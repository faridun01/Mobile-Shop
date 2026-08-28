import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { CustomersService } from './customers.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerCustomerRoutes(app: Express) {
  // Customer debt data is financial and ADMIN+PARTNER-only, matching the Suppliers
  // page's access model — a SELLER has no legitimate need to read it via direct API call.
  app.get('/api/customers', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      res.json(await prisma.customer.findMany({ orderBy: { name: 'asc' } }));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/customers/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const customer = await CustomersService.update(req.params.id, req.body ?? {});
      RealtimeSyncGateway.broadcast('CUSTOMER_UPDATED', { customerId: customer.id });
      res.json(customer);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/customers/:id/payments', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountTjs, sourceAccount, storeId } = req.body ?? {};
      if (!amountTjs || !sourceAccount) {
        res.status(400).json({ message: 'amountTjs и sourceAccount обязательны' });
        return;
      }
      const result = await CustomersService.pay({
        customerId: req.params.id,
        amountTjs: Number(amountTjs),
        sourceAccount,
        storeId,
        createdByUserId: req.user!.userId,
      });
      RealtimeSyncGateway.broadcast('CUSTOMER_PAYMENT', { customerId: req.params.id });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });
}
