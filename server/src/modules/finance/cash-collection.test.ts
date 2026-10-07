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
});
