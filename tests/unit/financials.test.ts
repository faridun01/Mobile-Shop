import { describe, it, expect } from 'vitest';

function calculateTradeInExchange(
  returnedValueTjs: number,
  replacementPriceTjs: number,
  exchangeRate: number
) {
  const differenceTjs = replacementPriceTjs - returnedValueTjs;
  const differenceUsd = Number((differenceTjs / exchangeRate).toFixed(2));
  return { differenceTjs, differenceUsd };
}

function calculateOwnerProfitDistribution(
  netProfitUsd: number,
  shares: { ownerId: string; sharePercentage: number }[]
) {
  return shares.map((s) => ({
    ownerId: s.ownerId,
    accruedUsd: Number(((netProfitUsd * s.sharePercentage) / 100).toFixed(2)),
  }));
}

describe('Financial & Trade-In Calculation Engine', () => {
  it('correctly calculates Trade-In price difference in TJS and USD', () => {
    const exchangeRate = 10.9;
    const returnedValueTjs = 3000;
    const replacementPriceTjs = 8500;

    const result = calculateTradeInExchange(returnedValueTjs, replacementPriceTjs, exchangeRate);

    expect(result.differenceTjs).toBe(5500);
    expect(result.differenceUsd).toBe(504.59);
  });

  it('correctly calculates Owner Profit Distribution according to share percentage', () => {
    const netProfitUsd = 12500;
    const shares = [
      { ownerId: 'own-1', sharePercentage: 60 },
      { ownerId: 'own-2', sharePercentage: 40 },
    ];

    const distribution = calculateOwnerProfitDistribution(netProfitUsd, shares);

    expect(distribution).toEqual([
      { ownerId: 'own-1', accruedUsd: 7500 },
      { ownerId: 'own-2', accruedUsd: 5000 },
    ]);
  });
});
