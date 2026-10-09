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

    const totalExpected = storeDevices.length;
    const totalMissing = missingDevices.length;
    const totalSurplus = surplusDevices.length;
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

    return prisma.stockRevision.findMany({
      where: storeId ? { storeId } : undefined,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Get a single revision by ID.
   */
  static async getById(user: StaffUser, id: string) {
    const revision = await prisma.stockRevision.findUnique({
      where: { id },
    });

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
