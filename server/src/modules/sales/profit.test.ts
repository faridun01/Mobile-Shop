import { D, moneyJson } from '../../common/decimal';
import '../../common/decimal-test-setup';
import { describe, expect, it } from 'vitest';
import { allocateLikeBooked, allocateOwnerProfit, calculateRecognizedProfit, exchangeCostRestorations, refundOwnerProfit } from './profit';

describe('recognized sale profit', () => {
  it('adds original sale and every exchange profit impact', () => {
    expect(calculateRecognizedProfit([
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 400 } },
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: 500 } },
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: -25.235 } },
    ], 1)).toEqual(874.77);
  });

  it('uses the fallback for legacy sales without an audited original profit', () => {
    expect(calculateRecognizedProfit([
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: 50 } },
    ], 125.126)).toEqual(125.13);
  });

  it('preserves a real zero or negative audited profit', () => {
    expect(calculateRecognizedProfit([{ action: 'SALE_BELOW_COST', financialDetails: { recognizedProfitUsd: -10 } }], 99)).toEqual(-10);
    expect(calculateRecognizedProfit([{ action: 'SALE', financialDetails: { recognizedProfitUsd: 0 } }], 99)).toEqual(0);
  });
});

describe('refund owner allocations', () => {
  const originalOwners = [{ id: 'a', profitSharePercent: 60 }, { id: 'b', profitSharePercent: 40 }];
  const currentOwners = [{ id: 'a', profitSharePercent: 50 }, { id: 'b', profitSharePercent: 50 }];
  const sale = (amount: number) => ({ action: 'SALE', financialDetails: {
    ownerProfitAllocations: moneyJson(allocateOwnerProfit(amount, originalOwners)),
  } });

  it('reverses 60/40 amounts even after shares become 50/50', () => {
    expect(refundOwnerProfit([sale(100)], currentOwners, 0)).toEqual([
      { ownerId: 'a', amountUsd: -60 }, { ownerId: 'b', amountUsd: -40 },
    ]);
  });

  it('allocates a new penalty using current shares independently of the reversal', () => {
    expect(refundOwnerProfit([sale(100)], currentOwners, 10)).toEqual([
      { ownerId: 'a', amountUsd: -55 }, { ownerId: 'b', amountUsd: -35 },
    ]);
  });

  it('reverses each exchange using its own recorded amounts', () => {
    const exchange = { action: 'EXCHANGE', financialDetails: {
      ownerProfitAllocations: moneyJson(allocateOwnerProfit(50, currentOwners)),
    } };
    expect(refundOwnerProfit([sale(100), exchange], originalOwners, 0)).toEqual([
      { ownerId: 'a', amountUsd: -85 }, { ownerId: 'b', amountUsd: -65 },
    ]);
  });

  it('preserves original cent rounding and reverses losses', () => {
    expect(refundOwnerProfit([sale(-0.03)], currentOwners, 0)).toEqual([
      { ownerId: 'a', amountUsd: 0.02 }, { ownerId: 'b', amountUsd: 0.01 },
    ]);
  });

  it('does not charge a new partner for profit they never received', () => {
    expect(refundOwnerProfit([sale(100)], [
      { id: 'b', profitSharePercent: 50 }, { id: 'a', profitSharePercent: 0 },
      { id: 'c', profitSharePercent: 50 },
    ], 0)).toEqual([
      { ownerId: 'b', amountUsd: -40 }, { ownerId: 'a', amountUsd: -60 }, { ownerId: 'c', amountUsd: 0 },
    ]);
  });

  it('rejects missing original or exchange snapshots instead of guessing current shares', () => {
    expect(() => refundOwnerProfit([], currentOwners, 0)).toThrow('исходное распределение');
    expect(() => refundOwnerProfit([{ action: 'SALE', financialDetails: { recognizedProfitUsd: 100 } }], currentOwners, 0)).toThrow('исходное распределение');
    expect(() => refundOwnerProfit([sale(100), { action: 'EXCHANGE', financialDetails: {} }], currentOwners, 0)).toThrow('исходное распределение');
  });

  it('reverses a partner no longer in the store and rejects corrupt duplicate allocations', () => {
    // 'b' has since left the store: it still gets back exactly its original 40.
    expect(refundOwnerProfit([sale(100)], [{ id: 'a', profitSharePercent: 100 }], 0)).toEqual([
      { ownerId: 'a', amountUsd: -60 }, { ownerId: 'b', amountUsd: -40 },
    ]);
    expect(() => refundOwnerProfit([{ action: 'SALE', financialDetails: { ownerProfitAllocations: [
      { ownerId: 'a', amountUsd: 60 }, { ownerId: 'a', amountUsd: 40 },
    ] } }], currentOwners, 0)).toThrow('исходное распределение');
  });
});


describe('exact owner allocation', () => {
  const owners = [{ id: 'a', profitSharePercent: 50 }, { id: 'b', profitSharePercent: 50 }];
  it.each([0.01, 0.03, 1.01, -0.01, -0.03, 100.99])('preserves the total for %s', (amount) => {
    const allocated = allocateOwnerProfit(amount, owners);
    expect(allocated.reduce((sum, row) => sum.plus(row.amountUsd), D(0)).toFixed(2)).toEqual(D(amount).toFixed(2));
    expect(allocateOwnerProfit(amount, [...owners].reverse()).reverse()).toEqual(allocated);
  });
  it('does not allocate a remainder to zero-share owners', () => {
    expect(allocateOwnerProfit(0.01, [{ id: 'a', profitSharePercent: 0 }, { id: 'b', profitSharePercent: 100 }]))
      .toEqual([{ ownerId: 'a', amountUsd: 0 }, { ownerId: 'b', amountUsd: 0.01 }]);
  });
  it('rejects invalid shares before booking money', () => {
    expect(() => allocateOwnerProfit(100, [{ id: 'a', profitSharePercent: 99.99 }])).toThrow('100%');
  });
});

describe('allocateLikeBooked', () => {
  const booked = [{ ownerId: 'admin', amountUsd: 60 }, { ownerId: 'partner', amountUsd: 40 }];
  it('splits a part of the profit in the proportions it was booked at', () => {
    expect(allocateLikeBooked(50, booked, 100)).toEqual([{ ownerId: 'admin', amountUsd: D(30) }, { ownerId: 'partner', amountUsd: D(20) }]);
  });
  it('is cent-exact and handles losses and negative amounts', () => {
    const parts = allocateLikeBooked(-33.33, booked, 100)!;
    expect(parts.reduce((s, p) => s.plus(p.amountUsd), D(0))).toEqual(D(-33.33));
    const loss = allocateLikeBooked(-10, [{ ownerId: 'admin', amountUsd: -6 }, { ownerId: 'partner', amountUsd: -4 }], -10)!;
    expect(loss).toEqual([{ ownerId: 'admin', amountUsd: D(-6) }, { ownerId: 'partner', amountUsd: D(-4) }]);
  });
  it('gives up when there is nothing to scale by', () => {
    expect(allocateLikeBooked(10, booked, 0)).toBeNull();
    expect(allocateLikeBooked(10, [], 100)).toBeNull();
  });
});

describe('recognized profit after a return', () => {
  it('adds each return\'s profit change to the sale\'s profit', () => {
    expect(calculateRecognizedProfit([
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 300 } },
      { action: 'SALE_RETURN', financialDetails: { profitDeltaUsd: -95.5 } },
    ], 0)).toEqual(D(204.5));
  });
});

describe('exchange cost restorations', () => {
  it('returns each traded-in device with its trade-in and original cost', () => {
    expect(exchangeCostRestorations([
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 100 } },
      { action: 'EXCHANGE', financialDetails: { returnedDeviceId: 'a', exchangeInValueUsd: 150, returnedCostBasisUsd: 100.004 } },
    ])).toEqual([{ deviceId: 'a', tradeInCostUsd: D(150), originalCostUsd: D(100) }]);
  });

  it('skips exchanges that returned the device at its own cost', () => {
    expect(exchangeCostRestorations([
      { action: 'EXCHANGE', financialDetails: { returnedDeviceId: 'a', exchangeInValueUsd: 150, returnedCostBasisUsd: 100, returnedCostBasisAfterUsd: 100 } },
    ])).toEqual([]);
    expect(exchangeCostRestorations([
      { action: 'EXCHANGE', financialDetails: { returnedDeviceId: 'b', exchangeInValueUsd: 150, returnedCostBasisUsd: 0, returnedCostBasisAfterUsd: 150 } },
    ])).toEqual([{ deviceId: 'b', tradeInCostUsd: D(150), originalCostUsd: D(0) }]);
  });

  it('skips legacy exchanges that never recorded the original cost', () => {
    expect(exchangeCostRestorations([{ action: 'EXCHANGE', financialDetails: { exchangeInValueUsd: 150 } }])).toEqual([]);
  });
});

describe('tied cents between owners', () => {
  // An odd cent split 50/50 (or 75/25 on 2 mod 4 cents) is a tie: it must not always go to the
  // same owner, or one partner quietly earns more over thousands of sales.
  const drift = (shares: [string, number][], from: number, to: number) => {
    const owners = shares.map(([id, p]) => ({ id, profitSharePercent: p }));
    const total = new Map<string, number>(shares.map(([id]) => [id, 0]));
    for (let cents = from; cents <= to; cents++) {
      for (const part of allocateOwnerProfit(cents / 100, owners)) {
        const share = shares.find(([id]) => id === part.ownerId)![1];
        total.set(part.ownerId, total.get(part.ownerId)! + Number(part.amountUsd) - (cents / 100) * share / 100);
      }
    }
    return [...total.values()];
  };

  it('spreads tied cents evenly for 50/50, 75/25 and three owners', () => {
    for (const shares of [[['owner-admin', 50], ['owner-partner', 50]], [['owner-admin', 75], ['e05eb9e4', 25]], [['a', 33.33], ['b', 33.33], ['c', 33.34]]] as [string, number][][]) {
      for (const d of drift(shares, 1, 20000)) expect(Math.abs(d)).toBeLessThan(0.2);
    }
  });

  it('gives the same split for the same amount and always adds up', () => {
    const owners = [{ id: 'owner-admin', profitSharePercent: 50 }, { id: 'owner-partner', profitSharePercent: 50 }];
    expect(allocateOwnerProfit(12.35, owners)).toEqual(allocateOwnerProfit(12.35, owners));
    for (const amount of [0.01, 0.03, -0.05, 123.45, -987.65]) {
      const parts = allocateOwnerProfit(amount, owners);
      expect(parts.reduce((s, p) => s.plus(p.amountUsd), D(0)).toFixed(2)).toBe(D(amount).toFixed(2));
    }
  });
});
