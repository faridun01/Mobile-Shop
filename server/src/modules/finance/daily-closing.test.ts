import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DailyClosingService } from './daily-closing.service';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';

vi.mock('../../prisma/prisma.service', () => {
  const store = { findUnique: vi.fn() };
  const dailyCashClosing = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() };
  const sale = { findMany: vi.fn() };
  const exchangeEvent = { findMany: vi.fn() };
  const expense = { findMany: vi.fn() };
  const cashHandover = { findMany: vi.fn() };
  const customerPayment = { findMany: vi.fn() };
  const financialAccount = { findUnique: vi.fn() };
  const financialTransaction = { findMany: vi.fn() };
  const exchangeRate = { findUnique: vi.fn(), findFirst: vi.fn() };
  const auditLog = { create: vi.fn() };
  const notification = { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'n1' }) };
  const user = { findUnique: vi.fn() };

  const tx = {
    store, dailyCashClosing, sale, exchangeEvent, expense, cashHandover, customerPayment,
    financialAccount, financialTransaction, exchangeRate, auditLog, notification, user,
  };

  return {
    prisma: {
      ...tx,
      $transaction: vi.fn((cb: any) => cb(tx)),
    },
  };
});

vi.mock('../../common/actor', () => ({
  resolveActor: vi.fn().mockResolvedValue({ id: 'u1', name: 'Alisher', role: 'SELLER' }),
}));

vi.mock('../../websocket/websocket.gateway', () => ({
  RealtimeSyncGateway: {
    broadcast: vi.fn(),
    notifyDataRefresh: vi.fn(),
  },
}));

const db = prisma as any;

function openDay({
  prev = { actualCashTjs: 500, actualCashUsd: 50 },
  sales = [] as any[],
  refunds = [] as any[],
  exchanges = [] as any[],
  expenses = [] as any[],
  collections = [] as any[],
  customerPayments = [] as any[],
  ledger = [] as any[],
} = {}) {
  db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Сиёма', isMainWarehouse: false, active: true });
  db.dailyCashClosing.findUnique.mockResolvedValue(null);
  db.dailyCashClosing.findFirst.mockResolvedValue(prev && { ...prev, businessDate: '2026-10-05', createdAt: new Date('2026-10-05T15:00:00Z') });
  db.sale.findMany.mockResolvedValueOnce(sales).mockResolvedValueOnce(refunds);
  db.exchangeEvent.findMany.mockResolvedValue(exchanges);
  db.cashHandover.findMany.mockResolvedValue(collections);
  db.customerPayment.findMany.mockResolvedValue(customerPayments);
  db.financialAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
  // Expenses are read from the register ledger (OUT rows); other moves come from the same table.
  const expenseRows = expenses.map((e: any) => ({ direction: 'OUT', amountTjs: e.amountTjs, amountUsd: e.amountUsd }));
  db.financialTransaction.findMany.mockImplementation(async ({ where }: any) => (where.sourceType === 'EXPENSE' ? expenseRows : ledger));
  db.exchangeRate.findUnique.mockResolvedValue({ rate: 10 });
  db.dailyCashClosing.create.mockImplementation(({ data }: any) => ({ id: 'dc-1', ...data }));
}

describe('DailyClosingService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((cb: any) => cb(db));
    db.notification.create.mockResolvedValue({ id: 'n1' });
    vi.mocked(resolveActor).mockResolvedValue({ id: 'u1', name: 'Alisher', role: 'SELLER' } as any);
  });

  it('correctly calculates expected cash when day is open', async () => {
    openDay({
      sales: [{ id: 's1', cashAmountTjs: 1000, cardAmountTjs: 400, exchangeRate: 10, exchangeEvents: [] }],
      expenses: [{ id: 'e1', amountTjs: 100, amountUsd: 10 }],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.alreadyClosed).toBe(false);
    expect(summary.openingCashTjs).toBe('500');
    expect(summary.openingCashUsd).toBe('50');
    expect(summary.salesCashTjs).toBe('1000');
    expect(summary.salesCashUsd).toBe('100');
    expect(summary.salesCardTjs).toBe('400');
    expect(summary.expensesCashTjs).toBe('100');
    // Expected TJS = 500 + 1000 - 100 = 1400; USD equivalent = 50 + 100 - 10 = 140
    expect(summary.expectedCashTjs).toBe('1400');
    expect(summary.expectedCashUsd).toBe('140');
  });

  it('nets out a sale that was made and refunded on the same day', async () => {
    const sale = { id: 's1', cashAmountTjs: 1000, cardAmountTjs: 0, actualRefundAmountTjs: 1000, exchangeRate: 10, exchangeEvents: [] };
    openDay({ sales: [sale], refunds: [sale] });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    // The refunded sale is still counted as cash in, so the refund does not push expected below the opening.
    expect(db.sale.findMany.mock.calls[0][0].where.status).toBeUndefined();
    expect(summary.expectedCashTjs).toBe('500');
  });

  it('counts exchange cash on the day of the exchange, not on the original sale day', async () => {
    openDay({
      // Sale made today, exchanged today with +200 cash: sale row already includes the 200.
      sales: [{ id: 's1', cashAmountTjs: 1200, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [{ cashAmountTjs: 200, cardAmountTjs: 0, paymentMethod: 'CASH', differenceTjs: 200 }] }],
      // Today's exchange events: that one, plus a payout of 300 on an older sale.
      exchanges: [
        { cashAmountTjs: 200, cardAmountTjs: 0, paymentMethod: 'CASH', differenceTjs: 200, exchangeRate: 10 },
        { cashAmountTjs: -300, cardAmountTjs: 0, paymentMethod: 'CASH', differenceTjs: -300, exchangeRate: 10 },
      ],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    // 1000 at checkout + 200 surcharge - 300 payout
    expect(summary.salesCashTjs).toBe('900');
    expect(summary.expectedCashTjs).toBe('1400');
  });

  it('includes customer cash repayments and owner/supplier register moves', async () => {
    openDay({
      customerPayments: [{ amountTjs: 500, exchangeRate: 10 }],
      ledger: [
        { destinationAccountId: null, direction: 'OUT', amountTjs: 1000, amountUsd: 100 }, // owner withdrawal
        { destinationAccountId: null, direction: 'IN', amountTjs: 200, amountUsd: 20 }, // owner deposit
      ],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.otherCashTjs).toBe('-300');
    expect(summary.otherCashUsd).toBe('-30');
    expect(summary.otherCount).toBe(3);
    expect(summary.expectedCashTjs).toBe('200');
  });

  it('does not floor a negative expectation at zero', async () => {
    openDay({ collections: [{ id: 'c1', amountTjs: 800, amountUsd: 80 }] });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.expectedCashTjs).toBe('-300');
  });

  it('values the discrepancy at the closing day rate instead of asking for a dollar count', async () => {
    openDay({ prev: { actualCashTjs: 200, actualCashUsd: 20 } });

    const result = await DailyClosingService.closeDay('u1', {
      storeId: 'store-1',
      businessDate: '2026-10-06',
      actualCashTjs: 180,
      comment: 'Не хватило 20 сомони',
    });

    expect(result.expectedCashTjs).toBe('200');
    expect(result.actualCashTjs).toBe('180');
    expect(result.differenceTjs).toBe('-20');
    expect(result.differenceUsd).toBe('-2');
    expect(result.actualCashUsd).toBe('18');
    // The summary is computed with the transaction client.
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('confirms the day as calculated when no counted amount is sent', async () => {
    openDay({ prev: { actualCashTjs: 200, actualCashUsd: 20 } });

    const result = await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06' });

    expect(result.actualCashTjs).toBe('200');
    expect(result.differenceTjs).toBe('0');
    expect(result.actualCashUsd).toBe('20');
  });

  it('refuses to close without a rate for the business day', async () => {
    openDay();
    db.exchangeRate.findUnique.mockResolvedValue(null);

    await expect(
      DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06', actualCashTjs: 500 })
    ).rejects.toThrow('курс');
  });

  it('rejects duplicate closing for the same day with 409', async () => {
    db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Сиёма', isMainWarehouse: false, active: true });
    db.dailyCashClosing.findUnique.mockResolvedValue({ id: 'existing-closing', businessDate: '2026-10-06' });

    await expect(
      DailyClosingService.closeDay('u1', {
        storeId: 'store-1',
        businessDate: '2026-10-06',
        actualCashTjs: 100,
      })
    ).rejects.toThrow('уже закрыта');
  });
});
