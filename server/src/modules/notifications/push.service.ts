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

const DEFAULT_PUBLIC_KEY = 'BEzkY3CfaEoQmoLWIbq5pUu4VN46h2MbnnCjJwltp97g5yys2wWaQKQVm2SThiziKT93RG-pgkmTGs0qZQV-JsI';
const DEFAULT_PRIVATE_KEY = 'QG9LaQRIX7kK6aNYgPOnU_iXxNMOaXNgqE1ixKcNVWQ';
const DEFAULT_SUBJECT = 'mailto:admin@mobileshop.tj';

export class PushNotificationService {
  private static configured = false;

  public static init() {
    if (this.configured) return;
    const publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || DEFAULT_SUBJECT;

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
      console.log('[WebPush] VAPID details configured successfully');
    } catch (err) {
      console.error('[WebPush] Failed to set VAPID details:', err);
    }
  }

  public static getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
  }

  /**
   * Save or update a push subscription for a user.
   */
  public static async saveSubscription(
    userId: string,
    sub: ClientPushSubscription,
    userAgent?: string
  ) {
    this.init();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      throw new Error('Invalid push subscription format: endpoint and keys are required');
    }

    const db = prisma as any;
    if (!db.pushSubscription) {
      console.warn('[WebPush] pushSubscription table/delegate not available in Prisma client');
      return null;
    }

    return await db.pushSubscription.upsert({
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
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Remove a push subscription by endpoint (e.g. on user opt-out).
   */
  public static async removeSubscription(endpoint: string) {
    const db = prisma as any;
    if (!db.pushSubscription) return;
    try {
      await db.pushSubscription.delete({ where: { endpoint } });
    } catch {
      // Ignored if already removed
    }
  }

  /**
   * Send a push notification to a specific stored subscription.
   */
  public static async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload
  ) {
    this.init();
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
    } catch (err: any) {
      // HTTP 404 or 410 means the user unsubscribed or the token has expired
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[WebPush] Subscription expired (${err.statusCode}), removing: ${sub.id}`);
        const db = prisma as any;
        if (db.pushSubscription) {
          await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      } else {
        console.error(`[WebPush] Error sending push notification to ${sub.endpoint.slice(0, 30)}...:`, err.message || err);
      }
    }
  }

  /**
   * Send push to all active subscriptions of a user.
   */
  public static async sendPushToUser(userId: string, payload: PushPayload) {
    const db = prisma as any;
    if (!db.pushSubscription) return;
    const subscriptions = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (!subscriptions || subscriptions.length === 0) return;

    await Promise.allSettled(
      subscriptions.map((sub: any) => this.sendToSubscription(sub, payload))
    );
  }

  /**
   * Send push notification to all users with a specific role (e.g. ADMIN).
   */
  public static async sendPushToRole(role: string, payload: PushPayload) {
    const db = prisma as any;
    if (!db.pushSubscription) return;
    const subscriptions = await db.pushSubscription.findMany({
      where: {
        user: {
          role,
          active: true,
        },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (!subscriptions || subscriptions.length === 0) return;

    console.log(`[WebPush] Dispatching push to ${subscriptions.length} devices for role ${role}: "${payload.title}"`);
    await Promise.allSettled(
      subscriptions.map((sub: any) => this.sendToSubscription(sub, payload))
    );
  }
}
