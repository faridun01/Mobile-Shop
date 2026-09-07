import type { Express } from 'express';
import { authenticateJwt, requireRoles, enforceStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RefundService } from './refund.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { calculateRecognizedProfit } from './profit';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerRefundRoutes(app: Express) {
  app.get('/api/sales', authenticateJwt, enforceStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      // period/month let the Reports export preview ask for exactly the range it's showing,
      // instead of the client filtering the entire sales history it used to fetch in full.
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const dateRange = dateRangeForPeriod(period, month);
      const sales = await prisma.sale.findMany({
        where: { ...(storeId ? { storeId } : {}), ...(dateRange ? { createdAt: dateRange } : {}) },
        include: { saleItems: true, exchangeEvents: true, store: true, user: true },
        orderBy: { createdAt: 'desc' },
      });
      const saleIds = sales.map((sale) => sale.id);
      const profitLogs = saleIds.length
        ? await prisma.auditLog.findMany({
            where: { targetId: { in: saleIds }, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE'] } },
            select: { targetId: true, action: true, financialDetails: true },
          })
        : [];
      const profits = new Map<string, typeof profitLogs>();
      for (const log of profitLogs) if (log.targetId) profits.set(log.targetId, [...(profits.get(log.targetId) ?? []), log]);
      res.json(sales.map((sale) => {
        const fallbackCost = sale.saleItems.reduce((sum, item) => sum + item.costBasisUsd, 0);
        return { ...sale, recognizedProfitUsd: calculateRecognizedProfit(profits.get(sale.id) ?? [], sale.totalUsd - fallbackCost) };
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sales/:id/refund', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { reason, refundAmountTjs, penaltyFeeTjs, paymentMethod } = req.body ?? {};
      if (!reason || refundAmountTjs == null || !paymentMethod) {
        res.status(400).json({ message: 'reason, refundAmountTjs и paymentMethod обязательны' });
        return;
      }

      const sale = await RefundService.refund({
        saleId: req.params.id,
        reason,
        refundAmountTjs: Number(refundAmountTjs),
        penaltyFeeTjs: penaltyFeeTjs != null ? Number(penaltyFeeTjs) : undefined,
        paymentMethod,
        refundedByUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('REFUND_PROCESSED', { saleId: sale.id }, { storeIds: [sale.storeId] });
      res.json(sale);
    } catch (error) {
      next(error);
    }
  });
}
