import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockThresholdsService } from './stock-thresholds.service';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  });
  return {
    stockThreshold: model(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
  },
}));

describe('StockThresholdsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches thresholds for a store', async () => {
    db.stockThreshold.findMany.mockResolvedValue([
      { id: 'st-1', storeId: 'store-1', brand: 'Apple', model: 'iPhone 15', storage: '128GB', minQuantity: 5 },
    ]);

    const result = await StockThresholdsService.getThresholds('store-1');
    expect(db.stockThreshold.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { storage: 'asc' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].minQuantity).toBe(5);
  });

  it('upserts a threshold with sanitized values', async () => {
    db.stockThreshold.upsert.mockResolvedValue({
      id: 'st-1',
      storeId: 'store-1',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '128GB',
      minQuantity: 6,
    });

    const result = await StockThresholdsService.upsertThreshold({
      storeId: 'store-1',
      brand: '  Apple ',
      model: ' iPhone 15 ',
      storage: ' 128GB ',
      minQuantity: 6.7,
    });

    expect(db.stockThreshold.upsert).toHaveBeenCalledWith({
      where: {
        storeId_brand_model_storage: {
          storeId: 'store-1',
          brand: 'Apple',
          model: 'iPhone 15',
          storage: '128GB',
        },
      },
      update: { minQuantity: 6 },
      create: {
        storeId: 'store-1',
        brand: 'Apple',
        model: 'iPhone 15',
        storage: '128GB',
        minQuantity: 6,
      },
    });
    expect(result.minQuantity).toBe(6);
  });

  it('handles batch upsert in a transaction', async () => {
    db.stockThreshold.upsert.mockImplementation((args: any) => Promise.resolve({ id: 'id-1', ...args.create }));

    const items = [
      { brand: 'Apple', model: 'iPhone 15', storage: '128GB', minQuantity: 5 },
      { brand: 'Samsung', model: 'S24', storage: '256GB', minQuantity: 3 },
    ];

    const results = await StockThresholdsService.batchUpsertThresholds('store-1', items);
    expect(results).toHaveLength(2);
    expect(db.stockThreshold.upsert).toHaveBeenCalledTimes(2);
  });

  it('deletes a threshold by id', async () => {
    db.stockThreshold.delete.mockResolvedValue({ id: 'st-1' });
    const result = await StockThresholdsService.deleteThreshold('st-1');
    expect(db.stockThreshold.delete).toHaveBeenCalledWith({ where: { id: 'st-1' } });
    expect(result.id).toBe('st-1');
  });
});
