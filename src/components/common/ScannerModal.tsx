import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useHardwareScanner } from '../../hooks/useHardwareScanner';
import { Dialog } from '../ui/Dialog';

const READER_ELEMENT_ID = 'ms-barcode-scanner-viewport';

/**
 * The single scanner surface for the whole app — every page's "Сканировать" button calls
 * openScanner(callback) from AppContext, which just flips isScannerOpen/scannerCallback.
 * Without this component mounted, that state had nothing rendering it, so every scan
 * button in the app was a no-op. Supports the device camera (via html5-qrcode) and, since
 * hardware wedge scanners behave like a very fast keyboard, useHardwareScanner globally
 * while this modal is open — either one resolves the same pending callback.
 */
export const ScannerModal: React.FC = () => {
  const { isScannerOpen, scannerCallback, closeScanner } = useApp();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const resolveScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    scannerCallback?.(trimmed);
    closeScanner();
  };

  // Hardware USB/Bluetooth wedge scanners fire as fast keystrokes anywhere on the page —
  // route a completed scan into the same callback the camera view would resolve.
  useHardwareScanner((code) => {
    if (isScannerOpen) resolveScan(code);
  });

  useEffect(() => {
    if (!isScannerOpen) {
      setCameraError(null);
      return;
    }

    let cancelled = false;
    const instance = new Html5Qrcode(READER_ELEMENT_ID);
    scannerRef.current = instance;

    instance
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          if (!cancelled) resolveScan(decodedText);
        },
        () => {
          // Per-frame "nothing decoded yet" — not an error, ignore.
        }
      )
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
      subtitle="Наведите камеру на штрихкод или IMEI"
      maxWidth="sm"
    >
      <div className="space-y-3">
        <div id={READER_ELEMENT_ID} className="w-full rounded-lg overflow-hidden bg-black min-h-55" />
        {cameraError && (
          <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 border border-danger/30 p-2.5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}
        <p className="text-xs text-fg-subtle text-center">
          Также можно сканировать физическим сканером штрихкодов прямо сейчас.
        </p>
      </div>
    </Dialog>
  );
};
