import { apiClient } from '../api/client';
import { decimal, moneyNumber, sumMoney } from './money';

/** Why the invoice can't be deleted (something of it was sold or moved), or null when it can. */
export async function invoiceDeleteBlock(invoiceId: string): Promise<string | null> {
  const contents = await apiClient<InvoiceContents>(`/supplier-invoices/${invoiceId}/contents`);
  return contents.canDelete ? null : contents.deleteBlockReason || 'Накладную удалить нельзя';
}

/** One device of an invoice as GET /supplier-invoices/:id/contents returns it. */
export interface InvoiceContentDevice {
  id: string;
  brand: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
  category?: string;
  imei: string;
  imei2?: string | null;
  purchasePriceUsd: number;
  isBonus: boolean;
  status: string;
  storeName: string | null;
  /** SOLD: its cost is in a booked sale; BONUS: a free phone, always $0. */
  locked: 'SOLD' | 'BONUS' | null;
}

export interface InvoiceContentBatch {
  id: string;
  /** The accessory card (one per barcode); a move to a store makes another batch of the same card. */
  productId: string;
  brand: string;
  name: string;
  category?: string;
  /** Only this invoice brought the card in, so a typo in its name can be fixed here. */
  nameEditable?: boolean;
  barcode: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCostUsd: number;
  /** Where this batch is: a move to another store makes a new batch there, same invoice and cost. */
  storeName?: string;
  /** MOVED: some units were sold or moved, the cost stays. */
  locked: 'MOVED' | null;
}

export interface InvoiceContents {
  invoice: { id: string; invoiceNumber: string; supplierName: string; totalAmountUsd: number; paidAmountUsd: number };
  devices: InvoiceContentDevice[];
  accessories: InvoiceContentBatch[];
  canDelete: boolean;
  deleteBlockReason: string | null;
}

/** Devices of one model, colour and price: priced together on the edit screen. */
export interface PriceGroup {
  key: string;
  brand: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
  price: number;
  isBonus: boolean;
  devices: InvoiceContentDevice[];
  /** Those whose price can still change. */
  editable: InvoiceContentDevice[];
  /** Ever sold (also when returned since): the cost is in a booked sale. */
  soldCount: number;
  /** Where the units are now, e.g. Главный склад × 1, Сиёма × 2. */
  locations: { name: string; count: number }[];
}

export function groupInvoiceDevices(devices: InvoiceContentDevice[]): PriceGroup[] {
  const groups = new Map<string, PriceGroup>();
  for (const d of devices) {
    const key = [d.brand, d.model, d.ram ?? '', d.storage, d.color, moneyNumber(d.purchasePriceUsd), d.isBonus ? 'bonus' : ''].join('|');
    let group = groups.get(key);
    if (!group) {
      group = { key, brand: d.brand, model: d.model, ram: d.ram, storage: d.storage, color: d.color, price: moneyNumber(d.purchasePriceUsd), isBonus: d.isBonus, devices: [], editable: [], soldCount: 0, locations: [] };
      groups.set(key, group);
    }
    group.devices.push(d);
    if (d.locked === null) group.editable.push(d);
    if (d.locked === 'SOLD') group.soldCount += 1;
    if (d.locked !== 'SOLD') {
      const name = d.storeName || 'Склад';
      const place = group.locations.find((l) => l.name === name);
      if (place) place.count += 1; else group.locations.push({ name, count: 1 });
    }
  }
  return [...groups.values()];
}

/** A price as typed: a positive amount with at most two decimals, or null. */
export function parseUsd(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

export interface InvoiceEditResult {
  oldTotal: number;
  newTotal: number;
  diff: number;
  paid: number;
  /** Overpaid part that goes back to the Central Cash. */
  refund: number;
  debtBefore: number;
  debtAfter: number;
  prices: { deviceId: string; purchasePriceUsd: number }[];
  accessoryCosts: { batchId: string; unitCostUsd: number }[];
  /** A typed price that is not a valid amount, by group key or batch id. */
  invalid: string[];
}

/**
 * What saving the typed prices does: the new invoice total, and whether the change is owed to the
 * supplier or (below what was paid) comes back to the Central Cash. Mirrors the server's rules.
 */
export function invoiceEditResult(
  contents: InvoiceContents,
  groupPrices: Record<string, string>,
  batchCosts: Record<string, string>,
): InvoiceEditResult {
  const invalid: string[] = [];
  const prices: InvoiceEditResult['prices'] = [];
  const accessoryCosts: InvoiceEditResult['accessoryCosts'] = [];
  let diff = decimal(0);
  for (const group of groupInvoiceDevices(contents.devices)) {
    const typed = groupPrices[group.key];
    if (typed === undefined || !group.editable.length) continue;
    const price = parseUsd(typed);
    if (price === null) { invalid.push(group.key); continue; }
    if (price === group.price) continue;
    for (const d of group.editable) {
      prices.push({ deviceId: d.id, purchasePriceUsd: price });
      diff = diff.plus(decimal(price).minus(d.purchasePriceUsd));
    }
  }
  for (const batch of contents.accessories) {
    const typed = batchCosts[batch.id];
    if (typed === undefined || batch.locked) continue;
    const cost = parseUsd(typed);
    if (cost === null) { invalid.push(batch.id); continue; }
    if (cost === moneyNumber(batch.unitCostUsd)) continue;
    accessoryCosts.push({ batchId: batch.id, unitCostUsd: cost });
    diff = diff.plus(decimal(cost).minus(batch.unitCostUsd).mul(batch.quantityReceived));
  }
  const oldTotal = moneyNumber(contents.invoice.totalAmountUsd);
  const paid = moneyNumber(contents.invoice.paidAmountUsd);
  const newTotal = moneyNumber(decimal(oldTotal).plus(diff));
  const refund = Math.max(0, moneyNumber(decimal(paid).minus(newTotal)));
  return {
    oldTotal, newTotal, diff: moneyNumber(diff), paid, refund,
    debtBefore: moneyNumber(decimal(oldTotal).minus(paid)),
    debtAfter: moneyNumber(decimal(newTotal).minus(sumMoney([paid, -refund]))),
    prices, accessoryCosts, invalid,
  };
}

/** A model's name and specs as typed in the editor. */
export interface DeviceSpecDraft { brand: string; model: string; ram: string; storage: string; color: string }
export interface AccessoryNameDraft { brand: string; name: string; category: string }

export const specDraftOf = (g: PriceGroup): DeviceSpecDraft => ({ brand: g.brand, model: g.model, ram: g.ram ?? '', storage: g.storage, color: g.color });

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

/**
 * The renames to save: each edited model's new name on its units not sold yet (a sold one keeps
 * its name on the receipt), each edited accessory card's new name. `invalid` lists the group keys
 * or product ids missing a required field — the receipt's own rules for a phone or a tablet.
 */
export function renameChanges(
  groups: PriceGroup[],
  specDrafts: Record<string, DeviceSpecDraft>,
  accessories: InvoiceContentBatch[],
  nameDrafts: Record<string, AccessoryNameDraft>,
) {
  const specs: { deviceId: string; brand: string; model: string; ram: string | null; storage: string; color: string }[] = [];
  const accessoryNames: { productId: string; brand: string; name: string; category: string }[] = [];
  const invalid: string[] = [];
  for (const group of groups) {
    const draft = specDrafts[group.key];
    if (!draft || !group.editable.length) continue;
    const next = { brand: clean(draft.brand), model: clean(draft.model), ram: clean(draft.ram), storage: clean(draft.storage), color: clean(draft.color) };
    const isTablet = group.devices[0]?.category === 'TABLET';
    const missing = isTablet ? !next.brand || !next.model || !next.storage || !next.color : !next.brand || !next.model || !next.ram || !next.storage;
    if (missing) { invalid.push(group.key); continue; }
    const before = specDraftOf(group);
    if ((Object.keys(next) as (keyof DeviceSpecDraft)[]).every((k) => next[k] === clean(before[k]))) continue;
    for (const d of group.editable) specs.push({ deviceId: d.id, ...next, ram: next.ram || null });
  }
  const seen = new Set<string>();
  for (const batch of accessories) {
    const draft = nameDrafts[batch.productId];
    if (!draft || !batch.nameEditable || seen.has(batch.productId)) continue;
    seen.add(batch.productId);
    const next = { brand: clean(draft.brand), name: clean(draft.name), category: clean(draft.category) };
    if (!next.name || !next.category) { invalid.push(batch.productId); continue; }
    if (next.brand === batch.brand && next.name === batch.name && next.category === (batch.category ?? '')) continue;
    accessoryNames.push({ productId: batch.productId, ...next });
  }
  return { specs, accessoryNames, invalid };
}
