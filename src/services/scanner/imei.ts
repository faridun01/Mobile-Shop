/**
 * IMEI recognition for camera scans. A phone box carries several barcodes (IMEI 1/2,
 * EAN, serial, part number); only a 15-digit value whose last digit passes the Luhn
 * check is an IMEI. EAN-13 (13 digits), serials (letters) and IMEISV (16 digits) never
 * pass, and a misread IMEI fails the check digit instead of reaching a lookup.
 */
export function isValidImei(value: string): boolean {
  if (!/^\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = value.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Every distinct IMEI in a decoded barcode, in order. Handles a plain barcode value,
 * one printed with separators ("35-209900-176148-1") and QR/DataMatrix payloads such as
 * "IMEI1:351234567890123;IMEI2:351234567890131;SN:R58N…".
 */
export function extractImeis(raw: string): string[] {
  const compact = raw.trim().replace(/[\s-]/g, '');
  if (/^\d{15}$/.test(compact)) return isValidImei(compact) ? [compact] : [];
  // Avoid lookbehind: iOS 15.x–16.3 cannot parse it, even before scanning starts.
  const found = (raw.match(/\d+/g) ?? []).filter(value => value.length === 15);
  return [...new Set(found.filter(isValidImei))];
}

/** Scanner guidance shared by the native (ML Kit) and web camera scanners. */
export const SCAN_HINTS = {
  aim: 'Наведите рамку на штрих-код IMEI',
  notImei: 'Это не IMEI — наведите на штрих-код с подписью IMEI',
  several: 'В кадре несколько IMEI — наведите рамку на нужный',
  hold: 'IMEI найден — держите камеру неподвижно',
};

/** Guidance for the any-code mode (a tablet SN or an accessory barcode). */
export const CODE_SCAN_HINTS = {
  aim: 'Наведите рамку на штрих-код SN или товара',
  notImei: 'Код не распознан — наведите рамку на штрих-код',
  several: 'В кадре несколько штрих-кодов — наведите рамку на нужный',
  hold: 'Код найден — держите камеру неподвижно',
};

/**
 * Any barcode's value as one code (a serial number, EAN/UPC, a shop label): trimmed, at most
 * 128 printable characters. Null for an empty or multi-line payload, which is not one code.
 */
export function extractScanCode(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export const SERIAL_SCAN_HINTS = {
  aim: 'Наведите рамку на код с подписью SN / S/N',
  notImei: 'Это не SN — наведите на серийный номер, а не EAN/UPC или IMEI',
  several: 'В кадре несколько SN — оставьте в рамке нужный',
  hold: 'SN найден — держите камеру неподвижно',
};

/** A labelled numeric SN is unambiguous. Unlabelled EAN/UPC/IMEI must not become a SN. */
export function extractSerialCode(raw: string): string | null {
  const labelled = raw.match(/(?:^|[;\n\r\s])(?:S\/?N|SERIAL(?:\s*(?:NUMBER|NO\.?))?)\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9_.\/-]{2,62}[A-Za-z0-9])(?=$|[;\s])/i);
  const value = (labelled?.[1] ?? raw).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_.\/-]{2,62}[A-Z0-9]$/.test(value)) return null;
  if (!labelled && (!/[A-Z]/.test(value) || /\/[A-Z]$/.test(value))) return null;
  return value;
}

export function recognizeScanCodes(raw: string, mode: 'imei' | 'serial' | 'code'): string[] {
  if (mode === 'imei') return extractImeis(raw);
  const code = mode === 'serial' ? extractSerialCode(raw) : extractScanCode(raw);
  return code ? [code] : [];
}
