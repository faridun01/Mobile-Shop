import type { DailyCashClosing } from '../types';
import { decimal, moneyNumber } from './money';

/** Net bank and physical cash: a refund follows its payout channel. */
export function splitClosingAmounts(closing: DailyCashClosing) {
  const dayTotal = closing.salesCardUsd != null;
  const grossBankTjs = decimal(closing.salesCardTjs || 0);
  let grossBankUsd = decimal(closing.salesCardUsd ?? 0);
  if (!dayTotal && grossBankTjs.gt(0)) {
    const rate = decimal(closing.exchangeRate || 0);
    const actualTjs = decimal(closing.actualCashTjs || 0);
    const actualUsd = decimal(closing.actualCashUsd || 0);
    if (rate.gt(0)) grossBankUsd = grossBankTjs.div(rate);
    else if (actualTjs.gt(0) && actualUsd.gt(0)) grossBankUsd = grossBankTjs.mul(actualUsd).div(actualTjs);
  }
  const bankTjs = grossBankTjs.minus(closing.refundsCardTjs ?? 0);
  const bankUsd = grossBankUsd.minus(closing.refundsCardUsd ?? 0);
  return {
    cashTjs: moneyNumber(decimal(closing.actualCashTjs || 0).minus(dayTotal ? bankTjs : 0)),
    cashUsd: moneyNumber(decimal(closing.actualCashUsd || 0).minus(dayTotal ? bankUsd : 0)),
    bankTjs: moneyNumber(bankTjs),
    bankUsd: moneyNumber(bankUsd),
  };
}
