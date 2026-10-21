import { describe, expect, it } from 'vitest';
import type { DailyCashClosing } from '../types';
import { splitClosingAmounts } from './dailyClosing';

const closing = (fields: Partial<DailyCashClosing>) => ({
  salesCardTjs: '10550', salesCardUsd: '1134.41', actualCashTjs: '7480', actualCashUsd: '804.30',
  refundsCardTjs: '3070', refundsCardUsd: '330.11', ...fields,
} as DailyCashClosing);

describe('closing cash and bank', () => {
  it('subtracts a refund on a card from the bank, without creating negative physical cash', () => {
    expect(splitClosingAmounts(closing({}))).toEqual({ cashTjs: 0, cashUsd: 0, bankTjs: 7480, bankUsd: 804.3 });
  });

  it('keeps cash refunds in the physical cash portion', () => {
    expect(splitClosingAmounts(closing({ salesCardTjs: '0', salesCardUsd: '0', refundsCardTjs: '0', refundsCardUsd: '0' })))
      .toEqual({ cashTjs: 7480, cashUsd: 804.3, bankTjs: 0, bankUsd: 0 });
  });

  it('allows a day with only a bank refund to have a negative bank movement and zero cash', () => {
    expect(splitClosingAmounts(closing({ salesCardTjs: '0', salesCardUsd: '0', actualCashTjs: '-3070', actualCashUsd: '-330.11' })))
      .toEqual({ cashTjs: 0, cashUsd: 0, bankTjs: -3070, bankUsd: -330.11 });
  });

  it('preserves the cash-only meaning of legacy closings', () => {
    expect(splitClosingAmounts(closing({ actualCashTjs: '100', actualCashUsd: '10', salesCardTjs: '200', salesCardUsd: null,
      exchangeRate: '10', refundsCardTjs: null, refundsCardUsd: null })))
      .toEqual({ cashTjs: 100, cashUsd: 10, bankTjs: 200, bankUsd: 20 });
  });
});
