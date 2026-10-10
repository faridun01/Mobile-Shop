import { describe, expect, it } from 'vitest';
import {
  computeStockStatus,
  buildThresholdKey,
  mapThresholdsToMap,
} from './stockThresholds';
import { StockThreshold } from '../types';

describe('stockThresholds utils', () => {
  it('computes correct stock status', () => {
    expect(computeStockStatus(0, 0)).toBe('NONE');
    expect(computeStockStatus(5, 0)).toBe('NONE');
    expect(computeStockStatus(2, 5)).toBe('DEFICIT');
    expect(computeStockStatus(5, 5)).toBe('AT_RISK');
    expect(computeStockStatus(8, 5)).toBe('NORMAL');
  });

  it('builds normalized threshold key', () => {
    expect(buildThresholdKey(' Apple ', ' iPhone 15 ', ' 128GB ')).toBe('apple__iphone 15__128gb');
  });

  it('maps thresholds array to normalized map', () => {
    const thresholds: StockThreshold[] = [
      { id: '1', storeId: 's1', brand: 'Apple', model: 'iPhone 15', storage: '128GB', minQuantity: 5 },
      { id: '2', storeId: 's1', brand: 'Samsung', model: 'S24', storage: '256GB', minQuantity: 3 },
    ];
    const map = mapThresholdsToMap(thresholds);
    expect(map.get('apple__iphone 15__128gb')?.minQuantity).toBe(5);
    expect(map.get('samsung__s24__256gb')?.minQuantity).toBe(3);
    expect(map.get('xiaomi__14__256gb')).toBeUndefined();
  });
});
