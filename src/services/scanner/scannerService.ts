import { Capacitor } from '@capacitor/core';
import { createStore } from 'zustand/vanilla';
import { scanWebCode, type WebScannerHost } from './webScanner';

/**
 * What a scan looks for. `imei`: only a valid 15-digit IMEI (the other labels on a phone box
 * are ignored). `code`: any barcode — a tablet serial number or an accessory barcode.
 */
export type ScanMode = 'imei' | 'code';

export interface ScanOptions {
  mode?: ScanMode;
  /** Shows an IMEI / SN switch in the scanner (device lookups that may meet a tablet). */
  allowModeSwitch?: boolean;
}

/** The running scan's mode, read by both camera UIs and switched from them. */
export const scanModeState = createStore<{ mode: ScanMode; allowSwitch: boolean }>(() => ({ mode: 'imei', allowSwitch: false }));

export function setScanMode(mode: ScanMode): void {
  scanModeState.setState({ mode });
}

let activeSession: AbortController | null = null;

export const isNativeScanner = () => Capacitor.isNativePlatform();

// A duplicate caller receives no result: sharing the first result with multiple
// callbacks could add the same item to a sale twice.
export async function scanCode(webHost: WebScannerHost, options: ScanOptions = {}): Promise<string | null> {
  if (activeSession) return null;
  const session = new AbortController();
  activeSession = session;
  scanModeState.setState({ mode: options.mode ?? 'imei', allowSwitch: Boolean(options.allowModeSwitch) });
  try {
    if (isNativeScanner()) {
      const { scanNativeCode } = await import('./nativeScanner');
      if (session.signal.aborted) return null;
      return await scanNativeCode(session.signal);
    }
    return await scanWebCode(webHost, session.signal);
  } finally {
    if (activeSession === session) activeSession = null;
  }
}

export function cancelScan(): void {
  activeSession?.abort();
}
