import type { Sale } from '../types';
import { moneyNumber, sumMoney } from './money';

export interface SalesSummary {
  receipts: number;
  totalTjs: number;
  cashTjs: number;
  cardTjs: number;
  /** Dollars the receipts were booked at, each at its own day's rate. */
  totalUsd: number;
  cashUsd: number;
  cardUsd: number;
  /** Part of the receipts' total paid with goods handed back in an exchange — no money moved for it that day. */
  tradeInTjs: number;
  tradeInUsd: number;
  refunded: number;
}

type SummarizedSale = Pick<Sale, 'status' | 'totalTjs' | 'cashAmountTjs' | 'cardAmountTjs'>
  & Partial<Pick<Sale, 'totalUsd' | 'exchangeRate' | 'exchangeTradeInCreditTjs' | 'exchangeTradeInCreditUsd'>>;

/** A receipt's own rate: the one it was rung up at, or the one implied by its TJS and USD totals. */
function saleRate(sale: SummarizedSale): number {
  if (Number(sale.exchangeRate) > 0) return Number(sale.exchangeRate);
  return Number(sale.totalUsd) > 0 && Number(sale.totalTjs) > 0 ? Number(sale.totalTjs) / Number(sale.totalUsd) : 0;
}

/**
 * Shift totals for the receipts on screen: refunded receipts are counted separately and left
 * out of the money, since their payment went back to the customer.
 */
export function summarizeSales(sales: SummarizedSale[]): SalesSummary {
  const kept = sales.filter((s) => s.status !== 'REFUNDED');
  // In dollars every receipt counts at its own rate — never the period's TJS over today's rate.
  const atOwnRate = (sale: SummarizedSale, tjs: number) => {
    const rate = saleRate(sale);
    return rate > 0 ? moneyNumber((tjs || 0) / rate) : 0;
  };
  return {
    receipts: kept.length,
    totalTjs: moneyNumber(sumMoney(kept.map((s) => s.totalTjs || 0))),
    cashTjs: moneyNumber(sumMoney(kept.map((s) => s.cashAmountTjs || 0))),
    cardTjs: moneyNumber(sumMoney(kept.map((s) => s.cardAmountTjs || 0))),
    totalUsd: moneyNumber(sumMoney(kept.map((s) => (s.totalUsd !== undefined && s.totalUsd !== null ? s.totalUsd : atOwnRate(s, s.totalTjs))))),
    cashUsd: moneyNumber(sumMoney(kept.map((s) => atOwnRate(s, s.cashAmountTjs)))),
    cardUsd: moneyNumber(sumMoney(kept.map((s) => atOwnRate(s, s.cardAmountTjs)))),
    tradeInTjs: moneyNumber(sumMoney(kept.map((s) => s.exchangeTradeInCreditTjs || 0))),
    tradeInUsd: moneyNumber(sumMoney(kept.map((s) => s.exchangeTradeInCreditUsd || 0))),
    refunded: sales.length - kept.length,
  };
}
