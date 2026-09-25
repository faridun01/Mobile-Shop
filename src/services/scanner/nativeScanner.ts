import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BarcodeScanner, BarcodeFormat, LensFacing, Resolution, type Barcode } from '@capacitor-mlkit/barcode-scanning';
import { createStore } from 'zustand/vanilla';
import { extractImeis, SCAN_HINTS } from './imei';

type Phase = 'idle' | 'permission' | 'starting' | 'scanning' | 'denied' | 'error' | 'stopping';
export const nativeScannerState = createStore<{ phase: Phase; message: string; hint: string; torchAvailable: boolean; torchOn: boolean }>(() => ({
  phase: 'idle', message: '', hint: SCAN_HINTS.aim, torchAvailable: false, torchOn: false,
}));

// IMEI labels are Code 128 (occasionally Code 39); some brands add a QR/DataMatrix with
// both IMEIs. EAN/ITF can never hold a 15-digit IMEI, so they're not decoded at all.
const formats = [BarcodeFormat.Code128, BarcodeFormat.Code39, BarcodeFormat.QrCode, BarcodeFormat.DataMatrix];
// A little optical zoom lets the phone stay far enough away to focus on the thin bars.
const PREFERRED_ZOOM = 1.5;

type ImeiBarcode = { imeis: string[]; center: { x: number; y: number } | null };

function barcodeCenter(barcode: Barcode) {
  const points = barcode.cornerPoints;
  if (!points?.length) return null;
  return { x: points.reduce((sum, [x]) => sum + x, 0) / points.length, y: points.reduce((sum, [, y]) => sum + y, 0) / points.length };
}

/**
 * Picks the IMEI to return from one detection frame, or null to keep scanning.
 * Several different IMEIs (e.g. IMEI 1 and IMEI 2 printed together) resolve to the
 * barcode clearly nearest the on-screen aiming frame; corner points are in physical
 * screen pixels on both platforms. Such a position-based pick is flagged `confirm`: the
 * caller accepts it only once two consecutive frames agree.
 */
function chooseImei(found: ImeiBarcode[]): { imei: string | null; hint: string; confirm?: boolean } {
  if (!found.length) return { imei: null, hint: SCAN_HINTS.notImei };
  const distinct = new Set(found.flatMap((barcode) => barcode.imeis));
  // One barcode (a QR with both IMEIs yields IMEI 1) or the same IMEI printed twice.
  if (distinct.size === 1 || found.length === 1) return { imei: found[0].imeis[0], hint: SCAN_HINTS.hold };
  const scale = window.devicePixelRatio || 1;
  const target = { x: (window.innerWidth * scale) / 2, y: (window.innerHeight * scale) / 2 };
  const ranked = found
    .filter((barcode) => barcode.center)
    .map((barcode) => ({ barcode, distance: Math.hypot(barcode.center!.x - target.x, barcode.center!.y - target.y) }))
    .sort((a, b) => a.distance - b.distance);
  if (ranked.length >= 2 && ranked[0].distance < ranked[1].distance * 0.6) return { imei: ranked[0].barcode.imeis[0], hint: SCAN_HINTS.hold, confirm: true };
  return { imei: null, hint: SCAN_HINTS.several };
}

export async function toggleNativeTorch(): Promise<void> {
  try {
    await BarcodeScanner.toggleTorch();
    nativeScannerState.setState((state) => ({ torchOn: !state.torchOn }));
  } catch {
    // Torch is an aid only; scanning continues without it.
  }
}
// A failed native stop must be retried successfully before another camera starts.
let releaseRequired = false;

export async function openNativeScannerSettings(): Promise<void> {
  try {
    await BarcodeScanner.openSettings();
  } catch {
    nativeScannerState.setState({ message: 'Откройте настройки приложения вручную и разрешите доступ к камере.' });
  }
}

export async function scanNativeCode(signal: AbortSignal): Promise<string | null> {
  if (signal.aborted) return null;
  const handles: PluginListenerHandle[] = [];
  let finished = false;
  let scanError: Error | null = null;
  let resolveResult!: (value: string | null) => void;
  const result = new Promise<string | null>((resolve) => { resolveResult = resolve; });
  const finish = (value: string | null) => {
    if (finished) return;
    finished = true;
    resolveResult(value);
  };
  const cancel = () => finish(null);
  signal.addEventListener('abort', cancel, { once: true });
  const stop = async () => {
    if (!releaseRequired) return;
    await BarcodeScanner.stopScan();
    releaseRequired = false;
  };
  const hidePreview = () => document.documentElement.classList.remove('native-scanner-active');

  nativeScannerState.setState({ phase: 'permission', message: '', hint: SCAN_HINTS.aim, torchAvailable: false, torchOn: false });
  try {
    await stop();
    // iOS pause means background, unlike willResignActive (permission sheets).
    // Android appStateChange(false) means onStop, not a permission dialog.
    if (Capacitor.getPlatform() === 'ios') {
      handles.push(await App.addListener('pause', cancel));
    } else {
      handles.push(await App.addListener('appStateChange', ({ isActive }) => { if (!isActive) cancel(); }));
      handles.push(await App.addListener('backButton', cancel));
    }
    if (finished) return null;
    let permission = await BarcodeScanner.checkPermissions();
    if (finished) return null;
    if (permission.camera === 'prompt' || permission.camera === 'prompt-with-rationale') {
      permission = await BarcodeScanner.requestPermissions();
    }
    if (finished) return null;
    if (permission.camera !== 'granted') {
      nativeScannerState.setState({ phase: 'denied', message: 'Доступ к камере отключён. Разрешите камеру в настройках приложения, затем откройте сканер снова.' });
      return await result;
    }
    if (!(await BarcodeScanner.isSupported()).supported) throw new Error('Native scanner unavailable');
    if (finished) return null;
    // When a choice between several IMEIs had to be made, it must hold for two frames.
    let pendingChoice: string | null = null;
    handles.push(await BarcodeScanner.addListener('barcodesScanned', ({ barcodes }) => {
      if (finished) return;
      // Only IMEIs count: the other labels on a phone box (EAN, S/N, part number) are ignored.
      const found = barcodes
        .filter((barcode) => formats.includes(barcode.format))
        .map((barcode) => ({ imeis: extractImeis(barcode.rawValue ?? ''), center: barcodeCenter(barcode) }))
        .filter((barcode) => barcode.imeis.length > 0);
      const { imei, hint, confirm } = chooseImei(found);
      if (imei && (!confirm || pendingChoice === imei)) {
        finish(imei);
        return;
      }
      pendingChoice = confirm ? imei : null;
      if (nativeScannerState.getState().hint !== hint) nativeScannerState.setState({ hint });
    }));
    handles.push(await BarcodeScanner.addListener('scanError', () => {
      scanError = new Error('Native scan failed');
      finish(null);
    }));
    if (finished) return null;
    nativeScannerState.setState({ phase: 'starting' });
    document.documentElement.classList.add('native-scanner-active');
    releaseRequired = true;
    // 1080p resolves the thin bars of a 15-digit Code 128 far better than the 720p default.
    await BarcodeScanner.startScan({ formats, lensFacing: LensFacing.Back, resolution: Resolution['1920x1080'] });
    if (!finished) nativeScannerState.setState({ phase: 'scanning' });
    try {
      const { zoomRatio: maxZoom } = await BarcodeScanner.getMaxZoomRatio();
      if (!finished && maxZoom >= PREFERRED_ZOOM) await BarcodeScanner.setZoomRatio({ zoomRatio: PREFERRED_ZOOM });
      const { available } = await BarcodeScanner.isTorchAvailable();
      if (!finished) nativeScannerState.setState({ torchAvailable: available });
    } catch {
      // Zoom/torch are aids only; scanning continues at the default settings.
    }
    const value = await result;
    if (scanError) throw scanError;
    return value;
  } catch {
    try { await stop(); } catch { /* Keep releaseRequired true to block another start. */ }
    hidePreview();
    if (!signal.aborted) {
      nativeScannerState.setState({ phase: 'error', message: 'Не удалось запустить сканер. Закройте окно и попробуйте снова.' });
      await new Promise<void>((resolve) => {
        if (signal.aborted) { resolve(); return; }
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
    }
    return null;
  } finally {
    finished = true;
    nativeScannerState.setState({ phase: 'stopping' });
    try {
      await stop();
    } finally {
      hidePreview();
      signal.removeEventListener('abort', cancel);
      await Promise.allSettled(handles.map(handle => handle.remove()));
      nativeScannerState.setState({ phase: 'idle', message: '', hint: SCAN_HINTS.aim, torchAvailable: false, torchOn: false });
    }
  }
}
