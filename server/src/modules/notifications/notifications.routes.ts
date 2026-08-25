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

  app.patch('/api/notifications/:id/read', authenticateJwt, async (req, res, next) => {
    try {
      const notification = await prisma.notification.update({
        where: { id: req.params.id },
        data: { read: true, readAt: new Date() },
      });
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

  app.patch('/api/notifications/:id/resolve', authenticateJwt, async (req, res, next) => {
    try {
      const notification = await prisma.notification.update({
        where: { id: req.params.id },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });
      RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', notification);
      res.json(notification);
    } catch (error) {
      next(error);
    }
  });
}
