import { StockThreshold } from '../types';

export type StockStatusType = 'DEFICIT' | 'AT_RISK' | 'NORMAL' | 'NONE';

export interface ModelStockInfo {
  brand: string;
  model: string;
  storage: string;
  currentCount: number;
  minQuantity: number;
  status: StockStatusType;
  deficit: number;
  thresholdId?: string;
}

export function computeStockStatus(currentCount: number, minQuantity: number): StockStatusType {
  if (minQuantity <= 0) return 'NONE';
  if (currentCount < minQuantity) return 'DEFICIT';
  if (currentCount === minQuantity) return 'AT_RISK';
  return 'NORMAL';
}

export function buildThresholdKey(brand: string, model: string, storage: string): string {
  return `${brand.trim().toLowerCase()}__${model.trim().toLowerCase()}__${storage.trim().toLowerCase()}`;
}

export function mapThresholdsToMap(thresholds: StockThreshold[]): Map<string, StockThreshold> {
  const map = new Map<string, StockThreshold>();
  for (const t of thresholds) {
    map.set(buildThresholdKey(t.brand, t.model, t.storage), t);
  }
  return map;
}
