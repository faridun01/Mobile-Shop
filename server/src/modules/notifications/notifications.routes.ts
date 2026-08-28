import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerNotificationRoutes(app: Express) {
  app.get('/api/notifications', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const notifications = await prisma.notification.findMany({
        where: {
          OR: [{ targetUserId: user.userId }, { targetRole: user.role }, { AND: [{ targetUserId: null }, { targetRole: null }] }],
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(notifications);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/notifications/:id/read', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const scope = { OR: [{ targetUserId: req.user!.userId }, { targetRole: req.user!.role }, { AND: [{ targetUserId: null }, { targetRole: null }] }] };
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
        where: { OR: [{ targetUserId: user.userId }, { targetRole: user.role }, { AND: [{ targetUserId: null }, { targetRole: null }] }] },
        data: { read: true, readAt: new Date() },
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/notifications/:id/resolve', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const scope = { OR: [{ targetUserId: req.user!.userId }, { targetRole: req.user!.role }, { AND: [{ targetUserId: null }, { targetRole: null }] }] };
      const result = await prisma.notification.updateMany({
        where: { id: req.params.id, ...scope },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });
      if (result.count !== 1) { res.status(404).json({ message: 'Уведомление не найдено' }); return; }
      const notification = await prisma.notification.findUniqueOrThrow({ where: { id: req.params.id } });
      RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', notification);
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });
}
