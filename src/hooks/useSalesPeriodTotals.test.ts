import { describe, expect, it } from 'vitest';
import { toShiftCash } from './useSalesPeriodTotals';

describe('shift figures for the sales history', () => {
  it('splits today: 30 000 TJS of sales less a 3 300 TJS refund of yesterday\'s receipt', () => {
    const shift = toShiftCash('2026-10-23', {
      alreadyClosed: false,
      salesCashTjs: '30000', salesCashUsd: '3225.81', salesCardTjs: '0', salesCardUsd: '0',
      otherCashTjs: '0', otherCashUsd: '0', refundsCashTjs: '3300', refundsCashUsd: '354.84',
      expensesCashTjs: '0', expensesCashUsd: '0', expectedCashTjs: '26700', expectedCashUsd: '2870.97',
      refundedReceipts: [{ amountTjs: '3300' }],
    });
    expect(shift.total).toEqual({ tjs: 26700, usd: 2870.97 });
    expect(shift.parts).toMatchObject({ cash: { tjs: 30000 }, refunds: { tjs: 3300, usd: 354.84 }, refundCount: 1 });
    const { cash, bank, other, refunds, expenses } = shift.parts!;
    expect(cash.tjs + bank.tjs + other.tjs - refunds.tjs - expenses.tjs).toBe(shift.total.tjs);
  });

  it('a closed day keeps its total; an old closing without the split shows the total only', () => {
    const closed = toShiftCash('2026-10-22', { alreadyClosed: true, salesCashTjs: '2700', salesCardUsd: '0', refundsCashTjs: '0', expectedCashTjs: '2700', expectedCashUsd: '290.32' });
    expect(closed).toMatchObject({ closed: true, total: { tjs: 2700, usd: 290.32 } });
    expect(closed.parts?.refundCount).toBeUndefined();
    expect(toShiftCash('2026-01-05', { alreadyClosed: true, salesCardUsd: null, expectedCashTjs: '100', expectedCashUsd: '10' }).parts).toBeUndefined();
  });

  it('counts only refunds paid out, not a cancelled refund brought back', () => {
    const shift = toShiftCash('2026-10-23', { salesCardUsd: '0', refundedReceipts: [{ amountTjs: '3300' }, { amountTjs: '-1000' }] });
    expect(shift.parts!.refundCount).toBe(1);
  });
});
