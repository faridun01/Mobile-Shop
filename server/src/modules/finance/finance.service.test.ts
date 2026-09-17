import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() });
  return {
    financialAccount: model(), financialTransaction: model(), financialCategory: model(), store: model(), auditLog: model(),
    $queryRaw: vi.fn(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
    // resolveIdempotentConflict queries this directly (outside any tx, after the
    // transaction that lost a race has already rolled back) — same underlying mock so a
    // test can control "not found yet" vs "found after the fact" across the two calls.
    financialTransaction: db.financialTransaction,
  },
}));
vi.mock('../../common/actor', () => ({ resolveActor: async () => ({ id: 'admin', name: 'Admin', role: 'ADMIN' }) }));
vi.mock('../exchange-rate/exchange-rate.service', () => ({ requireTodayRate: async () => 10, getRateForDate: async () => 10 }));

import { createCashReceipt, cancelFinancialTransaction } from './finance.service';

beforeEach(() => {
  vi.resetAllMocks();
  db.financialAccount.findUnique.mockResolvedValue({ id: 'acc-1', active: true, storeId: null, name: 'Главный счёт' });
  db.financialAccount.update.mockResolvedValue({});
  db.financialAccount.updateMany.mockResolvedValue({ count: 1 });
  db.financialCategory.findFirst.mockResolvedValue({ id: 'cat-1' });
  db.$queryRaw.mockResolvedValue([{ issued: 1 }]);
  db.auditLog.create.mockResolvedValue({});
});

const baseInput = {
  accountId: 'acc-1',
  amount: 500,
  currency: 'TJS' as const,
  categoryId: 'cat-1',
  description: 'Idempotency test',
  createdByUserId: 'admin',
};

describe('createCashReceipt idempotency', () => {
  it('returns the already-committed row for a repeated key without re-validating or re-mutating', async () => {
    db.financialTransaction.findUnique.mockResolvedValue({ id: 'existing-tx', transactionNumber: 'CR-2026-000001' });

    const result = await createCashReceipt({ ...baseInput, idempotencyKey: 'key-1' });

    expect(result).toEqual({ id: 'existing-tx', transactionNumber: 'CR-2026-000001' });
    // The pre-check short-circuited before any account/balance work happened.
    expect(db.financialAccount.findUnique).not.toHaveBeenCalled();
    expect(db.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent duplicate by returning the winning row instead of throwing', async () => {
    db.financialTransaction.findUnique
      .mockResolvedValueOnce(null) // pre-check inside the losing transaction: no row committed yet
      .mockResolvedValueOnce({ id: 'winner-tx', transactionNumber: 'CR-2026-000005' }); // post-conflict re-query
    const conflictError = Object.assign(new Error('Unique constraint failed on the fields: (`idempotencyKey`)'), { code: 'P2002' });
    db.financialTransaction.create.mockRejectedValue(conflictError);

    const result = await createCashReceipt({ ...baseInput, idempotencyKey: 'key-2' });

    expect(result).toEqual({ id: 'winner-tx', transactionNumber: 'CR-2026-000005' });
  });

  it('re-throws a P2002 that turns out not to be an idempotency-key collision', async () => {
    db.financialTransaction.findUnique.mockResolvedValue(null); // never finds a match by this key
    const unrelatedConflict = Object.assign(new Error('Unique constraint failed on the fields: (`reversedTransactionId`)'), { code: 'P2002' });
    db.financialTransaction.create.mockRejectedValue(unrelatedConflict);

    await expect(createCashReceipt({ ...baseInput, idempotencyKey: 'key-3' })).rejects.toThrow('reversedTransactionId');
  });

  it('behaves exactly as before when no idempotency key is supplied', async () => {
    db.financialTransaction.create.mockResolvedValue({ id: 'tx-no-key', transactionNumber: 'CR-2026-000009' });

    const result = await createCashReceipt(baseInput);

    expect(result).toEqual({ id: 'tx-no-key', transactionNumber: 'CR-2026-000009' });
    // No key means no pre-check lookup at all.
    expect(db.financialTransaction.findUnique).not.toHaveBeenCalled();
  });
});

describe('cancelFinancialTransaction idempotency', () => {
  it('returns the existing reversal for a repeated key before even checking the original transaction', async () => {
    db.financialTransaction.findUnique.mockResolvedValue({ id: 'reversal-1', transactionNumber: 'AJ-2026-000001' });

    const result = await cancelFinancialTransaction('some-tx-id', 'admin', 'cancel-key-1');

    expect(result).toEqual({ id: 'reversal-1', transactionNumber: 'AJ-2026-000001' });
  });
});
