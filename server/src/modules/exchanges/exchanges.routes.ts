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
      const returnsSomething = Boolean(body.saleItemId || body.returnedImei || body.returnedAccessory);
      const sellsDevice = Boolean(body.replacementDeviceId) && body.newPriceTjs !== undefined && body.newPriceTjs !== null;
      if (!body.saleId || !returnsSomething || !(sellsDevice || body.replacementAccessory)) {
        res.status(400).json({ message: 'Укажите чек, сдаваемый товар, товар на замену и его цену' });
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
        returnedAccessory: body.returnedAccessory
          ? { lineId: String(body.returnedAccessory.lineId ?? ''), quantity: Number(body.returnedAccessory.quantity) }
          : undefined,
        withheldTjs: body.withheldTjs,
        replacementDeviceId: body.replacementDeviceId,
        newPriceTjs: body.newPriceTjs,
        replacementAccessory: body.replacementAccessory
          ? { productId: String(body.replacementAccessory.productId ?? ''), quantity: Number(body.replacementAccessory.quantity), unitPriceTjs: body.replacementAccessory.unitPriceTjs }
          : undefined,
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
