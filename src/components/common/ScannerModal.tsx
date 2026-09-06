import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { AlertCircle, Flashlight, FlashlightOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Dialog } from '../ui/Dialog';
import { soundEffects } from '../../utils/sound';

const READER_ELEMENT_ID = 'ms-barcode-scanner-viewport';

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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const resolveScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    soundEffects.playAddToCartSuccess();
    scannerCallback?.(trimmed);
    closeScanner();
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

  useEffect(() => {
    if (!isScannerOpen) {
      setCameraError(null);
      setTorchSupported(false);
      setTorchOn(false);
      return;
    }

    let cancelled = false;
    const instance = new Html5Qrcode(READER_ELEMENT_ID, {
      formatsToSupport: SUPPORTED_FORMATS,
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = instance;

    instance
      .start(
        { facingMode: 'environment' },
        // A wide-but-short box instead of a near-square one isolates a single 1D barcode
        // line (IMEI/EAN/S/N) from neighboring codes printed close together on the box.
        { fps: 15, qrbox: { width: 280, height: 110 }, disableFlip: true },
        (decodedText) => {
          if (!cancelled) resolveScan(decodedText);
        },
        () => {
          // Per-frame "nothing decoded yet" — not an error, ignore.
        }
      )
      .then(() => {
        if (cancelled) return;
        try {
          const capabilities = instance.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(!!capabilities.torch);
        } catch {
          setTorchSupported(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Не удалось получить доступ к камере. Проверьте разрешения браузера.');
        }
      });

    return () => {
      cancelled = true;
      const running = scannerRef.current;
      scannerRef.current = null;
      if (running) {
        running.stop().catch(() => {}).finally(() => running.clear());
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
        <p className="text-xs text-fg-subtle text-center">
          Совместите в рамке только один нужный штрих-код
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
