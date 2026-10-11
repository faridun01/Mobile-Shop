/**
 * Turns a row of the public TAC database (github.com/MoazEb/tac-database: Brand, TAC, SPECS)
 * into the brand and model names this app uses, e.g. "APPLE IPHONE 15 PRO MAX, Apple iPhone 15
 * Pro Max, A3108, 2023" → Apple / iPhone 15 Pro Max.
 */

/** The first 8 digits of an IMEI, which identify the phone model; null if there are fewer. */
export function tacOf(imei: string | null | undefined): string | null {
  const digits = String(imei ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

const BRAND_NAMES: Record<string, string> = {
  APPLE: 'Apple',
  SAMSUNG: 'Samsung',
  XIAOMI: 'Xiaomi',
  POCO: 'Xiaomi',
  REDMI: 'Xiaomi',
  HUAWEI: 'Huawei',
  HONOR: 'Honor',
  GOOGLE: 'Google',
  ONEPLUS: 'OnePlus',
  REALME: 'Realme',
  OPPO: 'OPPO',
  VIVO: 'Vivo',
  IQOO: 'iQOO',
  NOTHING: 'Nothing',
  MOTOROLA: 'Motorola',
  NOKIA: 'Nokia',
  TECNO: 'Tecno',
  INFINIX: 'Infinix',
  ITEL: 'Itel',
  SONY: 'Sony',
  ASUS: 'Asus',
  LENOVO: 'Lenovo',
  ALCATEL: 'Alcatel',
  BLACKVIEW: 'Blackview',
  DOOGEE: 'Doogee',
  UMIDIGI: 'Umidigi',
  ULEFONE: 'Ulefone',
  OUKITEL: 'Oukitel',
  MEIZU: 'Meizu',
  LG: 'LG',
  ZTE: 'ZTE',
  HTC: 'HTC',
  TCL: 'TCL',
  BQ: 'BQ',
};

const WORD_NAMES: Record<string, string> = {
  IPHONE: 'iPhone',
  IPAD: 'iPad',
  IPOD: 'iPod',
  ONEPLUS: 'OnePlus',
  IQOO: 'iQOO',
};

export function normalizeBrand(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (BRAND_NAMES[key]) return BRAND_NAMES[key];
  return key.length <= 3 ? key : key.charAt(0) + key.slice(1).toLowerCase();
}

/** "IPHONE 15 PRO MAX" → "iPhone 15 Pro Max", "GALAXY S26 ULTRA" → "Galaxy S26 Ultra". */
export function titleCaseModel(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (WORD_NAMES[upper]) return WORD_NAMES[upper];
      // A word with a number attached keeps only its capital (Fold7, Magic7); model numbers,
      // codes and short markers stay upper case (S26, 14S, NIC-AN00, 5G, SE, XR, FE).
      if (/^[A-Z]{4,}\d+$/.test(upper)) return upper.charAt(0) + upper.slice(1).toLowerCase();
      if (/\d/.test(word) || upper.length <= 2) return upper;
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    })
    .join(' ');
}

/** A bare manufacturer code such as 25113PN0EG or SM-S948B instead of a product name. */
function looksLikeModelCode(text: string): boolean {
  const t = text.trim();
  return !/\s/.test(t) && t.length >= 6 && /\d/.test(t) && /[A-Za-z]/.test(t);
}

const NOT_A_NAME = /^(N\/A|global model|.*\bmodel|\d{4})$/i;

/** Drops a leading manufacturer word: the brand is stored on its own ("XIAOMI REDMI 15C" → "REDMI 15C"). */
function withoutLeadingBrand(text: string, brandWords: string[]): string {
  const words = text.trim().split(/\s+/);
  return words.length > 1 && brandWords.includes(words[0].toUpperCase()) ? words.slice(1).join(' ') : text.trim();
}

const hasModelCode = (text: string) => text.split(/\s+/).some(looksLikeModelCode);

export interface CatalogEntry {
  tac: string;
  brand: string;
  model: string;
}

/** One CSV row → catalog entry; null for a row that has no usable TAC or name. */
export function parseTacRow(rawBrand: string, rawTac: string, specs: string): CatalogEntry | null {
  const tac = rawTac.trim();
  if (!/^\d{8}$/.test(tac)) return null;
  const brand = normalizeBrand(rawBrand);
  const brandWords = [rawBrand.trim().toUpperCase(), brand.toUpperCase()];

  const segments = specs.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  let name = withoutLeadingBrand(segments[0], brandWords);

  // Some rows start with the manufacturer's code ("25113PN0EG"); a product name may come later
  // ("Xiaomi 17"). Without a better one, the code is kept: still exact for that phone.
  if (hasModelCode(name)) {
    const productName = segments.slice(1)
      .map((s) => s.replace(/\(.*?\)|\?/g, '').trim())
      .find((s) => s && !NOT_A_NAME.test(s) && /\s/.test(s) && !hasModelCode(s));
    if (productName) name = withoutLeadingBrand(productName, brandWords);
  }

  const model = titleCaseModel(name);
  return model ? { tac, brand, model } : null;
}

/** Splits one CSV line into fields, honouring double-quoted fields with commas and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(current); current = ''; }
    else current += ch;
  }
  fields.push(current);
  return fields;
}
