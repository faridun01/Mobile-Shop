export function requireFiniteNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label}: укажите корректное числовое значение`);
  }
  return number;
}

export function requirePositiveMoney(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number <= 0) {
    throw new Error(`${label} должна быть больше нуля`);
  }
  return roundMoney(number);
}

export function requireNonNegativeMoney(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number < 0) {
    throw new Error(`${label} не может быть отрицательной`);
  }
  return roundMoney(number);
}

export function moneyEquals(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Сумма: укажите корректное числовое значение');
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}
