import React, { useEffect, useState } from 'react';
import { Smartphone, BellRing, Check, Send, AlertCircle, Loader2 } from 'lucide-react';
import { WebPushService } from '../../services/webPushService';

export const PushNotificationBanner: React.FC = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const supported = WebPushService.isSupported();
    setIsSupported(supported);
    if (supported) {
      WebPushService.isSubscribed().then(setIsSubscribed);
    }
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      if (isSubscribed) {
        const res = await WebPushService.unsubscribe();
        if (res.success) {
          setIsSubscribed(false);
          setFeedback({ type: 'success', message: 'Уведомления на этом телефоне отключены' });
        }
      } else {
        const res = await WebPushService.subscribe();
        if (res.success) {
          setIsSubscribed(true);
          setFeedback({ type: 'success', message: 'Push-уведомления успешно включены!' });
        } else {
          setFeedback({ type: 'error', message: res.message || 'Ошибка включения уведомлений' });
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    setTestLoading(true);
    setFeedback(null);
    try {
      const res = await WebPushService.sendTestNotification();
      if (res.success) {
        setFeedback({ type: 'success', message: 'Тестовый пуш отправлен! Проверьте шторку телефона.' });
      } else {
        setFeedback({ type: 'error', message: res.message || 'Не удалось отправить тест' });
      }
    } finally {
      setTestLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="mx-2 sm:mx-3 my-1.5 px-2.5 py-1.5 rounded-xl bg-surface/60 border border-border/70 flex items-center justify-between gap-2 text-xs text-fg-muted">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="text-[11px] text-fg-subtle truncate">
            Для пуш-уведомлений на телефон: меню браузера → <strong className="text-fg font-medium">«На экран Домой»</strong>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 sm:mx-3 my-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-accent/5 via-surface to-surface border border-accent/20 flex flex-wrap items-center justify-between gap-1.5 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
          isSubscribed 
            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
            : 'bg-accent/15 border-accent/30 text-accent'
        }`}>
          <BellRing className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-fg whitespace-nowrap">Push-уведомления</span>
          {isSubscribed ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
              <Check className="w-2.5 h-2.5" /> Вкл
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
              Выкл
            </span>
          )}
          <span className="hidden md:inline text-[11px] text-fg-subtle truncate max-w-xs">
            {isSubscribed ? 'Оповещения на телефон активны' : 'Включите для звука и вибрации при закрытом приложении'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {isSubscribed && (
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testLoading}
            className="h-6 px-2 rounded-lg bg-surface hover:bg-surface-raised border border-border text-[11px] font-medium text-fg hover:text-accent transition-all active:scale-95 flex items-center gap-1 cursor-pointer disabled:opacity-50"
            title="Отправить тестовое уведомление для проверки звука и вибрации"
          >
            {testLoading ? (
              <Loader2 className="w-3 h-3 animate-spin text-accent" />
            ) : (
              <Send className="w-3 h-3 text-accent" />
            )}
            <span>Тест</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className={`h-6 px-2.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
            isSubscribed
              ? 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-danger'
              : 'bg-accent hover:bg-accent/90 text-white shadow-2xs'
          }`}
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          <span>{isSubscribed ? 'Отключить' : 'Включить'}</span>
        </button>
      </div>

      {feedback && (
        <div className={`w-full mt-1 p-1.5 rounded-lg text-[11px] flex items-center gap-1.5 border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
            : 'bg-danger/10 border-danger/25 text-danger'
        }`}>
          {feedback.type === 'success' ? (
            <Check className="w-3 h-3 shrink-0" />
          ) : (
            <AlertCircle className="w-3 h-3 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
