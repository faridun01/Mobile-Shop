import '../../common/decimal-test-setup';
import { describe, expect, it } from 'vitest';
import { splitRegister, splitPaymentBreakdown } from './cash-collection.service';

// Pure split of a register into its bonus and regular parts. The full collection and
// cancellation flows run against a real database in scripts/test-collection-bonus-split.ts.
const split = (cash: [number, number], due: [number, number]) => {
  const r = splitRegister({ usd: cash[0], tjs: cash[1] }, { usd: due[0], tjs: due[1] });
  return { bonusUsd: r.bonusUsd.toString(), bonusTjs: r.bonusTjs.toString(), regularUsd: r.regularUsd.toString(), regularTjs: r.regularTjs.toString() };
};

describe('splitRegister', () => {
  it('splits $350 into $150 bonus and $200 regular, each with its own TJS', () => {
    expect(split([350, 3500], [150, 1500])).toEqual({ bonusUsd: '150', bonusTjs: '1500', regularUsd: '200', regularTjs: '2000' });
  });

  it('sends a register that is entirely bonus to the Bonus Account in both currencies', () => {
    expect(split([100, 1000], [100, 1000])).toEqual({ bonusUsd: '100', bonusTjs: '1000', regularUsd: '0', regularTjs: '0' });
  });

  it('sends a register with no bonus money entirely to Central Cash', () => {
    expect(split([100, 1000], [0, 0])).toEqual({ bonusUsd: '0', bonusTjs: '0', regularUsd: '100', regularTjs: '1000' });
  });

  it('never takes more than the register holds; the rest stays due', () => {
    expect(split([60, 650], [100, 1000])).toEqual({ bonusUsd: '60', bonusTjs: '650', regularUsd: '0', regularTjs: '0' });
  });

  it('treats a negative due (bonus already collected, then refunded) as no bonus part', () => {
    expect(split([50, 500], [-150, -1500])).toEqual({ bonusUsd: '0', bonusTjs: '0', regularUsd: '50', regularTjs: '500' });
  });

  it('keeps bonus + regular equal to the register in each currency at mixed historical rates', () => {
    const r = splitRegister({ usd: '400', tjs: '4400' }, { usd: '150', tjs: '1600' });
    expect(r.bonusUsd.plus(r.regularUsd).toString()).toBe('400');
    expect(r.bonusTjs.plus(r.regularTjs).toString()).toBe('4400');
  });
});

describe('splitPaymentBreakdown', () => {
  it('accurately isolates card and physical cash in a mixed register', () => {
    const res = splitPaymentBreakdown('17500', '8000');
    expect(res).toEqual({ cashOnlyTjs: '9500', cardOnlyTjs: '8000' });
  });

  it('reports zero card and full cash when all sales are cash', () => {
    const res = splitPaymentBreakdown('12000', '0');
    expect(res).toEqual({ cashOnlyTjs: '12000', cardOnlyTjs: '0' });
  });

  it('reports full card and zero cash when all sales are digital/card', () => {
    const res = splitPaymentBreakdown('15000', '15000');
    expect(res).toEqual({ cashOnlyTjs: '0', cardOnlyTjs: '15000' });
  });

  it('caps card payments at total register cash if expenses reduced the register below card total', () => {
    // e.g. Register only has 4000 left
    const res = splitPaymentBreakdown('4000', '6000');
    expect(res).toEqual({ cashOnlyTjs: '0', cardOnlyTjs: '4000' });
  });

  it('handles empty register (0 TJS)', () => {
    const res = splitPaymentBreakdown('0', '0');
    expect(res).toEqual({ cashOnlyTjs: '0', cardOnlyTjs: '0' });
  });
});

