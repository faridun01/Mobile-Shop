import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { StockThresholdsService } from './stock-thresholds.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerStockThresholdRoutes(app: Express) {
  // GET /api/stock-thresholds
  app.get('/api/stock-thresholds', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const requestedStoreId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;

      // Sellers and partners are restricted to their assigned store if not admin
      let effectiveStoreId = requestedStoreId;
      if (user.role === 'SELLER' || user.role === 'PARTNER') {
        if (user.storeId) {
          effectiveStoreId = user.storeId;
        }
      }

      const thresholds = await StockThresholdsService.getThresholds(effectiveStoreId);
      res.json(thresholds);
    } catch (error) {
      next(error);
    }
  });

  // POST /api/stock-thresholds
  app.post(
    '/api/stock-thresholds',
    authenticateJwt,
    requireRoles('ADMIN', 'PARTNER'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const user = req.user!;
        const { storeId, brand, model, storage, minQuantity } = req.body || {};

        if (!storeId || !brand || !model) {
          res.status(400).json({ message: 'storeId, brand и model обязательны для заполнения' });
          return;
        }

        if (user.role === 'PARTNER' && user.storeId && user.storeId !== storeId) {
          res.status(403).json({ message: 'Вы можете настраивать лимиты только для своего магазина' });
          return;
        }

        const threshold = await StockThresholdsService.upsertThreshold({
          storeId,
          brand,
          model,
          storage: storage || 'ALL',
          minQuantity: Number(minQuantity) || 0,
        });

        RealtimeSyncGateway.broadcast('STOCK_THRESHOLD_UPDATED', {
          threshold,
          storeId,
        });

        res.json(threshold);
      } catch (error) {
        next(error);
      }
    }
  );

  // POST /api/stock-thresholds/batch
  app.post(
    '/api/stock-thresholds/batch',
    authenticateJwt,
    requireRoles('ADMIN', 'PARTNER'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const user = req.user!;
        const { storeId, items } = req.body || {};

        if (!storeId || !Array.isArray(items)) {
          res.status(400).json({ message: 'storeId и items (массив) обязательны' });
          return;
        }

        if (user.role === 'PARTNER' && user.storeId && user.storeId !== storeId) {
          res.status(403).json({ message: 'Вы можете настраивать лимиты только для своего магазина' });
          return;
        }

        const results = await StockThresholdsService.batchUpsertThresholds(storeId, items);

        RealtimeSyncGateway.broadcast('STOCK_THRESHOLD_UPDATED', {
          storeId,
          count: results.length,
        });

        res.json(results);
      } catch (error) {
        next(error);
      }
    }
  );

  // DELETE /api/stock-thresholds/:id
  app.delete(
    '/api/stock-thresholds/:id',
    authenticateJwt,
    requireRoles('ADMIN', 'PARTNER'),
    async (req: AuthenticatedRequest, res, next) => {
      try {
        const { id } = req.params;
        await StockThresholdsService.deleteThreshold(id);
        RealtimeSyncGateway.broadcast('STOCK_THRESHOLD_UPDATED', { deletedId: id });
        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    }
  );
}
