import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DailyClosingService } from './daily-closing.service';
import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { createExpense, cancelExpenseInTx } from '../expenses/expenses.service';
import { postTransaction, cancelTransaction } from './financial-transaction.service';
import { currentOwnerAllocations, readOwnerAllocations, replaceOwnerAllocations } from './owner-allocations';
import { getStoreCashAccount } from './account.service';

vi.mock('../../prisma/prisma.service', () => {
  const store = { findUnique: vi.fn(), update: vi.fn() };
  const dailyCashClosing = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const sale = { findMany: vi.fn() };
  const exchangeEvent = { findMany: vi.fn() };
  const saleReturn = { findMany: vi.fn().mockResolvedValue([]) };
  const expense = { findMany: vi.fn() };
  const cashHandover = { findMany: vi.fn(), findFirst: vi.fn() };
  const customerPayment = { findMany: vi.fn() };
  const financialAccount = { findUnique: vi.fn() };
  const financialTransaction = { findMany: vi.fn(), findFirst: vi.fn() };
  const exchangeRate = { findUnique: vi.fn(), findFirst: vi.fn() };
  const auditLog = { create: vi.fn() };
  const notification = { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'n1' }) };
  const user = { findUnique: vi.fn() };

  const tx = {
    store, dailyCashClosing, sale, exchangeEvent, saleReturn, expense, cashHandover, customerPayment,
    financialAccount, financialTransaction, exchangeRate, auditLog, notification, user,
    $queryRaw: vi.fn(),
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

// The shortage expense itself is the expense service's job (tested there); here we check it is
// booked, linked and cancelled with the closing.
vi.mock('../expenses/expenses.service', () => ({
  SHORTAGE_CATEGORY: 'CASH_SHORTAGE',
  createExpense: vi.fn().mockResolvedValue({ id: 'exp-shortage' }),
  cancelExpenseInTx: vi.fn().mockResolvedValue({}),
}));

// The surplus posting: the register's account, the ledger row and the owners' shares.
vi.mock('./account.service', () => ({ getStoreCashAccount: vi.fn().mockResolvedValue({ id: 'acc-1' }) }));
vi.mock('./financial-transaction.service', () => ({ postTransaction: vi.fn(), cancelTransaction: vi.fn() }));
vi.mock('./owner-allocations', () => ({
  currentOwnerAllocations: vi.fn(),
  replaceOwnerAllocations: vi.fn(),
  readOwnerAllocations: vi.fn((rows: any) => rows),
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
  refundPostings = [] as any[],
  rate = 10,
} = {}) {
  db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Сиёма', isMainWarehouse: false, active: true });
  db.dailyCashClosing.findUnique.mockResolvedValue(null);
  // The day's sales; full refunds of that day (only used when they have no register posting);
  // receipt numbers of refund postings (taken from their descriptions here).
  db.sale.findMany.mockImplementation(async ({ where }: any) => (where.refundedAt ? refunds : where.id ? [] : sales));
  db.exchangeEvent.findMany.mockResolvedValue(exchanges);
  db.cashHandover.findMany.mockResolvedValue(collections);
  db.customerPayment.findMany.mockResolvedValue(customerPayments);
  db.financialAccount.findUnique.mockResolvedValue({ id: 'acc-1' });
  // Expenses are read from the register ledger (OUT rows); refunds and their cancellations too;
  // other moves come from the same table.
  const expenseRows = expenses.map((e: any) => ({ direction: 'OUT', amountTjs: e.amountTjs, amountUsd: e.amountUsd }));
  db.financialTransaction.findMany.mockImplementation(async ({ where }: any) =>
    (where.OR?.some((c: any) => c.type === 'REFUND') ? refundPostings
      : where.type === 'REFUND' ? refundPostings.filter((p: any) => p.sourceType === 'SALE')
        : where.sourceType === 'EXPENSE' ? expenseRows : ledger));
  db.exchangeRate.findUnique.mockResolvedValue({ rate });
  db.dailyCashClosing.create.mockImplementation(({ data }: any) => ({ id: 'dc-1', ...data }));
}

describe('DailyClosingService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.$transaction.mockImplementation((cb: any) => cb(db));
    db.notification.create.mockResolvedValue({ id: 'n1' });
    vi.mocked(resolveActor).mockResolvedValue({ id: 'u1', name: 'Alisher', role: 'SELLER' } as any);
    vi.mocked(createExpense).mockResolvedValue({ id: 'exp-shortage' } as any);
    vi.mocked(cancelExpenseInTx).mockResolvedValue({} as any);
    vi.mocked(getStoreCashAccount).mockResolvedValue({ id: 'acc-1' } as any);
    vi.mocked(readOwnerAllocations).mockImplementation((rows: any) => rows);
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

  it('takes a refund in the dollars its register posting booked, not at a rate set later that day', async () => {
    // 9300 TJS handed back at 9.35 booked $994.65; the rate was changed to 9.40 before closing.
    openDay({
      refunds: [{ id: 's1', actualRefundAmountTjs: 9300, penaltyFeeTjs: 50, penaltyFeeUsd: 5.35 }],
      refundPostings: [{ sourceType: 'SALE', sourceId: 's1', amountTjs: 9300, amountUsd: 994.65, description: 'Возврат по чеку #7 (наличными): брак' }],
      rate: 9.4,
    });

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.refundsCashTjs).toBe('9300');
    expect(summary.refundsCashUsd).toBe('994.65');
    expect(summary.refundsCount).toBe(1);
    expect(summary.refundedReceipts).toEqual([{ receiptNumber: 7, amountTjs: '9300', amountUsd: '994.65', reason: 'брак' }]);
  });

  it('a refund cancelled the same day nets out its own posting, and the refund made again counts once', async () => {
    openDay({
      sales: [{ id: 's1', cashAmountTjs: 10550, cardAmountTjs: 0, exchangeRate: 9.3, exchangeEvents: [] }],
      refundPostings: [
        { sourceType: 'SALE', sourceId: 's1', amountTjs: 3070, amountUsd: 330.11, description: 'Возврат по чеку #1 (наличными): первый' },
        { sourceType: 'RETURN_CANCEL', sourceId: 'log-1', amountTjs: 3070, amountUsd: 330.11, description: 'Отмена возврата по чеку #1 (наличными): ошибка' },
        { sourceType: 'SALE', sourceId: 's1', amountTjs: 7480, amountUsd: 804.3, description: 'Возврат по чеку #1 (наличными): повторный' },
      ],
      rate: 9.3,
    });
    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');
    expect(summary.refundsCashUsd).toBe('804.3');
    expect(summary.refundsCount).toBe(2);
    expect(summary.expectedCashTjs).toBe('3070');
    expect(summary.expectedCashUsd).toBe('330.11');
    const query = db.financialTransaction.findMany.mock.calls.find(([args]: any[]) => args.where.OR?.some((c: any) => c.type === 'REFUND'))[0];
    expect(query.where).toMatchObject({ accountId: 'acc-1', status: 'POSTED', transactionDate: expect.anything(), reversedTransactionId: null });
  });

  it('a refund of an earlier day cancelled today brings its money back into today, by its channel', async () => {
    openDay({
      refundPostings: [{ sourceType: 'RETURN_CANCEL', sourceId: 'ret-1', amountTjs: 3070, amountUsd: 330.11, description: 'Отмена возврата по чеку #5 (переводом / картой): передумал' }],
      rate: 9.4,
    });
    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');
    expect(summary.refundsCashTjs).toBe('-3070');
    expect(summary.refundsCardTjs).toBe('-3070');
    expect(summary.refundsCardUsd).toBe('-330.11');
    expect(summary.refundsCount).toBe(0);
    expect(summary.expectedCashTjs).toBe('3070');
    expect(summary.expectedCashUsd).toBe('330.11');
    expect(summary.refundedReceipts).toEqual([{ receiptNumber: 5, amountTjs: '-3070', amountUsd: '-330.11', reason: 'отмена возврата: передумал' }]);
  });

  it('stores the card refund portion separately when closing a day', async () => {
    openDay({
      sales: [{ id: 's1', cashAmountTjs: 0, cardAmountTjs: 10550, exchangeRate: 9.3, exchangeEvents: [] }],
      refundPostings: [{ sourceType: 'SALE', sourceId: 's1', amountTjs: 3070, amountUsd: 330.11, description: 'Возврат по чеку #32 (переводом / картой): Возврат' }],
      rate: 9.3,
    });
    const closing = await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06' });
    expect(closing.refundsCardTjs).toBe('3070');
    expect(closing.refundsCardUsd).toBe('330.11');
    expect(closing.actualCashTjs).toBe('7480');
    expect(closing.actualCashUsd).toBe('804.3');
    expect(db.notification.create.mock.calls[0][0].data.message).toContain('Наличные: 0 TJS, банк: 7480 TJS');
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

  it('books a shortage as a store expense from the register and links it to the closing', async () => {
    vi.mocked(createExpense).mockClear();
    openDay({ sales: [{ id: 's1', cashAmountTjs: 200, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [] }] });
    db.dailyCashClosing.create.mockImplementation(async ({ data }: any) => data);

    const result = await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06', actualCashTjs: 180 });

    expect(createExpense).toHaveBeenCalledTimes(1);
    const input = vi.mocked(createExpense).mock.calls[0][1];
    expect(input).toMatchObject({ category: 'CASH_SHORTAGE', storeId: 'store-1', targetType: 'STORE', paidFromCashRegister: true, createdByUserId: 'u1' });
    expect(String(input.amountTjs)).toBe('20');
    expect(result.shortageExpenseId).toBe('exp-shortage');
    // A past day's shortage is booked in that day, at that day's rate.
    const closingDay = vi.mocked(createExpense).mock.calls[0][2]!;
    expect(String(closingDay.rate)).toBe('10');
    expect(closingDay.at.toISOString().slice(0, 10)).toBe('2026-10-06');
  });

  it('puts a surplus into the register as the store owners income, in the closed day at its rate', async () => {
    openDay({ sales: [{ id: 's1', cashAmountTjs: 200, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [] }] });
    vi.mocked(currentOwnerAllocations).mockResolvedValue([{ ownerId: 'o1', amountUsd: 3 }] as any);

    await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06', actualCashTjs: 230 });

    expect(createExpense).not.toHaveBeenCalled();
    expect(db.store.update).toHaveBeenCalledWith({ where: { id: 'store-1' }, data: { cashBalanceUsd: { increment: expect.anything() } } });
    expect(String(db.store.update.mock.calls[0][0].data.cashBalanceUsd.increment)).toBe('3');
    const posting = vi.mocked(postTransaction).mock.calls[0][1];
    expect(posting).toMatchObject({ type: 'INCOME', direction: 'IN', accountId: 'acc-1', sourceType: 'CASH_SURPLUS', sourceId: 'dc-1' });
    expect([String(posting.amountTjs), String(posting.amountUsd), String(posting.exchangeRate)]).toEqual(['30', '3', '10']);
    expect(posting.transactionDate!.toISOString().slice(0, 10)).toBe('2026-10-06');
    expect(replaceOwnerAllocations).toHaveBeenCalledWith(expect.anything(), [], [{ ownerId: 'o1', amountUsd: 3 }], 1);
    expect(db.dailyCashClosing.update).toHaveBeenCalledWith({ where: { id: 'dc-1' }, data: { surplusOwnerAllocations: [{ ownerId: 'o1', amountUsd: 3 }] } });
  });

  it('books nothing for an exact count', async () => {
    openDay({ sales: [{ id: 's1', cashAmountTjs: 200, cardAmountTjs: 0, exchangeRate: 10, exchangeEvents: [] }] });
    await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06' });
    expect(createExpense).not.toHaveBeenCalled();
    expect(postTransaction).not.toHaveBeenCalled();
    expect(db.store.update).not.toHaveBeenCalled();
  });

  it('confirms the day as calculated and stores the bank takings in dollars', async () => {
    openDay({ sales: [{ id: 's1', cashAmountTjs: 200, cardAmountTjs: 300, exchangeRate: 10, exchangeEvents: [] }] });

    const result = await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06' });

    expect(result.actualCashTjs).toBe('500');
    expect(result.actualCashUsd).toBe('50');
    expect(result.salesCardUsd).toBe('30');
    expect(result.differenceTjs).toBe('0');
  });

  it('locks the store row before counting the day, the same lock every register operation takes', async () => {
    openDay();
    await DailyClosingService.closeDay('u1', { storeId: 'store-1', businessDate: '2026-10-06' });
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.sale.findMany.mock.invocationCallOrder[0]);
  });

  it('refuses to reopen a shift whose day was already collected', async () => {
    db.dailyCashClosing.findUnique.mockResolvedValue({ id: 'dc-1', storeId: 'store-1', businessDate: '2026-10-06', createdAt: new Date('2026-10-06T15:00:00Z'), store: { id: 'store-1', name: 'Сиёма' } });
    db.cashHandover.findFirst.mockResolvedValue({ id: 'h-1', createdAt: new Date('2026-10-06T16:00:00Z') });

    await expect(DailyClosingService.delete('dc-1', 'u1')).rejects.toThrow('проведена инкассация');
    expect(db.dailyCashClosing.delete).not.toHaveBeenCalled();
    // Only collections made after this closing, and not cancelled, count.
    expect(db.cashHandover.findFirst.mock.calls[0][0].where).toMatchObject({ storeId: 'store-1', cancelledAt: null, createdAt: { gt: new Date('2026-10-06T15:00:00Z') } });
  });

  it('reopens a shift that was not collected', async () => {
    db.dailyCashClosing.findUnique.mockResolvedValue({ id: 'dc-1', storeId: 'store-1', businessDate: '2026-10-06', createdAt: new Date('2026-10-06T15:00:00Z'), actualCashTjs: 500, store: { id: 'store-1', name: 'Сиёма' } });
    db.cashHandover.findFirst.mockResolvedValue(null);

    await DailyClosingService.delete('dc-1', 'u1');
    expect(db.dailyCashClosing.delete).toHaveBeenCalledWith({ where: { id: 'dc-1' } });
  });

  it('reopening a shift closed with a shortage cancels that shortage expense', async () => {
    vi.mocked(cancelExpenseInTx).mockClear();
    db.dailyCashClosing.findUnique.mockResolvedValue({ id: 'dc-2', storeId: 'store-1', businessDate: '2026-10-06', createdAt: new Date('2026-10-06T15:00:00Z'), actualCashTjs: 180, shortageExpenseId: 'exp-shortage', store: { id: 'store-1', name: 'Сиёма' } });
    db.cashHandover.findFirst.mockResolvedValue(null);

    await DailyClosingService.delete('dc-2', 'u1');
    expect(cancelExpenseInTx).toHaveBeenCalledWith(expect.anything(), 'exp-shortage', 'u1', true);
    expect(vi.mocked(cancelExpenseInTx).mock.invocationCallOrder[0]).toBeGreaterThan(db.dailyCashClosing.delete.mock.invocationCallOrder.at(-1));
  });

  it('reopening a shift closed with a surplus takes it back out of the register and the owners income, in that day', async () => {
    const allocations = [{ ownerId: 'o1', amountUsd: 3 }];
    db.dailyCashClosing.findUnique.mockResolvedValue({ id: 'dc-3', storeId: 'store-1', businessDate: '2026-10-06', createdAt: new Date('2026-10-06T15:00:00Z'), actualCashTjs: 230, surplusOwnerAllocations: allocations, store: { id: 'store-1', name: 'Сиёма' } });
    db.cashHandover.findFirst.mockResolvedValue(null);
    db.financialTransaction.findFirst.mockResolvedValue({ id: 'ft-surplus', amountUsd: 3 });

    await DailyClosingService.delete('dc-3', 'u1');

    expect(db.financialTransaction.findFirst.mock.calls[0][0].where).toMatchObject({ sourceType: 'CASH_SURPLUS', sourceId: 'dc-3' });
    expect(db.store.update).toHaveBeenCalledWith({ where: { id: 'store-1' }, data: { cashBalanceUsd: { decrement: 3 } } });
    expect(cancelTransaction).toHaveBeenCalledWith(expect.anything(), 'ft-surplus', 'u1', { keepDate: true });
    expect(replaceOwnerAllocations).toHaveBeenCalledWith(expect.anything(), allocations, [], 1);
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
