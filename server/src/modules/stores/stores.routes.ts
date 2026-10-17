import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { StoresService } from './stores.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerStoreRoutes(app: Express) {
  app.post('/api/stores', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const store = await StoresService.create(req.body?.name, req.body?.address, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.status(201).json(store);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/stores/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const store = await StoresService.update(req.params.id, req.body?.name, req.body?.address, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/stores/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      await StoresService.remove(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  // ADMIN only: setting a register to an arbitrary balance bypasses every overdraft guard, so a
  // store partner could erase a shortage right before a collection or a shift closing.
  app.post('/api/stores/:id/adjust-cash', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      // A store register is corrected to the somoni counted in it (newBalanceTjs); Central Cash
      // may also be set in dollars (newBalanceUsd). The service converts and validates.
      const { newBalanceUsd, newBalanceTjs, reason } = req.body ?? {};
      const amount = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? v : undefined);
      const tjs = amount(newBalanceTjs);
      const usd = amount(newBalanceUsd);
      if (tjs === undefined && usd === undefined) {
        res.status(400).json({ message: 'Укажите пересчитанный остаток кассы в сомони (newBalanceTjs)' });
        return;
      }
      const store = await StoresService.adjustCashBalance(req.params.id, { tjs, usd }, reason, req.user!.userId);
      RealtimeSyncGateway.broadcast('STORE_UPDATED', { storeId: store.id });
      res.json(store);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/stores/:id/merge', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
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
