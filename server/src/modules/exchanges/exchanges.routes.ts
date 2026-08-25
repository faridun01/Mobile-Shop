import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { ExchangesService } from './exchanges.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerExchangeRoutes(app: Express) {
  app.post('/api/exchanges', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      if (!body.saleId || !body.returnedImei || !body.replacementDeviceId || body.newPriceTjs == null || body.exchangeInValueTjs == null) {
        res.status(400).json({ message: 'saleId, returnedImei, replacementDeviceId, exchangeInValueTjs и newPriceTjs обязательны' });
        return;
      }

      const sale = await ExchangesService.process({ ...body, processedByUserId: req.user!.userId });
      RealtimeSyncGateway.broadcast('EXCHANGE_PROCESSED', { saleId: sale.id }, { storeIds: [sale.storeId] });
      res.json(sale);
    } catch (error) {
      next(error);
    }
  });
}
