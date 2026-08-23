import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { AuthService } from './auth/auth.service';
import { authenticateJwt, type AuthenticatedRequest, enforceStoreScope, requireRoles } from './auth/auth.middleware';
import { SalesService } from './modules/sales/sales.service';

const app = express();
const port = Number(process.env.PORT || 3000);
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, '../..');

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
    res.json(devices);
  } catch (error) {
    next(error);
  }
});

app.post('/api/purchases', authenticateJwt, requireRoles('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { supplierId, invoiceNumber, date, storeId, groups } = req.body ?? {};
    if (!supplierId || !invoiceNumber || !storeId || !Array.isArray(groups) || groups.length === 0) {
      res.status(400).json({ message: 'supplierId, invoiceNumber, storeId и groups обязательны' });
      return;
    }

    const result = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      const supplier = await transaction.supplier.findUnique({ where: { id: supplierId } });
      const store = await transaction.store.findUnique({ where: { id: storeId } });
      if (!supplier || !store) throw new Error('Поставщик или магазин не найден');

      const normalizedDevices = groups.flatMap((group: any) => {
        const imeis = Array.isArray(group.imeis) ? group.imeis : [];
        return imeis.filter((imei: unknown): imei is string => typeof imei === 'string' && imei.trim().length > 0).map((imei: string) => {
          const [imei1, imei2] = imei.split(/[\/,]/).map((part) => part.trim());
          return {
            imei: imei1,
            imei2: imei2 || null,
            barcode: typeof group.barcode === 'string' && group.barcode.trim() ? group.barcode.trim() : null,
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
      const existing = await transaction.device.findFirst({ where: { OR: identifiers.map((identifier) => ({ imei: identifier })) } });
      if (existing) throw new Error(`IMEI ${existing.imei} уже зарегистрирован`);

      const totalUsd = normalizedDevices.reduce((sum, device) => sum + device.purchasePriceUsd, 0);
      const invoice = await transaction.supplierInvoice.create({
        data: {
          invoiceNumber: String(invoiceNumber).trim(),
          supplierId,
          date: date ? new Date(date) : new Date(),
          totalUsd,
          groups: {
            create: groups.map((group: any) => ({
              brand: String(group.brand || '').trim(), model: String(group.model || '').trim(),
              storage: String(group.storage || '').trim(), color: String(group.color || '').trim(),
              quantity: Array.isArray(group.imeis) ? group.imeis.filter(Boolean).length : 0,
              purchasePriceUsd: Number(group.purchasePriceUsd) || 0,
            })),
          },
        },
      });

      const devices = await transaction.device.createManyAndReturn({
        data: normalizedDevices.map((device) => ({ ...device, storeId, status: 'IN_STOCK' as const, costBasisUsd: device.purchasePriceUsd })),
      });
      return { invoice, devices };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sales', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
  try {
    const sale = await SalesService.executeSale({ ...req.body, userId: req.user!.userId });
    res.status(201).json(sale);
  } catch (error) {
    next(error);
  }
});

app.use(express.static(path.join(projectRoot, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'index.html')));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
  res.status(400).json({ message });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Mobile Shop API listening on port ${port}`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);