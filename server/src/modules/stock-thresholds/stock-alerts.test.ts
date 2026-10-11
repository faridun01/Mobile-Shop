import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncStockAlerts } from './stock-alerts';

const notifyAdmins = vi.hoisted(() => vi.fn());
const notifyStorePartners = vi.hoisted(() => vi.fn());
vi.mock('../notifications/notification.service', () => ({ notifyAdmins, notifyStorePartners }));

function tx(thresholds: any[], devices: Array<{ storeId: string; brand: string; model: string; storage: string; n: number }>) {
  return {
    stockThreshold: { findMany: vi.fn().mockResolvedValue(thresholds), update: vi.fn() },
    device: {
      groupBy: vi.fn().mockResolvedValue(devices.map((d) => ({ storeId: d.storeId, brand: d.brand, model: d.model, storage: d.storage, _count: { _all: d.n } }))),
    },
    store: { findMany: vi.fn().mockResolvedValue([{ id: 'store-1', name: 'Сиёма' }]) },
  } as any;
}

const threshold = (over: Partial<any> = {}) => ({
  id: 'st-1', storeId: 'store-1', brand: 'Apple', model: 'iPhone 15', storage: '128 GB', minQuantity: 2, belowMinimum: false, ...over,
});

describe('syncStockAlerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('notifies the admin once when a model drops to its minimum', async () => {
    const db = tx([threshold()], [{ storeId: 'store-1', brand: 'apple', model: 'iPhone 15', storage: '128 GB', n: 2 }]);
    await syncStockAlerts(db, ['store-1']);

    expect(db.stockThreshold.update).toHaveBeenCalledWith({ where: { id: 'st-1' }, data: { belowMinimum: true, alertedAt: expect.any(Date) } });
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    // The store's partners get the same alert.
    expect(notifyStorePartners).toHaveBeenCalledWith(db, 'store-1', notifyAdmins.mock.calls[0][1]);
    expect(notifyAdmins.mock.calls[0][1]).toMatchObject({
      actionType: 'STOCK_MINIMUM',
      title: 'Минимальный остаток: Apple iPhone 15 128 GB',
      message: expect.stringContaining('осталось 2 шт. при минимуме 2 шт.'),
      targetRoute: '/stock-thresholds',
    });
  });

  it('does not repeat the notification while the stock stays at or below the minimum', async () => {
    const db = tx([threshold({ belowMinimum: true })], [{ storeId: 'store-1', brand: 'Apple', model: 'iPhone 15', storage: '128 GB', n: 1 }]);
    await syncStockAlerts(db, ['store-1']);
    expect(db.stockThreshold.update).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('re-arms the alert once the model is restocked above the minimum', async () => {
    const db = tx([threshold({ belowMinimum: true })], [{ storeId: 'store-1', brand: 'Apple', model: 'iPhone 15', storage: '128 GB', n: 3 }]);
    await syncStockAlerts(db, ['store-1']);
    expect(db.stockThreshold.update).toHaveBeenCalledWith({ where: { id: 'st-1' }, data: { belowMinimum: false } });
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('counts every capacity of a model for an "all capacities" minimum, and reports a sell-out', async () => {
    const db = tx([threshold({ storage: 'ALL', minQuantity: 5 })], [
      { storeId: 'store-1', brand: 'Apple', model: 'iPhone 15', storage: '128 GB', n: 2 },
      { storeId: 'store-1', brand: 'Apple', model: 'iPhone 15', storage: '256 GB', n: 2 },
    ]);
    await syncStockAlerts(db, ['store-1']);
    expect(notifyAdmins.mock.calls[0][1].message).toContain('осталось 4 шт. при минимуме 5 шт.');
    expect(notifyAdmins.mock.calls[0][1].title).toBe('Минимальный остаток: Apple iPhone 15');

    const soldOut = tx([threshold({ minQuantity: 1 })], []);
    await syncStockAlerts(soldOut, ['store-1']);
    expect(notifyAdmins.mock.calls[1][1].title).toBe('Закончился товар: Apple iPhone 15 128 GB');
  });

  it('only records the state when asked not to notify', async () => {
    const db = tx([threshold()], []);
    await syncStockAlerts(db, ['store-1'], { notify: false });
    expect(db.stockThreshold.update).toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
    expect(notifyStorePartners).not.toHaveBeenCalled();
  });

  it('counts only devices available for sale', async () => {
    const db = tx([threshold()], []);
    await syncStockAlerts(db, ['store-1', null, 'store-1']);
    expect(db.device.groupBy.mock.calls[0][0].where).toEqual({
      storeId: { in: ['store-1'] },
      status: { in: ['STORE_STOCK', 'MAIN_WAREHOUSE', 'IN_STOCK_AFTER_EXCHANGE'] },
    });
  });
});
