import webpush from 'web-push';
import { prisma } from '../../prisma/prisma.service';

export interface PushPayload {
  title: string;
  message: string;
  targetRoute?: string;
  dedupeKey?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface ClientPushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

const DEFAULT_VAPID_PUBLIC_KEY =
  'BEzkY3CfaEoQmoLWIbq5pUu4VN46h2MbnnCjJwltp97g5yys2wWaQKQVm2SThiziKT93RG-pgkmTGs0qZQV-JsI';
const DEFAULT_VAPID_PRIVATE_KEY =
  'QG9LaQRIX7kK6aNYgPOnU_iXxNMOaXNgqE1ixKcNVWQ';
const DEFAULT_SUBJECT = 'mailto:admin@mobileshop.tj';

// The server POSTs to whatever endpoint a subscription names, so only real browser push
// services are accepted — anything else would let a user make the server call internal hosts.
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) =>
    allowed.startsWith('.') ? host === allowed.slice(1) || host.endsWith(allowed) : host === allowed
  );
}

export class PushNotificationService {
  private static configured = false;
  private static warnedMissingKeys = false;

  /**
   * Configures VAPID from the environment with built-in default keys as a fallback.
   * If VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are provided in env, they take precedence.
   */
  public static init(): boolean {
    if (this.configured) return true;
    const publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || DEFAULT_SUBJECT;
    if (!publicKey || !privateKey) {
      if (!this.warnedMissingKeys) {
        console.warn('[WebPush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY не заданы — push-уведомления отключены');
        this.warnedMissingKeys = true;
      }
      return false;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
      console.log('[WebPush] VAPID details configured successfully');
    } catch (err) {
      console.error('[WebPush] Failed to set VAPID details:', err);
    }
    return this.configured;
  }

  public static isEnabled(): boolean {
    return this.init();
  }

  public static getPublicKey(): string | null {
    if (!this.init()) return null;
    return process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  }

  /**
   * Save or update a push subscription for a user.
   */
  public static async saveSubscription(
    userId: string,
    sub: ClientPushSubscription,
    userAgent?: string
  ) {
    if (!this.init()) {
      throw Object.assign(new Error('Push-уведомления не настроены на сервере'), { statusCode: 503 });
    }
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      throw new Error('Некорректная push-подписка: нужны endpoint и ключи');
    }
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      throw new Error('Push-подписка должна указывать на сервис уведомлений браузера');
    }

    return await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent || null,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent || null,
      },
    });
  }

  /**
   * Remove a push subscription by endpoint (e.g. on user opt-out). Scoped to the user so
   * one account can never unsubscribe another account's device.
   */
  public static async removeSubscription(endpoint: string, userId: string) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }

  /**
   * Send a push notification to a specific stored subscription.
   * Returns true when the push service accepted the message, false otherwise.
   */
  public static async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
    onExpired?: () => Promise<unknown>
  ): Promise<boolean> {
    if (!this.init()) return false;
    // Re-checked at send time too, so rows saved before the allowlist existed are never called.
    if (!isAllowedPushEndpoint(sub.endpoint)) return false;
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    const notificationPayload = JSON.stringify({
      title: payload.title,
      message: payload.message,
      targetRoute: payload.targetRoute || '/notifications',
      dedupeKey: payload.dedupeKey,
      data: payload.data,
    });

    try {
      await webpush.sendNotification(pushSubscription, notificationPayload, {
        TTL: 60 * 60 * 24, // 24 hours
        urgency: 'high',
      });
      return true;
    } catch (err: any) {
      // HTTP 404 or 410 means the user unsubscribed or the token has expired
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[WebPush] Subscription expired (${err.statusCode}), removing: ${sub.id}`);
        const remove = onExpired ?? (() => prisma.pushSubscription.delete({ where: { id: sub.id } }));
        await remove().catch(() => {});
      } else {
        console.error(`[WebPush] Error sending push notification to ${sub.endpoint.slice(0, 30)}...:`, err.message || err);
      }
      return false;
    }
  }

  /**
   * Send push to all active subscriptions of a user.
   */
  public static async sendPushToUser(userId: string, payload: PushPayload) {
    if (!this.init() || !prisma.pushSubscription) return;
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    await Promise.allSettled(
      subscriptions.map((sub) => this.sendToSubscription(sub, payload))
    );
  }

  /**
   * Send push notification to all users with a specific role (e.g. ADMIN).
   */
  public static async sendPushToRole(role: 'ADMIN' | 'PARTNER' | 'SELLER', payload: PushPayload) {
    if (!this.init() || !prisma.pushSubscription) return;
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        user: {
          role,
          active: true,
        },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    console.log(`[WebPush] Dispatching push to ${subscriptions.length} devices for role ${role}: "${payload.title}"`);
    await Promise.allSettled(
      subscriptions.map((sub) => this.sendToSubscription(sub, payload))
    );
  }
}
