import type { Express } from 'express';
import { authenticateJwt, requireRoles } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';

export function registerAuditLogRoutes(app: Express) {
  app.get('/api/audit-logs', authenticateJwt, requireRoles('ADMIN'), async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 200, 500);
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const logs = await prisma.auditLog.findMany({
        take: limit,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { createdAt: 'desc' },
      });
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });
}
