import type { Express } from 'express';
import { authenticateJwt, requireRoles, enforceStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RefundService } from './refund.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { calculateRecognizedProfit } from './profit';

export function registerRefundRoutes(app: Express) {
  app.get('/api/sales', authenticateJwt, enforceStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      const sales = await prisma.sale.findMany({
        where: storeId ? { storeId } : undefined,
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
