import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { SuppliersService } from './suppliers.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerSupplierRoutes(app: Express) {
  app.get('/api/suppliers', authenticateJwt, async (_req, res, next) => {
    try {
      res.json(await prisma.supplier.findMany({ orderBy: { name: 'asc' } }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/supplier-invoices', authenticateJwt, async (_req, res, next) => {
    try {
      const invoices = await prisma.supplierInvoice.findMany({ include: { groups: true, supplier: true }, orderBy: { date: 'desc' } });
      const withComputed = invoices.map((inv) => ({
        ...inv,
        remainingAmountUsd: inv.totalAmountUsd - inv.paidAmountUsd,
        status: inv.paidAmountUsd >= inv.totalAmountUsd ? 'PAID' : inv.paidAmountUsd > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
      }));
      res.json(withComputed);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/supplier-bonuses', authenticateJwt, async (_req, res, next) => {
    try {
      res.json(await prisma.supplierBonus.findMany({ include: { freeDevices: true, supplier: true }, orderBy: { createdAt: 'desc' } }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/suppliers', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const supplier = await SuppliersService.create(req.body ?? {});
      res.status(201).json(supplier);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/suppliers/:id/payments', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, sourceAccount, storeId, note } = req.body ?? {};
      if (!amountUsd || !sourceAccount) {
        res.status(400).json({ message: 'amountUsd и sourceAccount обязательны' });
        return;
      }
      const result = await SuppliersService.pay({
        supplierId: req.params.id,
        amountUsd: Number(amountUsd),
        sourceAccount,
        storeId,
        note,
        createdByUserId: req.user!.userId,
      });
      RealtimeSyncGateway.broadcast('SUPPLIER_PAYMENT', { supplierId: req.params.id });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/supplier-bonuses', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const bonus = await SuppliersService.createBonus({ ...(req.body ?? {}), createdByUserId: req.user!.userId });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
      res.status(201).json(bonus);
    } catch (error) {
      next(error);
    }
  });
}
