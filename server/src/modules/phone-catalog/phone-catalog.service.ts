import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { tacOf } from './normalize';

export interface CatalogPhone {
  brand: string;
  model: string;
  ram: string | null;
  storage: string | null;
}

export interface PhoneToRemember {
  imei: string;
  imei2?: string | null;
  brand: string;
  model: string;
  ram?: string | null;
  storage?: string | null;
}

/** The phone model behind an IMEI (by its first 8 digits), or null when the catalog doesn't know it. */
export async function findPhoneByImei(imei: string): Promise<CatalogPhone | null> {
  const tac = tacOf(imei);
  if (!tac) return null;
  const entry = await prisma.phoneCatalog.findUnique({ where: { tac } });
  return entry ? { brand: entry.brand, model: entry.model, ram: entry.ram, storage: entry.storage } : null;
}

/** Model names for a picker (e.g. setting a minimum for a model not in stock yet). */
export async function searchCatalogModels(query: string, brand?: string): Promise<Array<{ brand: string; model: string }>> {
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.phoneCatalog.findMany({
    where: {
      model: { contains: q, mode: 'insensitive' },
      ...(brand?.trim() ? { brand: { equals: brand.trim(), mode: 'insensitive' } } : {}),
    },
    distinct: ['brand', 'model'],
    select: { brand: true, model: true },
    orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    take: 20,
  });
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
