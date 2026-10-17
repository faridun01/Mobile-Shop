import { Prisma } from '@prisma/client';
import { D } from '../../common/decimal';
import { roundMoney } from '../../common/money';
import type { TransactionClient } from '../../prisma/prisma.service';

type Db = TransactionClient;

/** Units taken from one batch, at that batch's own unit cost. */
export interface BatchAllocation {
  batchId: string;
  quantity: number;
  unitCostUsd: string;
}

/** A line's batch allocations as stored in a JSON column. */
export function readAllocations(value: unknown): BatchAllocation[] {
  if (!Array.isArray(value)) throw new Error('Не сохранено распределение аксессуара по партиям');
  return value.map((row) => {
    if (!row || typeof row.batchId !== 'string' || !Number.isInteger(row.quantity) || row.quantity <= 0) {
      throw new Error('Не сохранено распределение аксессуара по партиям');
    }
    return { batchId: row.batchId, quantity: row.quantity, unitCostUsd: D(row.unitCostUsd ?? 0).toString() };
  });
}

/** The cost of allocated units: each batch's units at its own unit cost. */
export function allocationsCostUsd(allocations: BatchAllocation[]): Prisma.Decimal {
  return roundMoney(allocations.reduce((sum, a) => sum.plus(D(a.unitCostUsd).mul(a.quantity)), D(0)));
}

/**
 * Takes `quantity` units of a product at a store, oldest batch first (FIFO), from the units not
 * already held by a transfer. `consume` removes them (a sale); `reserve` holds them in place for a
 * transfer awaiting approval. Locks the product's batches at the store first, so two sales or a
 * sale and a transfer of the same product wait for each other and never oversell.
 */
export async function takeFifo(tx: Db, input: { storeId: string; productId: string; quantity: number; mode: 'consume' | 'reserve'; label: string }) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error(`${input.label}: количество должно быть целым числом от 1`);
  await tx.$queryRaw(Prisma.sql`SELECT id FROM accessory_batches WHERE "productId" = ${input.productId} AND "storeId" = ${input.storeId} ORDER BY "receivedAt", "createdAt", id FOR UPDATE`);
  const batches = await tx.accessoryBatch.findMany({
    where: { productId: input.productId, storeId: input.storeId, quantityRemaining: { gt: 0 } },
    orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const available = batches.reduce((sum, b) => sum + (b.quantityRemaining - b.quantityReserved), 0);
  if (available < input.quantity) {
    throw new Error(`${input.label}: в наличии ${available} шт., требуется ${input.quantity} шт.`);
  }
  const allocations: BatchAllocation[] = [];
  let left = input.quantity;
  for (const batch of batches) {
    if (left === 0) break;
    const free = batch.quantityRemaining - batch.quantityReserved;
    if (free <= 0) continue;
    const take = Math.min(free, left);
    const guard = await tx.accessoryBatch.updateMany({
      where: { id: batch.id, quantityRemaining: batch.quantityRemaining, quantityReserved: batch.quantityReserved },
      data: input.mode === 'consume' ? { quantityRemaining: { decrement: take } } : { quantityReserved: { increment: take } },
    });
    if (guard.count !== 1) throw new Error(`${input.label}: остаток изменился, повторите операцию`);
    allocations.push({ batchId: batch.id, quantity: take, unitCostUsd: D(batch.unitCostUsd).toString() });
    left -= take;
  }
  return { allocations, costUsd: allocationsCostUsd(allocations) };
}

/**
 * Puts sold units back into the batches they came from (a refunded sale), at their own cost.
 * The batch CHECK (remaining ≤ received) rejects putting back more than the batch ever had.
 */
export async function restoreAllocations(tx: Db, allocations: BatchAllocation[]) {
  for (const a of allocations) {
    const guard = await tx.accessoryBatch.updateMany({ where: { id: a.batchId }, data: { quantityRemaining: { increment: a.quantity } } });
    if (guard.count !== 1) throw new Error('Партия аксессуара не найдена — вернуть товар на склад невозможно');
  }
}

/** Releases the units a rejected transfer held. */
export async function releaseReservation(tx: Db, allocations: BatchAllocation[]) {
  for (const a of allocations) {
    const guard = await tx.accessoryBatch.updateMany({
      where: { id: a.batchId, quantityReserved: { gte: a.quantity } },
      data: { quantityReserved: { decrement: a.quantity } },
    });
    if (guard.count !== 1) throw new Error('Резерв аксессуара изменился, отклонение невозможно');
  }
}

/**
 * Moves units out of their source batches into new batches at the destination, each keeping its
 * source batch's unit cost, receipt date and invoice, so FIFO and the cost of goods stay exact.
 * `reserved`: the units were held by a pending transfer (the hold is released as they leave).
 */
export async function moveAllocations(tx: Db, allocations: BatchAllocation[], toStoreId: string, reserved: boolean) {
  for (const a of allocations) {
    const source = await tx.accessoryBatch.findUnique({ where: { id: a.batchId } });
    if (!source) throw new Error('Партия аксессуара не найдена');
    const guard = await tx.accessoryBatch.updateMany({
      where: reserved
        ? { id: a.batchId, quantityReserved: { gte: a.quantity }, quantityRemaining: { gte: a.quantity } }
        : { id: a.batchId, quantityRemaining: { gte: a.quantity } },
      data: reserved
        ? { quantityRemaining: { decrement: a.quantity }, quantityReserved: { decrement: a.quantity } }
        : { quantityRemaining: { decrement: a.quantity } },
    });
    if (guard.count !== 1) throw new Error('Остаток аксессуара изменился, перемещение невозможно');
    await tx.accessoryBatch.create({
      data: {
        productId: source.productId,
        storeId: toStoreId,
        purchaseInvoiceId: source.purchaseInvoiceId,
        supplierId: source.supplierId,
        quantityReceived: a.quantity,
        quantityRemaining: a.quantity,
        unitCostUsd: source.unitCostUsd,
        receivedAt: source.receivedAt,
      },
    });
  }
}
