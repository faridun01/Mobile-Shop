import { apiClient } from '../api/client';

function urlB64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export class WebPushService {
  /**
   * Check if Push Notifications are supported by the current browser/device.
   */
  public static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }

  /**
   * Get current notification permission status.
   */
  public static getPermission(): PushPermissionStatus {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Check if device is currently subscribed to push notifications.
   */
  public static async isSubscribed(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch (err) {
      console.warn('[WebPush] Failed to check subscription status:', err);
      return false;
    }
  }

  /**
   * Request permission and subscribe device to Push notifications.
   */
  public static async subscribe(): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupported()) {
      return {
        success: false,
        message: 'Push-уведомления не поддерживаются вашим браузером. Убедитесь, что приложение добавлено на Главный экран (PWA).',
      };
    }

    try {
      // 1. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          message: 'Разрешение на отправку уведомлений отклонено в настройках телефона/браузера.',
        };
      }

      // 2. Fetch VAPID public key from backend
      const { publicKey } = await apiClient<{ publicKey: string }>('/push/public-key');
      if (!publicKey) {
        throw new Error('Ключ push-уведомлений не получен от сервера');
      }

      // 3. Ensure service worker is registered
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        try {
          reg = await navigator.serviceWorker.register('/sw.js');
        } catch {
          reg = await navigator.serviceWorker.register('/sw-push.js');
        }
      }

      // Wait for service worker to become ready (with 8s safety timeout)
      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Время ожидания Service Worker истекло. Обновите страницу.')), 8000)
      );
      const activeReg = await Promise.race([readyPromise, timeoutPromise]);

      const serverKey = urlB64ToUint8Array(publicKey);
      let subscription = await activeReg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await activeReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
      } else {
        // If subscription already exists, ensure applicationServerKey matches
        try {
          const rawKey = subscription.options.applicationServerKey;
          if (rawKey) {
            const currentKeyArray = new Uint8Array(rawKey);
            const matches =
              currentKeyArray.length === serverKey.length &&
              currentKeyArray.every((byte, idx) => byte === serverKey[idx]);
            if (!matches) {
              await subscription.unsubscribe();
              subscription = await activeReg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: serverKey,
              });
            }
          }
        } catch {
          await subscription.unsubscribe().catch(() => {});
          subscription = await activeReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: serverKey,
          });
        }
      }

      // 4. Send subscription to server
      const subscriptionJson = subscription.toJSON();
      await apiClient('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscriptionJson,
          userAgent: navigator.userAgent,
        }),
      });

      return { success: true, message: 'Push-уведомления на телефон успешно подключены!' };
    } catch (err: any) {
      console.error('[WebPush] Subscription error:', err);
      return {
        success: false,
        message: err.message || 'Не удалось подписаться на уведомления',
      };
    }
  }

  /**
   * Unsubscribe device from push notifications.
   */
  public static async unsubscribe(): Promise<{ success: boolean }> {
    if (!this.isSupported()) return { success: false };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { success: true };
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await apiClient('/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe();
      }
      return { success: true };
    } catch (err) {
      console.error('[WebPush] Unsubscribe error:', err);
      return { success: false };
    }
  }

  /**
   * Send a test push notification to verify delivery on phone.
   */
  public static async sendTestNotification(): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await apiClient<{ success: boolean; message: string }>('/push/test', {
        method: 'POST',
      });
      return res;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Ошибка отправки тестового уведомления',
      };
    }
  }
}
