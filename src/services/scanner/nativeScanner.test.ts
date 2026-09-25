import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'ios', callbacks: {} as Record<string, (event?: any) => void>,
  checkPermissions: vi.fn(), requestPermissions: vi.fn(), startScan: vi.fn(), stopScan: vi.fn(),
  isSupported: vi.fn(), openSettings: vi.fn(), remove: vi.fn(),
  getMaxZoomRatio: vi.fn(), setZoomRatio: vi.fn(), isTorchAvailable: vi.fn(), toggleTorch: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: vi.fn(async (name, callback) => { mocks.callbacks[name] = callback; return { remove: mocks.remove }; }),
} }));
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { Code128: 'CODE_128', Ean13: 'EAN_13', Code39: 'CODE_39', Itf: 'ITF', QrCode: 'QR_CODE', DataMatrix: 'DATA_MATRIX' },
  LensFacing: { Back: 'BACK' },
  Resolution: { '1920x1080': 2 },
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
// Valid IMEIs (Luhn check digit) and a 390x844 @3x screen whose centre is (585, 1266).
const IMEI1 = '490154203237518';
const IMEI2 = '356938035643809';
const at = (x: number, y: number): [number, number][] => [[x - 300, y - 40], [x + 300, y - 40], [x + 300, y + 40], [x - 300, y + 40]];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform = 'ios'; mocks.callbacks = {};
  mocks.checkPermissions.mockResolvedValue({ camera: 'granted' });
  mocks.requestPermissions.mockResolvedValue({ camera: 'granted' });
  mocks.isSupported.mockResolvedValue({ supported: true });
  mocks.startScan.mockResolvedValue(undefined); mocks.stopScan.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined); mocks.openSettings.mockResolvedValue(undefined);
  mocks.getMaxZoomRatio.mockResolvedValue({ zoomRatio: 8 }); mocks.setZoomRatio.mockResolvedValue(undefined);
  mocks.isTorchAvailable.mockResolvedValue({ available: true }); mocks.toggleTorch.mockResolvedValue(undefined);
  vi.stubGlobal('document', { documentElement: { classList: { add: vi.fn(), remove: vi.fn() } } });
  vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 });
  controller = new AbortController(); pending = undefined;
});
afterEach(async () => { controller.abort(); await pending?.catch(() => {}); vi.unstubAllGlobals(); });

describe('native camera ownership and permissions', () => {
  it('checks OS permission on every opening, skips prompting when granted, returns the IMEI', async () => {
    start(); await ready(); emit(IMEI1);
    expect(await pending).toBe(IMEI1);
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.stopScan).toHaveBeenCalledTimes(1);
    controller = new AbortController();
    start(); await ready(); emit(` ${IMEI2} `);
    expect(await pending).toBe(IMEI2);
    expect(mocks.checkPermissions).toHaveBeenCalledTimes(2);
    expect(mocks.startScan).toHaveBeenCalledTimes(2);
    expect(mocks.stopScan).toHaveBeenCalledTimes(2);
  });

  it.each(['prompt', 'prompt-with-rationale'])('requests once for %s, then starts', async camera => {
    mocks.checkPermissions.mockResolvedValue({ camera });
    start(); await ready(); emit(IMEI1); await pending;
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

  it('scans at 1080p with a 1.5x zoom and reports torch availability', async () => {
    start(); await ready();
    await vi.waitFor(() => expect(nativeScannerState.getState().torchAvailable).toBe(true));
    expect(mocks.startScan).toHaveBeenCalledWith(expect.objectContaining({ resolution: 2 }));
    expect(mocks.setZoomRatio).toHaveBeenCalledWith({ zoomRatio: 1.5 });
    emit(IMEI1); await pending;
  });

  it('ignores EAN, serial, misread IMEIs and other barcodes, with a hint', async () => {
    start(); await ready();
    mocks.callbacks.barcodesScanned({ barcodes: [
      { format: 'CODE_128', rawValue: 'R58N123ABCD' }, { format: 'EAN_13', rawValue: IMEI1 },
      { format: 'CODE_128', rawValue: '490154203237519' },
    ] });
    expect(nativeScannerState.getState().hint).toMatch(/не IMEI/);
    expect(mocks.stopScan).not.toHaveBeenCalled();
    emit(IMEI1); emit(IMEI2);
    expect(await pending).toBe(IMEI1); expect(mocks.stopScan).toHaveBeenCalledTimes(1);
  });

  it('with IMEI 1 and 2 in view picks the one on the aiming frame once two frames agree', async () => {
    start(); await ready();
    const frame = { barcodes: [
      { format: 'CODE_128', rawValue: IMEI1, cornerPoints: at(585, 1000) },
      { format: 'CODE_128', rawValue: IMEI2, cornerPoints: at(585, 1270) },
    ] };
    mocks.callbacks.barcodesScanned(frame);
    expect(mocks.stopScan).not.toHaveBeenCalled();
    mocks.callbacks.barcodesScanned(frame);
    expect(await pending).toBe(IMEI2);
  });

  it('waits when two IMEIs are equally far from the aiming frame', async () => {
    start(); await ready();
    mocks.callbacks.barcodesScanned({ barcodes: [
      { format: 'CODE_128', rawValue: IMEI1, cornerPoints: at(585, 1166) },
      { format: 'CODE_128', rawValue: IMEI2, cornerPoints: at(585, 1366) },
    ] });
    expect(nativeScannerState.getState().hint).toMatch(/несколько IMEI/);
    expect(mocks.stopScan).not.toHaveBeenCalled();
  });

  it('takes IMEI 1 from a QR code that lists both IMEIs', async () => {
    start(); await ready();
    mocks.callbacks.barcodesScanned({ barcodes: [{ format: 'QR_CODE', rawValue: `IMEI1:${IMEI1};IMEI2:${IMEI2};SN:R58N` }] });
    expect(await pending).toBe(IMEI1);
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
