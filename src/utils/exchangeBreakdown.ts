import type { Sale } from '../types';
import { decimal, moneyNumber, sumMoney } from './money';
import { getBusinessDateKey } from './businessDate';

export interface Amount { tjs: number; usd: number }

export interface ProfitLine {
  /** Business day 'YYYY-MM-DD' the amount belongs to. */
  day: string;
  label: string;
  usd: number;
}

/**
 * An exchange seen from its new receipt: what the customer paid on each day (the old receipt's
 * day, whose shift may be long closed, and the exchange day, where only the difference moved the
 * register), and — for the admin — how the profit landed on each day.
 */
export interface ExchangeBreakdown {
  oldReceiptNumber: number;
  oldDay: string;
  exchangeDay: string;
  sameDay: boolean;
  returnedGoods: string;
  newGoods: string;
  money: {
    /** Paid for the returned goods on the old receipt's day. */
    oldPaid: Amount;
    /** Taken today: the surcharge (positive) or the change handed back (negative). */
    exchangeDay: Amount;
    /** Everything the customer paid for the new goods, over both days. */
    total: Amount;
  };
  /** ADMIN-only (needs the reversed profit). */
  profit?: {
    lines: ProfitLine[];
    /** The exchange day's profit: the new receipt less the returned goods' profit taken back. */
    exchangeDayUsd: number;
    /** Over both days: the new receipt plus what was withheld and the rate result. */
    totalUsd: number;
  };
}

const dayOf = (date: string | undefined, fallback: string) => (date ? getBusinessDateKey(new Date(date)) : fallback);

export const goodsOf = (sale: Pick<Sale, 'items' | 'accessoryItems'>) => [
  ...(sale.items || []).map((item) => `${item.brand} ${item.model}`.trim()),
  ...(sale.accessoryItems || []).map((line) => `${line.brand} ${line.name} × ${line.quantity}`.trim()),
].filter(Boolean).join(', ');

/** `newSaleProfitUsd` is the new receipt's own profit, as its card shows it. */
export function exchangeBreakdown(sale: Sale, newSaleProfitUsd?: number): ExchangeBreakdown | null {
  const from = sale.exchangeFrom;
  if (!from) return null;
  const exchangeDay = dayOf(from.date ?? sale.date, getBusinessDateKey());
  const oldDay = dayOf(from.saleDate, exchangeDay);

  // The returned goods' price is the credit plus what was withheld; their dollars as the old receipt booked them.
  const oldPaid: Amount = {
    tjs: sumMoney([from.creditTjs, from.withheldTjs]),
    usd: moneyNumber(from.bookedUsd ?? sumMoney([from.creditUsd, from.withheldUsd ?? 0])),
  };
  // The register took the new receipt's dollars less the credit's own dollars, and paid out any change.
  const surchargeTjs = sumMoney([sale.cashAmountTjs || 0, sale.cardAmountTjs || 0]);
  const surchargeUsd = moneyNumber(decimal(sale.totalUsd || 0).minus(sale.exchangeTradeInCreditUsd ?? from.creditUsd ?? 0));
  const today: Amount = {
    tjs: moneyNumber(decimal(surchargeTjs).minus(from.payoutTjs ?? 0)),
    usd: moneyNumber(decimal(surchargeUsd).minus(from.payoutUsd ?? 0)),
  };
  const total: Amount = { tjs: sumMoney([oldPaid.tjs, today.tjs]), usd: sumMoney([oldPaid.usd, today.usd]) };

  const returnedGoods = from.goods || `товар из чека #${from.receiptNumber}`;
  const newGoods = goodsOf(sale) || `чек #${sale.receiptNumber}`;
  let profit: ExchangeBreakdown['profit'];
  if (from.reversedProfitUsd !== undefined && newSaleProfitUsd !== undefined) {
    const reversed = moneyNumber(from.reversedProfitUsd);
    const withheld = moneyNumber(from.withheldUsd ?? 0);
    const fx = moneyNumber(from.fxUsd ?? 0);
    const lines: ProfitLine[] = [
      { day: oldDay, label: `Продажа ${returnedGoods} (чек #${from.receiptNumber})`, usd: reversed },
      { day: exchangeDay, label: `Возврат ${returnedGoods}: прибыль отменена`, usd: -reversed },
      ...(withheld !== 0 ? [{ day: exchangeDay, label: 'Удержано с клиента', usd: withheld }] : []),
      ...(fx !== 0 ? [{ day: exchangeDay, label: 'Разница курса при возврате', usd: fx }] : []),
      { day: exchangeDay, label: `Продажа ${newGoods} (этот чек)`, usd: moneyNumber(newSaleProfitUsd) },
    ];
    profit = {
      lines,
      exchangeDayUsd: sumMoney(lines.filter((line) => line.day === exchangeDay).map((line) => line.usd)),
      totalUsd: sumMoney(lines.map((line) => line.usd)),
    };
  }

  return { oldReceiptNumber: from.receiptNumber, oldDay, exchangeDay, sameDay: oldDay === exchangeDay, returnedGoods, newGoods, money: { oldPaid, exchangeDay: today, total }, profit };
}

/**
 * The profit a receipt booked on its own day, before any return took some of it back (ADMIN-only
 * data). The server's recognized profit already includes each return's change (its goods' profit
 * taken back, what was withheld and the rate result), so those are added back; a whole-receipt
 * refund is not part of it.
 */
export function originalSaleProfitUsd(sale: Sale): number | undefined {
  if (sale.recognizedProfitUsd === undefined || sale.recognizedProfitUsd === null) return undefined;
  const returns = sale.returns ?? [];
  if (returns.some((ret) => ret.reversedProfitUsd === undefined)) return undefined;
  return moneyNumber(returns.reduce(
    (acc, ret) => acc.plus(ret.reversedProfitUsd!).minus(ret.withheldUsd || 0).minus(ret.fxUsd || 0),
    decimal(sale.recognizedProfitUsd),
  ));
}

/**
 * A receipt's profit day by day once goods came back from it (ADMIN-only): the sale on its own
 * day, then each return — or the refund of the whole receipt — taking that profit back on its own
 * day, keeping what was withheld and the rate result. The lines add up to what the owners kept.
 */
export function receiptProfitTimeline(sale: Sale): { lines: ProfitLine[]; totalUsd: number } | null {
  const original = originalSaleProfitUsd(sale);
  if (original === undefined) return null;
  const returns = sale.returns ?? [];
  const lines: ProfitLine[] = [{ day: dayOf(sale.date, getBusinessDateKey()), label: 'Продажа', usd: original }];
  if (returns.length) {
    for (const ret of returns) {
      const day = dayOf(ret.date, getBusinessDateKey());
      lines.push({
        day,
        label: ret.exchangeSaleId ? `Обмен (чек #${ret.exchangeReceiptNumber ?? ''}): прибыль отменена` : 'Возврат: прибыль отменена',
        usd: -moneyNumber(ret.reversedProfitUsd!),
      });
      if ((ret.withheldUsd || 0) !== 0) lines.push({ day, label: 'Удержано с клиента', usd: moneyNumber(ret.withheldUsd) });
      if ((ret.fxUsd || 0) !== 0) lines.push({ day, label: 'Разница курса при возврате', usd: moneyNumber(ret.fxUsd!) });
    }
    return { lines, totalUsd: moneyNumber(sale.recognizedProfitUsd!) };
  }
  if (sale.status !== 'REFUNDED' || sale.refundProfitUsd === undefined || sale.refundProfitUsd === null) return null;
  // The whole receipt refunded: its profit taken back on the refund's day, with what was withheld
  // and whatever else the refund booked (the rate result).
  const day = dayOf(sale.refundedAt, getBusinessDateKey());
  const penalty = moneyNumber(sale.penaltyFeeUsd || 0);
  const rest = moneyNumber(decimal(sale.refundProfitUsd).plus(original).minus(penalty));
  lines.push({ day, label: sale.isCancelled ? 'Продажа отменена: прибыль отменена' : 'Возврат всего чека: прибыль отменена', usd: -original });
  if (penalty !== 0) lines.push({ day, label: 'Удержано с клиента', usd: penalty });
  if (rest !== 0) lines.push({ day, label: 'Разница курса при возврате', usd: rest });
  return { lines, totalUsd: moneyNumber(decimal(original).plus(sale.refundProfitUsd)) };
}
