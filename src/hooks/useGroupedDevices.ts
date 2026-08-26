import { useMemo } from 'react';
import { Device } from '../types';

export interface ColorGroup {
  key: string;
  color: string;
  devices: Device[];
}

export interface StorageGroup {
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
  count: number;
}

/**
 * Centralizes the brand -> model -> storage -> color grouping that was
 * previously copy-pasted independently in InventoryPage and TransferPage
 * (with a simpler variant in SalePage), so it only needs fixing in one place.
 */
export function useGroupedDevices(devices: Device[]): DeviceGroup[] {
  return useMemo(() => {
    const groupMap = new Map<string, DeviceGroup>();

    for (const device of devices) {
      const groupKey = `${device.brand}__${device.model}`;
      let group = groupMap.get(groupKey);
      if (!group) {
        group = { key: groupKey, brand: device.brand, model: device.model, storageGroups: [], count: 0 };
        groupMap.set(groupKey, group);
      }
      group.count++;

      let storageGroup = group.storageGroups.find((s) => s.storage === device.storage);
      if (!storageGroup) {
        storageGroup = { key: `${groupKey}__${device.storage}`, storage: device.storage, colorGroups: [], count: 0 };
        group.storageGroups.push(storageGroup);
      }
      storageGroup.count++;

      let colorGroup = storageGroup.colorGroups.find((c) => c.color === device.color);
      if (!colorGroup) {
        colorGroup = { key: `${storageGroup.key}__${device.color}`, color: device.color, devices: [] };
        storageGroup.colorGroups.push(colorGroup);
      }
      colorGroup.devices.push(device);
    }

    return Array.from(groupMap.values()).sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model));
  }, [devices]);
}
