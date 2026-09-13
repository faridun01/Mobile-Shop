import { create } from 'zustand';
import { Device } from '../types';
import { apiClient } from '../api/client';
import { mapDevice } from '../api/mappers';

interface DevicesState {
  devices: Device[];
  // `devices` excludes SOLD units by default (see fetchDevices) — a device once sold never
  // leaves the table, so it's the one status that grows unbounded over the shop's lifetime.
  // This reaches a specific SOLD device by exact IMEI and merges it in, for the rare lookup
  // (repair intake, inventory scan) that needs sale history the in-stock list doesn't carry.
  findDeviceByImei: (imei: string) => Promise<Device[]>;
  // Every device (any status, including SOLD) from one purchase invoice — for the
  // invoice-detail "which units were sold" view, which the SOLD-excluded default misses.
  findDevicesByInvoice: (invoiceId: string) => Promise<Device[]>;
  // excludeSold: a SOLD device never leaves the table, so it's the one status that would
  // otherwise grow this fetch unbounded over the shop's lifetime — everything else (in
  // stock, in transfer, in repair) is capped by real physical inventory. Old sold devices
  // are still reachable on demand via findDeviceByImei.
  fetchDevices: () => Promise<void>;
}

function mergeDevicesById(prev: Device[], mapped: Device[]): Device[] {
  const byId = new Map(prev.map((d) => [d.id, d]));
  for (const d of mapped) byId.set(d.id, d);
  return Array.from(byId.values());
}

export const useDevicesStore = create<DevicesState>((set, get) => ({
  devices: [],

  fetchDevices: async () => {
    const raw = await apiClient<any[]>('/devices?excludeSold=true');
    set({ devices: raw.map(mapDevice) });
  },

  findDeviceByImei: async (imei) => {
    const raw = await apiClient<any[]>(`/devices?search=${encodeURIComponent(imei)}`);
    const mapped = raw.map(mapDevice);
    set({ devices: mergeDevicesById(get().devices, mapped) });
    return mapped;
  },

  findDevicesByInvoice: async (invoiceId) => {
    const raw = await apiClient<any[]>(`/devices?purchaseInvoiceId=${encodeURIComponent(invoiceId)}`);
    const mapped = raw.map(mapDevice);
    set({ devices: mergeDevicesById(get().devices, mapped) });
    return mapped;
  },
}));
