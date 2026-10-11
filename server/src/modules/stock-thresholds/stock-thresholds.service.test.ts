import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockThresholdsService, requireMinQuantity } from './stock-thresholds.service';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  });
  return { stockThreshold: model(), device: { findFirst: vi.fn(), groupBy: vi.fn() } };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
  },
}));

const syncStockAlerts = vi.hoisted(() => vi.fn());
vi.mock('./stock-alerts', () => ({ ALL_STORAGE: 'ALL', syncStockAlerts }));

describe('StockThresholdsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.device.findFirst.mockResolvedValue({ id: 'device-1' });
  });

  it('offers the models the shop has had in stock, sold-out ones included', async () => {
    db.device.groupBy.mockResolvedValue([
      { brand: 'Apple', model: 'iPhone 15', storage: '128 GB' },
      { brand: 'Apple', model: 'iPhone 15', storage: '' },
      { brand: ' ', model: 'x', storage: '1' },
    ]);
    expect(await StockThresholdsService.listStockModels()).toEqual([
      { brand: 'Apple', model: 'iPhone 15', storage: '128 GB' },
      { brand: 'Apple', model: 'iPhone 15', storage: '—' },
    ]);
    // Grouped over every device (any status), so a sold-out model stays pickable.
    expect(db.device.groupBy.mock.calls[0][0].where).toBeUndefined();
  });

  it('refuses a minimum for a model that has never been in stock', async () => {
    db.device.findFirst.mockResolvedValue(null);
    await expect(StockThresholdsService.upsertThreshold({ storeId: 'store-1', brand: 'Nokia', model: '3310', storage: '', minQuantity: 2 }))
      .rejects.toThrow('нет в базе склада');
    expect(db.stockThreshold.upsert).not.toHaveBeenCalled();
  });

  it('matches the model and capacity in stock regardless of letter case and spacing', async () => {
    db.stockThreshold.upsert.mockResolvedValue({ id: 'st-1' });
    db.stockThreshold.findUniqueOrThrow.mockResolvedValue({ id: 'st-1' });
    await StockThresholdsService.upsertThreshold({ storeId: 'store-1', brand: 'apple', model: 'iphone 15', storage: '128 GB', minQuantity: 2 });
    const insensitive = (equals: string) => ({ equals, mode: 'insensitive' });
    expect(db.device.findFirst.mock.calls[0][0].where).toEqual({
      brand: insensitive('apple'),
      model: insensitive('iphone 15'),
      // "128 GB" and "128GB" are the same capacity.
      OR: [{ storage: insensitive('128 GB') }, { storage: insensitive('128GB') }, { storage: insensitive('128 GB') }],
    });
  });

  it('fetches thresholds for a store', async () => {
    db.stockThreshold.findMany.mockResolvedValue([{ id: 'st-1' }]);
    await StockThresholdsService.getThresholds('store-1');
    expect(db.stockThreshold.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
    });
  });

  it('sets a minimum for any model and records the current state with alerts enabled', async () => {
    db.stockThreshold.upsert.mockResolvedValue({ id: 'st-1' });
    db.stockThreshold.findUniqueOrThrow.mockResolvedValue({ id: 'st-1', belowMinimum: true });

    const result = await StockThresholdsService.upsertThreshold({ storeId: 'store-1', brand: ' Apple ', model: ' iPhone 17 ', storage: '', minQuantity: 3 });

    expect(db.stockThreshold.upsert).toHaveBeenCalledWith({
      where: { storeId_brand_model_storage: { storeId: 'store-1', brand: 'Apple', model: 'iPhone 17', storage: 'ALL' } },
      update: { minQuantity: 3, belowMinimum: false },
      create: { storeId: 'store-1', brand: 'Apple', model: 'iPhone 17', storage: 'ALL', minQuantity: 3, belowMinimum: false },
    });
    expect(syncStockAlerts).toHaveBeenCalledWith(db, ['store-1']);
    expect(result).toEqual({ id: 'st-1', belowMinimum: true });
  });

  it('saves a batch in one transaction', async () => {
    db.stockThreshold.upsert.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' });
    db.stockThreshold.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await StockThresholdsService.batchUpsertThresholds('store-1', [
      { brand: 'Apple', model: 'iPhone 15', storage: '128 GB', minQuantity: 2 },
      { brand: 'Samsung', model: 'Galaxy S25', storage: 'ALL', minQuantity: '4' },
    ]);
    expect(db.stockThreshold.upsert).toHaveBeenCalledTimes(2);
    expect(syncStockAlerts).toHaveBeenCalledTimes(1);
  });

  it('rejects a minimum that is not a whole non-negative number', () => {
    expect(requireMinQuantity(5)).toBe(5);
    expect(requireMinQuantity('7')).toBe(7);
    expect(() => requireMinQuantity(-1)).toThrow('целым числом');
    expect(() => requireMinQuantity(2.5)).toThrow('целым числом');
    expect(() => requireMinQuantity('abc')).toThrow('целым числом');
  });

  it('lets a partner delete only a minimum of their own store', async () => {
    db.stockThreshold.findUnique.mockResolvedValue({ storeId: 'store-2' });
    await expect(StockThresholdsService.deleteThreshold('st-1', { role: 'PARTNER', storeId: 'store-1' })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.stockThreshold.delete).not.toHaveBeenCalled();

    await StockThresholdsService.deleteThreshold('st-1', { role: 'PARTNER', storeId: 'store-2' });
    await StockThresholdsService.deleteThreshold('st-1', { role: 'ADMIN' });
    expect(db.stockThreshold.delete).toHaveBeenCalledTimes(2);
  });
});
