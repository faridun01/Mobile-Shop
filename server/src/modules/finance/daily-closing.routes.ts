import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { DailyClosingService } from './daily-closing.service';

export function registerDailyClosingRoutes(app: Express) {
  // Get summary of expected cash for today or a specific date
  app.get('/api/daily-closings/summary', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = req.user!;
      let storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;

      if (user.role === 'SELLER' || user.role === 'PARTNER') {
        if (!user.storeId) {
          return res.status(403).json({ message: 'Сотрудник не привязан к магазину' });
        }
        storeId = user.storeId;
      } else if (!storeId) {
        return res.status(400).json({ message: 'Укажите storeId' });
      }

      const businessDate = typeof req.query.businessDate === 'string' ? req.query.businessDate : undefined;
      const initialOpeningTjs = typeof req.query.initialOpeningTjs === 'string' ? req.query.initialOpeningTjs : undefined;
      const initialOpeningUsd = typeof req.query.initialOpeningUsd === 'string' ? req.query.initialOpeningUsd : undefined;

      const summary = await DailyClosingService.getSummary(storeId, businessDate, {
        tjs: initialOpeningTjs,
        usd: initialOpeningUsd,
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
      let storeId = req.body?.storeId;

      if (user.role === 'SELLER' || user.role === 'PARTNER') {
        if (!user.storeId) {
          return res.status(403).json({ message: 'Сотрудник не привязан к магазину' });
        }
        storeId = user.storeId;
      } else if (!storeId) {
        return res.status(400).json({ message: 'Укажите storeId' });
      }

      const closing = await DailyClosingService.closeDay(user.userId, {
        storeId,
        businessDate: req.body?.businessDate,
        actualCashTjs: req.body?.actualCashTjs,
        actualCashUsd: req.body?.actualCashUsd,
        comment: req.body?.comment,
        initialOpeningCashTjs: req.body?.initialOpeningCashTjs,
        initialOpeningCashUsd: req.body?.initialOpeningCashUsd,
      });

      res.status(201).json(closing);
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
        storeId = user.storeId || undefined;
      }

      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const limit = req.query.limit !== undefined ? Number(req.query.limit) || undefined : undefined;

      const list = await DailyClosingService.list({ storeId, startDate, endDate, limit });
      res.json(list);
    } catch (error) {
      next(error);
    }
  });
}
