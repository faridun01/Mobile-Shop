import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';

export class StoresService {
  public static async create(name: string, address: string | undefined, userId: string) {
    const trimmed = name?.trim();
    if (!trimmed) throw new Error('Укажите название магазина');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const existing = await tx.store.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } } });
      if (existing) throw new Error(`Магазин с названием "${trimmed}" уже существует`);
      const store = await tx.store.create({ data: { name: trimmed, address } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'STORE_CREATE', details: `Создан новый магазин: ${store.name}`, targetId: store.id },
      });
      return store;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async update(storeId: string, name: string, address: string | undefined, userId: string) {
    const trimmed = name?.trim();
    if (!trimmed) throw new Error('Укажите название филиала');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const existing = await tx.store.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' }, id: { not: storeId } } });
      if (existing) throw new Error(`Магазин с названием "${trimmed}" уже существует`);
      const store = await tx.store.update({ where: { id: storeId }, data: { name: trimmed, address } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'STORE_UPDATE', details: `Обновлены данные магазина: ${store.name}`, targetId: store.id },
      });
      return store;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async remove(storeId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const store = await tx.store.findUnique({ where: { id: storeId } });
      if (!store) throw new Error('Магазин не найден');
      if (store.isMainWarehouse) throw new Error('Центральный (Главный) склад нельзя удалить. Он всегда остается в системе.');

      const mainWarehouse = await tx.store.findFirst({ where: { isMainWarehouse: true } });
      if (!mainWarehouse) throw new Error('Главный склад не найден в системе');

      await tx.device.updateMany({
        where: { storeId, status: 'STORE_STOCK' },
        data: { storeId: mainWarehouse.id, status: 'MAIN_WAREHOUSE' },
      });
      // Devices in other states (SOLD/IN_REPAIR/TRANSFER_PENDING) keep their status but
      // move their storeId reference so nothing points at the deleted store afterward.
      await tx.device.updateMany({
        where: { storeId, status: { not: 'STORE_STOCK' } },
        data: { storeId: mainWarehouse.id },
      });

      try {
        await tx.store.delete({ where: { id: storeId } });
      } catch (error: any) {
        if (error?.code === 'P2003') {
          throw new Error('Нельзя удалить магазин с историей продаж, ремонтов или перемещений — сначала деактивируйте его вместо удаления');
        }
        throw error;
      }

      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'STORE_DELETE', details: `Удален филиал: ${store.name}. Товары филиала перенесены на ${mainWarehouse.name}` },
      });
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * Merges a duplicate store into a surviving one: every record referencing the
   * source store (devices, sales, repairs, expenses, transfers, purchase invoices,
   * payments, assigned sellers) is reassigned to the target, the source's cash
   * balance is folded into the target's, then the now-empty source is deleted.
   * Unlike remove(), this works even when the source has real sales/repair history.
   */
  public static async mergeAndDelete(sourceStoreId: string, targetStoreId: string, userId: string) {
    if (sourceStoreId === targetStoreId) throw new Error('Магазин-источник и магазин-получатель должны отличаться');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, userId);
      const [source, target] = await Promise.all([
        tx.store.findUnique({ where: { id: sourceStoreId } }),
        tx.store.findUnique({ where: { id: targetStoreId } }),
      ]);
      if (!source) throw new Error('Магазин-источник не найден');
      if (!target) throw new Error('Магазин-получатель не найден');
      if (source.isMainWarehouse) throw new Error('Главный склад нельзя объединить с другим магазином');

      await tx.user.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.device.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.sale.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.supplierInvoice.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.supplierPayment.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.customerPayment.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.transferRequest.updateMany({ where: { fromStoreId: sourceStoreId }, data: { fromStoreId: targetStoreId } });
      await tx.transferRequest.updateMany({ where: { toStoreId: sourceStoreId }, data: { toStoreId: targetStoreId } });
      await tx.repairTicket.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.expense.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });
      await tx.ledgerEntry.updateMany({ where: { storeId: sourceStoreId }, data: { storeId: targetStoreId } });

      await tx.store.update({ where: { id: targetStoreId }, data: { cashBalanceTjs: { increment: source.cashBalanceTjs } } });

      try {
        await tx.store.delete({ where: { id: sourceStoreId } });
      } catch (error: any) {
        if (error?.code === 'P2003') {
          throw new Error('Не удалось полностью перенести историю магазина — обратитесь к разработчику');
        }
        throw error;
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'STORE_MERGE',
          details: `Магазин "${source.name}" объединён с "${target.name}": перенесена касса ${source.cashBalanceTjs} TJS и вся история продаж/ремонтов/расходов`,
        },
      });

      return tx.store.findUnique({ where: { id: targetStoreId } });
    }, { maxWait: 20000, timeout: 60000 });
  }
}
