import { D, type MoneyInput } from './decimal';

export function requireFiniteNumber(value: unknown, label: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
    throw new Error(`${label}: укажите корректное числовое значение`);
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label}: укажите корректное числовое значение`);
  }
  return number;
}

export function requirePositiveMoney(value: unknown, label: string) {
  const number = parseMoney(value, label);
  if (roundMoney(number).lte(0)) {
    throw new Error(`${label} должна быть больше нуля`);
  }
  return roundMoney(number);
}

export function requireNonNegativeMoney(value: unknown, label: string) {
  const number = parseMoney(value, label);
  if (number.lt(0)) {
    throw new Error(`${label} не может быть отрицательной`);
  }
  return roundMoney(number);
}

export function moneyEquals(left: MoneyInput, right: MoneyInput): boolean {
  return roundMoney(left).eq(roundMoney(right));
}

export function roundMoney(value: MoneyInput) {
  return D(value).toDecimalPlaces(2);
}

/** Largest rate the exchange_rates column (DECIMAL(10,2)) holds. */
const MAX_RATE = '99999999.99';

/**
 * The USD/TJS rate is set with at most 2 decimals (e.g. 10.50) — never rounded silently: a rate
 * entered with more is rejected so what is saved is exactly what was typed.
 */
export function requireExchangeRate(value: unknown) {
  const label = 'Курс';
  const rate = parseMoney(value, label);
  if (rate.lte(0) || rate.gt(MAX_RATE)) throw new Error('Укажите положительный курс (например, 10.50)');
  if (rate.decimalPlaces() > 2) throw new Error('Курс указывается не более чем с 2 знаками после запятой (например, 10.50)');
  return rate;
}

/**
 * The average rate of an amount moved with its own TJS and USD (a register's balance built up
 * over many days), for reference only: the posting moves the exact amounts. Like every rate in
 * the system it has 2 decimals.
 */
export function averageRate(amountTjs: MoneyInput, amountUsd: MoneyInput) {
  return D(amountUsd).gt(0) ? D(amountTjs).div(amountUsd).toDecimalPlaces(2) : null;
}

function parseMoney(value: unknown, label: string) {
  if (typeof value !== 'number' && typeof value !== 'string' && !(value && typeof value === 'object' && 'toDecimalPlaces' in value)) {
    throw new Error(`${label}: укажите корректное числовое значение`);
  }
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) throw new Error(`${label}: укажите корректное числовое значение`);
  const amount = D(value as MoneyInput);
  if (amount.abs().gt('999999999999.99')) throw new Error(`${label}: превышен допустимый размер суммы`);
  return amount;
}

export { D };
