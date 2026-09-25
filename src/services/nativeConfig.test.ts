import { describe, expect, it } from 'vitest';
import { requireNativeUrl } from './nativeConfig';

describe('native endpoint validation', () => {
  it('accepts configured remote HTTPS and WSS endpoints', () => {
    expect(requireNativeUrl('https://shop.example/api', 'https:', 'VITE_API_URL')).toBe('https://shop.example/api');
    expect(requireNativeUrl('wss://shop.example/ws', 'wss:', 'VITE_WS_URL')).toBe('wss://shop.example/ws');
  });
  it.each([undefined, '', '/api', 'http://shop.example/api', 'https://localhost/api', 'https://127.0.0.1/api', 'https://user:password@shop.example/api'])(
    'rejects an unsafe or missing native API address: %s', value => {
      expect(() => requireNativeUrl(value, 'https:', 'VITE_API_URL')).toThrow('VITE_API_URL');
    },
  );
});
