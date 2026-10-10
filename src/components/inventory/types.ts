import { Device, DeviceStatus } from '../../types';
import { BadgeTone } from '../ui/Badge';
import { decimal, formatMoney } from '../../utils/money';
import { DEVICE_STATUS_LABELS } from '../../utils/scanLookup';

export const IN_STOCK_STATUSES: DeviceStatus[] = ['STORE_STOCK', 'MAIN_WAREHOUSE', 'IN_STOCK_AFTER_EXCHANGE'];

export const STATUS_LABELS: Record<DeviceStatus, string> = DEVICE_STATUS_LABELS;

export const STATUS_TONE: Record<DeviceStatus, BadgeTone> = {
  MAIN_WAREHOUSE: 'warning',
  STORE_STOCK: 'success',
  SOLD: 'neutral',
  IN_STOCK_AFTER_EXCHANGE: 'info',
  IN_REPAIR: 'warning',
  TRANSFER_PENDING: 'warning',
};

export function formatTimelineDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year}, ${hours}:${mins}`;
  } catch {
    return dateStr;
  }
}

/** Warehouse goods are displayed strictly in USD without Somoni approximation. */
export function approxTjs(_usd: number, _rate?: number): string | null {
  return null;
}

export function getBrandBadgeStyle(brand: string): { bg: string; text: string; border: string } {
  const b = brand.toLowerCase();
  if (b.includes('apple') || b.includes('iphone')) {
    return { bg: 'bg-zinc-800 text-zinc-100 border-zinc-700', text: 'text-zinc-100', border: 'border-zinc-700' };
  }
  if (b.includes('samsung')) {
    return { bg: 'bg-blue-500/15 text-blue-500 border-blue-500/30', text: 'text-blue-500', border: 'border-blue-500/30' };
  }
  if (b.includes('xiaomi') || b.includes('redmi') || b.includes('poco')) {
    return { bg: 'bg-orange-500/15 text-orange-500 border-orange-500/30', text: 'text-orange-500', border: 'border-orange-500/30' };
  }
  if (b.includes('honor')) {
    return { bg: 'bg-sky-500/15 text-sky-500 border-sky-500/30', text: 'text-sky-500', border: 'border-sky-500/30' };
  }
  if (b.includes('huawei')) {
    return { bg: 'bg-red-500/15 text-red-500 border-red-500/30', text: 'text-red-500', border: 'border-red-500/30' };
  }
  if (b.includes('google') || b.includes('pixel')) {
    return { bg: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30', text: 'text-emerald-500', border: 'border-emerald-500/30' };
  }
  if (b.includes('realme')) {
    return { bg: 'bg-amber-500/15 text-amber-500 border-amber-500/30', text: 'text-amber-500', border: 'border-amber-500/30' };
  }
  return { bg: 'bg-accent/15 text-accent border-accent/30', text: 'text-accent', border: 'border-accent/30' };
}

export {
  getPhoneColorHex,
  formatPhoneColor,
  normalizePhoneColor,
  formatRam,
  formatStorage,
  isRamInStorage,
} from '../../utils/phoneSpecs';

export function getTimelineBadge(type: string) {
  const upper = (type || '').toUpperCase();
  if (upper === 'BONUS') {
    return {
      label: 'Бонус поставщика',
      tone: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
      dot: 'bg-amber-500',
    };
  }
  if (upper === 'PURCHASE') {
    return {
      label: 'Поступление',
      tone: 'bg-accent/15 text-accent border-accent/30',
      dot: 'bg-accent',
    };
  }
  if (upper === 'TRANSFER') {
    return {
      label: 'Перемещение',
      tone: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      dot: 'bg-purple-500',
    };
  }
  if (upper === 'SALE') {
    return {
      label: 'Продажа',
      tone: 'bg-success/15 text-success border-success/30',
      dot: 'bg-success',
    };
  }
  if (upper === 'REPAIR') {
    return {
      label: 'Ремонт',
      tone: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      dot: 'bg-orange-500',
    };
  }
  return {
    label: upper,
    tone: 'bg-surface text-fg-muted border-border',
    dot: 'bg-accent',
  };
}

export interface BrandGroupItem {
  key: string;
  brand: string;
  totalCount: number;
  totalValueUsd: number;
  distinctModelsCount: number;
  modelGroups: {
    key: string;
    model: string;
    count: number;
    valueUsd: number;
    storageList: { storage: string; count: number }[];
    ramList: string[];
    devices: Device[];
  }[];
  devices: Device[];
}

export type InventoryViewMode = 'BY_BRAND' | 'BY_MODEL' | 'FLAT_LIST';
