export const DEFAULT_PHONE_COLORS_EN: string[] = [
  'Black',
  'White',
  'Silver',
  'Gold',
  'Gray',
  'Space Gray',
  'Space Black',
  'Graphite',
  'Natural Titanium',
  'Black Titanium',
  'White Titanium',
  'Desert Titanium',
  'Blue Titanium',
  'Midnight',
  'Starlight',
  'Deep Purple',
  'Purple',
  'Lavender',
  'Blue',
  'Light Blue',
  'Sky Blue',
  'Dark Blue',
  'Sierra Blue',
  'Pacific Blue',
  'Green',
  'Alpine Green',
  'Midnight Green',
  'Mint',
  'Red',
  'Pink',
  'Rose Gold',
  'Yellow',
  'Orange',
  'Coral',
  'Cream',
  'Beige',
  'Burgundy',
  'Emerald',
  'Bronze',
  'Teal',
  'Turquoise',
  'Ultramarine',
  'Charcoal',
  'Phantom Black',
  'Phantom Silver',
  'Phantom White',
];

export const DEFAULT_PHONE_COLORS = DEFAULT_PHONE_COLORS_EN;
export const DEFAULT_PHONE_COLORS_RU = DEFAULT_PHONE_COLORS_EN; // backward compatibility

export const COLOR_TRANSLATIONS_RU_TO_EN: Record<string, string> = {
  // Базовые
  черный: 'Black',
  чёрный: 'Black',
  черная: 'Black',
  чёрная: 'Black',
  черное: 'Black',
  чёрное: 'Black',
  черн: 'Black',
  чёрн: 'Black',
  белый: 'White',
  белая: 'White',
  белое: 'White',
  бел: 'White',
  серый: 'Gray',
  серая: 'Gray',
  серое: 'Gray',
  серебристый: 'Silver',
  серебристая: 'Silver',
  серебристое: 'Silver',
  серебро: 'Silver',
  золотой: 'Gold',
  золотая: 'Gold',
  золотое: 'Gold',
  золото: 'Gold',
  синий: 'Blue',
  синяя: 'Blue',
  синее: 'Blue',
  син: 'Blue',
  голубой: 'Light Blue',
  голубая: 'Light Blue',
  голубое: 'Light Blue',
  зеленый: 'Green',
  зелёный: 'Green',
  зеленая: 'Green',
  зелёная: 'Green',
  зеленое: 'Green',
  зелёное: 'Green',
  фиолетовый: 'Purple',
  фиолетовая: 'Purple',
  фиолетовое: 'Purple',
  красный: 'Red',
  красная: 'Red',
  красное: 'Red',
  розовый: 'Pink',
  розовая: 'Pink',
  розовое: 'Pink',
  желтый: 'Yellow',
  жёлтый: 'Yellow',
  желтая: 'Yellow',
  жёлтая: 'Yellow',
  желтое: 'Yellow',
  жёлтое: 'Yellow',
  оранжевый: 'Orange',
  оранжевая: 'Orange',
  оранжевое: 'Orange',
  графит: 'Graphite',
  графитовый: 'Graphite',
  графитовая: 'Graphite',
  графитовое: 'Graphite',

  // Титановая серия (iPhone 15 Pro / 16 Pro)
  титан: 'Titanium',
  титановый: 'Titanium',
  титановая: 'Titanium',
  титановое: 'Titanium',
  'натуральный титан': 'Natural Titanium',
  'черный титан': 'Black Titanium',
  'чёрный титан': 'Black Titanium',
  'белый титан': 'White Titanium',
  'пустынный титан': 'Desert Titanium',
  'синий титан': 'Blue Titanium',
  'серый титан': 'Gray Titanium',
  'серебристый титан': 'Silver Titanium',

  // Фирменные цвета Apple
  'темная ночь': 'Midnight',
  'тёмная ночь': 'Midnight',
  'сияющая звезда': 'Starlight',
  'серый космос': 'Space Gray',
  'черный космос': 'Space Black',
  'чёрный космос': 'Space Black',
  'глянцевый черный': 'Jet Black',
  'глянцевый чёрный': 'Jet Black',
  'матовый черный': 'Matte Black',
  'матовый чёрный': 'Matte Black',
  'розовое золото': 'Rose Gold',
  'альпийский зеленый': 'Alpine Green',
  'альпийский зелёный': 'Alpine Green',
  'тихоокеанский синий': 'Pacific Blue',
  'небесно-голубой': 'Sierra Blue',
  'небесный': 'Sierra Blue',
  'темно-синий': 'Dark Blue',
  'тёмно-синий': 'Dark Blue',
  'ледяной синий': 'Ice Blue',
  'океанический синий': 'Ocean Blue',
  'штормовой синий': 'Storm Blue',
  'темно-зеленый': 'Midnight Green',
  'тёмно-зелёный': 'Midnight Green',
  'лесной зеленый': 'Forest Green',
  'лесной зелёный': 'Forest Green',
  'светло-зеленый': 'Light Green',
  'светло-зелёный': 'Light Green',
  'темно-фиолетовый': 'Deep Purple',
  'тёмно-фиолетовый': 'Deep Purple',
  'светло-фиолетовый': 'Light Purple',
  'светло-розовый': 'Light Pink',
  'темно-красный': 'Dark Red',
  'тёмно-красный': 'Dark Red',
  ультрамарин: 'Ultramarine',

  // Оттенки
  лавандовый: 'Lavender',
  лавандовая: 'Lavender',
  лаванда: 'Lavender',
  мятный: 'Mint',
  мятная: 'Mint',
  мята: 'Mint',
  кремовый: 'Cream',
  кремовая: 'Cream',
  крем: 'Cream',
  бежевый: 'Beige',
  бежевая: 'Beige',
  бирюзовый: 'Turquoise',
  бирюзовая: 'Turquoise',
  бирюза: 'Turquoise',
  коралловый: 'Coral',
  коралловая: 'Coral',
  коралл: 'Coral',
  бордовый: 'Burgundy',
  бордовая: 'Burgundy',
  бордо: 'Burgundy',
  изумрудный: 'Emerald',
  изумрудная: 'Emerald',
  изумруд: 'Emerald',
  бронзовый: 'Bronze',
  бронзовая: 'Bronze',
  бронза: 'Bronze',
  медный: 'Copper',
  медная: 'Copper',
  медь: 'Copper',
  аквамарин: 'Aquamarine',
  лимонный: 'Lemon',
  лимонная: 'Lemon',
  лимон: 'Lemon',
  персиковый: 'Peach',
  персиковая: 'Peach',
  персик: 'Peach',
  малиновый: 'Crimson',
  малиновая: 'Crimson',
  сливовый: 'Plum',
  сливовая: 'Plum',
  сиреневый: 'Lilac',
  сиреневая: 'Lilac',
  пурпурный: 'Magenta',
  пурпурная: 'Magenta',
  песочный: 'Sand',
  песочная: 'Sand',
  янтарный: 'Amber',
  янтарная: 'Amber',
  янтарь: 'Amber',
  жемчужный: 'Pearl',
  жемчужная: 'Pearl',
  жемчуг: 'Pearl',
  'жемчужно-белый': 'Pearl White',
  'угольно-черный': 'Charcoal',
  'угольно-чёрный': 'Charcoal',
  угольный: 'Charcoal',
  'черный оникс': 'Onyx Black',
  'чёрный оникс': 'Onyx Black',
  оникс: 'Onyx',
  сланцевый: 'Slate',
  мраморный: 'Marble',
  'мраморный серый': 'Marble Gray',
  лаймовый: 'Lime',
  лаймовая: 'Lime',
  лайм: 'Lime',
  оливковый: 'Olive',
  оливковая: 'Olive',
  оливка: 'Olive',
  шалфей: 'Sage',
  коричневый: 'Brown',
  коричневая: 'Brown',
  кобальтовый: 'Cobalt',
  сапфировый: 'Sapphire',
  сапфир: 'Sapphire',
  'слоновая кость': 'Ivory',

  // Samsung
  'черный фантом': 'Phantom Black',
  'чёрный фантом': 'Phantom Black',
  'серебристый фантом': 'Phantom Silver',
  'белый фантом': 'Phantom White',
  'серый фантом': 'Phantom Gray',
  'фиолетовый фантом': 'Phantom Violet',
  'мистический бронзовый': 'Mystic Bronze',
  'мистическая бронза': 'Mystic Bronze',
  'мистический черный': 'Mystic Black',
  'мистический чёрный': 'Mystic Black',
  'мистический белый': 'Mystic White',
  'мистический синий': 'Mystic Blue',
  'мистический зеленый': 'Mystic Green',
  'мистический зелёный': 'Mystic Green',
  'аура свечение': 'Aura Glow',
  космос: 'Space',
  фантом: 'Phantom',
  тихоокеанский: 'Pacific',
};

const RU_WORD_TRANSLATIONS: Record<string, string> = {
  черный: 'Black',
  чёрный: 'Black',
  черная: 'Black',
  чёрная: 'Black',
  черное: 'Black',
  чёрное: 'Black',
  черн: 'Black',
  чёрн: 'Black',
  белый: 'White',
  белая: 'White',
  белое: 'White',
  бел: 'White',
  серый: 'Gray',
  серая: 'Gray',
  серое: 'Gray',
  серебристый: 'Silver',
  серебристая: 'Silver',
  серебристое: 'Silver',
  серебро: 'Silver',
  золотой: 'Gold',
  золотая: 'Gold',
  золотое: 'Gold',
  золото: 'Gold',
  синий: 'Blue',
  синяя: 'Blue',
  синее: 'Blue',
  син: 'Blue',
  голубой: 'Light Blue',
  голубая: 'Light Blue',
  голубое: 'Light Blue',
  зеленый: 'Green',
  зелёный: 'Green',
  зеленая: 'Green',
  зелёная: 'Green',
  зеленое: 'Green',
  зелёное: 'Green',
  фиолетовый: 'Purple',
  фиолетовая: 'Purple',
  фиолетовое: 'Purple',
  красный: 'Red',
  красная: 'Red',
  красное: 'Red',
  розовый: 'Pink',
  розовая: 'Pink',
  розовое: 'Pink',
  желтый: 'Yellow',
  жёлтый: 'Yellow',
  желтая: 'Yellow',
  жёлтая: 'Yellow',
  желтое: 'Yellow',
  жёлтое: 'Yellow',
  оранжевый: 'Orange',
  оранжевая: 'Orange',
  оранжевое: 'Orange',
  коричневый: 'Brown',
  коричневая: 'Brown',
  графит: 'Graphite',
  титан: 'Titanium',
  титановый: 'Titanium',
  титановая: 'Titanium',
  титановое: 'Titanium',
  натуральный: 'Natural',
  натуральная: 'Natural',
  натуральное: 'Natural',
  пустынный: 'Desert',
  пустынная: 'Desert',
  пустынное: 'Desert',
  темная: 'Midnight',
  тёмная: 'Midnight',
  ночь: 'Midnight',
  сияющая: 'Starlight',
  звезда: 'Starlight',
  космос: 'Space',
  космический: 'Cosmic',
  фантом: 'Phantom',
  небесный: 'Sierra',
  небесная: 'Sierra',
  альпийский: 'Alpine',
  альпийская: 'Alpine',
  ледяной: 'Ice',
  ледяная: 'Ice',
  мятный: 'Mint',
  мятная: 'Mint',
  мята: 'Mint',
  коралловый: 'Coral',
  коралловая: 'Coral',
  бронзовый: 'Bronze',
  бронзовая: 'Bronze',
  бронза: 'Bronze',
  медный: 'Copper',
  медная: 'Copper',
  медь: 'Copper',
  изумрудный: 'Emerald',
  изумрудная: 'Emerald',
  изумруд: 'Emerald',
  лавандовый: 'Lavender',
  лавандовая: 'Lavender',
  сиреневый: 'Lilac',
  сиреневая: 'Lilac',
  кремовый: 'Cream',
  кремовая: 'Cream',
  бежевый: 'Beige',
  бежевая: 'Beige',
  бордовый: 'Burgundy',
  бордовая: 'Burgundy',
  бирюзовый: 'Turquoise',
  бирюзовая: 'Turquoise',
  аквамарин: 'Aquamarine',
  угольный: 'Charcoal',
  угольная: 'Charcoal',
  оливковый: 'Olive',
  оливковая: 'Olive',
  лаймовый: 'Lime',
  лаймовая: 'Lime',
  лимонный: 'Lemon',
  лимонная: 'Lemon',
  оникс: 'Onyx',
  мраморный: 'Marble',
  кобальтовый: 'Cobalt',
  янтарный: 'Amber',
  янтарная: 'Amber',
  жемчужный: 'Pearl',
  жемчужная: 'Pearl',
  мистический: 'Mystic',
  мистическая: 'Mystic',
  матовый: 'Matte',
  матовая: 'Matte',
  глянцевый: 'Jet',
  глянцевая: 'Jet',
  темный: 'Dark',
  тёмный: 'Dark',
  темно: 'Dark',
  тёмно: 'Dark',
  светлый: 'Light',
  светлая: 'Light',
  светло: 'Light',
  глубокий: 'Deep',
  глубокая: 'Deep',
  океанический: 'Ocean',
  ультрамарин: 'Ultramarine',
  стандарт: 'Standard',
};

function toTitleCase(str: string): string {
  return str
    .split(/([\s\-\/]+)/)
    .map((word) => {
      if (/^[a-zA-Z]/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join('');
}

/**
 * Normalizes phone color to English and cleanly formats it.
 * - Converts Russian color names into English (e.g. "Черный" -> "Black",
 *   "Натуральный титан" -> "Natural Titanium", "Синий" -> "Blue").
 * - If the user types a custom color in English or any other custom text,
 *   it formats it to clean Title Case and PRESERVES it so manual custom colors work.
 */
export function normalizePhoneColor(color?: string | null): string {
  if (!color) return '';
  const trimmed = color.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // 1. Direct dictionary match for Russian -> English
  if (COLOR_TRANSLATIONS_RU_TO_EN[lower]) {
    return COLOR_TRANSLATIONS_RU_TO_EN[lower];
  }

  // 2. If it contains Cyrillic letters, try word-by-word translation
  if (/[а-яёА-ЯЁ]/.test(trimmed)) {
    const parts = trimmed.split(/([\s\-\/]+)/);
    let translatedCount = 0;
    const translatedParts = parts.map((part) => {
      const pLower = part.toLowerCase();
      if (COLOR_TRANSLATIONS_RU_TO_EN[pLower]) {
        translatedCount++;
        return COLOR_TRANSLATIONS_RU_TO_EN[pLower];
      }
      if (RU_WORD_TRANSLATIONS[pLower]) {
        translatedCount++;
        return RU_WORD_TRANSLATIONS[pLower];
      }
      return part;
    });

    if (translatedCount > 0) {
      return toTitleCase(translatedParts.join(''));
    }
  }

  // 3. User entered an English or custom color: format to Title Case and preserve!
  return toTitleCase(trimmed);
}

export function formatPhoneColor(color?: string | null): string {
  const norm = normalizePhoneColor(color);
  return norm || (color ? color.trim() : '');
}

export function getPhoneColorHex(color?: string): string | null {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('black') || c.includes('черн') || c.includes('темн') || c.includes('ночь') || c.includes('midnight') || c.includes('phantom')) return '#1e293b';
  if (c.includes('white') || c.includes('бел') || c.includes('звезд') || c.includes('starlight') || c.includes('pearl')) return '#f8fafc';
  if (c.includes('gold') || c.includes('золот')) return '#eab308';
  if (c.includes('silver') || c.includes('серебр')) return '#cbd5e1';
  if (c.includes('desert')) return '#d4b996';
  if (c.includes('gray') || c.includes('grey') || c.includes('серый') || c.includes('титан') || c.includes('titanium') || c.includes('graphite') || c.includes('графит') || c.includes('космос')) return '#64748b';
  if (c.includes('blue') || c.includes('син') || c.includes('голуб') || c.includes('sierra') || c.includes('pacific')) return '#3b82f6';
  if (c.includes('green') || c.includes('зелен') || c.includes('изумруд') || c.includes('alpine') || c.includes('mint') || c.includes('мят')) return '#22c55e';
  if (c.includes('purple') || c.includes('фиолет') || c.includes('лаванд') || c.includes('violet') || c.includes('lilac')) return '#a855f7';
  if (c.includes('red') || c.includes('красн') || c.includes('burgundy') || c.includes('борд')) return '#ef4444';
  if (c.includes('pink') || c.includes('розов') || c.includes('rose')) return '#ec4899';
  if (c.includes('yellow') || c.includes('желт') || c.includes('lemon')) return '#eab308';
  if (c.includes('orange') || c.includes('оранж') || c.includes('coral') || c.includes('корал')) return '#f97316';
  if (c.includes('teal') || c.includes('turquoise') || c.includes('бирюз')) return '#14b8a6';
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
