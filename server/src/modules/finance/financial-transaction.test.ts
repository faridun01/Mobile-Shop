import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() });
  return { financialAccount: model(), financialTransaction: model(), financialCategory: model(), $queryRaw: vi.fn() };
});

import { postTransaction, cancelTransaction } from './financial-transaction.service';
import { nextTransactionNumber } from './transaction-number.service';

beforeEach(() => {
  vi.resetAllMocks();
  db.financialTransaction.create.mockImplementation(async ({ data }: any) => ({ id: 'ftx-new', ...data }));
  db.financialAccount.update.mockResolvedValue({});
  db.financialAccount.updateMany.mockResolvedValue({ count: 1 });
  db.financialCategory.findFirst.mockResolvedValue({ id: 'category-1' });
  db.$queryRaw.mockResolvedValue([{ issued: 42 }]);
});

const basePosting = {
  numberPrefix: 'CR',
  accountId: 'account-1',
  balanceCurrency: 'TJS' as const,
  amount: 500,
  currency: 'TJS' as const,
  exchangeRate: 10,
  amountTjs: 500,
  amountUsd: 50,
  categoryName: 'Продажа',
  description: 'Test income',
  createdByUserId: 'admin',
};

describe('nextTransactionNumber', () => {
  it('formats prefix-year-padded sequence from the raw query result', async () => {
    const number = await nextTransactionNumber(db as any, 'CR');
    const year = new Date().getFullYear();
    expect(number).toBe(`CR-${year}-000042`);
  });
});

describe('postTransaction', () => {
  it('increments the account balance for an IN movement and creates one row', async () => {
    const result = await postTransaction(db as any, { ...basePosting, type: 'INCOME', direction: 'IN' });
    expect(db.financialAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { balanceTjs: { increment: 500 } } });
    expect(db.financialAccount.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ type: 'INCOME', direction: 'IN', amountTjs: 500 });
  });

  it('rejects an OUT movement that would take the account balance negative', async () => {
    db.financialAccount.updateMany.mockResolvedValue({ count: 0 });
    await expect(postTransaction(db as any, { ...basePosting, type: 'EXPENSE', direction: 'OUT' })).rejects.toThrow('Недостаточно средств');
    expect(db.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('allows an unguarded OUT movement to go through even when the balance check would fail', async () => {
    await postTransaction(db as any, { ...basePosting, type: 'SUPPLIER_PAYMENT', direction: 'OUT', guardBalance: false });
    expect(db.financialAccount.updateMany).not.toHaveBeenCalled();
    expect(db.financialAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { balanceTjs: { increment: -500 } } });
  });

  it('moves both accounts for a TRANSFER without guarding the destination', async () => {
    await postTransaction(db as any, {
      ...basePosting, type: 'TRANSFER', direction: 'NEUTRAL', destinationAccountId: 'account-2', categoryName: undefined,
    });
    expect(db.financialAccount.updateMany).toHaveBeenCalledWith({ where: { id: 'account-1', balanceTjs: { gte: 500 } }, data: { balanceTjs: { increment: -500 } } });
    expect(db.financialAccount.update).toHaveBeenCalledWith({ where: { id: 'account-2' }, data: { balanceTjs: { increment: 500 } } });
  });
});

describe('cancelTransaction', () => {
  it('marks the original CANCELLED and posts a linked reversal instead of deleting anything', async () => {
    db.financialTransaction.findUnique.mockResolvedValue({
      id: 'ftx-1', status: 'POSTED', type: 'EXPENSE', direction: 'OUT', accountId: 'account-1', destinationAccountId: null,
      balanceCurrency: 'TJS', amount: 500, currency: 'TJS', exchangeRate: 10, amountTjs: 500, amountUsd: 50,
      categoryId: 'category-1', counterpartyType: null, counterpartyId: null, counterpartyName: null,
      shopId: 'shop-1', sourceType: 'EXPENSE', sourceId: 'expense-1', description: 'Rent',
    });

    const reversal = await cancelTransaction(db as any, 'ftx-1', 'admin');

    expect(db.financialTransaction.update).toHaveBeenCalledWith({
      where: { id: 'ftx-1' },
      data: expect.objectContaining({ status: 'CANCELLED', cancelledByUserId: 'admin' }),
    });
    // The reversal of an OUT is an IN — money comes back — and must never be blocked by a guard.
    expect(db.financialAccount.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { balanceTjs: { increment: 500 } } });
    expect(db.financialAccount.updateMany).not.toHaveBeenCalled();
    expect(reversal).toMatchObject({ direction: 'IN', reversedTransactionId: 'ftx-1' });
  });

  it('refuses to cancel an already-cancelled transaction', async () => {
    db.financialTransaction.findUnique.mockResolvedValue({ id: 'ftx-1', status: 'CANCELLED' });
    await expect(cancelTransaction(db as any, 'ftx-1', 'admin')).rejects.toThrow('уже отменена');
    expect(db.financialTransaction.update).not.toHaveBeenCalled();
  });
});
