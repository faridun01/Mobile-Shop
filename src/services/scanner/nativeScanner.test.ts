import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'ios', callbacks: {} as Record<string, (event?: any) => void>,
  checkPermissions: vi.fn(), requestPermissions: vi.fn(), startScan: vi.fn(), stopScan: vi.fn(),
  isSupported: vi.fn(), openSettings: vi.fn(), remove: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (name, callback) => { mocks.callbacks[name] = callback; return { remove: mocks.remove }; }),
} }));
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { Code128: 'CODE_128', Ean13: 'EAN_13', Code39: 'CODE_39', Itf: 'ITF', QrCode: 'QR_CODE' },
  LensFacing: { Back: 'BACK' },
  BarcodeScanner: {
    ...mocks,
    addListener: vi.fn(async (name, callback) => { mocks.callbacks[name] = callback; return { remove: mocks.remove }; }),
  },
}));
import { scanNativeCode, nativeScannerState, openNativeScannerSettings } from './nativeScanner';

let controller: AbortController;
let pending: Promise<string | null> | undefined;
const start = () => (pending = scanNativeCode(controller.signal));
const ready = () => vi.waitFor(() => expect(nativeScannerState.getState().phase).toBe('scanning'));
const emit = (value: string) => mocks.callbacks.barcodesScanned({ barcodes: [{ format: 'CODE_128', rawValue: value }] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform = 'ios'; mocks.callbacks = {};
  mocks.checkPermissions.mockResolvedValue({ camera: 'granted' });
  mocks.requestPermissions.mockResolvedValue({ camera: 'granted' });
  mocks.isSupported.mockResolvedValue({ supported: true });
  mocks.startScan.mockResolvedValue(undefined); mocks.stopScan.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined); mocks.openSettings.mockResolvedValue(undefined);
  vi.stubGlobal('document', { documentElement: { classList: { add: vi.fn(), remove: vi.fn() } } });
  controller = new AbortController(); pending = undefined;
});
afterEach(async () => { controller.abort(); await pending?.catch(() => {}); vi.unstubAllGlobals(); });

describe('native camera ownership and permissions', () => {
  it('checks OS permission on every opening, skips prompting when granted, returns raw strings', async () => {
    start(); await ready(); emit('001234567890123');
    expect(await pending).toBe('001234567890123');
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    controller = new AbortController();
    start(); await ready(); emit(' QR payload with spaces ');
    expect(await pending).toBe(' QR payload with spaces ');
    expect(mocks.checkPermissions).toHaveBeenCalledTimes(2);
    expect(mocks.startScan).toHaveBeenCalledTimes(2);
    expect(mocks.stopScan).toHaveBeenCalledTimes(2);
  });

  it.each(['prompt', 'prompt-with-rationale'])('requests once for %s, then starts', async camera => {
    mocks.checkPermissions.mockResolvedValue({ camera });
    start(); await ready(); emit('0000'); await pending;
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.startScan).toHaveBeenCalledTimes(1);
  });

  it('does not request denied permission or open settings automatically', async () => {
    mocks.checkPermissions.mockResolvedValue({ camera: 'denied' });
    start();
    await vi.waitFor(() => expect(nativeScannerState.getState().phase).toBe('denied'));
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.startScan).not.toHaveBeenCalled();
    expect(mocks.openSettings).not.toHaveBeenCalled();
    await openNativeScannerSettings();
    expect(mocks.openSettings).toHaveBeenCalledTimes(1);
    controller.abort(); expect(await pending).toBeNull();
  });

  it('shows denial after a rejected permission request without retrying', async () => {
    mocks.checkPermissions.mockResolvedValue({ camera: 'prompt' });
    mocks.requestPermissions.mockResolvedValue({ camera: 'denied' });
    start(); await vi.waitFor(() => expect(nativeScannerState.getState().phase).toBe('denied'));
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.startScan).not.toHaveBeenCalled();
  });

  it('does not start after cancellation while the OS permission request is pending', async () => {
    let grant!: (value: { camera: string }) => void;
    mocks.checkPermissions.mockResolvedValue({ camera: 'prompt' });
    mocks.requestPermissions.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    start(); await vi.waitFor(() => expect(mocks.requestPermissions).toHaveBeenCalled());
    controller.abort(); grant({ camera: 'granted' });
    expect(await pending).toBeNull(); expect(mocks.startScan).not.toHaveBeenCalled();
  });

  it('serializes cancellation behind a pending start and removes listeners', async () => {
    let started!: () => void;
    mocks.startScan.mockImplementationOnce(() => new Promise<void>(resolve => { started = resolve; }));
    start(); await vi.waitFor(() => expect(mocks.startScan).toHaveBeenCalled());
    controller.abort(); expect(mocks.stopScan).not.toHaveBeenCalled();
    started(); expect(await pending).toBeNull();
    expect(mocks.stopScan).toHaveBeenCalledTimes(1); expect(mocks.remove).toHaveBeenCalledTimes(3);
    expect(nativeScannerState.getState().phase).toBe('idle');
  });

  it('cancels on iOS background without starting again on foreground', async () => {
    start(); await ready(); mocks.callbacks.pause();
    expect(await pending).toBeNull(); expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    expect(mocks.callbacks.appStateChange).toBeUndefined();
    expect(mocks.callbacks.resume).toBeUndefined();
  });

  it.each(['backButton', 'appStateChange'])('cancels Android on %s', async event => {
    mocks.platform = 'android';
    start(); await ready(); mocks.callbacks[event]({ isActive: false });
    expect(await pending).toBeNull(); expect(mocks.stopScan).toHaveBeenCalledTimes(1);
  });

  it('ignores ambiguous and late detections, delivers at most one value', async () => {
    start(); await ready();
    mocks.callbacks.barcodesScanned({ barcodes: [
      { format: 'CODE_128', rawValue: '111' }, { format: 'CODE_128', rawValue: '222' },
    ] });
    expect(mocks.stopScan).not.toHaveBeenCalled();
    emit('000123'); emit('late');
    expect(await pending).toBe('000123'); expect(mocks.stopScan).toHaveBeenCalledTimes(1);
  });

  it('stops on decoder failure and shows an error until dismissed', async () => {
    start(); await ready(); mocks.callbacks.scanError();
    await vi.waitFor(() => expect(nativeScannerState.getState().phase).toBe('error'));
    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    controller.abort(); expect(await pending).toBeNull();
  });

  it('cleans up a failed start without creating another camera automatically', async () => {
    mocks.startScan.mockRejectedValueOnce(new Error('camera busy'));
    start(); await vi.waitFor(() => expect(nativeScannerState.getState().phase).toBe('error'));
    expect(mocks.stopScan).toHaveBeenCalledTimes(1); expect(mocks.startScan).toHaveBeenCalledTimes(1);
    controller.abort(); expect(await pending).toBeNull();
  });
});
