import { describe, it, expect } from 'vitest';
import { groupDevices, DeviceGroup } from '../../hooks/useGroupedDevices';
import { Device } from '../../types';
import { DeviceVariantGroup } from './types';

describe('Model normalization and variant grouping', () => {
  const sampleDevices: Device[] = [
    {
      id: 'dev-1',
      imei: '860000000000001',
      brand: 'Redmi',
      model: 'A7pro', // Notice: no space
      ram: '4GB',
      storage: '64GB',
      color: 'Black',
      status: 'STORE_STOCK',
      locationId: 'store-siyoma',
      locationName: 'Сиёма',
      purchaseCostUsd: 138,
      costBasisUsd: 138,
      createdAt: '2026-10-14T00:00:00Z',
      timeline: [],
    },
    {
      id: 'dev-2',
      imei: '860000000000002',
      brand: 'Redmi',
      model: 'A7pro', // Notice: no space
      ram: '4GB',
      storage: '64GB',
      color: 'Blue',
      status: 'STORE_STOCK',
      locationId: 'store-siyoma',
      locationName: 'Сиёма',
      purchaseCostUsd: 138,
      costBasisUsd: 138,
      createdAt: '2026-10-14T00:00:00Z',
      timeline: [],
    },
    {
      id: 'dev-3',
      imei: '860000000000003',
      brand: 'Redmi',
      model: 'A7 pro', // Notice: space!
      ram: '6GB',
      storage: '128GB',
      color: 'Silver',
      status: 'STORE_STOCK',
      locationId: 'store-siyoma',
      locationName: 'Сиёма',
      purchaseCostUsd: 124,
      costBasisUsd: 124,
      createdAt: '2026-10-14T00:00:00Z',
      timeline: [],
    },
    {
      id: 'dev-4',
      imei: '860000000000004',
      brand: 'Redmi',
      model: '17',
      ram: '8GB',
      storage: '256GB',
      color: 'Black',
      status: 'STORE_STOCK',
      locationId: 'store-siyoma',
      locationName: 'Сиёма',
      purchaseCostUsd: 194.5,
      costBasisUsd: 194.5,
      createdAt: '2026-10-14T00:00:00Z',
      timeline: [],
    },
    {
      id: 'dev-5',
      imei: '860000000000005',
      brand: 'Redmi',
      model: '17',
      ram: '8GB',
      storage: '256GB',
      color: 'White',
      status: 'STORE_STOCK',
      locationId: 'store-siyoma',
      locationName: 'Сиёма',
      purchaseCostUsd: 194.5,
      costBasisUsd: 194.5,
      createdAt: '2026-10-14T00:00:00Z',
      timeline: [],
    },
  ];

  it('correctly consolidates A7pro and A7 pro under one canonical model A7 Pro', () => {
    const groups: DeviceGroup[] = groupDevices(sampleDevices);

    // Must be exactly 2 model groups: "17" and "A7 Pro" (NOT 3 separate groups!)
    expect(groups.length).toBe(2);

    const a7ProGroup = groups.find((g: DeviceGroup) => g.model === 'A7 Pro');
    expect(a7ProGroup).toBeDefined();
    expect(a7ProGroup!.count).toBe(3);
    expect(a7ProGroup!.valueUsd).toBe(400);

    // Inside A7 Pro, variants must be separated by RAM/ROM configurations
    expect(a7ProGroup!.variants.length).toBe(2);

    const var4_64 = a7ProGroup!.variants.find((v: DeviceVariantGroup) => v.label === '4 GB / 64 GB');
    expect(var4_64).toBeDefined();
    expect(var4_64!.count).toBe(2);
    expect(var4_64!.valueUsd).toBe(276);
    expect(var4_64!.devices.length).toBe(2);

    const var6_128 = a7ProGroup!.variants.find((v: DeviceVariantGroup) => v.label === '6 GB / 128 GB');
    expect(var6_128).toBeDefined();
    expect(var6_128!.count).toBe(1);
    expect(var6_128!.valueUsd).toBe(124);
    expect(var6_128!.devices.length).toBe(1);

    const group17 = groups.find((g: DeviceGroup) => g.model === '17');
    expect(group17).toBeDefined();
    expect(group17!.count).toBe(2);
    expect(group17!.valueUsd).toBe(389);
  });
});
