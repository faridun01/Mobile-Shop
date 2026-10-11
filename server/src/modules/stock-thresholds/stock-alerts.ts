import type { TransactionClient } from '../../prisma/prisma.service';
import { notifyAdmins, notifyStorePartners } from '../notifications/notification.service';

/** Devices a store can sell or ship right now (in transfer or repair they are not available). */
const AVAILABLE_STATUSES = ['STORE_STOCK', 'MAIN_WAREHOUSE', 'IN_STOCK_AFTER_EXCHANGE'] as const;

/** A minimum set for every capacity of a model counts all of them together. */
export const ALL_STORAGE = 'ALL';

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
const storageKey = (storage: string | null | undefined) => norm(storage) || '—';

/**
 * Compares the stock of the given stores with their minimums, inside the caller's transaction
 * (right after it moved devices). When a model's stock drops to its minimum, the admin gets one
 * notification; another one only comes after the stock was restocked above the minimum and
 * dropped again. `notify: false` only records the state (used when a minimum is set by hand,
 * which the admin sees on the page anyway).
 */
export async function syncStockAlerts(tx: TransactionClient, storeIds: Array<string | null | undefined>, options: { notify?: boolean } = {}) {
  const ids = [...new Set(storeIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  const thresholds = await tx.stockThreshold.findMany({ where: { storeId: { in: ids }, minQuantity: { gt: 0 } } });
  if (thresholds.length === 0) return;

  const grouped = await tx.device.groupBy({
    by: ['storeId', 'brand', 'model', 'storage'],
    where: { storeId: { in: ids }, status: { in: [...AVAILABLE_STATUSES] } },
    _count: { _all: true },
  });
  const counts = new Map<string, number>();
  const add = (key: string, n: number) => counts.set(key, (counts.get(key) ?? 0) + n);
  for (const row of grouped) {
    const model = `${row.storeId}|${norm(row.brand)}|${norm(row.model)}`;
    add(`${model}|${storageKey(row.storage)}`, row._count._all);
    add(`${model}|${ALL_STORAGE.toLowerCase()}`, row._count._all);
  }

  const stores = new Map((await tx.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((s) => [s.id, s]));
  for (const threshold of thresholds) {
    const storage = norm(threshold.storage) === ALL_STORAGE.toLowerCase() ? ALL_STORAGE.toLowerCase() : storageKey(threshold.storage);
    const count = counts.get(`${threshold.storeId}|${norm(threshold.brand)}|${norm(threshold.model)}|${storage}`) ?? 0;
    const reached = count <= threshold.minQuantity;
    if (reached === threshold.belowMinimum) continue;

    await tx.stockThreshold.update({
      where: { id: threshold.id },
      data: reached ? { belowMinimum: true, alertedAt: new Date() } : { belowMinimum: false },
    });
    if (!reached || options.notify === false) continue;

    const store = stores.get(threshold.storeId);
    const capacity = storage === ALL_STORAGE.toLowerCase() || storage === '—' ? '' : ` ${threshold.storage}`;
    const name = `${threshold.brand} ${threshold.model}${capacity}`;
    const alert = {
      actionType: 'STOCK_MINIMUM',
      dedupeKey: `STOCK_MINIMUM:${threshold.id}:${Date.now()}`,
      title: count === 0 ? `Закончился товар: ${name}` : `Минимальный остаток: ${name}`,
      message: `${store?.name ?? 'Магазин'}: осталось ${count} шт. при минимуме ${threshold.minQuantity} шт. — ${name}. Пора пополнить.`,
      store: store ? { id: store.id, name: store.name } : null,
      targetType: 'STOCK_THRESHOLD',
      targetId: threshold.id,
      targetRoute: '/stock-thresholds',
      details: { brand: threshold.brand, model: threshold.model, storage: threshold.storage, count, minQuantity: threshold.minQuantity },
    };
    // The admin, and the partners of that store.
    await notifyAdmins(tx, alert);
    await notifyStorePartners(tx, threshold.storeId, alert);
  }
}
