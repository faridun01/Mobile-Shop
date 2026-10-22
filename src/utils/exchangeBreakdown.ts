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
 * A receipt's profit day by day once goods came back from it (ADMIN-only): the sale on its own
 * day, then each return taking its goods' profit back on the return's day, keeping what was
 * withheld and the rate result. The lines add up to the receipt's recognized profit.
 */
export function receiptProfitTimeline(sale: Sale): { lines: ProfitLine[]; totalUsd: number } | null {
  const returns = sale.returns ?? [];
  if (!returns.length || sale.recognizedProfitUsd === undefined || sale.recognizedProfitUsd === null) return null;
  if (returns.some((ret) => ret.reversedProfitUsd === undefined)) return null;
  const recognized = moneyNumber(sale.recognizedProfitUsd);
  const original = moneyNumber(returns.reduce(
    (acc, ret) => acc.plus(ret.reversedProfitUsd!).minus(ret.withheldUsd || 0).minus(ret.fxUsd || 0),
    decimal(recognized),
  ));
  const lines: ProfitLine[] = [{ day: dayOf(sale.date, getBusinessDateKey()), label: 'Продажа', usd: original }];
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
  return { lines, totalUsd: recognized };
}
