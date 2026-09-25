import { afterEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ native: false, scan: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => runtime.native } }));
vi.mock('./nativeScanner', () => ({ scanNativeCode: runtime.scan }));
import { cancelScan, scanCode } from './scannerService';

afterEach(() => { cancelScan(); runtime.native = false; vi.clearAllMocks(); });

describe('shared scanner boundary', () => {
  it('uses the web host for browser/PWA, preserves strings and ignores duplicate results', async () => {
    let deliver!: (code: string) => void;
    const host = { open: vi.fn((fn) => { deliver = fn; }), close: vi.fn() };
    const pending = scanCode(host);
    deliver('001234567890123');
    deliver('another-code');
    expect(await pending).toBe('001234567890123');
    expect(host.close).toHaveBeenCalledTimes(1);
    expect(runtime.scan).not.toHaveBeenCalled();
  });

  it('rejects a double tap safely without delivering the first result twice', async () => {
    let deliver!: (code: string) => void;
    const host = { open: vi.fn((fn) => { deliver = fn; }), close: vi.fn() };
    const first = scanCode(host);
    expect(await scanCode(host)).toBeNull();
    expect(host.open).toHaveBeenCalledTimes(1);
    deliver('QR: full string 001');
    expect(await first).toBe('QR: full string 001');
  });

  it('returns null on web cancellation, ignores late results and can reopen', async () => {
    let deliver!: (code: string) => void;
    const host = { open: vi.fn((fn) => { deliver = fn; }), close: vi.fn() };
    const first = scanCode(host);
    const oldDelivery = deliver;
    cancelScan();
    expect(await first).toBeNull();
    const second = scanCode(host);
    oldDelivery('stale');
    deliver('new');
    expect(await second).toBe('new');
  });

  it('never opens the web scanner in a true native runtime', async () => {
    runtime.native = true;
    runtime.scan.mockResolvedValue('00001');
    const host = { open: vi.fn(), close: vi.fn() };
    expect(await scanCode(host)).toBe('00001');
    expect(host.open).not.toHaveBeenCalled();
    expect(runtime.scan).toHaveBeenCalledTimes(1);
  });

  it('holds the session lock until native cleanup finishes', async () => {
    runtime.native = true;
    let finish!: (value: null) => void;
    runtime.scan.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const host = { open: vi.fn(), close: vi.fn() };
    const first = scanCode(host);
    await vi.waitFor(() => expect(runtime.scan).toHaveBeenCalledTimes(1));
    cancelScan();
    expect(await scanCode(host)).toBeNull();
    finish(null);
    expect(await first).toBeNull();
    runtime.scan.mockResolvedValue('second');
    expect(await scanCode(host)).toBe('second');
  });
});
