import { describe, expect, it } from 'vitest';
import { summarizeSales } from './salesSummary';

describe('summarizeSales', () => {
  it('totals receipts, cash and card to the cent and leaves refunds out of the money', () => {
    const summary = summarizeSales([
      { status: 'COMPLETED', totalTjs: 0.1, cashAmountTjs: 0.1, cardAmountTjs: 0 },
      { status: 'COMPLETED', totalTjs: 0.2, cashAmountTjs: 0, cardAmountTjs: 0.2 },
      { status: 'EXCHANGED', totalTjs: 1000, cashAmountTjs: 400, cardAmountTjs: 600 },
      { status: 'REFUNDED', totalTjs: 5000, cashAmountTjs: 5000, cardAmountTjs: 0 },
    ]);
    expect(summary).toMatchObject({ receipts: 3, totalTjs: 1000.3, cashTjs: 400.1, cardTjs: 600.2, refunded: 1 });
  });

  it('totals dollars at each receipt rate, never the period TJS over today rate', () => {
    // 9300 TJS at 9.30 = $1000 and 9250 TJS at 9.25 = $1000: $2000, whatever today's rate is.
    const summary = summarizeSales([
      { status: 'COMPLETED', totalTjs: 9300, totalUsd: 1000, exchangeRate: 9.3, cashAmountTjs: 9300, cardAmountTjs: 0 },
      { status: 'COMPLETED', totalTjs: 9250, totalUsd: 1000, exchangeRate: 9.25, cashAmountTjs: 0, cardAmountTjs: 9250 },
      { status: 'REFUNDED', totalTjs: 9500, totalUsd: 1000, exchangeRate: 9.5, cashAmountTjs: 9500, cardAmountTjs: 0 },
    ]);
    expect(summary).toMatchObject({ totalUsd: 2000, cashUsd: 1000, cardUsd: 1000 });
  });

  it('is all zero for an empty period', () => {
    expect(summarizeSales([])).toEqual({ receipts: 0, totalTjs: 0, cashTjs: 0, cardTjs: 0, totalUsd: 0, cashUsd: 0, cardUsd: 0, refunded: 0 });
  });
});
