import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { CustomersService } from './customers.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerCustomerRoutes(app: Express) {
  // Summary for the "Касса" (Cash Register) overview dashboard page
  app.get('/api/cash-desk/summary', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const isStoreScoped = (req.user!.role === 'SELLER' || req.user!.role === 'PARTNER') && Boolean(req.user!.storeId);
      const storeId = isStoreScoped
        ? req.user!.storeId!
        : (typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined);
      const summary = await CustomersService.getCashDeskSummary(storeId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  // List customers with search and debt filtering
  app.get('/api/customers', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const debtorsOnly = req.query.debtorsOnly === 'true';
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
      const offset = req.query.offset ? Math.max(Number(req.query.offset) || 0, 0) : 0;

      const result = await CustomersService.list({ search, debtorsOnly, limit, offset });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Get customer by ID
  app.get('/api/customers/:id', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const customer = await CustomersService.getById(req.params.id);
      res.json(customer);
    } catch (error) {
      next(error);
    }
  });

  // Create customer
  app.post('/api/customers', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const customer = await CustomersService.create(req.body || {});
      RealtimeSyncGateway.broadcast('CUSTOMERS_UPDATED', { customerId: customer.id });
      res.status(201).json(customer);
    } catch (error) {
      next(error);
    }
  });

  // Update customer
  app.patch('/api/customers/:id', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const customer = await CustomersService.update(req.params.id, req.body || {});
      RealtimeSyncGateway.broadcast('CUSTOMERS_UPDATED', { customerId: customer.id });
      res.json(customer);
    } catch (error) {
      next(error);
    }
  });

  // Delete customer (ADMIN only)
  app.delete('/api/customers/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await CustomersService.delete(req.params.id);
      RealtimeSyncGateway.broadcast('CUSTOMERS_UPDATED', { customerId: req.params.id });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // Record customer debt payment
  app.post('/api/customers/:id/payments', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountTjs, storeId, sourceAccount, note } = req.body || {};
      const effectiveStoreId = (req.user!.role === 'SELLER' || req.user!.role === 'PARTNER')
        ? req.user!.storeId || undefined
        : storeId;

      const result = await CustomersService.recordPayment({
        customerId: req.params.id,
        amountTjs,
        storeId: effectiveStoreId,
        sourceAccount,
        note,
        userId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('CUSTOMERS_UPDATED', { customerId: req.params.id });
      RealtimeSyncGateway.broadcast('STORE_CASH', { storeId: result.storeId });
      RealtimeSyncGateway.broadcast('FINANCE_UPDATED', {});

      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // Save push subscription for customer
  app.post('/api/customers/:id/subscribe-push', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { subscription } = req.body || {};
      const customer = await CustomersService.savePushSubscription(req.params.id, subscription);
      RealtimeSyncGateway.broadcast('CUSTOMERS_UPDATED', { customerId: req.params.id });
      res.json({ success: true, customer });
    } catch (error) {
      next(error);
    }
  });

  // Send push notification to customers (ADMIN only)
  app.post('/api/customers/send-push', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { target, customerId, title, message, targetRoute } = req.body || {};
      const result = await CustomersService.sendPush({
        target: target || 'ALL',
        customerId,
        title,
        message,
        targetRoute,
        userId: req.user!.userId,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
