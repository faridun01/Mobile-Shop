import '../../common/decimal-test-setup';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  });
  return {
    store: model(),
    user: model(),
    cashHandover: model(),
    financialTransaction: model(),
    auditLog: model(),
    dailyCashClosing: model(),
    sale: model(),
    expense: model(),
    customerPayment: model(),
    financialAccount: {
      ...model(),
      findUniqueOrThrow: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
  },
}));

vi.mock('../../common/actor', () => ({
  resolveActor: async () => ({ id: 'user-admin', name: 'Admin', role: 'ADMIN' }),
}));

import { CashCollectionService } from './cash-collection.service';

describe('CashCollectionService validation and safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a negative or missing confirmed register balance before touching the database', async () => {
    await expect(
      CashCollectionService.collect({
        storeId: 'store-siyoma',
        expectedCashUsd: -50,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow('Подтверждённый остаток кассы не может быть отрицательной');

    await expect(
      CashCollectionService.collect({
        storeId: 'store-siyoma',
        expectedCashUsd: 'abc',
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow();
  });

  it('rejects collection from non-existent store', async () => {
    db.store.findUnique.mockResolvedValue(null);
    await expect(
      CashCollectionService.collect({
        storeId: 'non-existent-store-id',
        expectedCashUsd: 100,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow();
  });

  it('rejects uncollected breakdown for non-existent store', async () => {
    db.store.findUnique.mockResolvedValue(null);
    await expect(
      CashCollectionService.getUncollectedBreakdown('non-existent-store-id')
    ).rejects.toThrow('Магазин не найден');
  });

  it('rejects collection if store cash register shift is not closed', async () => {
    db.store.findUnique.mockResolvedValue({
      id: 'store-1',
      name: 'Садбарг',
      active: true,
      isMainWarehouse: false,
      cashBalanceUsd: 100,
    });
    db.financialAccount.findUnique.mockResolvedValue({
      id: 'fa-1',
      balanceUsd: 100,
    });
    db.financialAccount.findUniqueOrThrow.mockResolvedValue({
      id: 'fa-1',
      balanceUsd: 100,
    });
    db.cashHandover.findFirst.mockResolvedValue(null);
    db.sale.findMany.mockResolvedValue([{ createdAt: new Date() }]);
    db.expense.findMany.mockResolvedValue([]);
    db.customerPayment.findMany.mockResolvedValue([]);
    db.dailyCashClosing.findMany.mockResolvedValue([]);

    await expect(
      CashCollectionService.collect({
        storeId: 'store-1',
        expectedCashUsd: 100,
        actorUserId: 'user-admin',
      })
    ).rejects.toThrow('не закрыта');
  });

  it('checkStoreShiftStatus detects unclosed dates correctly', async () => {
    const { checkStoreShiftStatus } = await import('./cash-collection.service');
    
    // Test with sales on two dates, only one closed
    db.sale.findMany.mockResolvedValue([
      { createdAt: new Date('2026-10-07T12:00:00Z') },
      { createdAt: new Date('2026-10-08T15:00:00Z') },
    ]);
    db.expense.findMany.mockResolvedValue([]);
    db.customerPayment.findMany.mockResolvedValue([]);
    db.dailyCashClosing.findMany.mockResolvedValue([
      { businessDate: '2026-10-07' },
    ]);

    const res = await checkStoreShiftStatus(db as any, 'store-1', null);
    expect(res.isShiftClosed).toBe(false);
    expect(res.unclosedDates).toEqual(['2026-10-08']);
    expect(res.unclosedReason).toContain('2026-10-08');

    // When both are closed
    db.dailyCashClosing.findMany.mockResolvedValue([
      { businessDate: '2026-10-07' },
      { businessDate: '2026-10-08' },
    ]);
    const resClosed = await checkStoreShiftStatus(db as any, 'store-1', null);
    expect(resClosed.isShiftClosed).toBe(true);
    expect(resClosed.unclosedDates).toEqual([]);
    expect(resClosed.unclosedReason).toBeNull();
  });
});
