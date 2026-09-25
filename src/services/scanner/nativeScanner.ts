import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';
import { createStore } from 'zustand/vanilla';

type Phase = 'idle' | 'permission' | 'starting' | 'scanning' | 'denied' | 'error' | 'stopping';
export const nativeScannerState = createStore<{ phase: Phase; message: string }>(() => ({
  phase: 'idle', message: '',
}));

const formats = [BarcodeFormat.Code128, BarcodeFormat.Ean13, BarcodeFormat.Code39, BarcodeFormat.Itf, BarcodeFormat.QrCode];
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

  nativeScannerState.setState({ phase: 'permission', message: '' });
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
    handles.push(await BarcodeScanner.addListener('barcodesScanned', ({ barcodes }) => {
      if (finished) return;
      // Multiple labels on a phone box must not produce an arbitrary IMEI.
      const values = [...new Set(barcodes.filter(b => formats.includes(b.format)).map(b => b.rawValue)
        .filter((value): value is string => typeof value === 'string' && value.length > 0))];
      if (values.length === 1) finish(values[0]);
    }));
    handles.push(await BarcodeScanner.addListener('scanError', () => {
      scanError = new Error('Native scan failed');
      finish(null);
    }));
    if (finished) return null;
    nativeScannerState.setState({ phase: 'starting' });
    document.documentElement.classList.add('native-scanner-active');
    releaseRequired = true;
    await BarcodeScanner.startScan({ formats, lensFacing: LensFacing.Back });
    if (!finished) nativeScannerState.setState({ phase: 'scanning' });
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
      nativeScannerState.setState({ phase: 'idle', message: '' });
    }
  }
}
