import { describe, it, expect } from 'vitest';
import {
  normalizePhoneColor,
  formatPhoneColor,
  getPhoneColorHex,
  DEFAULT_PHONE_COLORS_EN,
  isRamInStorage,
  formatRam,
  formatStorage,
  parseAndCanonicalizeModel,
  getModelVariantLabel,
} from './phoneSpecs';

describe('phoneSpecs colors', () => {
  it('translates common Russian color names to English in Title Case', () => {
    expect(normalizePhoneColor('черный')).toBe('Black');
    expect(normalizePhoneColor('чёрный')).toBe('Black');
    expect(normalizePhoneColor('Черная')).toBe('Black');
    expect(normalizePhoneColor('белый')).toBe('White');
    expect(normalizePhoneColor('серый')).toBe('Gray');
    expect(normalizePhoneColor('золотой')).toBe('Gold');
    expect(normalizePhoneColor('серебристый')).toBe('Silver');
    expect(normalizePhoneColor('синий')).toBe('Blue');
    expect(normalizePhoneColor('зеленый')).toBe('Green');
    expect(normalizePhoneColor('фиолетовый')).toBe('Purple');
    expect(normalizePhoneColor('красный')).toBe('Red');
    expect(normalizePhoneColor('розовый')).toBe('Pink');
  });

  it('translates compound Russian Apple & titanium colors to English', () => {
    expect(normalizePhoneColor('натуральный титан')).toBe('Natural Titanium');
    expect(normalizePhoneColor('черный титан')).toBe('Black Titanium');
    expect(normalizePhoneColor('чёрный титан')).toBe('Black Titanium');
    expect(normalizePhoneColor('белый титан')).toBe('White Titanium');
    expect(normalizePhoneColor('пустынный титан')).toBe('Desert Titanium');
    expect(normalizePhoneColor('синий титан')).toBe('Blue Titanium');
    expect(normalizePhoneColor('серый космос')).toBe('Space Gray');
    expect(normalizePhoneColor('темная ночь')).toBe('Midnight');
    expect(normalizePhoneColor('сияющая звезда')).toBe('Starlight');
    expect(normalizePhoneColor('тихоокеанский синий')).toBe('Pacific Blue');
    expect(normalizePhoneColor('альпийский зеленый')).toBe('Alpine Green');
  });

  it('preserves and standardizes English colors to Title Case', () => {
    expect(normalizePhoneColor('black')).toBe('Black');
    expect(normalizePhoneColor('Black')).toBe('Black');
    expect(normalizePhoneColor('natural titanium')).toBe('Natural Titanium');
    expect(normalizePhoneColor('Desert Titanium')).toBe('Desert Titanium');
    expect(normalizePhoneColor('Space Gray')).toBe('Space Gray');
    expect(normalizePhoneColor('midnight')).toBe('Midnight');
  });

  it('allows manual free-text custom colors typed by the user', () => {
    expect(normalizePhoneColor('Matte Forest Green')).toBe('Matte Forest Green');
    expect(normalizePhoneColor('Solar Red 5G')).toBe('Solar Red 5G');
    expect(normalizePhoneColor('Cyberpunk Yellow')).toBe('Cyberpunk Yellow');
    expect(normalizePhoneColor('Rose Diamond')).toBe('Rose Diamond');
  });

  it('formatPhoneColor handles empty, null and Russian values', () => {
    expect(formatPhoneColor('')).toBe('');
    expect(formatPhoneColor(null)).toBe('');
    expect(formatPhoneColor('черный')).toBe('Black');
    expect(formatPhoneColor('Desert Titanium')).toBe('Desert Titanium');
  });

  it('DEFAULT_PHONE_COLORS_EN contains exclusively English color presets', () => {
    expect(DEFAULT_PHONE_COLORS_EN.length).toBeGreaterThan(20);
    DEFAULT_PHONE_COLORS_EN.forEach((color) => {
      expect(color).not.toMatch(/[а-яёА-ЯЁ]/);
    });
    expect(DEFAULT_PHONE_COLORS_EN).toContain('Black');
    expect(DEFAULT_PHONE_COLORS_EN).toContain('Natural Titanium');
    expect(DEFAULT_PHONE_COLORS_EN).toContain('Desert Titanium');
    expect(DEFAULT_PHONE_COLORS_EN).toContain('Midnight');
  });

  it('getPhoneColorHex returns appropriate hex colors for English and Russian names', () => {
    expect(getPhoneColorHex('Black')).toBe('#1e293b');
    expect(getPhoneColorHex('черный')).toBe('#1e293b');
    expect(getPhoneColorHex('White')).toBe('#f8fafc');
    expect(getPhoneColorHex('Gold')).toBe('#eab308');
    expect(getPhoneColorHex('Desert Titanium')).toBe('#d4b996');
  });
});

describe('isRamInStorage', () => {
  it('does NOT false-positive on standard storage capacities ending with RAM digits', () => {
    // 4/64: "64 GB" ends with "4 GB", but is NOT a composite RAM/ROM spec
    expect(isRamInStorage('64', '4')).toBe(false);
    expect(isRamInStorage('64 GB', '4')).toBe(false);
    expect(isRamInStorage('64 GB', '4 GB')).toBe(false);
    expect(isRamInStorage('64GB', '4 GB')).toBe(false);

    // 8/128: "128 GB" ends with "8 GB"
    expect(isRamInStorage('128 GB', '8 GB')).toBe(false);
    expect(isRamInStorage('128GB', '8')).toBe(false);

    // 6/256: "256 GB" ends with "6 GB"
    expect(isRamInStorage('256 GB', '6 GB')).toBe(false);
    expect(isRamInStorage('256GB', '6')).toBe(false);

    // 2/512 and 12/512: "512 GB" ends with "2 GB" and "12 GB"
    expect(isRamInStorage('512 GB', '2 GB')).toBe(false);
    expect(isRamInStorage('512 GB', '12 GB')).toBe(false);

    // 6/16: "16 GB" ends with "6 GB"
    expect(isRamInStorage('16 GB', '6 GB')).toBe(false);

    // 2/32: "32 GB" ends with "2 GB"
    expect(isRamInStorage('32 GB', '2 GB')).toBe(false);
  });

  it('correctly detects genuine composite RAM/Storage specifications', () => {
    // Slash delimiter prefix
    expect(isRamInStorage('4/64', '4')).toBe(true);
    expect(isRamInStorage('4/64 GB', '4')).toBe(true);
    expect(isRamInStorage('4/64 GB', '4 GB')).toBe(true);
    expect(isRamInStorage('4GB/64GB', '4 GB')).toBe(true);
    expect(isRamInStorage('4 / 64 GB', '4 GB')).toBe(true);

    // Plus delimiter prefix
    expect(isRamInStorage('4+64', '4')).toBe(true);
    expect(isRamInStorage('4+64 GB', '4 GB')).toBe(true);
    expect(isRamInStorage('8/128', '8')).toBe(true);
    expect(isRamInStorage('8/128 GB', '8 GB')).toBe(true);

    // Suffix format (ROM/RAM)
    expect(isRamInStorage('64/4', '4')).toBe(true);

    // Explicit label
    expect(isRamInStorage('64GB (4GB RAM)', '4')).toBe(true);
    expect(isRamInStorage('64GB 4GB ОЗУ', '4 GB')).toBe(true);
  });

  it('returns false for null, empty or non-matching composite values', () => {
    expect(isRamInStorage(null, '4')).toBe(false);
    expect(isRamInStorage('64 GB', null)).toBe(false);
    expect(isRamInStorage('', '')).toBe(false);
    expect(isRamInStorage('128/6', '8')).toBe(false);
  });
});

describe('formatRam', () => {
  it('standardizes RAM to uppercase GB with space', () => {
    expect(formatRam('4')).toBe('4 GB');
    expect(formatRam('4GB')).toBe('4 GB');
    expect(formatRam('4 GB')).toBe('4 GB');
    expect(formatRam('8')).toBe('8 GB');
    expect(formatRam('8GB')).toBe('8 GB');
    expect(formatRam('8 gb')).toBe('8 GB');
    expect(formatRam('4+4 GB')).toBe('4+4 GB');
    expect(formatRam(null)).toBe(null);
    expect(formatRam('')).toBe(null);
  });
});

describe('formatStorage', () => {
  it('standardizes ROM to uppercase GB/TB with space', () => {
    expect(formatStorage('64')).toBe('64 GB');
    expect(formatStorage('64GB')).toBe('64 GB');
    expect(formatStorage('64 gb')).toBe('64 GB');
    expect(formatStorage('64 GB')).toBe('64 GB');
    expect(formatStorage('128')).toBe('128 GB');
    expect(formatStorage('128GB')).toBe('128 GB');
    expect(formatStorage('1TB')).toBe('1 TB');
    expect(formatStorage('1 TB')).toBe('1 TB');
    expect(formatStorage('4/64')).toBe('4/64');
    expect(formatStorage(null)).toBe('');
    expect(formatStorage('')).toBe('');
  });
});

describe('parseAndCanonicalizeModel', () => {
  it('unifies spaced and glued model variations (e.g. A7pro vs A7 pro)', () => {
    const v1 = parseAndCanonicalizeModel('A7pro', 'Redmi');
    const v2 = parseAndCanonicalizeModel('A7 pro', 'Redmi');
    const v3 = parseAndCanonicalizeModel('A7 Pro', 'Redmi');
    const v4 = parseAndCanonicalizeModel('a7 pro', 'Redmi');

    expect(v1.canonicalModel).toBe('A7 Pro');
    expect(v2.canonicalModel).toBe('A7 Pro');
    expect(v3.canonicalModel).toBe('A7 Pro');
    expect(v4.canonicalModel).toBe('A7 Pro');

    expect(v1.modelGroupKey).toBe('a7pro');
    expect(v2.modelGroupKey).toBe('a7pro');
    expect(v3.modelGroupKey).toBe('a7pro');
    expect(v4.modelGroupKey).toBe('a7pro');
  });

  it('unifies models with embedded RAM and storage suffixes', () => {
    const v1 = parseAndCanonicalizeModel('A7 Pro 4/64', 'Redmi');
    const v2 = parseAndCanonicalizeModel('A7 Pro 6/128GB', 'Redmi');
    const v3 = parseAndCanonicalizeModel('A7 Pro (128GB)', 'Redmi');

    expect(v1.canonicalModel).toBe('A7 Pro');
    expect(v2.canonicalModel).toBe('A7 Pro');
    expect(v3.canonicalModel).toBe('A7 Pro');

    expect(v1.modelGroupKey).toBe('a7pro');
    expect(v2.modelGroupKey).toBe('a7pro');
    expect(v3.modelGroupKey).toBe('a7pro');

    expect(v1.extractedRam).toBe('4 GB');
    expect(v1.extractedStorage).toBe('64 GB');
    expect(v2.extractedRam).toBe('6 GB');
    expect(v2.extractedStorage).toBe('128 GB');
    expect(v3.extractedStorage).toBe('128 GB');
  });

  it('preserves distinct models like "17" and "Note 13 Pro"', () => {
    const v17 = parseAndCanonicalizeModel('17', 'Redmi');
    expect(v17.canonicalModel).toBe('17');
    expect(v17.modelGroupKey).toBe('17');

    const note13 = parseAndCanonicalizeModel('Note13', 'Xiaomi');
    const note13Pro = parseAndCanonicalizeModel('Note 13 Pro', 'Xiaomi');
    expect(note13.canonicalModel).toBe('Note 13');
    expect(note13Pro.canonicalModel).toBe('Note 13 Pro');
    expect(note13.modelGroupKey).not.toBe(note13Pro.modelGroupKey);
  });

  it('handles empty and null values gracefully', () => {
    expect(parseAndCanonicalizeModel('', 'Redmi').canonicalModel).toBe('Без модели');
    expect(parseAndCanonicalizeModel(null, 'Redmi').canonicalModel).toBe('Без модели');
  });
});

describe('getModelVariantLabel', () => {
  it('combines RAM and storage cleanly', () => {
    expect(getModelVariantLabel('4 GB', '64 GB')).toBe('4 GB / 64 GB');
    expect(getModelVariantLabel('4', '64')).toBe('4 GB / 64 GB');
    expect(getModelVariantLabel(null, '128 GB')).toBe('128 GB');
    expect(getModelVariantLabel('8 GB', null)).toBe('8 GB ОЗУ');
    expect(getModelVariantLabel(null, null)).toBe('Стандарт');
  });

  it('avoids repeating RAM if already inside composite storage string', () => {
    expect(getModelVariantLabel('4 GB', '4/64')).toBe('4/64');
  });
});

