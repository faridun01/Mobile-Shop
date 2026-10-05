import type { Sale, SaleItem } from '../types';

export interface SaleProfitResult {
  profitUsd: number;
  profitTjs: number;
  costUsd: number;
  revenueUsd: number;
  marginPercent: number;
  isNegative: boolean;
}

export interface SaleItemProfitResult {
  profitUsd: number;
  profitTjs: number;
  costUsd: number;
  priceUsd: number;
  marginPercent: number;
  isNegative: boolean;
}

/**
 * Calculates net profit and cost metrics for an individual sale item.
 */
export function computeSaleItemProfit(item: SaleItem, exchangeRate: number = 1): SaleItemProfitResult {
  const costUsd = Number(item.costBasisUsd) || 0;
  const priceUsd = Number(item.salePriceUsd) || 0;
  const profitUsd = Math.round((priceUsd - costUsd) * 100) / 100;
  const rate = exchangeRate > 0 ? exchangeRate : 1;
  const profitTjs = Math.round(profitUsd * rate);
  const marginPercent = costUsd > 0
    ? Math.round((profitUsd / costUsd) * 100)
    : (priceUsd > 0 ? 100 : 0);

  return {
    profitUsd,
    profitTjs,
    costUsd: Math.round(costUsd * 100) / 100,
    priceUsd: Math.round(priceUsd * 100) / 100,
    marginPercent,
    isNegative: profitUsd < 0,
  };
}

/**
 * Calculates net profit and cost metrics for a complete receipt / sale.
 * - Handles refunded sales (income is only the retained penalty fee, if any).
 * - Prefers recognizedProfitUsd if stored by the backend audit log.
 * - Falls back to sum of item profits (price - cost).
 */
export function computeSaleProfit(sale: Sale, fallbackExchangeRate: number = 1): SaleProfitResult {
  const costUsd = (sale.items || []).reduce((acc, item) => acc + (Number(item.costBasisUsd) || 0), 0);
  const revenueUsd = Number(sale.totalUsd) || 0;

  let profitUsd = 0;
  if (sale.status === 'REFUNDED') {
    profitUsd = Number(sale.penaltyFeeUsd) || 0;
  } else if (sale.recognizedProfitUsd !== undefined && sale.recognizedProfitUsd !== null) {
    profitUsd = Number(sale.recognizedProfitUsd);
  } else {
    profitUsd = (sale.items || []).reduce(
      (acc, item) => acc + ((Number(item.salePriceUsd) || 0) - (Number(item.costBasisUsd) || 0)),
      0
    );
  }

  const roundedProfitUsd = Math.round(profitUsd * 100) / 100;
  const rate = sale.exchangeRate && sale.exchangeRate > 0
    ? sale.exchangeRate
    : (sale.totalUsd > 0 && sale.totalTjs > 0 ? sale.totalTjs / sale.totalUsd : fallbackExchangeRate);

  const profitTjs = Math.round(roundedProfitUsd * rate);
  const roundedCostUsd = Math.round(costUsd * 100) / 100;
  const marginPercent = roundedCostUsd > 0
    ? Math.round((roundedProfitUsd / roundedCostUsd) * 100)
    : (roundedProfitUsd > 0 ? 100 : 0);

  return {
    profitUsd: roundedProfitUsd,
    profitTjs,
    costUsd: roundedCostUsd,
    revenueUsd: Math.round(revenueUsd * 100) / 100,
    marginPercent,
    isNegative: roundedProfitUsd < 0,
  };
}
