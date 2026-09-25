export interface WebScannerHost {
  open: (onResult: (code: string) => void) => void;
  close: () => void;
}

// ScannerModal remains the sole web camera owner. This bridge only adapts its
// existing result callback and close action to the shared Promise contract.
export function scanWebCode(host: WebScannerHost, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (code: string | null) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      host.close();
      resolve(code);
    };
    const cancel = () => finish(null);
    if (signal.aborted) { resolve(null); return; }
    signal.addEventListener('abort', cancel, { once: true });
    try {
      host.open((code) => finish(code));
    } catch (error) {
      settled = true;
      signal.removeEventListener('abort', cancel);
      host.close();
      reject(error);
    }
  });
}
