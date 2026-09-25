import React from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { Flashlight, FlashlightOff } from 'lucide-react';
import { cancelScan } from '../../services/scanner/scannerService';
import { nativeScannerState, openNativeScannerSettings, toggleNativeTorch } from '../../services/scanner/nativeScanner';
import '../../services/scanner/nativeScanner.css';

export function NativeScannerOverlay() {
  const { phase, message, hint, torchAvailable, torchOn } = useStore(nativeScannerState);
  if (phase === 'idle') return null;
  const preview = phase === 'starting' || phase === 'scanning' || phase === 'stopping';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Сканирование IMEI" className={`native-scanner-overlay fixed inset-0 z-100 flex flex-col justify-between ${preview ? 'text-white' : 'bg-bg text-fg'}`}>
      {preview && <div className="native-scanner-target" aria-hidden="true" />}
      <div className={`relative flex items-center justify-between gap-3 rounded-xl p-3 ${preview ? 'bg-black/70' : 'bg-surface'}`}>
        <span className="text-sm font-semibold">Сканирование IMEI</span>
        <div className="flex items-center gap-2">
          {preview && torchAvailable && (
            <button
              type="button"
              onClick={() => void toggleNativeTorch()}
              aria-label={torchOn ? 'Выключить фонарик' : 'Включить фонарик'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border"
            >
              {torchOn ? <FlashlightOff className="h-4.5 w-4.5" /> : <Flashlight className="h-4.5 w-4.5" />}
            </button>
          )}
          <button type="button" onClick={cancelScan} className="rounded-lg border px-4 py-2 text-sm">Отмена</button>
        </div>
      </div>
      {preview ? (
        <p className="relative rounded-xl bg-black/70 p-4 text-center text-sm" aria-live="polite">
          {phase === 'stopping' ? 'Закрытие камеры…' : hint}
        </p>
      ) : (
        <div className="my-auto rounded-xl border border-border bg-surface p-4 space-y-4">
          <p className="text-sm" role="status">{message || 'Проверка доступа к камере…'}</p>
          {phase === 'denied' && <button type="button" onClick={() => void openNativeScannerSettings()} className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-fg">Открыть настройки</button>}
        </div>
      )}
    </div>, document.body,
  );
}
