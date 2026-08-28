import { describe, expect, it } from 'vitest';
import { calculateRecognizedProfit } from './profit';

describe('recognized sale profit', () => {
  it('adds original sale and every exchange profit impact', () => {
    expect(calculateRecognizedProfit([
      { action: 'SALE', financialDetails: { recognizedProfitUsd: 400 } },
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: 500 } },
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: -25.235 } },
    ], 1)).toBe(874.77);
  });

  it('uses the fallback for legacy sales without an audited original profit', () => {
    expect(calculateRecognizedProfit([
      { action: 'EXCHANGE', financialDetails: { exchangeProfitUsd: 50 } },
    ], 125.126)).toBe(125.13);
  });

  it('preserves a real zero or negative audited profit', () => {
    expect(calculateRecognizedProfit([{ action: 'SALE_BELOW_COST', financialDetails: { recognizedProfitUsd: -10 } }], 99)).toBe(-10);
    expect(calculateRecognizedProfit([{ action: 'SALE', financialDetails: { recognizedProfitUsd: 0 } }], 99)).toBe(0);
  });
});
