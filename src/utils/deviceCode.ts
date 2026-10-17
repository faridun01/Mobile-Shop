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
