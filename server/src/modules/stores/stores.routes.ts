import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { StoresService } from './stores.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerStoreRoutes(app: Express) {
  app.post('/api/stores', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const store = await StoresService.create(req.body?.name, req.body?.address, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.status(201).json(store);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/stores/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const store = await StoresService.update(req.params.id, req.body?.name, req.body?.address, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/stores/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      await StoresService.remove(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/stores/:id/adjust-cash', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { newBalanceTjs, reason } = req.body ?? {};
      if (newBalanceTjs === undefined || newBalanceTjs === null) {
        res.status(400).json({ message: 'newBalanceTjs обязателен' });
        return;
      }
      const store = await StoresService.adjustCashBalance(req.params.id, Number(newBalanceTjs), reason, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/stores/:id/merge', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const targetStoreId = req.body?.targetStoreId;
      if (!targetStoreId) {
        res.status(400).json({ message: 'targetStoreId обязателен' });
        return;
      }
      const store = await StoresService.mergeAndDelete(req.params.id, targetStoreId, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: targetStoreId });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });
}
