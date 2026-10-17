import { afterEach, expect, it, vi } from 'vitest';
import { saveUiCrash } from './uiCrashDiagnostics';

afterEach(() => vi.unstubAllGlobals());
it('persists diagnostic context without the raw error message or URL query', () => {
  const setItem = vi.fn();
  vi.stubGlobal('localStorage', { setItem });
  vi.stubGlobal('window', { location: { pathname: '/sale', search: '?token=secret' } });
  const id = saveUiCrash(new Error('Customer private data'), 'at SalePage');
  const saved = JSON.parse(setItem.mock.calls[0][1]);
  expect(saved).toMatchObject({ id, kind: 'RENDER_ERROR', path: '/sale', componentStack: 'at SalePage' });
  expect(setItem.mock.calls[0][1]).not.toMatch(/secret|Customer private data/);
});
it('still returns a code when storage is denied', () => {
  vi.stubGlobal('localStorage', { setItem: () => { throw new Error('denied'); } });
  expect(saveUiCrash(new Error('failure'))).toMatch(/^UI-/);
});
