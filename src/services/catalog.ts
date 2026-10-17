import { apiClient } from '../api/client';
import { mapAccessoryProduct } from '../api/mappers';
import type { AccessoryLookup } from '../types';

export type SuggestKind = 'TABLET' | 'ACCESSORY';

/**
 * Saved values of one receipt field that contain the typed text (tablet variants or accessory
 * cards). `brand` narrows models (and accessory names) to the chosen brand.
 */
export async function suggestCatalogValues(kind: SuggestKind, field: string, query: string, brand?: string): Promise<string[]> {
  const params = new URLSearchParams({ kind, field, q: query });
  if (brand?.trim()) params.set('brand', brand.trim());
  const res = await apiClient<{ values: string[] }>(`/catalog/suggest?${params.toString()}`);
  return Array.isArray(res?.values) ? res.values : [];
}

/** The saved accessory card behind a barcode, or null for a barcode never received. */
export async function findAccessoryByBarcode(barcode: string): Promise<AccessoryLookup | null> {
  const res = await apiClient<{ found: boolean; product?: any }>(`/accessories/by-barcode/${encodeURIComponent(barcode)}`);
  if (!res?.found || !res.product) return null;
  const last = Number(res.product.lastUnitCostUsd);
  return {
    ...mapAccessoryProduct(res.product),
    stockQuantity: Number(res.product.stockQuantity) || 0,
    lastUnitCostUsd: Number.isFinite(last) && last > 0 ? last : undefined,
  };
}

/** Common values offered while typing, before the shop's own catalog has them. */
export const TABLET_DEFAULTS = {
  brand: ['Apple', 'Samsung', 'Xiaomi', 'Redmi', 'Lenovo', 'Huawei', 'Honor', 'Realme', 'OnePlus', 'Teclast', 'Blackview', 'Doogee'],
  ram: ['2 GB', '3 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB'],
  storage: ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB'],
  color: ['Black', 'Gray', 'Silver', 'Blue', 'Green', 'Gold', 'White', 'Purple', 'Pink'],
  connectivity: ['Wi-Fi', 'Wi-Fi + Cellular'],
  screenSize: ['8.7"', '10.1"', '10.9"', '11"', '12.1"', '12.4"', '13"'],
};

export const ACCESSORY_CATEGORY_DEFAULTS = [
  'Чехол', 'Защитное стекло', 'Зарядное устройство', 'Кабель', 'Наушники', 'Power Bank',
  'Держатель', 'Карта памяти', 'Колонка', 'Смарт-часы',
];
