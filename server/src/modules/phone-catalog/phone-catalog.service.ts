import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { tacOf } from './normalize';

export interface CatalogPhone {
  brand: string;
  model: string;
  ram?: string | null;
  storage?: string | null;
  color?: string | null;
  lastPurchasePriceUsd?: number | null;
}

export interface PhoneToRemember {
  /** Only phones are remembered: a tablet's SN is no IMEI and has no TAC. */
  category?: string | null;
  imei: string;
  imei2?: string | null;
  brand: string;
  model: string;
  ram?: string | null;
  storage?: string | null;
}

export interface KnownSpecsModel {
  brand: string;
  model: string;
  rams: string[];
  storages: string[];
  colors: string[];
  lastPrice?: number | null;
}

export interface KnownCatalogSpecs {
  brands: string[];
  models: KnownSpecsModel[];
  rams: string[];
  storages: string[];
  colors: string[];
}

/** The phone model behind an IMEI (by its first 8 digits), or null when the catalog doesn't know it. */
export async function findPhoneByImei(imei: string): Promise<CatalogPhone | null> {
  const tac = tacOf(imei);
  if (!tac) return null;
  let entry = await prisma.phoneCatalog.findUnique({ where: { tac } });
  if (!entry) {
    // If not yet in phone_catalog, check if any device in stock/history matches this TAC
    // Phones only: a tablet's serial number is no IMEI and has no TAC.
    const existing = await prisma.device.findFirst({
      where: {
        category: 'PHONE',
        OR: [
          { imei: { startsWith: tac } },
          { imei2: { startsWith: tac } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { brand: true, model: true, ram: true, storage: true, color: true, costBasisUsd: true },
    });
    if (existing && existing.brand && existing.model) {
      try {
        entry = await prisma.phoneCatalog.create({
          data: {
            tac,
            brand: existing.brand.trim(),
            model: existing.model.trim(),
            ram: existing.ram ? existing.ram.trim() : null,
            storage: existing.storage ? existing.storage.trim() : null,
          },
        });
      } catch {
        // Ignore duplicate key error in case of concurrent insert
      }
      return {
        brand: existing.brand.trim(),
        model: existing.model.trim(),
        ram: existing.ram ? existing.ram.trim() : null,
        storage: existing.storage ? existing.storage.trim() : null,
        color: existing.color ? existing.color.trim() : null,
        lastPurchasePriceUsd: null,
      };
    }
  }
  if (!entry) return null;

  // Retrieve latest color for this model from Device table
  const lastDevice = await prisma.device.findFirst({
    where: {
      category: 'PHONE',
      brand: { equals: entry.brand, mode: 'insensitive' },
      model: { equals: entry.model, mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    select: { color: true },
  });

  return {
    brand: entry.brand,
    model: entry.model,
    ram: entry.ram,
    storage: entry.storage,
    color: lastDevice?.color ? lastDevice.color.trim() : null,
    lastPurchasePriceUsd: null,
  };
}

const filled = (value: string | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * Remembers the brand and model of phones just received, under both of their IMEIs' TACs, so the
 * next phone of that model fills in by itself. What was entered by hand wins over what the
 * catalog had. Runs in the caller's transaction, so it commits together with the receipt.
 */
export async function rememberPhones(tx: TransactionClient, phones: PhoneToRemember[]) {
  const byTac = new Map<string, { brand: string; model: string; ram?: string; storage?: string }>();
  for (const phone of phones) {
    if (phone.category && phone.category !== 'PHONE') continue;
    const brand = filled(phone.brand);
    const model = filled(phone.model);
    if (!brand || !model) continue;
    for (const tac of [tacOf(phone.imei), tacOf(phone.imei2)]) {
      if (tac) byTac.set(tac, { brand, model, ram: filled(phone.ram), storage: filled(phone.storage) });
    }
  }
  for (const [tac, entry] of byTac) {
    await tx.phoneCatalog.upsert({
      where: { tac },
      create: { tac, brand: entry.brand, model: entry.model, ram: entry.ram ?? null, storage: entry.storage ?? null },
      update: {
        brand: entry.brand,
        model: entry.model,
        ...(entry.ram ? { ram: entry.ram } : {}),
        ...(entry.storage ? { storage: entry.storage } : {}),
      },
    });
  }
}

/**
 * Returns all brands, models, and specifications ever recorded in the database
 * (both in stock and previously sold devices, as well as catalog TAC entries).
 */
export async function getKnownCatalogSpecs(): Promise<KnownCatalogSpecs> {
  const [devices, catalog] = await Promise.all([
    // Phone suggestions come from phones only; tablets have their own saved variants.
    prisma.device.findMany({
      where: { category: 'PHONE' },
      select: { brand: true, model: true, ram: true, storage: true, color: true, costBasisUsd: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.phoneCatalog.findMany({
      select: { brand: true, model: true, ram: true, storage: true },
    }),
  ]);

  const defaultBrands = ['Apple', 'Samsung', 'Xiaomi', 'Honor', 'Huawei', 'Realme', 'Tecno', 'Infinix', 'OnePlus', 'Google', 'Novey', 'itel', 'Nothing'];
  const brandSet = new Set<string>(defaultBrands);
  const modelMap = new Map<string, {
    brand: string;
    model: string;
    rams: Set<string>;
    storages: Set<string>;
    colors: Set<string>;
    lastPrice?: number;
  }>();

  const ramSet = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
  const storageSet = new Set<string>(['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
  const colorSet = new Set<string>();

  for (const d of devices) {
    const brand = (d.brand || '').trim();
    const model = (d.model || '').trim();
    if (!brand || !model) continue;
    brandSet.add(brand);
    const key = `${brand.toLowerCase()}|${model.toLowerCase()}`;
    let m = modelMap.get(key);
    if (!m) {
      m = { brand, model, rams: new Set(), storages: new Set(), colors: new Set() };
      modelMap.set(key, m);
    }
    if (d.costBasisUsd && m.lastPrice === undefined) {
      const p = Number(d.costBasisUsd);
      if (p > 0) m.lastPrice = p;
    }
    if (d.ram && d.ram.trim()) {
      const r = d.ram.trim();
      m.rams.add(r);
      ramSet.add(r);
    }
    if (d.storage && d.storage.trim()) {
      const s = d.storage.trim();
      m.storages.add(s);
      storageSet.add(s);
    }
    if (d.color && d.color.trim()) {
      const c = d.color.trim();
      m.colors.add(c);
      colorSet.add(c);
    }
  }

  for (const c of catalog) {
    const brand = (c.brand || '').trim();
    const model = (c.model || '').trim();
    if (!brand || !model) continue;
    brandSet.add(brand);
    const key = `${brand.toLowerCase()}|${model.toLowerCase()}`;
    let m = modelMap.get(key);
    if (!m) {
      m = { brand, model, rams: new Set(), storages: new Set(), colors: new Set() };
      modelMap.set(key, m);
    }
    if (c.ram && c.ram.trim()) {
      const r = c.ram.trim();
      m.rams.add(r);
      ramSet.add(r);
    }
    if (c.storage && c.storage.trim()) {
      const s = c.storage.trim();
      m.storages.add(s);
      storageSet.add(s);
    }
  }

  const models: KnownSpecsModel[] = Array.from(modelMap.values()).map((m) => ({
    brand: m.brand,
    model: m.model,
    rams: Array.from(m.rams),
    storages: Array.from(m.storages),
    colors: Array.from(m.colors),
    lastPrice: null,
  }));

  return {
    brands: Array.from(brandSet).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' })),
    models,
    rams: Array.from(ramSet),
    storages: Array.from(storageSet),
    colors: Array.from(colorSet),
  };
}

/**
 * Ensures all existing devices in the warehouse/stock are remembered in PhoneCatalog.
 */
export async function backfillCatalogFromDevices(tx?: TransactionClient) {
  const client = (tx || prisma) as any;
  const devices = await client.device.findMany({
    select: { imei: true, imei2: true, brand: true, model: true, ram: true, storage: true },
  });
  if (devices.length > 0) {
    await rememberPhones(client, devices);
  }
}

