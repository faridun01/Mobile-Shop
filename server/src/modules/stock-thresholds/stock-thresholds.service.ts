import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { ALL_STORAGE, syncStockAlerts } from './stock-alerts';

export interface UpsertThresholdInput {
  storeId: string;
  brand: string;
  model: string;
  storage: string;
  minQuantity: number;
}

const forbidden = (message: string) => Object.assign(new Error(message), { statusCode: 403 });

/** A minimum is a whole number of phones, 0 (no minimum) to 100 000. */
export function requireMinQuantity(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 100_000) {
    throw new Error('Минимум должен быть целым числом от 0 до 100 000');
  }
  return n;
}

const insensitive = (value: string) => ({ equals: value, mode: 'insensitive' as const });

async function upsertOne(tx: TransactionClient, storeId: string, item: { brand: string; model: string; storage?: string; minQuantity: unknown }) {
  const brand = String(item.brand ?? '').trim();
  const model = String(item.model ?? '').trim();
  if (!brand || !model) throw new Error('Укажите бренд и модель');
  const storage = String(item.storage ?? '').trim() || ALL_STORAGE;
  const minQuantity = requireMinQuantity(item.minQuantity);
  
  // Minimums are for the shop's own phones: a model and capacity that has been in stock or catalog.
  const cleanStorage = storage.replace(/\s+/g, '');
  const known = await tx.device.findFirst({
    where: {
      brand: insensitive(brand),
      model: insensitive(model),
      ...(storage === ALL_STORAGE
        ? {}
        : {
            OR: [
              { storage: insensitive(storage === '—' ? '' : storage) },
              { storage: insensitive(cleanStorage) },
              { storage: insensitive(cleanStorage.replace(/gb$/i, ' GB')) },
            ],
          }),
    },
    select: { id: true },
  });

  const alreadyExists =
    known ||
    (await tx.stockThreshold.findFirst({
      where: { brand: insensitive(brand), model: insensitive(model) },
      select: { id: true },
    }));

  if (!alreadyExists) {
    throw new Error(`Модели «${brand} ${model}${storage === ALL_STORAGE ? '' : ` ${storage}`}» нет в базе склада: минимум задаётся только для телефонов, которые были в наличии`);
  }

  return tx.stockThreshold.upsert({
    where: { storeId_brand_model_storage: { storeId, brand, model, storage } },
    update: { minQuantity, belowMinimum: false },
    create: { storeId, brand, model, storage, minQuantity, belowMinimum: false },
  });
}

export class StockThresholdsService {
  /** Every brand / model / capacity the shop has had in stock (sold-out ones included), for the picker. */
  static async listStockModels() {
    const rows = await prisma.device.groupBy({
      by: ['brand', 'model', 'storage'],
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
    });
    return rows
      .filter((r) => r.brand.trim() && r.model.trim())
      .map((r) => ({ brand: r.brand.trim(), model: r.model.trim(), storage: r.storage.trim() || '—' }));
  }

  static async getThresholds(storeId?: string) {
    if (storeId) {
      return prisma.stockThreshold.findMany({
        where: { storeId },
        orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
      });
    }
    return prisma.stockThreshold.findMany({
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
    });
  }

  /**
   * Sets the minimum for one model (one capacity, or every capacity together). If current
   * stock is already at or below the minimum, an alert is sent right away.
   */
  static async upsertThreshold(input: UpsertThresholdInput) {
    return prisma.$transaction(async (tx) => {
      const threshold = await upsertOne(tx, input.storeId, input);
      await syncStockAlerts(tx, [input.storeId]);
      return tx.stockThreshold.findUniqueOrThrow({ where: { id: threshold.id } });
    });
  }

  static async batchUpsertThresholds(storeId: string, items: Array<{ brand: string; model: string; storage: string; minQuantity: unknown }>) {
    return prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const item of items) ids.push((await upsertOne(tx, storeId, item)).id);
      await syncStockAlerts(tx, [storeId]);
      return tx.stockThreshold.findMany({ where: { id: { in: ids } } });
    });
  }

  /** Removes a minimum; a partner only for their own store. */
  static async deleteThreshold(id: string, user: { role: string; storeId?: string | null }) {
    const threshold = await prisma.stockThreshold.findUnique({ where: { id }, select: { storeId: true } });
    if (!threshold) throw Object.assign(new Error('Минимум не найден'), { statusCode: 404 });
    if (user.role !== 'ADMIN' && threshold.storeId !== user.storeId) {
      throw forbidden('Вы можете настраивать лимиты только для своего магазина');
    }
    return prisma.stockThreshold.delete({ where: { id } });
  }
}
