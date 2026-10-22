import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

interface Amount { tjs: number; usd: number }

/** One store's day as the shift closing counts it; the parts add up to `total`. */
export interface ShiftCash {
  businessDate: string;
  closed: boolean;
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
 * Server figures for the sales history totals, so they match the shift closing and the profit
 * report instead of re-adding the receipts on screen:
 * - the shift's register for one store and one day — what the closing counts, where an exchange
 *   brings in only its difference, a refund of an older receipt is paid out today and that
 *   receipt's money stays on its own day;
 * - for the admin, the period's profit as the report books it, with returns and exchanges of
 *   older receipts on the day they happened.
 * Each is undefined while loading, on an error, or when not asked for.
 */
export function useSalesPeriodTotals({ storeId, businessDate, reportQuery, revision }: {
  storeId?: string;
  businessDate?: string;
  /** e.g. "period=TODAY&storeId=…"; omitted when the profit isn't shown or a search narrows the receipts. */
  reportQuery?: string;
  revision: number;
}) {
  const [shift, setShift] = useState<ShiftCash>();
  const [profit, setProfit] = useState<PeriodProfit>();

  useEffect(() => {
    setShift(undefined);
    if (!storeId || !businessDate) return;
    let cancelled = false;
    apiClient<ShiftSummaryRow>(`/daily-closings/summary?storeId=${encodeURIComponent(storeId)}&businessDate=${businessDate}`)
      .then((row) => { if (!cancelled) setShift(toShiftCash(businessDate, row)); })
      .catch(() => { /* the chips fall back to the receipts; the closing screen still has the figures */ });
    return () => { cancelled = true; };
  }, [storeId, businessDate, revision]);

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
