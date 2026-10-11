import type { TransactionClient } from '../../prisma/prisma.service';
import { getBusinessDateKey } from '../../common/business-date';

/**
 * A store's register takes no more money once today's shift is closed: the closing froze that
 * day's total, and anything after it would belong to no shift and reach collection unreported.
 * Locks the store row first, so an operation and the closing (which locks it too) never
 * interleave — whichever commits first, the other sees it. Central Cash has no shifts.
 *
 * Call it right before the operation moves the register (after any device locks), keeping
 * the lock order devices → store used everywhere else.
 */
export async function assertShiftOpen(tx: TransactionClient, storeId: string) {
  await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { name: true, isMainWarehouse: true } });
  if (!store || store.isMainWarehouse) return;
  const businessDate = getBusinessDateKey();
  const closing = await tx.dailyCashClosing.findUnique({
    where: { storeId_businessDate: { storeId, businessDate } },
    select: { id: true },
  });
  if (closing) {
    throw Object.assign(
      new Error(`Смена магазина «${store.name}» за ${businessDate} уже закрыта, касса этого дня больше не принимает операции. Чтобы продолжить работу сегодня, администратор может отменить закрытие смены, если по ней ещё не было инкассации.`),
      { statusCode: 409 },
    );
  }
}
