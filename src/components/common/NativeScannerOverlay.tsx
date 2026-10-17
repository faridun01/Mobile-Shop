import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { Flashlight, FlashlightOff } from 'lucide-react';
import { cancelScan, scanModeState, setScanMode, type ScanMode } from '../../services/scanner/scannerService';
import { nativeScannerState, openNativeScannerSettings, toggleNativeTorch } from '../../services/scanner/nativeScanner';
import { CODE_SCAN_HINTS, SCAN_HINTS } from '../../services/scanner/imei';
import '../../services/scanner/nativeScanner.css';

export function NativeScannerOverlay() {
  const { phase, message, hint, torchAvailable, torchOn } = useStore(nativeScannerState);
  const { mode, allowSwitch } = useStore(scanModeState);
  if (phase === 'idle') return null;
  const preview = phase === 'starting' || phase === 'scanning' || phase === 'stopping';
  const title = mode === 'code' ? 'Сканирование SN / штрихкода' : 'Сканирование IMEI';
  const switchTo = (next: ScanMode) => {
    setScanMode(next);
    nativeScannerState.setState({ hint: (next === 'code' ? CODE_SCAN_HINTS : SCAN_HINTS).aim });
  };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className={`native-scanner-overlay fixed inset-0 z-100 flex flex-col justify-between ${preview ? 'text-white' : 'bg-bg text-fg'}`}>
      {preview && <div className="native-scanner-target" aria-hidden="true" />}
      <div className="relative space-y-2">
        <div className={`flex items-center justify-between gap-3 rounded-xl p-3 ${preview ? 'bg-black/70' : 'bg-surface'}`}>
          <span className="text-sm font-semibold">{title}</span>
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
        {preview && allowSwitch && (
          <div className="flex justify-center">
            <div role="radiogroup" aria-label="Что сканировать" className="inline-flex rounded-xl bg-black/70 p-1 text-sm">
              {(['imei', 'code'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => switchTo(value)}
                  className={`min-h-9 rounded-lg px-4 font-semibold ${mode === value ? 'bg-white text-black' : 'text-white'}`}
                >
                  {value === 'imei' ? 'IMEI (телефон)' : 'SN / штрихкод'}
                </button>
              ))}
            </div>
          </div>
        )}
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
