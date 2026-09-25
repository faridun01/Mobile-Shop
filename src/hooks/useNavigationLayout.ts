import { useSyncExternalStore } from 'react';

export type NavigationLayout = 'desktop' | 'tablet' | 'mobile';

function getSnapshot(): NavigationLayout {
  if (typeof window === 'undefined') return 'mobile';
  const width = window.innerWidth;
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'mobile';
}

function subscribe(listener: () => void) {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('resize', listener);
  window.addEventListener('orientationchange', listener);

  const qTablet = window.matchMedia('(min-width: 768px)');
  const qDesktop = window.matchMedia('(min-width: 1024px)');

  if (qTablet.addEventListener) {
    qTablet.addEventListener('change', listener);
    qDesktop.addEventListener('change', listener);
  } else {
    // Legacy WebKit / iOS Safari fallback
    (qTablet as any).addListener?.(listener);
    (qDesktop as any).addListener?.(listener);
  }

  return () => {
    window.removeEventListener('resize', listener);
    window.removeEventListener('orientationchange', listener);
    if (qTablet.removeEventListener) {
      qTablet.removeEventListener('change', listener);
      qDesktop.removeEventListener('change', listener);
    } else {
      (qTablet as any).removeListener?.(listener);
      (qDesktop as any).removeListener?.(listener);
    }
  };
}

export function useNavigationLayout(): NavigationLayout {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'mobile');
}

