import type { Sale, SaleItem } from '../types';
import { decimal, moneyNumber, sumMoney } from './money';

/** Retained somoni are a saved amount, not a conversion of rounded USD profit. */
export function saleWithheldTjs(sale: Pick<Sale, 'penaltyFeeTjs' | 'returns'>): number {
  return sale.penaltyFeeTjs ?? sumMoney((sale.returns ?? []).map((ret) => ret.withheldTjs));
}

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
export function computeSaleItemProfit(item: SaleItem, exchangeRate: number): SaleItemProfitResult {
  const costUsd = Number(item.costBasisUsd) || 0;
  const priceUsd = Number(item.salePriceUsd) || 0;
  const profitUsd = moneyNumber(decimal(priceUsd).minus(costUsd));
  const rate = exchangeRate > 0 ? exchangeRate : 1;
  // The receipt's somoni are the source: 10550 − 750 × 9.3 = 3575 TJS.
  // Converting the rounded $384.41 back would incorrectly add one diram.
  const profitTjs = moneyNumber(decimal(item.salePriceTjs).minus(decimal(costUsd).mul(rate)));
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
export function computeSaleProfit(sale: Sale, fallbackExchangeRate: number = 0): SaleProfitResult {
  // A returned phone is back in stock: its cost is no longer part of this receipt.
  const keptItems = sale.status === 'REFUNDED' ? [] : (sale.items || []).filter((item) => !item.returnId);
  const hasReturns = (sale.returns?.length ?? 0) > 0;
  // Accessories: the cost of the units still sold (returned units are back in their batches).
  const accessoryCostUsd = sale.status === 'REFUNDED' ? 0 : (sale.accessoryItems || []).reduce((acc, line) => acc + (line.costUsd - line.returnedCostUsd), 0);
  const costUsd = keptItems.reduce((acc, item) => acc + (Number(item.costBasisUsd) || 0), 0) + accessoryCostUsd;
  const revenueUsd = Number(sale.totalUsd) || 0;
  const recognized = sale.recognizedProfitUsd !== undefined && sale.recognizedProfitUsd !== null ? Number(sale.recognizedProfitUsd) : undefined;

  let profitUsd = 0;
  if (hasReturns && recognized !== undefined) {
    // Returned phone by phone: the server's profit already reverses them and keeps what was withheld.
    profitUsd = recognized;
  } else if (sale.status === 'REFUNDED') {
    profitUsd = Number(sale.penaltyFeeUsd) || 0;
  } else if (recognized !== undefined) {
    profitUsd = recognized;
  } else {
    profitUsd = keptItems.reduce(
      (acc, item) => acc + ((Number(item.salePriceUsd) || 0) - (Number(item.costBasisUsd) || 0)),
      0
    ) + (sale.accessoryItems || []).reduce((acc, line) => acc + (line.salePriceUsd - line.costUsd), 0);
  }

  const roundedProfitUsd = Math.round(profitUsd * 100) / 100;
  const rate = sale.exchangeRate && sale.exchangeRate > 0
    ? sale.exchangeRate
    : (sale.totalUsd > 0 && sale.totalTjs > 0 ? sale.totalTjs / sale.totalUsd : fallbackExchangeRate);

  let profitTjs = moneyNumber(decimal(roundedProfitUsd).mul(rate));
  const returns = sale.returns ?? [];
  const hasSavedWithholding = sale.penaltyFeeTjs != null || returns.some((ret) => typeof ret.withheldTjs === 'number');
  if (sale.status === 'REFUNDED' && hasSavedWithholding) {
    profitTjs = saleWithheldTjs(sale);
  } else if (rate > 0 && !sale.exchangeEvents?.length) {
    const regularItems = keptItems.filter((item) => !item.isBonus);
    const accessories = sale.accessoryItems ?? [];
    const keptPriceTjs = sumMoney([
      ...regularItems.map((item) => item.salePriceTjs),
      ...accessories.map((line) => moneyNumber(decimal(line.salePriceTjs).minus(line.returnedPriceTjs))),
    ]);
    const keptCostUsd = sumMoney([
      ...regularItems.map((item) => item.costBasisUsd),
      ...accessories.map((line) => moneyNumber(decimal(line.costUsd).minus(line.returnedCostUsd))),
    ]);
    const sourceProfitUsd = moneyNumber(decimal(sumMoney([
      ...regularItems.map((item) => item.salePriceUsd),
      ...accessories.map((line) => moneyNumber(decimal(line.salePriceUsd).minus(line.returnedPriceUsd ?? 0))),
      ...returns.map((ret) => ret.withheldUsd ?? 0),
    ])).minus(keptCostUsd));
    const hasLineAmounts = regularItems.length > 0 || accessories.length > 0;
    // Preserve explicit server adjustments on legacy receipts without their source amounts.
    // USD remains the booked snapshot (including FX and cent allocation); TJS comes from
    // the original prices, restored costs and actual withheld somoni.
    if (hasLineAmounts && (recognized === undefined || sourceProfitUsd === roundedProfitUsd || (hasReturns && hasSavedWithholding))) {
      profitTjs = moneyNumber(decimal(keptPriceTjs).minus(decimal(keptCostUsd).mul(rate))
        .plus(sumMoney(returns.map((ret) => ret.withheldTjs ?? 0))));
    }
  }
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
