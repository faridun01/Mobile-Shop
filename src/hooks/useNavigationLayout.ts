import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void) {
  const queries = [window.matchMedia('(min-width: 768px)'), window.matchMedia('(min-width: 1024px)')];
  queries.forEach((query) => query.addEventListener('change', listener));
  return () => queries.forEach((query) => query.removeEventListener('change', listener));
}
function getSnapshot() {
  return window.matchMedia('(min-width: 1024px)').matches ? 'desktop' : window.matchMedia('(min-width: 768px)').matches ? 'tablet' : 'mobile';
}
export function useNavigationLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'mobile');
}
