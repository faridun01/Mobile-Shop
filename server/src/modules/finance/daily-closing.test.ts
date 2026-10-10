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
  sales = [] as any[],
  refunds = [] as any[],
  exchanges = [] as any[],
  expenses = [] as any[],
  collections = [] as any[],
  customerPayments = [] as any[],
  ledger = [] as any[],
  rate = 10,
} = {}) {
  db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Сиёма', isMainWarehouse: false, active: true });
  db.dailyCashClosing.findUnique.mockResolvedValue(null);
  db.sale.findMany.mockResolvedValueOnce(sales).mockResolvedValueOnce(refunds);
  db.exchangeEvent.findMany.mockResolvedValue(exchanges);
  db.cashHandover.findMany.mockResolvedValue(collections);
  db.customerPayment.findMany.mockResolvedValue(customerPayments);
  db.financialAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
  // Expenses are read from the register ledger (OUT rows); other moves come from the same table.
  const expenseRows = expenses.map((e: any) => ({ direction: 'OUT', amountTjs: e.amountTjs, amountUsd: e.amountUsd }));
  db.financialTransaction.findMany.mockImplementation(async ({ where }: any) => (where.sourceType === 'EXPENSE' ? expenseRows : ledger));
  db.exchangeRate.findUnique.mockResolvedValue({ rate });
  db.dailyCashClosing.create.mockImplementation(({ data }: any) => ({ id: 'dc-1', ...data }));
}

describe('DailyClosingService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((cb: any) => cb(db));
    db.notification.create.mockResolvedValue({ id: 'n1' });
    vi.mocked(resolveActor).mockResolvedValue({ id: 'u1', name: 'Alisher', role: 'SELLER' } as any);
  });

  it('a day starts from 0 and totals cash and bank less the store expenses paid that day', async () => {
    openDay({
      sales: [{ id: 's1', cashAmountTjs: 1000, cardAmountTjs: 400, exchangeRate: 10, exchangeEvents: [] }],
      expenses: [{ id: 'e1', amountTjs: 100, amountUsd: 10 }],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.alreadyClosed).toBe(false);
    expect(summary.openingCashTjs).toBe('0');
    expect(summary.openingCashUsd).toBe('0');
    expect(summary.salesCashTjs).toBe('1000');
    expect(summary.salesCashUsd).toBe('100');
    expect(summary.salesCardTjs).toBe('400');
    expect(summary.salesCardUsd).toBe('40');
    expect(summary.expensesCashTjs).toBe('100');
    // 1000 cash + 400 bank − 100 expense = 1300 TJS; $100 + $40 − $10 = $130
    expect(summary.expectedCashTjs).toBe('1300');
    expect(summary.expectedCashUsd).toBe('130');
  });

  it('splits a sale into cash and bank dollars that add up to what the register booked', async () => {
    // 1000 TJS at 9.3: the register booked $107.53 for the whole receipt.
    openDay({ sales: [{ id: 's1', cashAmountTjs: 333, cardAmountTjs: 667, exchangeRate: 9.3, exchangeEvents: [] }], rate: 9.3 });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.salesCashUsd).toBe('35.81');
    expect(summary.salesCardUsd).toBe('71.72');
    expect(summary.expectedCashUsd).toBe('107.53');
  });

  it('nets out a sale that was made and refunded on the same day, keeping the penalty', async () => {
    const sale = { id: 's1', cashAmountTjs: 1000, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [] };
    const refund = { id: 's1', actualRefundAmountTjs: 900, penaltyFeeTjs: 100, penaltyFeeUsd: 10 };
    openDay({ sales: [sale], refunds: [refund] });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    // The refunded sale is still counted as money in that day; the refund takes its part back out.
    expect(db.sale.findMany.mock.calls[0][0].where.status).toBeUndefined();
    expect(summary.refundsCashUsd).toBe('90');
    expect(summary.expectedCashTjs).toBe('100');
    expect(summary.expectedCashUsd).toBe('10');
  });

  it('a refund hands back the somoni paid, booked in dollars at the refund day rate', async () => {
    // Sold for 9200 TJS at 9.20 ($1000) on an earlier day; refunded today at 9.50 with a 100 TJS penalty.
    openDay({ refunds: [{ id: 's1', actualRefundAmountTjs: 9100, penaltyFeeTjs: 100, penaltyFeeUsd: 10.53 }], rate: 9.5 });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    // 9200 TJS at 9.50 = $968.42, less the $10.53 penalty = $957.89 out of the register.
    expect(summary.refundsCashTjs).toBe('9100');
    expect(summary.refundsCashUsd).toBe('957.89');
    expect(summary.expectedCashTjs).toBe('-9100');
    expect(summary.expectedCashUsd).toBe('-957.89');
  });

  it('counts exchange settlements on the day of the exchange, in the dollars the register moved', async () => {
    openDay({
      // Sale made today, exchanged today with +200 cash: sale row already includes the 200.
      sales: [{ id: 's1', cashAmountTjs: 1200, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [{ cashAmountTjs: 200, cardAmountTjs: 0, paymentMethod: 'CASH', differenceTjs: 200 }] }],
      // Today's exchange events: that one, plus a payout of 300 on an older sale.
      exchanges: [
        { cashAmountTjs: 200, cardAmountTjs: 0, paymentMethod: 'CASH', differenceTjs: 200, newPriceUsd: 120, exchangeInValueUsd: 100 },
        { cashAmountTjs: -300, cardAmountTjs: 0, paymentMethod: 'CASH', differenceTjs: -300, newPriceUsd: 50, exchangeInValueUsd: 80 },
      ],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    // 1000 at checkout + 200 surcharge − 300 payout; $100 + $20 − $30
    expect(summary.salesCashTjs).toBe('900');
    expect(summary.salesCashUsd).toBe('90');
    expect(summary.expectedCashTjs).toBe('900');
  });

  it('includes customer debt repayments and other register moves', async () => {
    openDay({
      customerPayments: [{ amountTjs: 500, exchangeRate: 10 }],
      ledger: [
        { destinationAccountId: null, direction: 'OUT', amountTjs: 1000, amountUsd: 100 }, // supplier payment
        { destinationAccountId: null, direction: 'IN', amountTjs: 200, amountUsd: 20 },
      ],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.otherCashTjs).toBe('-300');
    expect(summary.otherCashUsd).toBe('-30');
    expect(summary.otherCount).toBe(3);
    expect(summary.expectedCashTjs).toBe('-300');
  });

  it('a collection is not part of the day: it gathers the totals of closed days', async () => {
    openDay({
      sales: [{ id: 's1', cashAmountTjs: 500, cardAmountTjs: 1000, exchangeRate: 10, exchangeEvents: [] }],
      collections: [{ id: 'c1', amountTjs: 1500, amountUsd: 150 }],
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(db.cashHandover.findMany).not.toHaveBeenCalled();
    expect(summary.collectionsCashUsd).toBe('0');
    expect(summary.expectedCashTjs).toBe('1500');
    expect(summary.expectedCashUsd).toBe('150');
  });

  it('values the discrepancy at the closing day rate instead of asking for a dollar count', async () => {
    openDay({ sales: [{ id: 's1', cashAmountTjs: 200, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [] }] });

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

  it('confirms the day as calculated and stores the bank takings in dollars', async () => {
    openDay({ sales: [{ id: 's1', cashAmountTjs: 200, cardAmountTjs: 300, exchangeRate: 10, exchangeEvents: [] }] });

    const result = await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06' });

    expect(result.actualCashTjs).toBe('500');
    expect(result.actualCashUsd).toBe('50');
    expect(result.salesCardUsd).toBe('30');
    expect(result.differenceTjs).toBe('0');
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

  it('rejects shift closing for central store / main warehouse', async () => {
    db.store.findUnique.mockResolvedValue({ id: 'main-store', name: 'Главный склад', isMainWarehouse: true, active: true });

    await expect(
      DailyClosingService.getSummary('main-store', '2026-10-06')
    ).rejects.toThrow('Центральная касса не имеет розничных смен');

    await expect(
      DailyClosingService.closeDay('u1', {
        storeId: 'main-store',
        businessDate: '2026-10-06',
        actualCashTjs: 100,
      })
    ).rejects.toThrow('Центральная касса не имеет розничных смен');
  });
});
