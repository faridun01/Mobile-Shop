import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { ExchangesService } from './exchanges.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { hideSaleCosts } from '../sales/sale-visibility';

export function registerExchangeRoutes(app: Express) {
  app.post('/api/exchanges', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      if (!body.saleId || !(body.saleItemId || body.returnedImei) || !body.replacementDeviceId || body.newPriceTjs === undefined || body.newPriceTjs === null) {
        res.status(400).json({ message: 'Укажите чек, сдаваемый телефон, телефон на замену и его цену' });
        return;
      }

      // Store staff (SELLER and PARTNER) may only process an exchange against a sale from their
      // own store — otherwise they could move another store's stock and cash via a trade-in.
      if (req.user!.role !== 'ADMIN') {
        const sourceSale = await prisma.sale.findUnique({ where: { id: body.saleId }, select: { storeId: true } });
        if (!sourceSale || !req.user!.storeId || sourceSale.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Этот чек принадлежит другому магазину' });
          return;
        }
      }

      const result = await ExchangesService.process({
        saleId: body.saleId,
        saleItemId: body.saleItemId,
        returnedImei: body.returnedImei,
        withheldTjs: body.withheldTjs,
        replacementDeviceId: body.replacementDeviceId,
        newPriceTjs: body.newPriceTjs,
        paymentMethod: body.paymentMethod,
        cashAmountTjs: body.cashAmountTjs,
        cardAmountTjs: body.cardAmountTjs,
        reason: body.reason,
        processedByUserId: req.user!.userId,
      });
      RealtimeSyncGateway.broadcast('EXCHANGE_PROCESSED', { saleId: result.originalSaleId, newSaleId: result.sale.id }, { storeIds: [result.sale.storeId] });
      res.json({ ...result, sale: hideSaleCosts(result.sale, req.user!.role) });
    } catch (error) {
      next(error);
    }
  });
}
