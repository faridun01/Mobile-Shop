import { D, type MoneyInput } from './decimal';
import { roundMoney } from './money';

/** Largest-remainder allocation: all cents are assigned exactly once. */
export function allocateMoney(total: MoneyInput, weights: MoneyInput[]) {
  const cents = roundMoney(total).mul(100);
  const sum = weights.reduce<ReturnType<typeof D>>((acc, w) => acc.plus(w), D(0));
  if (!weights.length || sum.lte(0) || cents.lt(0)) throw new Error('Невозможно распределить сумму по устройствам');
  const exact = weights.map(w => cents.mul(w).div(sum));
  const allocated = exact.map(v => v.floor());
  const remaining = cents.minus(allocated.reduce((a, b) => a.plus(b), D(0))).toNumber();
  const order = exact.map((v, i) => ({ i, remainder: v.minus(allocated[i]) }))
    .sort((a, b) => b.remainder.comparedTo(a.remainder) || a.i - b.i);
  for (let i = 0; i < remaining; i++) allocated[order[i].i] = allocated[order[i].i].plus(1);
  return allocated.map(v => v.div(100));
}
