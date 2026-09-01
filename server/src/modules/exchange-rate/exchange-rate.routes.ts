import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { getBusinessDateKey, setTodayRate } from './exchange-rate.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerExchangeRateRoutes(app: Express) {
  app.get('/api/exchange-rate/today', authenticateJwt, async (_req, res, next) => {
    try {
      const today = getBusinessDateKey();
      const rate = await prisma.exchangeRate.findUnique({ where: { date: today } });
      res.json(rate);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/exchange-rate/today', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const rate = Number(req.body?.rate);
      if (!Number.isFinite(rate) || rate <= 0) {
        res.status(400).json({ message: 'Укажите корректный курс валюты' });
        return;
      }

      const before = await prisma.exchangeRate.findUnique({ where: { date: getBusinessDateKey() } });
      const result = await setTodayRate(rate, req.user!.userId);

      await prisma.auditLog.create({
        data: {
          userId: req.user!.userId,
          userRole: req.user!.role,
          action: before ? 'RATE_CHANGE' : 'RATE_SET',
          details: `Курс USD/TJS установлен: 1 USD = ${rate.toFixed(2)} TJS`,
          financialDetails: { exchangeRate: rate },
        },
      });

      RealtimeSyncGateway.broadcast('EXCHANGE_RATE_UPDATED', { rate });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
