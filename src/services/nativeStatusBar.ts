import { Capacitor } from '@capacitor/core';

export async function updateNativeStatusBar(theme: 'dark' | 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: theme === 'light' ? '#FFFFFF' : '#0F1219' });
    }
  } catch {
    // Best-effort cosmetic setup; the app remains fully usable without it.
  }
}

export async function initNativeStatusBar(): Promise<void> {
  const savedTheme = (typeof localStorage !== 'undefined' ? localStorage.getItem('ms_theme') : null) === 'dark' ? 'dark' : 'light';
  await updateNativeStatusBar(savedTheme);
}
