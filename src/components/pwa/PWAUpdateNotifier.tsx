import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, X, RefreshCw, Sparkles } from 'lucide-react';
import { usePWAUpdate } from '../../hooks/usePWAUpdate';

export const PWAUpdateNotifier: React.FC = () => {
  const {
    offline,
    showNetworkNotice,
    dismissNetworkNotice,
    hasUpdate,
    isUpdating,
    latestCommit,
    applyUpdate,
  } = usePWAUpdate();

  const [dismissedCommit, setDismissedCommit] = useState<string | null>(null);

  // When a newer commit is discovered, re-show the banner even if previously dismissed
  useEffect(() => {
    if (latestCommit && latestCommit !== dismissedCommit) {
      setDismissedCommit(null);
    }
  }, [latestCommit]);

  const showUpdateBanner = hasUpdate && (!dismissedCommit || (latestCommit && dismissedCommit !== latestCommit));

  return (
    <>
      {/* Network Offline / Online Toast */}
      {showNetworkNotice && (
        <div
          data-pwa-ignore="true"
          className={`fixed top-3 left-3 right-3 z-50 max-w-md mx-auto p-2.5 rounded-xl border font-mono text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in duration-200 ${
            offline
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {offline ? <WifiOff className="w-4 h-4 text-rose-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
            <span>{offline ? 'АВТОНОМНЫЙ РЕЖИМ (НЕТ ИНТЕРНЕТА)' : 'СВЯЗЬ ВОССТАНОВЛЕНА (ОНЛАЙН)'}</span>
          </div>
          <button
            type="button"
            onClick={dismissNetworkNotice}
            title="Закрыть уведомление"
            aria-label="Закрыть"
            className="w-8 h-8 -mr-1 -my-1 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Available Version Update Banner */}
      {showUpdateBanner && (
        <div
          data-pwa-ignore="true"
          className="fixed top-3 left-3 right-3 z-[100] max-w-md mx-auto p-3 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-slate-100 animate-in slide-in-from-top-3 duration-300 ring-1 ring-cyan-500/20"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm shadow-cyan-500/30">
              <Sparkles className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white flex items-center gap-1.5 leading-tight">
                <span>Доступно обновление</span>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              </div>
              <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                Новая версия готова к применению
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => applyUpdate(true)}
              disabled={isUpdating}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-500/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              <span>{isUpdating ? 'Обновление...' : 'Обновить'}</span>
            </button>
            <button
              type="button"
              onClick={() => setDismissedCommit(latestCommit || 'dismissed')}
              title="Закрыть"
              aria-label="Закрыть"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
