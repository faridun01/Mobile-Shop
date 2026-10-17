import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { onCommit } from '../../common/after-commit';
import { notifyAdmins } from '../notifications/notification.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export interface CreateStockRevisionInput {
  storeId?: string;
  comment?: string;
  checkedImeis: string[];
  surplusDevices?: Array<{ code: string; note?: string }>;
  /** Accessories counted by hand or by scanning their barcode: units found per card. */
  accessoryCounts?: Array<{ productId: string; counted: number }>;
}

/** One accessory card of a revision: units on the books at the store and units counted. */
export interface RevisionAccessoryLine {
  productId: string;
  barcode: string;
  brand: string;
  name: string;
  expected: number;
  counted: number;
}

export interface StaffUser {
  userId?: string;
  id?: string;
  role: string;
  storeId?: string | null;
}

export class StockRevisionService {
  /**
   * Save a stock revision record with audit log and admin notification.
   */
  static async create(user: StaffUser, input: CreateStockRevisionInput) {
    const userId = user.userId || user.id;
    if (!userId) {
      throw Object.assign(new Error('Не удалось определить пользователя'), { status: 401 });
    }
    const actor = await resolveActor(prisma, userId);
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { storeId: true },
    });
    const userStoreId = dbUser?.storeId || user.storeId;

    let storeId = input.storeId;
    if (actor.role === 'SELLER' || actor.role === 'PARTNER') {
      if (!userStoreId) {
        throw Object.assign(new Error('Сотрудник не привязан к магазину'), { status: 403 });
      }
      storeId = userStoreId;
    }

    if (!storeId || storeId === 'all') {
      // Admin fallback: first active retail store
      const firstStore = await prisma.store.findFirst({
        where: { active: true },
        orderBy: [{ isMainWarehouse: 'asc' }, { name: 'asc' }],
      });
      if (!firstStore) {
        throw Object.assign(new Error('Не найден активный склад или магазин'), { status: 400 });
      }
      storeId = firstStore.id;
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });
    if (!store) {
      throw Object.assign(new Error('Склад или магазин не найден'), { status: 404 });
    }

    // Devices expected in stock at this location
    const expectedStatusList = store.isMainWarehouse
      ? (['MAIN_WAREHOUSE', 'STORE_STOCK'] as const)
      : (['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] as const);

    const storeDevices = await prisma.device.findMany({
      where: {
        storeId: store.id,
        status: { in: [...expectedStatusList] },
      },
      select: {
        id: true,
        imei: true,
        imei2: true,
        brand: true,
        model: true,
        storage: true,
        color: true,
        purchasePriceUsd: true,
      },
    });

    const normalizedChecked = new Set(
      (input.checkedImeis || []).map((code) => code.trim().toLowerCase()).filter(Boolean)
    );

    const missingDevices: Array<{
      id: string;
      imei: string;
      imei2?: string | null;
      brand: string;
      model: string;
      storage?: string | null;
      color?: string | null;
      purchasePriceUsd?: string | null;
    }> = [];

    let totalChecked = 0;

    for (const d of storeDevices) {
      const imei1Match = normalizedChecked.has(d.imei.toLowerCase());
      const imei2Match = d.imei2 ? normalizedChecked.has(d.imei2.toLowerCase()) : false;

      if (imei1Match || imei2Match) {
        totalChecked += 1;
      } else {
        missingDevices.push({
          id: d.id,
          imei: d.imei,
          imei2: d.imei2,
          brand: d.brand,
          model: d.model,
          storage: d.storage,
          color: d.color,
          purchasePriceUsd: d.purchasePriceUsd ? d.purchasePriceUsd.toString() : null,
        });
      }
    }

    const surplusDevices = (input.surplusDevices || []).filter(
      (s) => s.code && s.code.trim().length > 0
    );

    // Accessories: units left in the store's batches (units held by a pending transfer are still
    // physically here) against the units counted. A card counted but not on the books is a surplus.
    const counted = new Map<string, number>();
    for (const row of input.accessoryCounts || []) {
      const units = Number(row?.counted);
      if (typeof row?.productId !== 'string' || !row.productId) continue;
      if (!Number.isInteger(units) || units < 0) {
        throw Object.assign(new Error('Количество аксессуара в ревизии должно быть целым числом от 0'), { status: 400 });
      }
      counted.set(row.productId, units);
    }
    const batches = await prisma.accessoryBatch.findMany({
      where: { storeId: store.id, quantityRemaining: { gt: 0 } },
      select: { productId: true, quantityRemaining: true },
    });
    const expectedByProduct = new Map<string, number>();
    for (const b of batches) expectedByProduct.set(b.productId, (expectedByProduct.get(b.productId) ?? 0) + b.quantityRemaining);
    const productIds = [...new Set([...expectedByProduct.keys(), ...counted.keys()])];
    const products = productIds.length
      ? await prisma.accessoryProduct.findMany({ where: { id: { in: productIds } }, select: { id: true, barcode: true, brand: true, name: true } })
      : [];
    if (products.length !== productIds.length) {
      throw Object.assign(new Error('Аксессуар из ревизии не найден в базе'), { status: 400 });
    }
    const accessoryLines: RevisionAccessoryLine[] = products
      .map((p) => ({ productId: p.id, barcode: p.barcode, brand: p.brand, name: p.name, expected: expectedByProduct.get(p.id) ?? 0, counted: counted.get(p.id) ?? 0 }))
      .sort((a, b) => `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, 'ru'));
    const accessoryExpected = accessoryLines.reduce((sum, l) => sum + l.expected, 0);
    const accessoryChecked = accessoryLines.reduce((sum, l) => sum + Math.min(l.expected, l.counted), 0);
    const accessoryMissing = accessoryLines.reduce((sum, l) => sum + Math.max(0, l.expected - l.counted), 0);
    const accessorySurplus = accessoryLines.reduce((sum, l) => sum + Math.max(0, l.counted - l.expected), 0);
    totalChecked += accessoryChecked;

    const totalExpected = storeDevices.length + accessoryExpected;
    const totalMissing = missingDevices.length + accessoryMissing;
    const totalSurplus = surplusDevices.length + accessorySurplus;
    const status = totalMissing === 0 && totalSurplus === 0 ? 'MATCH' : 'DISCREPANCY';

    const revision = await prisma.$transaction(async (tx) => {
      const record = await tx.stockRevision.create({
        data: {
          storeId: store.id,
          storeName: store.name,
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          totalExpected,
          totalChecked,
          totalMissing,
          totalSurplus,
          status,
          missingDevices: missingDevices as any,
          surplusDevices: surplusDevices as any,
          checkedImeis: (input.checkedImeis || []) as any,
          accessoryLines: accessoryLines.length ? (accessoryLines as any) : undefined,
          comment: input.comment?.trim() || null,
        },
      });

      const discrepancyText =
        totalMissing > 0 || totalSurplus > 0
          ? ` (недостача: ${totalMissing} шт., излишки: ${totalSurplus} шт.)`
          : ' (расхождений нет, всё сходится)';

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          storeName: store.name,
          action: 'STOCK_REVISION',
          targetId: record.id,
          details: `Сверка склада «${store.name}»: сверено ${totalChecked} из ${totalExpected} шт.${discrepancyText}. Проверил: ${actor.name}.`,
        },
      });

      await notifyAdmins(tx, {
        actionType: 'STOCK_REVISION',
        dedupeKey: `STOCK_REVISION:${record.id}`,
        title:
          status === 'MATCH'
            ? `Сверка склада «${store.name}»: всё сходится`
            : `Сверка склада «${store.name}»: выявлены расхождения`,
        message: `Проведена сверка остатков склада (${actor.name}). Сверено ${totalChecked} из ${totalExpected} шт.${totalMissing > 0 ? ` Недостача: ${totalMissing} шт.` : ''}${totalSurplus > 0 ? ` Излишки: ${totalSurplus} шт.` : ''}`,
        store: { id: store.id, name: store.name },
        actor: { id: actor.id, name: actor.name },
        targetType: 'STOCK_REVISION',
        targetId: record.id,
        targetRoute: '/revision',
        details: {
          totalExpected,
          totalChecked,
          totalMissing,
          totalSurplus,
          status,
        },
      });

      return record;
    });

    onCommit(() => {
      RealtimeSyncGateway.broadcast('BUSINESS_DATA_CHANGED', {
        entity: 'stock_revision',
        storeId: store.id,
      });
    });

    return revision;
  }

  /**
   * Ensure stock_revisions table and indexes exist in the database.
   */
  static async ensureTable() {
    if (typeof prisma.$executeRawUnsafe !== 'function') return;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "stock_revisions" (
          "id" TEXT NOT NULL,
          "storeId" TEXT NOT NULL,
          "storeName" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "userName" TEXT NOT NULL,
          "userRole" TEXT NOT NULL,
          "totalExpected" INTEGER NOT NULL,
          "totalChecked" INTEGER NOT NULL,
          "totalMissing" INTEGER NOT NULL,
          "totalSurplus" INTEGER NOT NULL,
          "status" TEXT NOT NULL,
          "missingDevices" JSONB,
          "surplusDevices" JSONB,
          "checkedImeis" JSONB,
          "accessoryLines" JSONB,
          "comment" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "stock_revisions_pkey" PRIMARY KEY ("id")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "stock_revisions_storeId_createdAt_idx" ON "stock_revisions"("storeId", "createdAt")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "stock_revisions_createdAt_idx" ON "stock_revisions"("createdAt")
      `);
    } catch (err) {
      console.warn('[StockRevision] ensureTable error:', (err as any)?.message || err);
    }
  }

  /**
   * Get past revisions history.
   */
  static async list(user: StaffUser, query: { storeId?: string; take?: string }) {
    const userId = user.userId || user.id;
    let storeId = query.storeId;
    if (user.role === 'SELLER' || user.role === 'PARTNER') {
      const dbUser = userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { storeId: true } })
        : null;
      const userStoreId = dbUser?.storeId || user.storeId;
      if (!userStoreId) throw Object.assign(new Error('Сотрудник не привязан к магазину'), { statusCode: 403 });
      storeId = userStoreId;
    } else if (storeId === 'all') {
      storeId = undefined;
    }

    const take = Math.min(100, Math.max(1, parseInt(query.take || '50', 10) || 50));

    try {
      return await prisma.stockRevision.findMany({
        where: storeId ? { storeId } : undefined,
        orderBy: { createdAt: 'desc' },
        take,
      });
    } catch (err: any) {
      if (err?.code === 'P2021' || err?.code === 'P2022' || (err?.code === 'P2010' && ['42P01', '42703'].includes(err?.meta?.code))) {
        await this.ensureTable();
        return [];
      }
      throw err;
    }
  }

  /**
   * Get a single revision by ID.
   */
  static async getById(user: StaffUser, id: string) {
    let revision;
    try {
      revision = await prisma.stockRevision.findUnique({
        where: { id },
      });
    } catch (err: any) {
      if (err?.code === 'P2021' || err?.code === 'P2022' || (err?.code === 'P2010' && ['42P01', '42703'].includes(err?.meta?.code))) {
        await this.ensureTable();
        throw Object.assign(new Error('Запись сверки не найдена'), { status: 404 });
      }
      throw err;
    }

    if (!revision) {
      throw Object.assign(new Error('Запись сверки не найдена'), { status: 404 });
    }

    if (user.role === 'SELLER' || user.role === 'PARTNER') {
      const userId = user.userId || user.id;
      const dbUser = userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { storeId: true } })
        : null;
      const userStoreId = dbUser?.storeId || user.storeId;
      if (!userStoreId || revision.storeId !== userStoreId) {
        throw Object.assign(new Error('Нет доступа к этой сверке'), { statusCode: 403 });
      }
    }

    return revision;
  }
}
