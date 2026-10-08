import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { DailyClosingService } from './daily-closing.service';
import { prisma } from '../../prisma/prisma.service';

export function registerDailyClosingRoutes(app: Express) {
  // Get summary of expected cash for today or a specific date
  app.get('/api/daily-closings/summary', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      let storeId = typeof req.query.storeId === 'string' && req.query.storeId.trim() !== '' && req.query.storeId !== 'all'
        ? req.query.storeId.trim()
        : undefined;

      if (user.role === 'SELLER' || user.role === 'PARTNER') {
        if (!user.storeId) {
          return res.status(403).json({ message: 'Сотрудник не привязан к магазину' });
        }
        storeId = user.storeId;
      } else if (!storeId) {
        // Fallback for admin: if only 1 retail store exists, use it
        const retailStores = await prisma.store.findMany({
          where: { active: true, isMainWarehouse: false },
          orderBy: { name: 'asc' },
        });
        if (retailStores.length === 1) {
          storeId = retailStores[0].id;
        }
      }

      if (!storeId) {
        return res.status(400).json({ message: 'Укажите storeId' });
      }

      const businessDate = typeof req.query.businessDate === 'string' ? req.query.businessDate : undefined;
      const initialOpeningTjs = typeof req.query.initialOpeningTjs === 'string' ? req.query.initialOpeningTjs : undefined;

      const summary = await DailyClosingService.getSummary(storeId, businessDate, {
        tjs: initialOpeningTjs,
      });

      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  // Submit daily closing (Expected vs Actual Cash)
  app.post('/api/daily-closings', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      let storeId = typeof req.body?.storeId === 'string' && req.body.storeId.trim() !== '' && req.body.storeId !== 'all'
        ? req.body.storeId.trim()
        : undefined;

      if (user.role === 'SELLER' || user.role === 'PARTNER') {
        if (!user.storeId) {
          return res.status(403).json({ message: 'Сотрудник не привязан к магазину' });
        }
        storeId = user.storeId;
      } else if (!storeId) {
        const retailStores = await prisma.store.findMany({
          where: { active: true, isMainWarehouse: false },
          orderBy: { name: 'asc' },
        });
        if (retailStores.length === 1) {
          storeId = retailStores[0].id;
        }
      }

      if (!storeId) {
        return res.status(400).json({ message: 'Укажите storeId' });
      }

      const closing = await DailyClosingService.closeDay(user.userId, {
        storeId,
        businessDate: req.body?.businessDate,
        actualCashTjs: req.body?.actualCashTjs,
        comment: req.body?.comment,
        initialOpeningCashTjs: req.body?.initialOpeningCashTjs,
      });

      res.status(201).json(closing);
    } catch (error) {
      next(error);
    }
  });

  // Re-open / delete a daily closing (ADMIN only)
  app.delete('/api/daily-closings/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await DailyClosingService.delete(req.params.id, req.user!.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // List historical closings
  app.get('/api/daily-closings', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      let storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;

      if (user.role === 'SELLER' || user.role === 'PARTNER') {
        // Without a store an employee must see nothing, not every store's closings.
        if (!user.storeId) {
          return res.status(403).json({ message: 'Сотрудник не привязан к магазину' });
        }
        storeId = user.storeId;
      }

      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000) : undefined;

      const list = await DailyClosingService.list({ storeId, startDate, endDate, limit });
      res.json(list);
    } catch (error) {
      next(error);
    }
  });
}
