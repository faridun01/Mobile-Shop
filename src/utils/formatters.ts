import { DeviceStatus } from '../types';

/**
 * Formats full device spec string: "Apple iPhone 16 Pro (256 GB / Black)"
 */
export function formatDeviceName(device: { brand: string; model: string; storage?: string; color?: string }): string {
  const specs = [device.storage, device.color].filter(Boolean).join(' / ');
  return `${device.brand} ${device.model}${specs ? ` (${specs})` : ''}`;
}

/**
 * Formats device IMEI identifiers consistently:
 * "IMEI: 35489... / 35489..."
 */
export function formatDeviceIdentifiers(device: { imei: string; imei2?: string; serialNumber?: string }): {
  imeiText: string;
  fullText: string;
} {
  const imeiText = device.imei2 ? `IMEI: ${device.imei} / ${device.imei2}` : `IMEI: ${device.imei}`;

  return {
    imeiText,
    fullText: imeiText
  };
}

/**
 * Formats TJS price amount with thousand separators: "14,250 TJS"
 */
export function formatTjs(amount: number): string {
  return `${Math.round(amount || 0).toLocaleString('ru-RU')} TJS`;
}

/**
 * Formats USD price amount with dollar sign: "$1,500"
 */
export function formatUsd(amount: number): string {
  return `$${+(amount || 0).toLocaleString('en-US')}`;
}

/**
 * Status labels and styling dictionary for device statuses
 */
export const DEVICE_STATUS_CONFIG: Record<DeviceStatus, { label: string; bg: string; color: string; border: string }> = {
  MAIN_WAREHOUSE: { label: 'Главный склад', bg: 'bg-emerald-500/10', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  STORE_STOCK: { label: 'В магазине', bg: 'bg-emerald-500/10', color: 'text-emerald-400', border: 'border-emerald-500/30' },
  SOLD: { label: 'Продан', bg: 'bg-slate-800', color: 'text-slate-400', border: 'border-slate-700' },
  IN_STOCK_AFTER_EXCHANGE: { label: 'После обмена', bg: 'bg-blue-500/10', color: 'text-blue-400', border: 'border-blue-500/30' },
  IN_REPAIR: { label: 'В ремонте', bg: 'bg-amber-500/10', color: 'text-amber-400', border: 'border-amber-500/30' },
  TRANSFER_PENDING: { label: 'В транзите', bg: 'bg-purple-500/10', color: 'text-purple-400', border: 'border-purple-500/30' }
};
