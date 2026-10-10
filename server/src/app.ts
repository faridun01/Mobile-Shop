import { D, moneyJson } from './common/decimal';
import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { prisma } from './prisma/prisma.service';
import type { TransactionClient } from './prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { AuthService } from './auth/auth.service';
import { authenticateJwt, type AuthenticatedRequest, enforceBodyStoreScope, requireRoles } from './auth/auth.middleware';
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
import { registerReportRoutes } from './modules/reports/reports.routes';
import { registerBonusRoutes } from './modules/bonuses/bonuses.routes';
import { registerCashCollectionRoutes } from './modules/finance/cash-collection.routes';
import { registerDailyClosingRoutes } from './modules/finance/daily-closing.routes';
import { registerStoreReceiptRoutes } from './modules/store-receipts/store-receipts.routes';
import { registerCustomerRoutes } from './modules/customers/customers.routes';
import { registerStockRevisionRoutes } from './modules/revisions/revisions.routes';
import { decorateTransactions } from './prisma/prisma.service';
import { withAuditNotifications } from './modules/notifications/audit-notifications';
import { requireNonNegativeMoney, requirePositiveMoney, roundMoney } from './common/money';
import { requireTodayRate } from './modules/exchange-rate/exchange-rate.service';
import { decimalJsonReplacer } from './common/decimal';
import { operationContext } from './common/request-operation';
import { lockCashRegister } from './modules/finance/account.service';
import { postTransaction } from './modules/finance/financial-transaction.service';
import { resolveActor } from './common/actor';

export const app = express();
app.set('json replacer', decimalJsonReplacer);

// Trusts the immediate upstream proxy (nginx, in production — see docker-compose.prod.yml)
// so req.ip reflects the real client IP from X-Forwarded-For instead of nginx's own
// container IP. Without this every request behind the proxy looks like it comes from the
// same address, which would make the login rate limiter below either lock out every user
// at once or protect no one.
// TRUST_PROXY is the number of proxy hops in front of the app (docker + nginx: 1; Vercel
// rewrite → Render: usually 2). Too low and every client shares the proxy's IP, so anyone
// could lock any login out of the rate limiter; too high and clients can spoof their IP.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY ?? '1', 10);
app.set('trust proxy', Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);

// Allowed origins come from APP_URL (comma-separated for multiple, e.g. a staging +
// prod domain). In this app's actual deployment shape nothing legitimate ever calls
// the API cross-origin — prod serves the frontend and API from the same origin via
// nginx, and the Vite dev server proxies /api server-side — so there's no real use
// case for a wildcard here. Fall back to '*' only when APP_URL isn't configured, so
// local runs without a .env don't unexpectedly break — but production must never silently
// degrade to a wildcard just because an operator forgot to set APP_URL, so it fails to boot
// instead (same fail-fast contract as JWT_SECRET in auth.service.ts).
if (process.env.NODE_ENV === 'production' && !process.env.APP_URL?.trim()) {
  throw new Error('APP_URL environment variable must be set in production (no wildcard CORS fallback is permitted)');
}
const allowedOrigins = (process.env.APP_URL || '').split(',').map((o) => o.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Baseline security headers on every response. nginx adds them in the docker deployment, but
// the Render-hosted API is reached directly (through the Vercel rewrite), without nginx.
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(operationContext);

app.get('/api/health', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

// Login brute-force throttle: nginx's general /api/ rate limit (10 req/s, see
// nginx/nginx.conf) is generous enough that it doesn't meaningfully slow down password
// guessing on its own. This is a simple in-memory per-IP+login sliding window — sufficient
// for this app's single-instance deployment (docker-compose.prod.yml runs one `app`
// container); it would need a shared store (e.g. Redis) if that ever changes to multiple
// replicas.
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; windowStartedAt: number }>();
const loginAttemptsCleanup = setInterval(() => {
  const cutoff = Date.now() - LOGIN_ATTEMPT_WINDOW_MS;
  for (const [key, entry] of loginAttempts) {
    if (entry.windowStartedAt <= cutoff) loginAttempts.delete(key);
  }
}, 60_000);
loginAttemptsCleanup.unref();

function isLoginRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.windowStartedAt > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, windowStartedAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const login = typeof req.body?.login === 'string' ? req.body.login.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const rateLimitKey = `${req.ip}:${login.toLowerCase()}`;
    if (isLoginRateLimited(rateLimitKey)) {
      res.status(429).json({ message: 'Слишком много попыток входа. Попробуйте снова через несколько минут.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { login }, include: { store: true } });
    // An unknown login still costs a full hash check, so timing does not reveal valid logins.
    const passwordOk = user
      ? await AuthService.verifyPassword(password, user.password)
      : await AuthService.verifyAgainstDummy(password);

    if (!user || !user.active || !passwordOk) {
      res.status(401).json({ message: 'Неверный логин или пароль' });
      return;
    }

    loginAttempts.delete(rateLimitKey);
    const token = await AuthService.createSession({ userId: user.id, login: user.login, role: user.role, storeId: user.storeId }, user.password);

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN',
        details: `Пользователь ${user.name} (${user.role}) вошел в систему`,
        ipAddress: req.ip,
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
    await prisma.authSession.update({ where: { id: req.user!.sessionId! }, data: { revokedAt: new Date() } });
    RealtimeSyncGateway.disconnectSession(req.user!.sessionId!);
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

app.get('/api/stores', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
  try {
    const isStoreScoped = req.user!.role === 'SELLER' || req.user!.role === 'PARTNER';
    const storeId = req.user!.storeId;
    // Store staff get their own store, plus the main warehouse by name only (a receipt names it
    // as the source; a return can be sent to it). Its cash and stock stay ADMIN-only.
    // Closed (merged) stores are history only and are not offered anywhere.
    const where = isStoreScoped
      ? (storeId ? { active: true, OR: [{ id: storeId }, { isMainWarehouse: true }] } : { id: '__none__' })
      : { active: true };
    const stores = await prisma.store.findMany({ where, orderBy: { name: 'asc' } });
    res.json(isStoreScoped
      ? stores.map((s) => (s.isMainWarehouse ? { id: s.id, name: s.name, isMainWarehouse: true, active: s.active } : s))
      : stores);
  } catch (error) {
    next(error);
  }
});

app.get('/api/devices', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
  try {
    // A SOLD device sits in this table forever, so it's the one status that actually grows
    // unbounded over the shop's lifetime — every other status (in stock, in transfer, in
    // repair) is capped by real physical inventory and stays roughly constant in size.
    // `search` reaches a specific SOLD device by IMEI regardless (repair intake / inventory
    // scan looking up something already sold); it overrides `excludeSold` and any status
    // filter since it's a targeted, unbounded lookup, not a listing.
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const excludeSold = req.query.excludeSold === 'true';
    // Every device (any status) from one specific purchase invoice — naturally bounded to
    // that invoice's own device count, for the invoice-detail "which units were sold" view.
    const purchaseInvoiceId = typeof req.query.purchaseInvoiceId === 'string' ? req.query.purchaseInvoiceId : undefined;

    let where: Prisma.DeviceWhereInput | undefined;
    if (req.user!.role === 'SELLER' || req.user!.role === 'PARTNER') {
      // Store staff see their own store only. Main warehouse stock is ADMIN-only: phones the
      // admin delivers are found one by one through the IMEI scan of a store receipt.
      if (!req.user!.storeId) {
        res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
        return;
      }
      where = { storeId: req.user!.storeId };
    } else {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      where = storeId ? { storeId } : undefined;
    }

    if (search) {
      where = { ...where, OR: [{ imei: search }, { imei2: search }] };
    } else if (purchaseInvoiceId) {
      where = { ...where, purchaseInvoiceId };
    } else if (excludeSold) {
      where = { ...where, status: { not: 'SOLD' } };
    }

    const devices = await prisma.device.findMany({
      where,
      include: { store: true, timeline: { orderBy: { date: 'asc' as const } } },
      orderBy: { createdAt: 'desc' },
      ...(search ? { take: 5 } : {}),
    });

    const sanitizedDevices = req.user!.role === 'ADMIN'
      ? devices
      : devices.map((d) => ({
          ...d,
          purchasePriceUsd: 0,
          costBasisUsd: 0,
        }));

    res.json(sanitizedDevices);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/devices/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { ram, storage, color, model } = req.body ?? {};
    const existing = await prisma.device.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ message: 'Устройство не найдено' });
      return;
    }

    if (req.user!.role === 'PARTNER' && existing.storeId !== req.user!.storeId) {
      res.status(403).json({ message: 'Нет доступа к товарам другого магазина' });
      return;
    }

    if (ram !== undefined && (typeof ram !== 'string' || !ram.trim())) {
      res.status(400).json({ message: 'RAM обязателен для устройства' });
      return;
    }

    const updated = await prisma.device.update({
      where: { id: req.params.id },
      data: {
        ...(ram !== undefined ? { ram: ram.trim() } : {}),
        ...(typeof storage === 'string' && storage.trim() ? { storage: storage.trim() } : {}),
        ...(typeof color === 'string' && color.trim() ? { color: color.trim() } : {}),
        ...(typeof model === 'string' && model.trim() ? { model: model.trim() } : {}),
      },
      include: { store: true, timeline: { orderBy: { date: 'asc' as const } } },
    });

    RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {});
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.post('/api/purchases', authenticateJwt, requireRoles('ADMIN'), enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { supplierId, invoiceNumber, date, groups, paidAmountUsd: rawPaidAmount } = req.body ?? {};
    if (!supplierId || !invoiceNumber || !Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ message: 'supplierId, invoiceNumber и groups обязательны' });
      return;
    }

    const paidAmountUsd = rawPaidAmount !== undefined && rawPaidAmount !== null
      ? requireNonNegativeMoney(rawPaidAmount, 'Сумма оплаты')
      : D(0);

    const result = await prisma.$transaction(async (transaction: TransactionClient) => {
      const exchangeRate = await requireTodayRate(transaction);
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      const mainWarehouse = await transaction.store.findFirst({ where: { isMainWarehouse: true } });
      if (!supplier || !supplier.active) throw new Error('Поставщик не найден либо неактивен');
      if (!mainWarehouse) throw new Error('Главный склад не найден в системе');
      const store = mainWarehouse;
      const targetStoreId = mainWarehouse.id;

      const normalizedDevices = groups.flatMap((group: any) => {
        const isBonus = Boolean(group.isBonus);
        const purchasePriceUsd = isBonus
          ? requireNonNegativeMoney(group.purchasePriceUsd ?? 0, 'Закупочная цена')
          : requirePositiveMoney(group.purchasePriceUsd, 'Закупочная цена');
        const bonusCampaign = isBonus ? (String(group.bonusCampaign || '').trim() || 'Бонус от поставщика') : null;

        if (Array.isArray(group.items) && group.items.length > 0) {
          return group.items
            .filter((item: any) => item && typeof item.imei === 'string' && item.imei.trim().length > 0)
            .map((item: any) => {
              const [imei1, imei2] = String(item.imei).split(/[\/,]/).map((part) => part.trim());
              const explicitImei2 = typeof item.imei2 === 'string' && item.imei2.trim() ? item.imei2.trim() : null;
              return {
                imei: imei1,
                imei2: explicitImei2 || imei2 || null,
                brand: String(group.brand || '').trim(),
                model: String(group.model || '').trim(),
                ram: String(group.ram || '').trim(),
                storage: String(group.storage || '').trim(),
                color: String(group.color || '').trim(),
                purchasePriceUsd,
                isBonus,
                bonusCampaign,
              };
            });
        }

        const imeis = Array.isArray(group.imeis) ? group.imeis : [];
        return imeis.filter((imei: unknown): imei is string => typeof imei === 'string' && imei.trim().length > 0).map((imei: string) => {
          const [imei1, imei2] = imei.split(/[\/,]/).map((part) => part.trim());
          return {
            imei: imei1,
            imei2: imei2 || null,
            brand: String(group.brand || '').trim(),
            model: String(group.model || '').trim(),
            ram: String(group.ram || '').trim(),
            storage: String(group.storage || '').trim(),
            color: String(group.color || '').trim(),
            purchasePriceUsd,
            isBonus,
            bonusCampaign,
          };
        });
      });

      if (normalizedDevices.length === 0 || normalizedDevices.some((device) => !device.imei || !device.brand || !device.model || !device.ram || !device.storage)) {
        throw new Error('Каждое устройство должно содержать IMEI, бренд, модель, RAM и память');
      }

      for (const device of normalizedDevices) {
        if (!device.imei || !/^\d{15}$/.test(device.imei)) {
          throw new Error(`IMEI устройства (${device.brand} ${device.model}) должен содержать ровно 15 цифр (получено: "${device.imei}")`);
        }
        if (device.imei2 && !/^\d{15}$/.test(device.imei2)) {
          throw new Error(`IMEI 2 устройства (${device.brand} ${device.model}) должен содержать ровно 15 цифр (получено: "${device.imei2}")`);
        }
      }

      const identifiers = normalizedDevices.flatMap((device) => [device.imei, device.imei2]).filter(Boolean);
      if (new Set(identifiers).size !== identifiers.length) throw new Error('В запросе обнаружены дублирующиеся IMEI');
      const existing = await transaction.device.findFirst({
        where: { OR: identifiers.flatMap((identifier) => [{ imei: identifier }, { imei2: identifier }]) },
      });
      if (existing) throw new Error(`IMEI ${existing.imei} уже зарегистрирован`);

      const totalAmountUsd = normalizedDevices.reduce((sum, device) => D(sum).plus(device.purchasePriceUsd), D(0));

      if (D(paidAmountUsd).gt(totalAmountUsd)) {
        throw new Error(`Сумма оплаты ($${paidAmountUsd}) не может превышать стоимость партии ($${totalAmountUsd})`);
      }

      let cashAccount: any = null;
      if (D(paidAmountUsd).gt(0)) {
        const actor = await resolveActor(transaction, req.user!.userId);
        const locked = await lockCashRegister(transaction, mainWarehouse.id, actor, 'оплата прихода товара');
        cashAccount = locked.account;
        if (D(locked.store.cashBalanceUsd).lt(paidAmountUsd)) {
          throw new Error(`В Центральной кассе недостаточно средств: доступно $${locked.store.cashBalanceUsd}, требуется $${paidAmountUsd}`);
        }
        await transaction.store.update({
          where: { id: mainWarehouse.id },
          data: { cashBalanceUsd: { decrement: paidAmountUsd } },
        });
      }

      let invoiceDate = new Date();
      if (date) {
        if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
          const [y, m, d] = date.trim().split('-').map(Number);
          const now = new Date();
          invoiceDate = new Date(Date.UTC(y, m - 1, d, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
        } else {
          const parsed = new Date(date);
          if (!isNaN(parsed.getTime())) invoiceDate = parsed;
        }
      }

      const invoice = await transaction.supplierInvoice.create({
        data: {
          invoiceNumber: String(invoiceNumber).trim(),
          supplierId,
          date: invoiceDate,
          totalAmountUsd,
          exchangeRate,
          paidAmountUsd,
          devicesCount: normalizedDevices.length,
          isStorePurchase: false,
          storeId: targetStoreId,
          groups: {
            create: groups.map((group: any) => {
              const isBonus = Boolean(group.isBonus);
              const purchasePriceUsd = isBonus
                ? requireNonNegativeMoney(group.purchasePriceUsd ?? 0, 'Закупочная цена')
                : requirePositiveMoney(group.purchasePriceUsd, 'Закупочная цена');
              return {
                brand: String(group.brand || '').trim(), model: String(group.model || '').trim(),
                ram: String(group.ram || '').trim(),
                storage: String(group.storage || '').trim(), color: String(group.color || '').trim(),
                quantity: Array.isArray(group.items)
                  ? group.items.filter((i: any) => i && typeof i.imei === 'string' && i.imei.trim().length > 0).length
                  : (Array.isArray(group.imeis) ? group.imeis.filter(Boolean).length : 0),
                purchasePriceUsd,
              };
            }),
          },
        },
      });

      const targetStatus = 'MAIN_WAREHOUSE' as const;
      const devices = await transaction.device.createManyAndReturn({
        data: normalizedDevices.map((device) => ({
          ...device,
          storeId: targetStoreId,
          status: targetStatus,
          costBasisUsd: device.purchasePriceUsd,
          supplierId,
          supplierName: supplier.name,
          invoiceNumber: invoice.invoiceNumber,
          purchaseInvoiceId: invoice.id,
        })),
      });

      const unpaidAmountUsd = D(totalAmountUsd).minus(paidAmountUsd);
      await transaction.supplier.update({
        where: { id: supplierId },
        data: {
          totalPurchasedUsd: { increment: totalAmountUsd },
          totalPaidUsd: { increment: paidAmountUsd },
          totalDebtUsd: { increment: unpaidAmountUsd },
        },
      });

      if (D(paidAmountUsd).gt(0)) {
        const payment = await transaction.supplierPayment.create({
          data: {
            supplierId,
            amountUsd: paidAmountUsd,
            exchangeRate,
            sourceAccount: 'STORE_CASH',
            storeId: mainWarehouse.id,
            createdByUserId: req.user!.userId,
          },
        });

        await transaction.supplierPaymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            allocatedAmountUsd: paidAmountUsd,
          },
        });

        const cashAmountTjs = roundMoney(D(paidAmountUsd).mul(exchangeRate));
        await postTransaction(transaction, {
          type: 'SUPPLIER_PAYMENT',
          direction: 'OUT',
          numberPrefix: 'SP',
          accountId: cashAccount.id,
          balanceCurrency: 'USD',
          amount: paidAmountUsd,
          currency: 'USD',
          exchangeRate,
          amountTjs: cashAmountTjs,
          amountUsd: paidAmountUsd,
          categoryName: 'Оплата поставщику',
          counterpartyType: 'SUPPLIER',
          counterpartyId: supplierId,
          counterpartyName: supplier.name,
          shopId: mainWarehouse.id,
          sourceType: 'SUPPLIER_PAYMENT',
          sourceId: payment.id,
          description: `Оплата при приходе по накладной ${invoice.invoiceNumber} (${supplier.name}): $${paidAmountUsd}`,
          createdByUserId: req.user!.userId,
        });

        await transaction.ledgerEntry.create({
          data: {
            type: 'SUPPLIER_PAYMENT',
            description: `Оплата при приходе: накладная ${invoice.invoiceNumber} (${supplier.name}) — $${paidAmountUsd}`,
            amountUsd: paidAmountUsd,
            exchangeRate,
            storeId: mainWarehouse.id,
            storeName: mainWarehouse.name,
            referenceId: invoice.id,
          },
        });
      }

      await transaction.ledgerEntry.create({
        data: {
          type: 'PURCHASE',
          description: `Приход по накладной ${invoice.invoiceNumber} (${supplier.name}): ${devices.length} устройств`,
          amountUsd: totalAmountUsd,
          exchangeRate,
          storeId: store.id,
          storeName: store.name,
          referenceId: invoice.id,
        },
      });

      const paymentAuditNote = D(paidAmountUsd).gt(0)
        ? `, оплачено из Центральной кассы $${paidAmountUsd}${D(paidAmountUsd).lt(totalAmountUsd) ? `, в долг $${unpaidAmountUsd}` : ' (полная оплата)'}`
        : ', принято в долг (без оплаты)';

      await transaction.auditLog.create({
        data: {
          userId: req.user!.userId,
          userRole: req.user!.role,
          action: 'PURCHASE',
          details: `Создан приход по накладной ${invoice.invoiceNumber} (${supplier.name}): ${devices.length} устройств, сумма $${totalAmountUsd}${paymentAuditNote}`,
          financialDetails: moneyJson({ amountUsd: totalAmountUsd, paidAmountUsd, exchangeRate }),
        },
      });

      return { invoice, devices, paidAmountUsd: Number(paidAmountUsd), mainWarehouseId: mainWarehouse.id };
    }, { maxWait: 10000, timeout: 25000 });

    const updatedStoreId = result.invoice.storeId || undefined;
    RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', { storeId: updatedStoreId }, updatedStoreId ? { storeIds: [updatedStoreId] } : undefined);
    RealtimeSyncGateway.broadcast('PURCHASE', { invoiceId: result.invoice.id });
    if (result.paidAmountUsd > 0) {
      RealtimeSyncGateway.broadcast('STORE_CASH', { storeId: result.mainWarehouseId });
      RealtimeSyncGateway.broadcast('SUPPLIER_PAYMENT', { supplierId: result.invoice.supplierId });
    }
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
registerReportRoutes(app);
registerBonusRoutes(app);
registerCashCollectionRoutes(app);
registerDailyClosingRoutes(app);
registerStoreReceiptRoutes(app);
registerCustomerRoutes(app);
registerStockRevisionRoutes(app);
// Every audited business event inside a transaction also notifies the admin (same transaction).
decorateTransactions(withAuditNotifications);

app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
  // Every error that reaches here gets logged server-side, regardless of what the client
  // ends up seeing — previously nothing was logged at all, so a production failure left no
  // diagnostic trail.
  console.error(`[${req.method} ${req.originalUrl}]`, error);
  if (error?.statusCode === 409 || error?.statusCode === 403 || error?.statusCode === 404 || error?.statusCode === 503) {
    res.status(error.statusCode).json({ message: error.message }); return;
  }

  // express.json() parse failures and oversized bodies carry parser internals in their message.
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Некорректный JSON в теле запроса' }); return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Слишком большой запрос' }); return;
  }

  if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
    res.status(409).json({ message: 'Запись с такими уникальными данными уже существует' });
    return;
  }

  // Any other Prisma/DB error (P2003 FK violations, P2025 not-found, connection errors,
  // raw SQL messages, ...) carries technical internals that must never reach the client —
  // only this app's OWN deliberately-worded `throw new Error('...')` calls (used throughout
  // every service for user-facing Russian messages) are safe to forward as-is below.
  const isPrismaError = error && typeof error === 'object' && typeof error.name === 'string' && error.name.startsWith('Prisma');
  if (isPrismaError) {
    if (error.code === 'P2021' || error.code === 'P2022' || (error.code === 'P2010' && ['42P01', '42703'].includes(error.meta?.code))) {
      res.status(503).json({ message: 'База данных не обновлена до версии приложения. Администратору нужно применить миграции базы данных.' });
      return;
    }
    if ((error as any).name === 'PrismaClientInitializationError' || (error as any).code === 'P1001' || String((error as any).message).includes("Can't reach database server")) {
      res.status(503).json({ message: 'Сервер временно не может подключиться к базе данных. Повторите попытку через минуту.' });
      return;
    }
    res.status(400).json({ message: 'Некорректный запрос' });
    return;
  }

  // Services throw plain `new Error('<Russian message>')` for the client. Built-in subclasses
  // (TypeError, RangeError, …) are programming errors whose text must not reach the client.
  if (error instanceof Error && error.constructor === Error) {
    res.status(400).json({ message: error.message });
    return;
  }

  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});
