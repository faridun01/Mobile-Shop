import type { DeviceCategory } from '../types';

/**
 * A device's identifier wording: a phone has an IMEI, a tablet a serial number (SN). Both are
 * stored in the same imei/imei2 fields.
 */
export function deviceCodeLabel(category: DeviceCategory | undefined, slot: 1 | 2 = 1): string {
  if (category === 'TABLET') return slot === 1 ? 'SN' : 'Доп. SN';
  return slot === 1 ? 'IMEI' : 'IMEI 2';
}

/** A serial number as the server stores it: no spaces, upper case. */
export function normalizeSerial(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

/** A tablet SN: 4–64 letters/digits, optionally - _ . / inside (the server applies the same rule). */
export function isValidSerial(serial: string): boolean {
  return /^[A-Z0-9](?:[A-Z0-9\-_./]{2,62})[A-Z0-9]$/.test(serial);
}

export const deviceKindLabel = (category: DeviceCategory | undefined) => (category === 'TABLET' ? 'Планшет' : 'Телефон');

/**
 * What an IMEI field keeps of what is typed or pasted: its digits. Nothing is cut off: 16 digits
 * (an IMEISV) are shown as too many, never silently turned into a wrong IMEI.
 */
export const imeiDigits = (raw: string) => raw.replace(/\D/g, '');

/** Why a typed IMEI cannot be saved, or null; an empty optional field is fine. */
export function imeiProblem(value: string, required = false): string | null {
  const code = value.replace(/\s+/g, '');
  if (!code) return required ? 'Введите IMEI: ровно 15 цифр' : null;
  const digits = code.replace(/\D/g, '').length;
  return /^\d{15}$/.test(code) ? null : `IMEI: ${digits} ${digits % 10 === 1 && digits !== 11 ? 'цифра' : digits % 10 >= 2 && digits % 10 <= 4 && (digits < 12 || digits > 14) ? 'цифры' : 'цифр'}, нужно ровно 15`;
}

/**
 * Why a code typed for a phone or a tablet cannot be saved, or null: digits only are an IMEI
 * (exactly 15), a code with letters a tablet's SN. An empty optional field is fine.
 */
export function deviceCodeProblem(value: string, required = false): string | null {
  const code = value.replace(/\s+/g, '');
  if (!code) return required ? 'Введите IMEI: ровно 15 цифр' : null;
  if (/^\d+$/.test(code)) return imeiProblem(code);
  return isValidSerial(normalizeSerial(code)) ? null : 'IMEI — ровно 15 цифр, SN планшета — 4–64 буквы и цифры';
}
