import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RefundService } from './refund.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerRefundRoutes(app: Express) {
  app.get('/api/sales', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : req.user!.role === 'SELLER' ? req.user!.storeId ?? undefined : undefined;
      const sales = await prisma.sale.findMany({
        where: storeId ? { storeId } : undefined,
        include: { saleItems: true, exchangeEvents: true, store: true, user: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(sales);
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
