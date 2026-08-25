import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { TransfersService } from './transfers.service';

export function registerTransferRoutes(app: Express) {
  app.get('/api/transfers', authenticateJwt, async (_req, res, next) => {
    try {
      const transfers = await prisma.transferRequest.findMany({
        include: { items: true, fromStore: true, toStore: true },
        orderBy: { requestedAt: 'desc' },
      });
      res.json(transfers);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { fromStoreId, toStoreId, deviceIds } = req.body ?? {};
      if (!fromStoreId || !toStoreId || !Array.isArray(deviceIds)) {
        res.status(400).json({ message: 'fromStoreId, toStoreId и deviceIds обязательны' });
        return;
      }
      const transfer = await TransfersService.create({ fromStoreId, toStoreId, deviceIds, requestedByUserId: req.user!.userId });
      res.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers/direct', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { fromStoreId, toStoreId, deviceIds } = req.body ?? {};
      if (!fromStoreId || !toStoreId || !Array.isArray(deviceIds)) {
        res.status(400).json({ message: 'fromStoreId, toStoreId и deviceIds обязательны' });
        return;
      }
      const transfer = await TransfersService.createDirect({ fromStoreId, toStoreId, deviceIds, requestedByUserId: req.user!.userId });
      res.status(201).json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers/:id/approve', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const transfer = await TransfersService.approve(req.params.id, req.user!.userId);
      res.json(transfer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/transfers/:id/reject', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Не указана';
      const transfer = await TransfersService.reject(req.params.id, req.user!.userId, reason);
      res.json(transfer);
    } catch (error) {
      next(error);
    }
  });
}
