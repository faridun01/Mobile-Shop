import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const auth = vi.hoisted(() => ({ token: 'test-token', currentUser: { id: 'test-user' }, logout: vi.fn() }));
vi.mock('../stores/useAuthStore', () => ({ useAuthStore: { getState: () => auth } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
import { apiClient } from './client';

describe('mutation retry protocol', () => {
  beforeEach(() => {
    auth.token = 'test-token';
    const storage = new Map<string, string>();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());
  it('coalesces simultaneous submissions and sends an idempotency key', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'one' })));
    vi.stubGlobal('fetch', fetcher);
    const opts = { method: 'POST', body: '{"amount":1}' };
    const results = await Promise.all([apiClient('/expenses', opts), apiClient('/expenses', opts)]);
    expect(results).toEqual([{ id: 'one' }, { id: 'one' }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get('Idempotency-Key')).toMatch(/^[a-f0-9]{32}$/);
  });
  it('retains the key after ambiguous failure, clears it after success', async () => {
    const keys: string[] = [];
    let attempt = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      keys.push(new Headers(options.headers).get('Idempotency-Key')!);
      if (++attempt === 1) throw new TypeError('Failed to fetch');
      return new Response('{"id":"saved"}');
    }));
    const opts = { method: 'POST', body: '{"amount":2}' };
    await expect(apiClient('/expenses', opts)).rejects.toThrow();
    await apiClient('/expenses', opts);
    await apiClient('/expenses', opts);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
  it('rejects an old response after account switching', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { auth.token = 'new-session'; return new Response('[]'); }));
    await expect(apiClient('/sales')).rejects.toThrow('Сессия изменилась');
  });
});
