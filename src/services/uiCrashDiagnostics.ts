import { readBuildInfo } from './buildInfo';
import { isChunkLoadError } from '../utils/lazyWithRetry';

export function saveUiCrash(error: Error, componentStack?: string | null): string {
  const id = `UI-${Date.now().toString(36).toUpperCase()}`;
  // Do not persist arbitrary error messages, query strings, tokens or business data.
  try {
    localStorage.setItem('ms_last_ui_crash', JSON.stringify({
      id,
      time: new Date().toISOString(),
      kind: isChunkLoadError(error) ? 'CHUNK_LOAD' : /Rendered (more|fewer) hooks/.test(error.message) ? 'HOOK_ORDER' : 'RENDER_ERROR',
      path: window.location.pathname,
      build: readBuildInfo().commit,
      componentStack: (componentStack || '').slice(0, 3000),
    }));
  } catch { /* Diagnostics must never prevent displaying the recovery screen. */ }
  return id;
}
