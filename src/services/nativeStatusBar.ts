import { Capacitor } from '@capacitor/core';

// The app is dark-themed everywhere (--color-bg / --color-surface, src/index.css).
// Without an explicit style, iOS defaults to dark status bar text on a transparent
// bar — invisible against this background — while Android's default varies by OEM.
// Style.Dark here means "status bar tuned for a dark background", i.e. light icons/text.
export async function initNativeStatusBar(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0B0E14' });
    }
  } catch {
    // Best-effort cosmetic setup; the app remains fully usable without it.
  }
}
