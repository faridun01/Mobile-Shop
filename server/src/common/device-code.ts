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
