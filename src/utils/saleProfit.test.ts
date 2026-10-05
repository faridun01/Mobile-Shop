import { describe, it, expect } from 'vitest';
import { computeSaleProfit, computeSaleItemProfit } from './saleProfit';
import type { Sale, SaleItem } from '../types';

describe('computeSaleItemProfit', () => {
  it('calculates profit and margin for a normal device sale', () => {
    const item: SaleItem = {
      deviceId: 'd1',
      imei: '123456789012345',
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '128 GB',
      color: 'Black',
      salePriceUsd: 800,
      salePriceTjs: 8800,
      purchaseCostUsd: 700,
      costBasisUsd: 700,
    };

    const res = computeSaleItemProfit(item, 11);
    expect(res.profitUsd).toBe(100);
    expect(res.profitTjs).toBe(1100);
    expect(res.costUsd).toBe(700);
    expect(res.marginPercent).toBe(14); // 100 / 700 * 100 = 14.28% -> 14%
    expect(res.isNegative).toBe(false);
  });

  it('detects loss when device sold below cost', () => {
    const item: SaleItem = {
      deviceId: 'd2',
      imei: '987654321098765',
      brand: 'Samsung',
      model: 'S24',
      storage: '256 GB',
      color: 'Gray',
      salePriceUsd: 650,
      salePriceTjs: 7150,
      purchaseCostUsd: 700,
      costBasisUsd: 700,
      isBelowCost: true,
    };

    const res = computeSaleItemProfit(item, 11);
    expect(res.profitUsd).toBe(-50);
    expect(res.profitTjs).toBe(-550);
    expect(res.isNegative).toBe(true);
  });
});

describe('computeSaleProfit', () => {
  it('calculates total profit for a multi-item sale using fallback cost basis', () => {
    const sale: Sale = {
      id: 's1',
      receiptNumber: 101,
      date: '2026-10-05T10:00:00Z',
      storeId: 'store-1',
      storeName: 'Main Store',
      sellerId: 'user-1',
      sellerName: 'Seller',
      items: [
        {
          deviceId: 'd1',
          imei: '111',
          brand: 'Apple',
          model: 'iPhone 15',
          storage: '128 GB',
          color: 'Blue',
          salePriceUsd: 800,
          salePriceTjs: 8800,
          purchaseCostUsd: 720,
          costBasisUsd: 720,
        },
        {
          deviceId: 'd2',
          imei: '222',
          brand: 'Apple',
          model: 'AirPods Pro',
          storage: 'N/A',
          color: 'White',
          salePriceUsd: 200,
          salePriceTjs: 2200,
          purchaseCostUsd: 150,
          costBasisUsd: 150,
        },
      ],
      totalTjs: 11000,
      totalUsd: 1000,
      exchangeRate: 11,
      paymentMethod: 'CASH',
      cashAmountTjs: 11000,
      cardAmountTjs: 0,
      status: 'COMPLETED',
    };

    const res = computeSaleProfit(sale);
    // (800 - 720) + (200 - 150) = 80 + 50 = 130
    expect(res.profitUsd).toBe(130);
    expect(res.profitTjs).toBe(1430);
    expect(res.costUsd).toBe(870);
    expect(res.isNegative).toBe(false);
  });

  it('prefers recognizedProfitUsd when available', () => {
    const sale: Sale = {
      id: 's2',
      receiptNumber: 102,
      date: '2026-10-05T11:00:00Z',
      storeId: 'store-1',
      storeName: 'Main Store',
      sellerId: 'user-1',
      sellerName: 'Seller',
      items: [],
      totalTjs: 5500,
      totalUsd: 500,
      recognizedProfitUsd: 75.5,
      exchangeRate: 11,
      paymentMethod: 'CARD',
      cashAmountTjs: 0,
      cardAmountTjs: 5500,
      status: 'COMPLETED',
    };

    const res = computeSaleProfit(sale);
    expect(res.profitUsd).toBe(75.5);
    expect(res.profitTjs).toBe(831);
  });

  it('treats refunded sale profit as retained penalty fee only', () => {
    const refundedWithoutPenalty: Sale = {
      id: 's3',
      receiptNumber: 103,
      date: '2026-10-05T12:00:00Z',
      storeId: 'store-1',
      storeName: 'Main Store',
      sellerId: 'user-1',
      sellerName: 'Seller',
      items: [{
        deviceId: 'd3',
        imei: '333',
        brand: 'Xiaomi',
        model: 'Redmi 13',
        storage: '128 GB',
        color: 'Black',
        salePriceUsd: 200,
        salePriceTjs: 2200,
        purchaseCostUsd: 150,
        costBasisUsd: 150,
      }],
      totalTjs: 2200,
      totalUsd: 200,
      paymentMethod: 'CASH',
      cashAmountTjs: 2200,
      cardAmountTjs: 0,
      status: 'REFUNDED',
    };

    expect(computeSaleProfit(refundedWithoutPenalty).profitUsd).toBe(0);

    const refundedWithPenalty: Sale = {
      ...refundedWithoutPenalty,
      penaltyFeeUsd: 20,
      penaltyFeeTjs: 220,
    };

    const res = computeSaleProfit(refundedWithPenalty);
    expect(res.profitUsd).toBe(20);
    expect(res.profitTjs).toBe(220);
  });
});
