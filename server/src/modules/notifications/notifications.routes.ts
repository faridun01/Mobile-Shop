import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { PushNotificationService } from './push.service';

const notificationScope = (user: NonNullable<AuthenticatedRequest['user']>) => ({
  AND: [
    { OR: [{ targetUserId: null }, { targetUserId: user.userId }] },
    { OR: [{ targetRole: null }, { targetRole: user.role }] },
  ],
});

export function registerNotificationRoutes(app: Express) {
  app.get('/api/notifications', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        res.json([]);
        return;
      }
      const user = req.user!;
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Notification Center history (ADMIN): only notifications from the last 24 hours to keep the list compact.
      if (req.query.view === 'history' && user.role === 'ADMIN') {
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
        const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
        const filters = [
          notificationScope(user),
          { createdAt: { gte: oneDayAgo } },
          ...(req.query.unread === '1' ? [{ read: false }] : []),
          ...(typeof req.query.storeId === 'string' && req.query.storeId ? [{ storeId: req.query.storeId }] : []),
          ...(typeof req.query.actionType === 'string' && req.query.actionType ? [{ actionType: req.query.actionType }] : []),
        ];
        const rows = await prisma.notification.findMany({
          where: { AND: filters },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        res.json({ items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null });
        return;
      }

      // Notifications list & badge: only show notifications created within the last 24 hours
      const notifications = await prisma.notification.findMany({
        where: {
          AND: [
            notificationScope(user),
            { createdAt: { gte: oneDayAgo } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      res.json(notifications);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/notifications/:id/read', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const scope = notificationScope(req.user!);
      const result = await prisma.notification.updateMany({
        where: { id: req.params.id, ...scope },
        data: { read: true, readAt: new Date() },
      });
      if (result.count !== 1) { res.status(404).json({ message: 'Уведомление не найдено' }); return; }
      const notification = await prisma.notification.findUniqueOrThrow({ where: { id: req.params.id } });
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/notifications/read-all', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      await prisma.notification.updateMany({
        where: notificationScope(user),
        data: { read: true, readAt: new Date() },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/notifications/:id/resolve', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const scope = notificationScope(req.user!);
      const result = await prisma.notification.updateMany({
        where: { id: req.params.id, ...scope },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });
      if (result.count !== 1) { res.status(404).json({ message: 'Уведомление не найдено' }); return; }
      const notification = await prisma.notification.findUniqueOrThrow({ where: { id: req.params.id } });
      RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', { id: notification.id }, notification.targetRole ? { roles: [notification.targetRole] } : {});
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });

  // Get VAPID public key for frontend push subscription
  app.get('/api/push/public-key', authenticateJwt, (_req, res) => {
    const publicKey = PushNotificationService.getPublicKey();
    if (!publicKey) {
      res.status(503).json({ message: 'Push-уведомления не настроены на сервере' });
      return;
    }
    res.json({ publicKey });
  });

  // Save push subscription for the logged-in user
  app.post('/api/push/subscribe', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const { subscription, userAgent } = req.body || {};
      if (!subscription?.endpoint) {
        res.status(400).json({ message: 'Push subscription payload is required' });
        return;
      }
      await PushNotificationService.saveSubscription(user.userId, subscription, userAgent);
      res.json({ success: true, message: 'Push-уведомления успешно подключены' });
    } catch (error) {
      next(error);
    }
  });

  // Unsubscribe from push
  app.post('/api/push/unsubscribe', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { endpoint } = req.body || {};
      if (typeof endpoint === 'string' && endpoint) {
        await PushNotificationService.removeSubscription(endpoint, req.user!.userId);
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // Test push notification delivery to current user
  app.post('/api/push/test', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      await PushNotificationService.sendPushToUser(user.userId, {
        title: 'Mobile Shop 📲',
        message: 'Проверка связи: Push-уведомления на телефон работают отлично!',
        targetRoute: '/notifications',
        dedupeKey: `TEST_PUSH:${user.userId}:${Date.now()}`,
      });
      res.json({ success: true, message: 'Тестовое уведомление отправлено на телефон' });
    } catch (error) {
      next(error);
    }
  });
}
