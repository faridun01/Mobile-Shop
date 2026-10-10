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
      <div className="mx-2 sm:mx-3 my-1 px-2 py-1 rounded-lg bg-surface/60 border border-border/70 flex items-center justify-between gap-1.5 text-[11px] text-fg-muted shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Smartphone className="w-3.5 h-3.5 text-warning shrink-0" />
          <span className="text-[10px] text-fg-subtle truncate">
            Для пуш на телефон: браузер → <strong className="text-fg font-medium">«На экран Домой»</strong>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2 sm:mx-3 my-1 shrink-0">
      <div className="px-2 py-1 rounded-lg bg-surface/90 border border-border flex items-center justify-between gap-1.5 text-xs shadow-2xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
            isSubscribed 
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
              : 'bg-accent/15 border-accent/30 text-accent'
          }`}>
            <BellRing className="w-3 h-3" />
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[11px] font-semibold text-fg whitespace-nowrap">Push-уведомления</span>
            {isSubscribed ? (
              <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                <Check className="w-2.5 h-2.5" /> Вкл
              </span>
            ) : (
              <span className="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                Выкл
              </span>
            )}
            <span className="hidden lg:inline text-[10px] text-fg-subtle truncate max-w-xs">
              {isSubscribed ? 'Оповещения активны' : 'Включите для оповещений при закрытом приложении'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {isSubscribed && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={testLoading}
              className="h-5.5 px-1.5 rounded-md bg-surface-raised hover:bg-surface border border-border text-[10px] font-medium text-fg hover:text-accent transition-all active:scale-95 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Отправить тестовое уведомление для проверки звука и вибрации"
            >
              {testLoading ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin text-accent" />
              ) : (
                <Send className="w-2.5 h-2.5 text-accent" />
              )}
              <span>Тест</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className={`h-5.5 px-2 rounded-md text-[10px] font-semibold transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
              isSubscribed
                ? 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-danger'
                : 'bg-accent hover:bg-accent/90 text-white shadow-2xs'
            }`}
          >
            {loading && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            <span>{isSubscribed ? 'Отключить' : 'Включить'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`mt-1 px-2 py-1 rounded-md text-[10px] flex items-center gap-1.5 border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
            : 'bg-danger/10 border-danger/25 text-danger'
        }`}>
          {feedback.type === 'success' ? (
            <Check className="w-2.5 h-2.5 shrink-0" />
          ) : (
            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
          )}
          <span className="truncate">{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
