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

function parseMoney(value: unknown, label: string) {
  if (typeof value !== 'number' && typeof value !== 'string' && !(value && typeof value === 'object' && 'toDecimalPlaces' in value)) {
    throw new Error(`${label}: укажите корректное числовое значение`);
  }
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) throw new Error(`${label}: укажите корректное числовое значение`);
  const amount = D(value as MoneyInput);
  if (amount.abs().gt('999999999999.99')) throw new Error(`${label}: превышен допустимый размер суммы`);
  return amount;
}
