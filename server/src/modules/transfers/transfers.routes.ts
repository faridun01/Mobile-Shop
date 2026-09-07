import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { TransfersService } from './transfers.service';

export function registerTransferRoutes(app: Express) {
  app.get('/api/transfers', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      // SELLERs only see transfers touching their own store — cross-store transfer
      // history is not something a store employee should be able to read.
      const storeScope =
        req.user!.role === 'SELLER' && req.user!.storeId
          ? { OR: [{ fromStoreId: req.user!.storeId }, { toStoreId: req.user!.storeId }] }
          : undefined;

      const transfers = await prisma.transferRequest.findMany({
        where: storeScope,
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
      // SELLERs may request transfers OUT of their own assigned store, or IN from the main
      // warehouse into their own store (e.g. when the admin is away and stock still needs to
      // reach the shop floor) — approval still requires an ADMIN/PARTNER, so this never lets a
      // SELLER move stock on their own authority. Any other combination (another store's stock,
      // or a destination that isn't their own store) stays blocked.
      if (req.user!.role === 'SELLER') {
        const ownStoreId = req.user!.storeId;
        const isOwnStoreOrigin = fromStoreId === ownStoreId;
        const isPullFromMainWarehouse =
          toStoreId === ownStoreId &&
          !!(await prisma.store.findUnique({ where: { id: fromStoreId }, select: { isMainWarehouse: true } }))?.isMainWarehouse;
        if (!isOwnStoreOrigin && !isPullFromMainWarehouse) {
          res.status(403).json({ message: 'Вы можете перемещать товары только из своего магазина или с главного склада в свой магазин' });
          return;
        }
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
