/**
 * Identifier rules for serialized devices. A phone is identified by its IMEI (exactly 15
 * digits); a tablet by its serial number (SN): letters and digits of any length the
 * manufacturer uses, never limited to the IMEI format. Both live in Device.imei/imei2.
 */
export type DeviceCategoryCode = 'PHONE' | 'TABLET';

export const DEVICE_CATEGORIES: readonly DeviceCategoryCode[] = ['PHONE', 'TABLET'];

/** A serial number: 4–64 letters/digits, optionally with - _ . / inside. */
const SERIAL_PATTERN = /^[A-Z0-9](?:[A-Z0-9\-_./]{2,62})[A-Z0-9]$/;

/** The category of a request value; anything unknown is a phone (the existing behaviour). */
export function parseDeviceCategory(value: unknown): DeviceCategoryCode {
  return value === 'TABLET' ? 'TABLET' : 'PHONE';
}

/** A serial number as stored: no spaces, upper case (SNs are case-insensitive on the label). */
export function normalizeSerial(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, '').toUpperCase() : '';
}

export function isValidSerial(serial: string): boolean {
  return SERIAL_PATTERN.test(serial);
}

export function isValidImei(imei: string): boolean {
  return /^\d{15}$/.test(imei);
}

/**
 * The stored forms a scanned or typed code can match: as given (an IMEI, or an SN stored before
 * upper-casing) and upper-cased (a tablet SN). Used by every lookup by IMEI/SN.
 */
export function deviceCodeCandidates(raw: unknown): string[] {
  const compact = typeof raw === 'string' ? raw.trim().replace(/\s+/g, '') : '';
  if (!compact) return [];
  return [...new Set([compact, compact.toUpperCase()])];
}

/** A typed IMEI with its spaces dropped: exactly 15 digits, or an error naming the field. */
export function requireImei(raw: unknown, label = 'IMEI'): string {
  const code = String(raw ?? '').replace(/\s+/g, '');
  if (!isValidImei(code)) throw new Error(`${label} должен содержать ровно 15 цифр (получено: "${code}")`);
  return code;
}

/**
 * A code typed for a phone or a tablet: digits only are an IMEI and must be exactly 15; a code
 * with letters is a tablet's SN (4–64 letters and digits, upper-cased).
 */
export function requireDeviceCode(raw: unknown, label = 'IMEI'): string {
  const code = String(raw ?? '').replace(/\s+/g, '');
  if (/^\d+$/.test(code)) return requireImei(code, label);
  const serial = normalizeSerial(code);
  if (!isValidSerial(serial)) throw new Error(`${label}: IMEI — ровно 15 цифр, SN планшета — 4–64 буквы и цифры (получено: "${code}")`);
  return serial;
}
