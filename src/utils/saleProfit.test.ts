import { describe, it, expect } from 'vitest';
import { computeSaleProfit, computeSaleItemProfit, saleWithheldTjs } from './saleProfit';
import type { Sale, SaleItem } from '../types';

describe('saved return withholding', () => {
  it('displays the exact 7480 TJS rather than 804.30 USD converted back to 7479.99', () => {
    expect(saleWithheldTjs({ penaltyFeeTjs: 7480 })).toBe(7480);
    expect(saleWithheldTjs({ penaltyFeeTjs: 0 })).toBe(0);
  });

  it('adds saved return amounts cent-exactly when the receipt total is unavailable', () => {
    expect(saleWithheldTjs({ returns: [{ withheldTjs: 0.1 }, { withheldTjs: 0.2 }] as Sale['returns'] })).toBe(0.3);
  });
});

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
    expect(res.profitTjs).toBe(830.5);
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

describe('computeSaleProfit with phones returned one by one', () => {
  const base = {
    id: 's9', receiptNumber: 109, date: '2026-10-15T10:00:00Z', storeId: 'store-1', storeName: 'Main', sellerId: 'u', sellerName: 'S',
    totalTjs: 5000, totalUsd: 500, exchangeRate: 10, paymentMethod: 'CASH' as const, cashAmountTjs: 5000, cardAmountTjs: 0,
    items: [
      { id: 'i1', deviceId: 'd1', imei: '1', brand: 'A', model: 'One', storage: '', color: '', salePriceUsd: 200, salePriceTjs: 2000, purchaseCostUsd: 100, costBasisUsd: 100, returnId: 'r1' },
      { id: 'i2', deviceId: 'd2', imei: '2', brand: 'A', model: 'Two', storage: '', color: '', salePriceUsd: 300, salePriceTjs: 3000, purchaseCostUsd: 100, costBasisUsd: 100 },
    ],
  };

  it('calculates the somoni margin before displaying its dollar equivalent', () => {
    const receipt: Sale = {
      ...base, status: 'COMPLETED', totalTjs: 10550, totalUsd: 1134.41, exchangeRate: 9.3, recognizedProfitUsd: 384.41,
      items: [{ ...base.items[1], salePriceTjs: 10550, salePriceUsd: 1134.41, costBasisUsd: 750, purchaseCostUsd: 750 }],
    };
    const result = computeSaleProfit(receipt, 15);
    expect(result.profitTjs).toBe(3575);
    expect(result.profitUsd).toBe(384.41);
    expect(computeSaleItemProfit(receipt.items[0], 9.3).profitTjs).toBe(3575);
  });

  it('keeps the actual withheld somoni after a complete return', () => {
    const receipt: Sale = {
      ...base, status: 'REFUNDED', exchangeRate: 9.3, penaltyFeeTjs: 7480, penaltyFeeUsd: 804.3, recognizedProfitUsd: 804.3,
      returns: [{ id: 'r1', withheldTjs: 7480, withheldUsd: 804.3 } as NonNullable<Sale['returns']>[number]],
    };
    expect(computeSaleProfit(receipt).profitTjs).toBe(7480);
    expect(computeSaleProfit(receipt).profitUsd).toBe(804.3);
  });

  it('uses the remaining accessory price, restored cost and saved withholding in somoni', () => {
    const receipt: Sale = {
      ...base, status: 'COMPLETED', exchangeRate: 9.3, items: [], recognizedProfitUsd: 88.61,
      accessoryItems: [{
        id: 'a1', productId: 'p1', barcode: '123', brand: 'Test', name: 'Cable', category: 'Cable',
        quantity: 3, unitPriceTjs: 500, salePriceTjs: 1500, salePriceUsd: 161.29, costUsd: 40,
        returnedQuantity: 1, returnedPriceTjs: 500, returnedPriceUsd: 53.76, returnedCostUsd: 20,
      }],
      returns: [{ id: 'r1', withheldTjs: 10, withheldUsd: 1.08 } as NonNullable<Sale['returns']>[number]],
    };
    expect(computeSaleProfit(receipt).profitTjs).toBe(824);
    expect(computeSaleProfit(receipt).profitUsd).toBe(88.61);
  });

  it('has zero retained profit for a full return without withholding at the original rate', () => {
    const receipt: Sale = {
      ...base, status: 'REFUNDED', penaltyFeeTjs: 0, penaltyFeeUsd: 0, recognizedProfitUsd: 0,
      returns: [{ id: 'r1', withheldTjs: 0, withheldUsd: 0 } as NonNullable<Sale['returns']>[number]],
    };
    expect(computeSaleProfit(receipt).profitTjs).toBe(0);
    expect(computeSaleProfit(receipt).profitUsd).toBe(0);
  });

  it('leaves the returned phone out of the cost and uses the server profit', () => {
    const res = computeSaleProfit({ ...base, status: 'COMPLETED', recognizedProfitUsd: 220, returns: [{ id: 'r1' } as any] } as Sale);
    expect(res.costUsd).toBe(100);
    expect(res.profitUsd).toBe(220);
  });

  it('uses the server profit for a receipt fully returned phone by phone', () => {
    const res = computeSaleProfit({ ...base, status: 'REFUNDED', penaltyFeeUsd: 20, recognizedProfitUsd: 18.5, returns: [{ id: 'r1' } as any] } as Sale);
    expect(res.profitUsd).toBe(18.5);
  });
});
