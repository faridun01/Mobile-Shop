import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertCircle, Flashlight, FlashlightOff, Focus, ZoomIn } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Dialog } from '../ui/Dialog';
import { soundEffects } from '../../utils/sound';

const READER_ELEMENT_ID = 'ms-barcode-scanner-viewport';
const CONFIRMATION_WINDOW_MS = 800;
const REQUIRED_MATCHING_FRAMES = 2;

type BarcodeCameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
};

type BarcodeCameraConstraint = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
  zoom?: number;
};

type BarcodeCameraSettings = MediaTrackSettings & {
  zoom?: number;
};

type ZoomRange = {
  min: number;
  max: number;
  step: number;
};

// Phone boxes carry 1D barcodes (IMEI/S/N/EAN) plus the occasional QR — restricting to
// exactly these formats stops the decoder from latching onto a stray/irrelevant symbology
// and cuts the per-frame work, both of which speed up recognition.
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
];

/**
 * The single scanner surface for the whole app — every page's "Сканировать" button calls
 * openScanner(callback) from AppContext, which just flips isScannerOpen/scannerCallback.
 * Without this component mounted, that state had nothing rendering it, so every scan
 * button in the app was a no-op. Camera-only (via html5-qrcode) — hardware wedge scanner
 * support was removed since the app is used with phone/tablet cameras exclusively.
 */
export const ScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner } = useApp();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pendingScanRef = useRef({ code: '', matches: 0, seenAt: 0 });
  const scanLockedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [focusSupported, setFocusSupported] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [scanHint, setScanHint] = useState('Поместите один штрих-код внутрь рамки');

  const resolveScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || scanLockedRef.current) return;
    scanLockedRef.current = true;
    try {
      scannerRef.current?.pause(true);
    } catch {
      // Closing the dialog will stop the camera even if pause is unavailable.
    }
    soundEffects.playAddToCartSuccess();
    scannerCallback?.(trimmed);
    closeScanner();
  };

  const confirmScan = (decodedText: string) => {
    const code = decodedText.trim();
    if (!code || scanLockedRef.current) return;

    const now = Date.now();
    const pending = pendingScanRef.current;
    if (pending.code === code && now - pending.seenAt <= CONFIRMATION_WINDOW_MS) {
      pending.matches += 1;
      pending.seenAt = now;
    } else {
      pendingScanRef.current = { code, matches: 1, seenAt: now };
      setScanHint('Код найден — держите камеру неподвижно');
    }

    if (pendingScanRef.current.matches >= REQUIRED_MATCHING_FRAMES) {
      resolveScan(code);
    }
  };

  const toggleTorch = async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    const next = !torchOn;
    try {
      await instance.applyVideoConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // Some devices report torch capability but reject the constraint — ignore.
    }
  };

  const changeZoom = async (value: number) => {
    const instance = scannerRef.current;
    if (!instance || !zoomRange) return;
    const next = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
    setZoomValue(next);
    try {
      await instance.applyVideoConstraints({ advanced: [{ zoom: next } as BarcodeCameraConstraint] });
    } catch {
      // Capability reporting differs across Android browsers; keep scanning.
    }
  };

  const refocus = async () => {
    const instance = scannerRef.current;
    if (!instance || isFocusing) return;
    setIsFocusing(true);
    try {
      const capabilities = instance.getRunningTrackCapabilities() as BarcodeCameraCapabilities;
      const modes = capabilities.focusMode ?? [];
      const requestedMode = modes.includes('single-shot') ? 'single-shot' : 'continuous';
      await instance.applyVideoConstraints({
        advanced: [{ focusMode: requestedMode } as BarcodeCameraConstraint],
      });

      if (requestedMode === 'single-shot' && modes.includes('continuous')) {
        window.setTimeout(() => {
          if (scannerRef.current === instance) {
            instance.applyVideoConstraints({
              advanced: [{ focusMode: 'continuous' } as BarcodeCameraConstraint],
            }).catch(() => {});
          }
        }, 700);
      }
    } catch {
      // Refocus is an enhancement; unsupported devices continue normally.
    } finally {
      window.setTimeout(() => setIsFocusing(false), 450);
    }
  };

  useEffect(() => {
    if (!isScannerOpen) {
      setCameraError(null);
      setTorchSupported(false);
      setTorchOn(false);
      setFocusSupported(false);
      setIsFocusing(false);
      setZoomRange(null);
      setZoomValue(1);
      setScanHint('Поместите один штрих-код внутрь рамки');
      return;
    }

    let cancelled = false;
    scanLockedRef.current = false;
    pendingScanRef.current = { code: '', matches: 0, seenAt: 0 };
    const instance = new Html5Qrcode(READER_ELEMENT_ID, {
      formatsToSupport: SUPPORTED_FORMATS,
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = instance;

    instance
      .start(
        { facingMode: 'environment' },
        {
          fps: 18,
          aspectRatio: 16 / 9,
          // Keep the active decoder area narrow enough to isolate IMEI 1 from IMEI 2,
          // while sizing it to the actual phone/tablet viewport instead of fixed pixels.
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.floor(Math.min(420, viewfinderWidth * 0.88));
            const height = Math.floor(Math.min(130, Math.max(70, width * 0.3), viewfinderHeight * 0.55));
            return { width, height };
          },
          disableFlip: true,
          videoConstraints: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: 'continuous' } as BarcodeCameraConstraint],
          },
        },
        (decodedText) => {
          if (!cancelled) confirmScan(decodedText);
        },
        () => {
          // Per-frame "nothing decoded yet" — not an error, ignore.
        }
      )
      .then(async () => {
        if (cancelled) return;
        try {
          const capabilities = instance.getRunningTrackCapabilities() as BarcodeCameraCapabilities;
          setTorchSupported(!!capabilities.torch);
          const modes = capabilities.focusMode ?? [];
          setFocusSupported(modes.includes('continuous') || modes.includes('single-shot'));

          if (modes.includes('continuous')) {
            instance.applyVideoConstraints({
              advanced: [{ focusMode: 'continuous' } as BarcodeCameraConstraint],
            }).catch(() => {});
          }

          const zoom = capabilities.zoom;
          if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) {
            const range = { min: zoom.min, max: zoom.max, step: zoom.step && zoom.step > 0 ? zoom.step : 0.1 };
            const currentZoom = (instance.getRunningTrackSettings() as BarcodeCameraSettings).zoom;
            const preferredZoom = Math.min(range.max, Math.max(range.min, Math.max(currentZoom ?? range.min, 1.5)));
            setZoomRange(range);
            setZoomValue(preferredZoom);
            await instance.applyVideoConstraints({
              advanced: [{ zoom: preferredZoom } as BarcodeCameraConstraint],
            }).catch(() => {});
          }
        } catch {
          setTorchSupported(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const errorName = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
          setCameraError(
            errorName === 'NotAllowedError'
              ? 'Доступ к камере запрещён. Разрешите использование камеры в настройках браузера.'
              : errorName === 'NotFoundError'
                ? 'Камера не найдена на этом устройстве.'
                : 'Не удалось запустить камеру. Закройте другие приложения, использующие камеру, и попробуйте снова.'
          );
        }
      });

    return () => {
      cancelled = true;
      const running = scannerRef.current;
      scannerRef.current = null;
      if (running) {
        Promise.resolve()
          .then(() => running.stop())
          .catch(() => {})
          .finally(() => running.clear());
      }
    };
  }, [isScannerOpen]);

  return (
    <Dialog
      open={isScannerOpen}
      onClose={closeScanner}
      title="Сканирование"
      maxWidth="sm"
    >
      <div className="space-y-3">
        <div className="relative">
          <div id={READER_ELEMENT_ID} className="w-full rounded-lg overflow-hidden bg-black min-h-55" />
          {!cameraError && (
            <div className="pointer-events-none absolute left-[6%] right-[6%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
          )}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? 'Выключить фонарик' : 'Включить фонарик'}
              className="absolute top-2 right-2 w-9 h-9 rounded-lg bg-black/60 text-white flex items-center justify-center backdrop-blur-sm active:scale-95 transition-transform"
            >
              {torchOn ? <FlashlightOff className="w-4.5 h-4.5" /> : <Flashlight className="w-4.5 h-4.5" />}
            </button>
          )}
        </div>
        {(focusSupported || zoomRange) && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-raised px-3 py-2">
            {focusSupported && (
              <button
                type="button"
                onClick={refocus}
                disabled={isFocusing}
                className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-fg active:scale-95 disabled:opacity-50"
              >
                <Focus className="h-4 w-4" />
                {isFocusing ? 'Фокусирую…' : 'Фокус'}
              </button>
            )}
            {zoomRange && (
              <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-fg-muted">
                <ZoomIn className="h-4 w-4 shrink-0" />
                <input
                  type="range"
                  min={zoomRange.min}
                  max={zoomRange.max}
                  step={zoomRange.step}
                  value={zoomValue}
                  onChange={(event) => void changeZoom(Number(event.target.value))}
                  className="min-w-0 flex-1 accent-accent"
                  aria-label="Масштаб камеры"
                />
                <span className="w-8 text-right tabular-nums">{zoomValue.toFixed(1)}×</span>
              </label>
            )}
          </div>
        )}
        <p className="text-xs text-fg-subtle text-center" aria-live="polite">
          {scanHint}
        </p>
        {cameraError && (
          <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
};
