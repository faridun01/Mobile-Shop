import { describe, expect, it } from 'vitest';
import type { Sale } from '../types';
import { exchangeBreakdown, originalSaleProfitUsd, receiptProfitTimeline } from './exchangeBreakdown';

const phone = (brand: string, model: string, salePriceTjs: number, salePriceUsd: number, costBasisUsd: number) => ({
  deviceId: model, imei: '1', brand, model, storage: '256 GB', color: 'Black', salePriceTjs, salePriceUsd, purchaseCostUsd: costBasisUsd, costBasisUsd,
});
const sale = (fields: Partial<Sale>): Sale => ({
  id: 's', receiptNumber: 1, date: '2026-10-22T06:59:32Z', storeId: 'st', storeName: '', sellerId: 'u', sellerName: '',
  items: [], totalTjs: 0, totalUsd: 0, paymentMethod: 'CASH', cashAmountTjs: 0, cardAmountTjs: 0, status: 'COMPLETED', ...fields,
});

describe('exchange breakdown', () => {
  // Honor X8d sold on 21.10 for 2700 TJS ($290.32, cost $275, closed shift), exchanged on 22.10
  // for a Poco M8 at 2900 TJS ($311.83, cost $246) with 200 TJS paid in cash.
  const poco = sale({
    receiptNumber: 42, items: [phone('Poco', 'M8', 2900, 311.83, 246)], totalTjs: 2900, totalUsd: 311.83, exchangeRate: 9.3,
    cashAmountTjs: 200, exchangeTradeInCreditTjs: 2700, exchangeTradeInCreditUsd: 290.32,
    exchangeFrom: {
      saleId: 'old', receiptNumber: 33, saleDate: '2026-10-21T06:10:03Z', date: '2026-10-22T06:59:32Z', goods: 'Honor X8d',
      creditTjs: 2700, creditUsd: 290.32, withheldTjs: 0, withheldUsd: 0, bookedUsd: 290.32, fxUsd: 0, payoutTjs: 0, payoutUsd: 0, reversedProfitUsd: 15.32,
    },
  });

  it('splits the money between the closed old day and the exchange day', () => {
    const b = exchangeBreakdown(poco, 65.83)!;
    expect(b.oldDay).toBe('2026-10-21');
    expect(b.exchangeDay).toBe('2026-10-22');
    expect(b.sameDay).toBe(false);
    expect(b.money).toEqual({ oldPaid: { tjs: 2700, usd: 290.32 }, exchangeDay: { tjs: 200, usd: 21.51 }, total: { tjs: 2900, usd: 311.83 } });
  });

  it('shows the profit taken back today and the total over both days', () => {
    const b = exchangeBreakdown(poco, 65.83)!;
    expect(b.profit!.lines.map((l) => [l.day, l.usd])).toEqual([['2026-10-21', 15.32], ['2026-10-22', -15.32], ['2026-10-22', 65.83]]);
    expect(b.profit!.exchangeDayUsd).toBe(50.51);
    expect(b.profit!.totalUsd).toBe(65.83);
  });

  it('hides the profit when the reversed profit is not visible (store staff)', () => {
    const staff = { ...poco, exchangeFrom: { ...poco.exchangeFrom!, reversedProfitUsd: undefined } };
    expect(exchangeBreakdown(staff, 65.83)!.profit).toBeUndefined();
    expect(exchangeBreakdown(staff)!.money.total.tjs).toBe(2900);
  });

  it('a cheaper phone at a new rate: change paid from today\'s register, the rate result kept', () => {
    // 5250 TJS at 10 ($525, profit $125) for 4200 TJS at 10.5 ($400, profit $100): 1050 TJS back.
    const b = exchangeBreakdown(sale({
      receiptNumber: 2, totalTjs: 4200, totalUsd: 400, cashAmountTjs: 0, exchangeTradeInCreditTjs: 4200, exchangeTradeInCreditUsd: 400,
      exchangeFrom: {
        saleId: 'old', receiptNumber: 1, saleDate: '2026-10-21T06:00:00Z', date: '2026-10-22T06:00:00Z', goods: 'A',
        creditTjs: 5250, creditUsd: 500, withheldTjs: 0, withheldUsd: 0, bookedUsd: 525, fxUsd: 25, payoutTjs: 1050, payoutUsd: 100, reversedProfitUsd: 125,
      },
    }), 100)!;
    expect(b.money).toEqual({ oldPaid: { tjs: 5250, usd: 525 }, exchangeDay: { tjs: -1050, usd: -100 }, total: { tjs: 4200, usd: 425 } });
    expect(b.profit!.exchangeDayUsd).toBe(0);
    expect(b.profit!.totalUsd).toBe(125);
  });
});

describe('receipt profit timeline', () => {
  it('shows the old receipt\'s profit on its own day and taken back on the exchange day', () => {
    const honor = sale({
      receiptNumber: 33, date: '2026-10-21T06:10:03Z', status: 'REFUNDED', recognizedProfitUsd: 0, totalTjs: 2700, totalUsd: 290.32,
      items: [{ ...phone('Honor', 'X8d', 2700, 290.32, 275), returnId: 'r1' }],
      returns: [{ id: 'r1', date: '2026-10-22T06:59:32Z', reason: 'Обмен', withheldTjs: 0, withheldUsd: 0, creditTjs: 2700, creditUsd: 290.32,
        payoutTjs: 0, payoutUsd: 0, exchangeSaleId: 'new', exchangeReceiptNumber: 42, fxUsd: 0, reversedProfitUsd: 15.32 }],
    });
    const t = receiptProfitTimeline(honor)!;
    expect(t.lines.map((l) => [l.day, l.usd])).toEqual([['2026-10-21', 15.32], ['2026-10-22', -15.32]]);
    expect(t.totalUsd).toBe(0);
  });

  it('keeps what was withheld and the rate result on the return day', () => {
    const t = receiptProfitTimeline(sale({
      date: '2026-10-21T06:00:00Z', recognizedProfitUsd: 73.76,
      returns: [{ id: 'r', date: '2026-10-22T06:00:00Z', reason: 'Брак', withheldTjs: 500, withheldUsd: 47.62, creditTjs: 4750, creditUsd: 452.38,
        payoutTjs: 4750, payoutUsd: 452.38, fxUsd: 26.14, reversedProfitUsd: 100 }],
    }))!;
    expect(t.lines.map((l) => l.usd)).toEqual([100, -100, 47.62, 26.14]);
    expect(t.totalUsd).toBe(73.76);
  });
});

describe('whole-receipt refund and repeated exchange', () => {
  it('a whole receipt refunded the next day: profit back on the refund day, withheld and rate result kept', () => {
    // Sold 22 Oct for 5000 TJS at 10 ($500, profit $100); refunded 23 Oct at 10.5 with 500 TJS withheld.
    const t = receiptProfitTimeline(sale({
      date: '2026-10-22T06:00:00Z', status: 'REFUNDED', refundedAt: '2026-10-23T06:00:00Z',
      recognizedProfitUsd: 100, refundProfitUsd: -28.57, penaltyFeeUsd: 47.62,
    }))!;
    expect(t.lines.map((l) => [l.day, l.label, l.usd])).toEqual([
      ['2026-10-22', 'Продажа', 100],
      ['2026-10-23', 'Возврат всего чека: прибыль отменена', -100],
      ['2026-10-23', 'Удержано с клиента', 47.62],
      ['2026-10-23', 'Разница курса при возврате', 23.81],
    ]);
    expect(t.totalUsd).toBe(71.43);
  });

  it('an exchange receipt exchanged again still shows its own sale at the profit it booked', () => {
    // #42 (Poco, profit $65.83) was itself exchanged later: its recognized profit is now $0.
    const chained = sale({
      receiptNumber: 42, status: 'REFUNDED', items: [{ ...phone('Poco', 'M8', 2900, 311.83, 246), returnId: 'r2' }],
      totalTjs: 2900, totalUsd: 311.83, cashAmountTjs: 200, exchangeTradeInCreditTjs: 2700, exchangeTradeInCreditUsd: 290.32,
      recognizedProfitUsd: 0,
      returns: [{ id: 'r2', date: '2026-10-24T06:00:00Z', reason: 'Обмен', withheldTjs: 0, withheldUsd: 0, creditTjs: 2900, creditUsd: 311.83,
        payoutTjs: 0, payoutUsd: 0, exchangeSaleId: 'n3', exchangeReceiptNumber: 50, fxUsd: 0, reversedProfitUsd: 65.83 }],
      exchangeFrom: { saleId: 'old', receiptNumber: 33, saleDate: '2026-10-21T06:10:03Z', date: '2026-10-22T06:59:32Z', goods: 'Honor X8d',
        creditTjs: 2700, creditUsd: 290.32, withheldTjs: 0, withheldUsd: 0, bookedUsd: 290.32, fxUsd: 0, payoutTjs: 0, payoutUsd: 0, reversedProfitUsd: 15.32 },
    });
    expect(originalSaleProfitUsd(chained)).toBe(65.83);
    expect(exchangeBreakdown(chained, originalSaleProfitUsd(chained))!.profit!.totalUsd).toBe(65.83);
  });
});
