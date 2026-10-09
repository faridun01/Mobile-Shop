export const DEFAULT_PHONE_COLORS_RU: string[] = [
  'Черный',
  'Белый',
  'Серый',
  'Серебристый',
  'Золотой',
  'Синий',
  'Голубой',
  'Зеленый',
  'Фиолетовый',
  'Красный',
  'Розовый',
  'Желтый',
  'Оранжевый',
  'Графит',
  'Натуральный титан',
  'Черный титан',
  'Белый титан',
  'Пустынный титан',
  'Темная ночь',
  'Сияющая звезда',
];

export const COLOR_TRANSLATIONS_EN_TO_RU: Record<string, string> = {
  black: 'Черный',
  white: 'Белый',
  gray: 'Серый',
  grey: 'Серый',
  silver: 'Серебристый',
  gold: 'Золотой',
  blue: 'Синий',
  'light blue': 'Голубой',
  green: 'Зеленый',
  purple: 'Фиолетовый',
  violet: 'Фиолетовый',
  red: 'Красный',
  pink: 'Розовый',
  yellow: 'Желтый',
  orange: 'Оранжевый',
  graphite: 'Графит',
  titanium: 'Титан',
  'natural titanium': 'Натуральный титан',
  'black titanium': 'Черный титан',
  'white titanium': 'Белый титан',
  'desert titanium': 'Пустынный титан',
  'blue titanium': 'Синий титан',
  midnight: 'Темная ночь',
  starlight: 'Сияющая звезда',
  'space gray': 'Серый космос',
  'space grey': 'Серый космос',
  'space black': 'Черный космос',
  'sierra blue': 'Небесно-голубой',
  'alpine green': 'Альпийский зеленый',
  'deep purple': 'Темно-фиолетовый',
  'phantom black': 'Черный фантом',
  'phantom silver': 'Серебристый фантом',
  'phantom white': 'Белый фантом',
};

/**
 * Normalizes phone color so it is consistently stored and displayed in Russian.
 * Translates English color names to Russian and capitalizes standard Russian names.
 */
export function normalizePhoneColor(color?: string | null): string {
  if (!color) return '';
  const trimmed = color.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  if (COLOR_TRANSLATIONS_EN_TO_RU[lower]) {
    return COLOR_TRANSLATIONS_EN_TO_RU[lower];
  }

  // Capitalize first letter of Russian / custom string
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function formatPhoneColor(color?: string | null): string {
  return normalizePhoneColor(color);
}

export function getPhoneColorHex(color?: string): string | null {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('black') || c.includes('черн') || c.includes('темн') || c.includes('ночь') || c.includes('midnight') || c.includes('phantom')) return '#1e293b';
  if (c.includes('white') || c.includes('бел') || c.includes('звезд') || c.includes('starlight') || c.includes('pearl')) return '#f8fafc';
  if (c.includes('gold') || c.includes('золот')) return '#eab308';
  if (c.includes('silver') || c.includes('серебр')) return '#cbd5e1';
  if (c.includes('gray') || c.includes('grey') || c.includes('серый') || c.includes('титан') || c.includes('titanium') || c.includes('graphite') || c.includes('графит') || c.includes('космос')) return '#64748b';
  if (c.includes('blue') || c.includes('син') || c.includes('голуб')) return '#3b82f6';
  if (c.includes('green') || c.includes('зелен') || c.includes('изумруд')) return '#22c55e';
  if (c.includes('purple') || c.includes('фиолет') || c.includes('лаванд') || c.includes('violet')) return '#a855f7';
  if (c.includes('red') || c.includes('красн')) return '#ef4444';
  if (c.includes('pink') || c.includes('розов')) return '#ec4899';
  if (c.includes('yellow') || c.includes('желт')) return '#eab308';
  if (c.includes('orange') || c.includes('оранж')) return '#f97316';
  return '#94a3b8';
}

export function formatRam(ram?: string | null): string | null {
  if (!ram) return null;
  const clean = ram.trim();
  if (!clean) return null;
  return clean.toUpperCase().includes('GB') ? clean : `${clean} GB`;
}

export function formatStorage(storage?: string | null): string {
  if (!storage) return '';
  const clean = storage.trim();
  if (!clean) return '';
  return clean.toUpperCase().includes('GB') || clean.toUpperCase().includes('TB') ? clean : `${clean} GB`;
}
