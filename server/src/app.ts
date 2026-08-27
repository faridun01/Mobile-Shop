import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { prisma } from './prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { AuthService } from './auth/auth.service';
import { authenticateJwt, type AuthenticatedRequest, enforceBodyStoreScope, enforceStoreScope, requireRoles } from './auth/auth.middleware';
import { SalesService } from './modules/sales/sales.service';
import { RealtimeSyncGateway } from './websocket/websocket.gateway';
import { registerTransferRoutes } from './modules/transfers/transfers.routes';
import { registerRepairRoutes } from './modules/repairs/repairs.routes';
import { registerRefundRoutes } from './modules/sales/refund.routes';
import { registerExchangeRoutes } from './modules/exchanges/exchanges.routes';
import { registerSupplierRoutes } from './modules/suppliers/suppliers.routes';
import { registerExpenseRoutes } from './modules/expenses/expenses.routes';
import { registerOwnerRoutes } from './modules/owners/owners.routes';
import { registerUserRoutes } from './modules/users/users.routes';
import { registerAuditLogRoutes } from './modules/audit/audit.routes';
import { registerNotificationRoutes } from './modules/notifications/notifications.routes';
import { registerExchangeRateRoutes } from './modules/exchange-rate/exchange-rate.routes';
import { registerStoreRoutes } from './modules/stores/stores.routes';

export const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const login = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await prisma.user.findUnique({ where: { login }, include: { store: true } });

    if (!user || !user.active || !(await AuthService.verifyPassword(password, user.password))) {
      res.status(401).json({ message: 'Неверный логин или пароль' });
      return;
    }

    const token = AuthService.generateToken({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN',
        details: `Пользователь ${user.name} (${user.role}) вошел в систему`,
      },
    });

    res.json({
      token,
      user: {
        id: user.id,
        login: user.login,
        name: user.name,
        role: user.role,
        active: user.active,
        storeId: user.storeId,
        storeName: user.store?.name,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        userRole: req.user!.role,
        action: 'LOGOUT',
        details: 'Пользователь вышел из системы',
      },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/stores', authenticateJwt, async (_req, res, next) => {
  try {
    const stores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
    res.json(stores);
  } catch (error) {
    next(error);
  }
});

app.get('/api/devices', authenticateJwt, enforceStoreScope, async (req: AuthenticatedRequest, res, next) => {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    const devices = await prisma.device.findMany({
      where: storeId ? { storeId } : undefined,
      include: { store: true },
      orderBy: { createdAt: 'desc' },
    });

    const withBarcodes = devices.map((d) => {
      if (!d.barcode || d.barcode.trim() === '') {
        const gen = '200' + Math.floor(100000000 + Math.random() * 900000000).toString();
        return { ...d, barcode: gen };
      }
      return d;
    });

    res.json(withBarcodes);
  } catch (error) {
    next(error);
  }
});

app.post('/api/purchases', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { supplierId, invoiceNumber, date, storeId, isStorePurchase, groups } = req.body ?? {};
    if (!supplierId || !invoiceNumber || !storeId || !Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ message: 'supplierId, invoiceNumber, storeId и groups обязательны' });
      return;
    }

    const result = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      const store = await transaction.store.findUnique({ where: { id: storeId } });
      if (!supplier || !store) throw new Error('Поставщик или магазин не найден');

      function generateFallbackBarcode(): string {
        return '200' + Math.floor(100000000 + Math.random() * 900000000).toString();
      }

      const normalizedDevices = groups.flatMap((group: any) => {
        if (Array.isArray(group.items) && group.items.length > 0) {
          return group.items
            .filter((item: any) => item && typeof item.imei === 'string' && item.imei.trim().length > 0)
            .map((item: any, idx: number) => {
              const [imei1, imei2] = String(item.imei).split(/[\/,]/).map((part) => part.trim());
              const explicitImei2 = typeof item.imei2 === 'string' && item.imei2.trim() ? item.imei2.trim() : null;
              const itemBarcode = typeof item.barcode === 'string' && item.barcode.trim() ? item.barcode.trim() : null;
              const arrayBarcode = (Array.isArray(group.barcodes) && group.barcodes[idx] && typeof group.barcodes[idx] === 'string' && group.barcodes[idx].trim()) ? group.barcodes[idx].trim() : null;
              const groupBarcode = typeof group.barcode === 'string' && group.barcode.trim() ? group.barcode.trim() : null;
              const bCode = itemBarcode || arrayBarcode || groupBarcode || generateFallbackBarcode();
              return {
                imei: imei1,
                imei2: explicitImei2 || imei2 || null,
                barcode: bCode,
                brand: String(group.brand || '').trim(),
                model: String(group.model || '').trim(),
                storage: String(group.storage || '').trim(),
                color: String(group.color || '').trim(),
                purchasePriceUsd: Number(group.purchasePriceUsd) || 0,
              };
            });
        }

        const imeis = Array.isArray(group.imeis) ? group.imeis : [];
        const barcodes = Array.isArray(group.barcodes) ? group.barcodes : [];
        return imeis.filter((imei: unknown): imei is string => typeof imei === 'string' && imei.trim().length > 0).map((imei: string, idx: number) => {
          const [imei1, imei2] = imei.split(/[\/,]/).map((part) => part.trim());
          const bCode = (barcodes[idx] && typeof barcodes[idx] === 'string' && barcodes[idx].trim())
            ? barcodes[idx].trim()
            : (typeof group.barcode === 'string' && group.barcode.trim() ? group.barcode.trim() : generateFallbackBarcode());
          return {
            imei: imei1,
            imei2: imei2 || null,
            barcode: bCode,
            brand: String(group.brand || '').trim(),
            model: String(group.model || '').trim(),
            storage: String(group.storage || '').trim(),
            color: String(group.color || '').trim(),
            purchasePriceUsd: Number(group.purchasePriceUsd) || 0,
          };
        });
      });

      if (normalizedDevices.length === 0 || normalizedDevices.some((device) => !device.imei || !device.brand || !device.model)) {
        throw new Error('Каждое устройство должно содержать IMEI, бренд и модель');
      }

      const identifiers = normalizedDevices.flatMap((device) => [device.imei, device.imei2]).filter(Boolean);
      if (new Set(identifiers).size !== identifiers.length) throw new Error('В запросе обнаружены дублирующиеся IMEI');
      const existing = await transaction.device.findFirst({
        where: { OR: identifiers.flatMap((identifier) => [{ imei: identifier }, { imei2: identifier }]) },
      });
      if (existing) throw new Error(`IMEI ${existing.imei} уже зарегистрирован`);

      const totalAmountUsd = normalizedDevices.reduce((sum, device) => sum + device.purchasePriceUsd, 0);
      const invoice = await transaction.supplierInvoice.create({
        data: {
          invoiceNumber: String(invoiceNumber).trim(),
          supplierId,
          date: date ? new Date(date) : new Date(),
          totalAmountUsd,
          devicesCount: normalizedDevices.length,
          isStorePurchase: Boolean(isStorePurchase),
          storeId,
          groups: {
            create: groups.map((group: any) => ({
              brand: String(group.brand || '').trim(), model: String(group.model || '').trim(),
              storage: String(group.storage || '').trim(), color: String(group.color || '').trim(),
              quantity: Array.isArray(group.items)
                ? group.items.filter((i: any) => i && typeof i.imei === 'string' && i.imei.trim().length > 0).length
                : (Array.isArray(group.imeis) ? group.imeis.filter(Boolean).length : 0),
              purchasePriceUsd: Number(group.purchasePriceUsd) || 0,
            })),
          },
        },
      });

      const targetStatus = isStorePurchase ? ('STORE_STOCK' as const) : ('MAIN_WAREHOUSE' as const);
      const devices = await transaction.device.createManyAndReturn({
        data: normalizedDevices.map((device) => ({
          ...device,
          storeId,
          status: targetStatus,
          costBasisUsd: device.purchasePriceUsd,
          supplierId,
          supplierName: supplier.name,
          invoiceNumber: invoice.invoiceNumber,
          purchaseInvoiceId: invoice.id,
        })),
      });

      await transaction.supplier.update({
        where: { id: supplierId },
        data: { totalPurchasedUsd: { increment: totalAmountUsd }, totalDebtUsd: { increment: totalAmountUsd } },
      });

      await transaction.ledgerEntry.create({
        data: {
          type: 'PURCHASE',
          description: `Приход по накладной ${invoice.invoiceNumber} (${supplier.name}): ${devices.length} устройств`,
          amountUsd: totalAmountUsd,
          storeId,
          storeName: store.name,
          referenceId: invoice.id,
        },
      });

      await transaction.auditLog.create({
        data: {
          userId: req.user!.userId,
          userRole: req.user!.role,
          action: 'PURCHASE',
          details: `Создан приход по накладной ${invoice.invoiceNumber} (${supplier.name}): ${devices.length} устройств, сумма $${totalAmountUsd}`,
        },
      });

      return { invoice, devices };
    });

    RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', { storeId }, { storeIds: [storeId] });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sales', authenticateJwt, enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
  try {
    const sale = await SalesService.executeSale({ ...req.body, userId: req.user!.userId });
    RealtimeSyncGateway.broadcast('SALE_COMPLETED', { saleId: sale.id, storeId: sale.storeId }, { storeIds: [sale.storeId] });
    res.status(201).json(sale);
  } catch (error) {
    next(error);
  }
});

registerRefundRoutes(app);
registerTransferRoutes(app);
registerRepairRoutes(app);
registerExchangeRoutes(app);
registerSupplierRoutes(app);
registerExpenseRoutes(app);
registerOwnerRoutes(app);
registerUserRoutes(app);
registerAuditLogRoutes(app);
registerNotificationRoutes(app);
registerExchangeRateRoutes(app);
registerStoreRoutes(app);

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
    res.status(409).json({ message: 'Запись с такими уникальными данными уже существует' });
    return;
  }

  if (error instanceof Error) {
    res.status(400).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});
