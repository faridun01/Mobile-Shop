import { apiClient } from '../api/client';

/** A phone model the catalog knows for an IMEI's first 8 digits (TAC). */
export interface CatalogPhone {
  brand: string;
  model: string;
  /** Last RAM / storage chosen for this model: a suggestion, they vary per phone. */
  ram?: string | null;
  storage?: string | null;
  color?: string | null;
  lastPurchasePriceUsd?: number | null;
}

export interface CatalogSpecsModel {
  brand: string;
  model: string;
  rams: string[];
  storages: string[];
  colors: string[];
  lastPrice?: number | null;
}

export interface CatalogSpecs {
  brands: string[];
  models: CatalogSpecsModel[];
  rams: string[];
  storages: string[];
  colors: string[];
}

export function imeiTac(imei: string): string | null {
  const digits = imei.replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

// One request per TAC while the page is open: a batch of the same model asks the server once.
const lookups = new Map<string, Promise<CatalogPhone | null>>();

/** Brand and model for a scanned IMEI, or null when the catalog doesn't know that model yet. */
export function lookupPhoneByImei(imei: string): Promise<CatalogPhone | null> {
  const tac = imeiTac(imei);
  if (!tac) return Promise.resolve(null);
  let lookup = lookups.get(tac);
  if (!lookup) {
    lookup = apiClient<{ found: boolean } & Partial<CatalogPhone>>(`/phone-catalog/${tac}`)
      .then((r) =>
        r.found && r.brand && r.model
          ? {
              brand: r.brand,
              model: r.model,
              ram: r.ram ?? null,
              storage: r.storage ?? null,
              color: r.color ?? null,
              lastPurchasePriceUsd: r.lastPurchasePriceUsd ?? null,
            }
          : null
      )
      .catch(() => {
        lookups.delete(tac);
        return null;
      });
    lookups.set(tac, lookup);
  }
  return lookup;
}

/** Fetches full catalog of brands, models, and specs from the database. */
export async function fetchCatalogSpecs(): Promise<CatalogSpecs | null> {
  try {
    return await apiClient<CatalogSpecs>('/phone-catalog/specs');
  } catch {
    return null;
  }
}

/** After a receipt the catalog has learned new models; forget cached "not found" answers. */
export function clearPhoneCatalogCache() {
  lookups.clear();
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether an entered brand/model is the model the catalog has for that IMEI. */
export function matchesCatalog(phone: CatalogPhone, brand: string, model: string): boolean {
  return sameName(phone.brand, brand) && sameName(phone.model, model);
}

