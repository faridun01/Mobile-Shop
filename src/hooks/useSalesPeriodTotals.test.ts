import { describe, expect, it } from 'vitest';
import { sumShiftCash, toShiftCash } from './useSalesPeriodTotals';

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

describe('all stores on one day', () => {
  const day = (row: Record<string, string | boolean>) => toShiftCash('2026-10-23', { salesCardUsd: '0', ...row });
  it('adds the stores shifts up, so the strip matches their closings', () => {
    // Сиёма: 6700 cash, 2000 card, 500 repaid, 4080 handed back, 500 rent → 4620. Second store: 1000 cash.
    const siyoma = day({
      salesCashTjs: '6700', salesCashUsd: '670', salesCardTjs: '2000', salesCardUsd: '200', otherCashTjs: '500', otherCashUsd: '50',
      refundsCashTjs: '4080', refundsCashUsd: '408', expensesCashTjs: '500', expensesCashUsd: '50', expectedCashTjs: '4620', expectedCashUsd: '462',
      alreadyClosed: true,
    });
    const other = day({ salesCashTjs: '1000', salesCashUsd: '100.1', expectedCashTjs: '1000', expectedCashUsd: '100.1' });
    const all = sumShiftCash('2026-10-23', [siyoma, other]);
    expect(all).toMatchObject({ stores: 2, closed: false, total: { tjs: 5620, usd: 562.1 } });
    expect(all.parts).toMatchObject({ cash: { tjs: 7700, usd: 770.1 }, bank: { tjs: 2000 }, refunds: { tjs: 4080 }, expenses: { tjs: 500 }, other: { tjs: 500 } });
    expect(sumShiftCash('2026-10-23', [siyoma, { ...other, closed: true }]).closed).toBe(true);
  });

  it('shows only the total when one store has an old closing without the split', () => {
    const old = toShiftCash('2026-01-05', { alreadyClosed: true, salesCardUsd: null as unknown as string, expectedCashTjs: '100', expectedCashUsd: '10' });
    const all = sumShiftCash('2026-01-05', [old, day({ expectedCashTjs: '50', expectedCashUsd: '5' })]);
    expect(all.parts).toBeUndefined();
    expect(all.total).toEqual({ tjs: 150, usd: 15 });
  });
});
