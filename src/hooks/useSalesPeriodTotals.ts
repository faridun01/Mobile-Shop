import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { sumMoney } from '../utils/money';

interface Amount { tjs: number; usd: number }

/** One store's day as the shift closing counts it; the parts add up to `total`. */
export interface ShiftCash {
  businessDate: string;
  closed: boolean;
  /** How many stores' shifts are added up (all stores); 1 for one store. */
  stores: number;
  total: Amount;
  /** Undefined for closings saved before the day-total rules (no split to show). */
  parts?: {
    cash: Amount;
    bank: Amount;
    /** Debt repayments and other money taken in. */
    other: Amount;
    refunds: Amount;
    /** Refunded receipts, when the server listed them (not for an old closed day). */
    refundCount?: number;
    expenses: Amount;
  };
}

export interface PeriodProfit {
  profitUsd: number;
  profitTjs: number;
}

type ShiftSummaryRow = Record<string, unknown> & { alreadyClosed?: boolean; refundedReceipts?: { amountTjs: string | number }[] };

const n = (value: unknown) => Number(value) || 0;

/** Maps /daily-closings/summary to the figures the sales history shows. */
export function toShiftCash(businessDate: string, row: ShiftSummaryRow): ShiftCash {
  const amount = (tjs: string, usd: string): Amount => ({ tjs: n(row[tjs]), usd: n(row[usd]) });
  const hasSplit = row.salesCardUsd !== null && row.salesCardUsd !== undefined;
  return {
    businessDate,
    closed: Boolean(row.alreadyClosed),
    stores: 1,
    total: amount('expectedCashTjs', 'expectedCashUsd'),
    parts: hasSplit
      ? {
          cash: amount('salesCashTjs', 'salesCashUsd'),
          bank: amount('salesCardTjs', 'salesCardUsd'),
          other: amount('otherCashTjs', 'otherCashUsd'),
          refunds: amount('refundsCashTjs', 'refundsCashUsd'),
          refundCount: Array.isArray(row.refundedReceipts) ? row.refundedReceipts.filter((r) => n(r.amountTjs) > 0).length : undefined,
          expenses: amount('expensesCashTjs', 'expensesCashUsd'),
        }
      : undefined,
  };
}

/**
 * The shifts of several stores on one day added up, as the closings of all of them would count:
 * closed when every one is; the split only when every shift has one.
 */
export function sumShiftCash(businessDate: string, shifts: ShiftCash[]): ShiftCash {
  const add = (pick: (s: ShiftCash) => Amount): Amount => ({
    tjs: sumMoney(shifts.map((s) => pick(s).tjs)),
    usd: sumMoney(shifts.map((s) => pick(s).usd)),
  });
  const split = shifts.every((s) => s.parts) ? shifts.map((s) => s.parts!) : undefined;
  const addPart = (key: Exclude<keyof NonNullable<ShiftCash['parts']>, 'refundCount'>): Amount => ({
    tjs: sumMoney(split!.map((p) => p[key].tjs)),
    usd: sumMoney(split!.map((p) => p[key].usd)),
  });
  return {
    businessDate,
    closed: shifts.length > 0 && shifts.every((s) => s.closed),
    stores: shifts.length,
    total: add((s) => s.total),
    parts: split
      ? {
          cash: addPart('cash'),
          bank: addPart('bank'),
          other: addPart('other'),
          refunds: addPart('refunds'),
          refundCount: split.every((p) => p.refundCount !== undefined) ? split.reduce((sum, p) => sum + p.refundCount!, 0) : undefined,
          expenses: addPart('expenses'),
        }
      : undefined,
  };
}

/**
 * Server figures for the sales history totals, so they match the shift closing and the profit
 * report instead of re-adding the receipts on screen:
 * - the shift's register for one day — of one store, or of every store added up — what the closing counts, where an exchange
 *   brings in only its difference, a refund of an older receipt is paid out today and that
 *   receipt's money stays on its own day;
 * - for the admin, the period's profit as the report books it, with returns and exchanges of
 *   older receipts on the day they happened.
 * Each is undefined while loading, on an error, or when not asked for.
 */
export function useSalesPeriodTotals({ storeId, allStoreIds, businessDate, reportQuery, revision }: {
  storeId?: string;
  /** Without a store: the retail stores whose shifts add up to the day (the main warehouse has none). */
  allStoreIds?: string[];
  businessDate?: string;
  /** e.g. "period=TODAY&storeId=…"; omitted when the profit isn't shown or a search narrows the receipts. */
  reportQuery?: string;
  revision: number;
}) {
  const [shift, setShift] = useState<ShiftCash>();
  const [profit, setProfit] = useState<PeriodProfit>();

  const storeKey = storeId ?? (allStoreIds ?? []).join(',');
  useEffect(() => {
    setShift(undefined);
    const ids = storeKey ? storeKey.split(',') : [];
    if (!ids.length || !businessDate) return;
    let cancelled = false;
    // Every store's shift or none: a partial sum would not match the closings.
    Promise.all(ids.map((id) => apiClient<ShiftSummaryRow>(`/daily-closings/summary?storeId=${encodeURIComponent(id)}&businessDate=${businessDate}`)))
      .then((rows) => {
        if (cancelled) return;
        const shifts = rows.map((row) => toShiftCash(businessDate, row));
        setShift(storeId ? shifts[0] : sumShiftCash(businessDate, shifts));
      })
      .catch(() => { /* the chips fall back to the receipts; the closing screen still has the figures */ });
    return () => { cancelled = true; };
  }, [storeId, storeKey, businessDate, revision]);

  useEffect(() => {
    setProfit(undefined);
    if (!reportQuery) return;
    let cancelled = false;
    apiClient<{ profitUsd: number; profitTjs: number }>(`/reports/summary?${reportQuery}`)
      .then((row) => { if (!cancelled) setProfit({ profitUsd: Number(row.profitUsd) || 0, profitTjs: Number(row.profitTjs) || 0 }); })
      .catch(() => { /* falls back to the receipts' own profit */ });
    return () => { cancelled = true; };
  }, [reportQuery, revision]);

  return { shift, profit };
}
