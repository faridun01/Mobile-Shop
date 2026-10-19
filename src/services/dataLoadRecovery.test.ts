import { expect, it, vi } from 'vitest';
import { DataLoadRecovery } from './dataLoadRecovery';

it('retries only failed reads and preserves a failure until that read succeeds', async () => {
  const recovered = vi.fn(); const state = new DataLoadRecovery(recovered);
  const good = vi.fn().mockResolvedValue('ok');
  const bad = vi.fn().mockRejectedValueOnce(new Error('503')).mockRejectedValueOnce(new Error('503')).mockResolvedValue('stock');
  await state.run('stores', good);
  await expect(state.run('devices', bad)).rejects.toThrow('503');
  await state.retry(); expect(state.snapshot().failed).toBe(1); expect(recovered).not.toHaveBeenCalled();
  await state.retry(); expect(state.snapshot()).toEqual({ failed: 0, retrying: false });
  expect(good).toHaveBeenCalledTimes(1); expect(bad).toHaveBeenCalledTimes(3); expect(recovered).toHaveBeenCalledOnce();
});

it('does not clear another outstanding failure when one read recovers', async () => {
  const state = new DataLoadRecovery();
  await expect(state.run('stores', async () => { throw Error('503'); })).rejects.toThrow();
  await expect(state.run('devices', async () => { throw Error('503'); })).rejects.toThrow();
  await state.run('stores', async () => []);
  expect(state.snapshot().failed).toBe(1);
});

it('deduplicates repeated clicks on retry', async () => {
  let finish!: () => void;
  const state = new DataLoadRecovery();
  const read = vi.fn().mockRejectedValueOnce(Error('offline')).mockImplementation(() => new Promise<void>(r => { finish = r; }));
  await expect(state.run('stock', read)).rejects.toThrow();
  const first = state.retry(); expect(state.retry()).toBe(first);
  await Promise.resolve(); expect(read).toHaveBeenCalledTimes(2); expect(state.snapshot().retrying).toBe(true);
  finish(); await first; expect(state.snapshot().failed).toBe(0);
});

it('one retry also recovers a slower initial read that fails after the button was pressed', async () => {
  const state = new DataLoadRecovery(); let rejectSlow!: (e: Error) => void;
  const fast = vi.fn().mockRejectedValueOnce(Error('503')).mockResolvedValue([]);
  const slow = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { rejectSlow = reject; })).mockResolvedValue([]);
  await expect(state.run('fast', fast)).rejects.toThrow();
  const pending = state.run('slow', slow); const rejection = expect(pending).rejects.toThrow();
  const retry = state.retry(); rejectSlow(Error('503')); await rejection; await retry;
  expect(state.snapshot()).toEqual({ failed: 0, retrying: false });
  expect(fast).toHaveBeenCalledTimes(2); expect(slow).toHaveBeenCalledTimes(2);
});

it('ignores a previous session completing after reset', async () => {
  let fail!: (error: Error) => void;
  const state = new DataLoadRecovery();
  const old = state.run('stock', () => new Promise((_, reject) => { fail = reject; }));
  const rejected = expect(old).rejects.toThrow('old session');
  state.reset(); fail(Error('old session')); await rejected;
  expect(state.snapshot().failed).toBe(0);
});

it('cannot replay queued reads or publish recovery after the session changes', async () => {
  const recovered = vi.fn(); const read = vi.fn().mockRejectedValue(Error('offline'));
  const state = new DataLoadRecovery(recovered);
  await expect(state.run('private', read)).rejects.toThrow();
  const retry = state.retry(); state.reset(); await retry;
  expect(read).toHaveBeenCalledOnce(); expect(recovered).not.toHaveBeenCalled();
  expect(state.snapshot()).toEqual({ failed: 0, retrying: false });
});
