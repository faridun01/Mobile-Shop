import React, { useEffect, useState } from 'react';
import { BellRing, Check, X, Loader2, ShieldCheck } from 'lucide-react';
import { WebPushService } from '../../services/webPushService';
import { useAuthStore } from '../../stores/useAuthStore';

const STORAGE_KEY = 'admin_push_enabled';
const DEFERRED_KEY = 'admin_push_deferred_session';

export const AdminPushPrompt: React.FC = () => {
  const { currentUser } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // 1. Only show for ADMIN
    if (currentUser?.role !== 'ADMIN') return;

    // 2. Must support Web Push
    if (!WebPushService.isSupported()) return;

    // 3. Never show if already enabled and saved
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;

    // 4. Do not show if deferred in this session
    if (sessionStorage.getItem(DEFERRED_KEY) === 'true') return;

    // 5. Check actual browser subscription status
    let cancelled = false;
    WebPushService.isSubscribed().then((subscribed) => {
      if (cancelled) return;
      if (subscribed && Notification.permission === 'granted') {
        // Already active on this device: mark as enabled and never show
        localStorage.setItem(STORAGE_KEY, 'true');
        setVisible(false);
      } else if (Notification.permission !== 'denied') {
        // Not yet subscribed: show friendly 1-click prompt
        setVisible(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.role]);

  if (!visible) return null;

  const handleEnable = async () => {
    setLoading(true);
    try {
      const res = await WebPushService.subscribe();
      if (res.success) {
        setSuccess(true);
        // Permanently remember that push is enabled on this device so it NEVER shows again
        localStorage.setItem(STORAGE_KEY, 'true');

        // Immediately trigger an automated test notification to verify delivery
        await WebPushService.sendTestNotification().catch(() => {});

        // Close after showing the success checkmark
        setTimeout(() => {
          setVisible(false);
        }, 1800);
      } else {
        // If permission was denied or dismissed in the browser popup
        sessionStorage.setItem(DEFERRED_KEY, 'true');
        setVisible(false);
      }
    } catch {
      sessionStorage.setItem(DEFERRED_KEY, 'true');
      setVisible(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DEFERRED_KEY, 'true');
    setVisible(false);
  };

  return (
    <div className="fixed bottom-4 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 z-50 max-w-sm w-full mx-auto animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/95 backdrop-blur-md border border-accent/30 shadow-xl space-y-3">
        {success ? (
          <div className="flex items-center gap-3 py-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-fg">Уведомления подключены!</h4>
              <p className="text-[11px] text-fg-subtle">Проверьте шторку телефона — тестовый пуш отправлен.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/25 text-accent flex items-center justify-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs font-bold text-fg truncate">Уведомления для Админа</h4>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-accent/10 text-accent text-[9px] font-semibold">
                      <ShieldCheck className="w-2.5 h-2.5" /> Только вам
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-subtle mt-0.5 leading-tight">
                    Получать звуковые оповещения о продажах, смене и инкассациях на этот телефон?
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="p-1 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors shrink-0"
                title="Закрыть"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleEnable}
                disabled={loading}
                className="flex-1 h-8 px-3 rounded-xl bg-accent hover:opacity-90 active:scale-95 text-accent-fg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BellRing className="w-3.5 h-3.5" />
                )}
                <span>{loading ? 'Подключение…' : 'Включить в 1 клик'}</span>
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                disabled={loading}
                className="h-8 px-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg text-xs font-medium transition-colors cursor-pointer"
              >
                Позже
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
