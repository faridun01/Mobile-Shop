import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { StockRevisionService } from './revisions.service';

export function registerStockRevisionRoutes(app: Express) {
  // List revisions history (ADMIN only)
  app.get('/api/revisions', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : undefined;
      const take = typeof req.query.take === 'string' ? req.query.take : undefined;

      const items = await StockRevisionService.list(user, { storeId, take });
      res.json(items);
    } catch (error) {
      next(error);
    }
  });

  // Get revision details by ID (ADMIN only)
  app.get('/api/revisions/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const item = await StockRevisionService.getById(user, req.params.id);
      res.json(item);
    } catch (error) {
      next(error);
    }
  });

  // Save completed revision (ADMIN only)
  app.post('/api/revisions', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      const body = req.body || {};
      const storeId = typeof body.storeId === 'string' ? body.storeId.trim() : undefined;
      const comment = typeof body.comment === 'string' ? body.comment : undefined;
      const checkedImeis = Array.isArray(body.checkedImeis) ? body.checkedImeis : [];
      const surplusDevices = Array.isArray(body.surplusDevices) ? body.surplusDevices : [];

      const result = await StockRevisionService.create(user, {
        storeId,
        comment,
        checkedImeis,
        surplusDevices,
      });

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });
}
