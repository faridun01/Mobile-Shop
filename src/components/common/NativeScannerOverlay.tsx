import React from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { cancelScan } from '../../services/scanner/scannerService';
import { nativeScannerState, openNativeScannerSettings } from '../../services/scanner/nativeScanner';
import '../../services/scanner/nativeScanner.css';

export function NativeScannerOverlay() {
  const { phase, message } = useStore(nativeScannerState);
  if (phase === 'idle') return null;
  const preview = phase === 'starting' || phase === 'scanning' || phase === 'stopping';
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Сканирование" className={`native-scanner-overlay fixed inset-0 z-100 flex flex-col justify-between p-4 ${preview ? 'text-white' : 'bg-bg text-fg'}`}>
      <div className={`flex items-center justify-between gap-3 rounded-xl p-3 ${preview ? 'bg-black/70' : 'bg-surface'}`}>
        <span className="text-sm font-semibold">Сканирование</span>
        <button type="button" onClick={cancelScan} className="rounded-lg border px-4 py-2 text-sm">Отмена</button>
      </div>
      {preview ? (
        <p className="rounded-xl bg-black/70 p-4 text-center text-sm" aria-live="polite">
          {phase === 'stopping' ? 'Закрытие камеры…' : 'Наведите камеру на один штрих-код или IMEI'}
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
