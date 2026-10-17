import { afterEach, expect, it, vi } from 'vitest';
import { importWithRetry, isChunkLoadError } from './lazyWithRetry';

afterEach(() => vi.useRealTimers());

it('retries a transient module failure once', async () => {
  vi.useFakeTimers();
  const load = vi.fn().mockRejectedValueOnce(new TypeError('Importing a module script failed.')).mockResolvedValue({ default: 'page' });
  const result = importWithRetry(load);
  await vi.runAllTimersAsync();
  expect(await result).toEqual({ default: 'page' });
  expect(load).toHaveBeenCalledTimes(2);
});

it('does not retry a bug in module initialization', async () => {
  const error = new Error('broken initialization');
  const load = vi.fn().mockRejectedValue(error);
  await expect(importWithRetry(load)).rejects.toBe(error);
  expect(load).toHaveBeenCalledTimes(1);
});

it('stops after the second asset failure', async () => {
  vi.useFakeTimers();
  const error = new TypeError('Failed to fetch dynamically imported module');
  const load = vi.fn().mockRejectedValue(error);
  const result = expect(importWithRetry(load)).rejects.toBe(error);
  await vi.runAllTimersAsync();
  await result;
  expect(load).toHaveBeenCalledTimes(2);
});

it('recognizes browser module errors without treating ordinary API errors as chunks', () => {
  expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /assets/page.js'))).toBe(true);
  expect(isChunkLoadError(new Error('Нет связи с сервером'))).toBe(false);
});
