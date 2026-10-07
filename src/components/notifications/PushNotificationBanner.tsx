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
      <div className="mx-2.5 sm:mx-4 my-2 p-3 rounded-xl bg-surface/70 border border-border/80 flex items-start gap-2.5 text-xs text-fg-muted">
        <Smartphone className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-medium text-fg">Для пуш-уведомлений на заблокированный телефон</p>
          <p className="text-[11px] text-fg-subtle">
            Добавьте приложение на главный экран телефона: в браузере нажмите <span className="font-semibold text-fg">«Поделиться»</span> (или меню ⋮) → <span className="font-semibold text-fg">«На экран Домой»</span>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-2.5 sm:mx-4 my-2 p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-accent/10 via-surface to-surface border border-accent/25 shadow-sm space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
            isSubscribed 
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
              : 'bg-accent/15 border-accent/30 text-accent'
          }`}>
            <BellRing className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-semibold text-fg">
                Push-уведомления на телефон
              </h3>
              {isSubscribed ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <Check className="w-2.5 h-2.5" /> Активно
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Отключено
                </span>
              )}
            </div>
            <p className="text-[11px] text-fg-subtle mt-0.5">
              {isSubscribed 
                ? 'Вы получаете системные оповещения на заблокированный экран' 
                : 'Включите, чтобы телефон вибрировал и звонил при закрытом приложении'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          {isSubscribed && (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={testLoading}
              className="px-2.5 py-1.5 rounded-xl bg-surface hover:bg-surface-raised border border-border text-xs font-medium text-fg hover:text-accent transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Отправить тестовое уведомление для проверки звука и вибрации"
            >
              {testLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
              ) : (
                <Send className="w-3.5 h-3.5 text-accent" />
              )}
              <span>Тест на телефон</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-sm ${
              isSubscribed
                ? 'bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-danger'
                : 'bg-accent hover:bg-accent/90 text-white'
            }`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{isSubscribed ? 'Отключить' : 'Включить на этом телефоне'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-2 rounded-xl text-xs flex items-center gap-2 border ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
            : 'bg-danger/10 border-danger/25 text-danger'
        }`}>
          {feedback.type === 'success' ? (
            <Check className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
