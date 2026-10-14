import { useMemo } from 'react';
import { Device } from '../types';
import {
  formatPhoneColor,
  formatStorage,
  formatRam,
  parseAndCanonicalizeModel,
  getModelVariantLabel,
} from '../utils/phoneSpecs';
import { DeviceVariantGroup } from '../components/inventory/types';
import { decimal, moneyNumber } from '../utils/money';

interface ColorGroup {
  key: string;
  color: string;
  devices: Device[];
}

interface StorageGroup {
  key: string;
  storage: string;
  colorGroups: ColorGroup[];
  count: number;
}

export interface DeviceGroup {
  key: string;
  brand: string;
  model: string;
  storageGroups: StorageGroup[];
  variants: DeviceVariantGroup[];
  count: number;
  valueUsd: number;
  devices: Device[];
}

function parseCapacityNum(val?: string | null): number {
  if (!val) return 0;
  const match = val.match(/(\d+)\s*(tb|gb)?/i);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'tb') return num * 1024;
  return num;
}

/**
 * Centralizes the brand -> model -> variant (RAM/Storage) grouping
 * for consistent grouping across inventory views.
 */
export function groupDevices(devices: Device[]): DeviceGroup[] {
  const groupMap = new Map<string, DeviceGroup>();

  for (const device of devices) {
    const bName = device.brand.trim() || 'Без бренда';
    const modelInfo = parseAndCanonicalizeModel(device.model, bName);
    const canonicalName = modelInfo.canonicalModel;
    const groupKey = `${bName}__${modelInfo.modelGroupKey}`;

    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        brand: bName,
        model: canonicalName,
        storageGroups: [],
        variants: [],
        count: 0,
        valueUsd: 0,
        devices: [],
      };
      groupMap.set(groupKey, group);
    }
    group.count++;
    group.valueUsd = moneyNumber(decimal(group.valueUsd).plus(device.purchaseCostUsd || 0));
    group.devices.push(device);

    // Effective RAM and Storage
    const effectiveRam = formatRam(device.ram) || modelInfo.extractedRam || null;
    const effectiveStorage = formatStorage(device.storage) || modelInfo.extractedStorage || device.storage?.trim() || 'Стандарт';

    // Storage group (backward compatibility)
    let storageGroup = group.storageGroups.find((s) => s.storage === effectiveStorage);
    if (!storageGroup) {
      storageGroup = { key: `${groupKey}__${effectiveStorage}`, storage: effectiveStorage, colorGroups: [], count: 0 };
      group.storageGroups.push(storageGroup);
    }
    storageGroup.count++;

    const normColor = formatPhoneColor(device.color);
    let colorGroup = storageGroup.colorGroups.find((c) => c.color === normColor);
    if (!colorGroup) {
      colorGroup = { key: `${storageGroup.key}__${normColor}`, color: normColor, devices: [] };
      storageGroup.colorGroups.push(colorGroup);
    }
    colorGroup.devices.push(device);

    // Variant group (RAM + Storage configuration)
    const variantKey = `${effectiveRam || 'none'}__${effectiveStorage}`;
    let variant = group.variants.find(v => v.key === variantKey);
    if (!variant) {
      variant = {
        key: variantKey,
        ram: effectiveRam,
        storage: effectiveStorage,
        label: getModelVariantLabel(effectiveRam, effectiveStorage),
        count: 0,
        valueUsd: 0,
        devices: [],
      };
      group.variants.push(variant);
    }
    variant.count++;
    variant.valueUsd = moneyNumber(decimal(variant.valueUsd).plus(device.purchaseCostUsd || 0));
    variant.devices.push(device);
  }

  const list = Array.from(groupMap.values());
  for (const g of list) {
    g.variants.sort((vA, vB) => {
      const ramA = parseCapacityNum(vA.ram);
      const ramB = parseCapacityNum(vB.ram);
      if (ramA !== ramB) return ramA - ramB;
      const romA = parseCapacityNum(vA.storage);
      const romB = parseCapacityNum(vB.storage);
      return romA - romB;
    });
  }

  return list.sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model, 'ru'));
}

export function useGroupedDevices(devices: Device[]): DeviceGroup[] {
  return useMemo(() => groupDevices(devices), [devices]);
}

