import { Capacitor } from '@capacitor/core';
import { scanWebCode, type WebScannerHost } from './webScanner';

let activeSession: AbortController | null = null;

export const isNativeScanner = () => Capacitor.isNativePlatform();

// A duplicate caller receives no result: sharing the first result with multiple
// callbacks could add the same item to a sale twice.
export async function scanCode(webHost: WebScannerHost): Promise<string | null> {
  if (activeSession) return null;
  const session = new AbortController();
  activeSession = session;
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
