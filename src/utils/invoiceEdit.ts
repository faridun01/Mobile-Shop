import { apiClient } from '../api/client';
import { decimal, moneyNumber, sumMoney } from './money';
import { isValidSerial, normalizeSerial } from './deviceCode';

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
  /** Why it can't be taken off the invoice (sold, repaired, being moved), or null when it can. */
  removeBlock?: string | null;
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
  /** Units sold, moved out or held by a transfer: the quantity can't go below them. */
  minQuantity?: number;
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
  /** Devices taken off the invoice. */
  removeDeviceIds: string[];
  accessoryQuantities: { batchId: string; quantity: number }[];
  /** A typed price that is not a valid amount, by group key or batch id; a bad quantity as `qty:<batch id>`. */
  invalid: string[];
  /** Every device and accessory would leave: the invoice is deleted instead. */
  empty: boolean;
}

/** A quantity as typed: a whole number of units, or null. */
export function parseQuantity(value: string): number | null {
  const text = value.trim();
  return /^\d{1,7}$/.test(text) ? Number(text) : null;
}

/**
 * What saving the edits does: the new invoice total, and whether the change is owed to the
 * supplier or (below what was paid) comes back to the Central Cash. Removed devices take their
 * price off; a batch's new quantity counts at its (new) unit cost. Mirrors the server's rules.
 */
export function invoiceEditResult(
  contents: InvoiceContents,
  groupPrices: Record<string, string>,
  batchCosts: Record<string, string>,
  removed: ReadonlySet<string> = new Set(),
  batchQuantities: Record<string, string> = {},
): InvoiceEditResult {
  const invalid: string[] = [];
  const prices: InvoiceEditResult['prices'] = [];
  const accessoryCosts: InvoiceEditResult['accessoryCosts'] = [];
  const accessoryQuantities: InvoiceEditResult['accessoryQuantities'] = [];
  const removeDeviceIds = contents.devices.filter((d) => removed.has(d.id) && !d.removeBlock).map((d) => d.id);
  const removing = new Set(removeDeviceIds);
  let diff = decimal(0);
  for (const d of contents.devices) if (removing.has(d.id)) diff = diff.minus(d.purchasePriceUsd);
  for (const group of groupInvoiceDevices(contents.devices)) {
    const typed = groupPrices[group.key];
    const kept = group.editable.filter((d) => !removing.has(d.id));
    if (typed === undefined || !kept.length) continue;
    const price = parseUsd(typed);
    if (price === null) { invalid.push(group.key); continue; }
    if (price === group.price) continue;
    for (const d of kept) {
      prices.push({ deviceId: d.id, purchasePriceUsd: price });
      diff = diff.plus(decimal(price).minus(d.purchasePriceUsd));
    }
  }
  let batchesLeft = 0;
  for (const batch of contents.accessories) {
    let cost = moneyNumber(batch.unitCostUsd);
    const typed = batchCosts[batch.id];
    if (typed !== undefined && !batch.locked) {
      const parsed = parseUsd(typed);
      if (parsed === null) invalid.push(batch.id);
      else if (parsed !== cost) {
        accessoryCosts.push({ batchId: batch.id, unitCostUsd: parsed });
        diff = diff.plus(decimal(parsed).minus(batch.unitCostUsd).mul(batch.quantityReceived));
        cost = parsed;
      }
    }
    let quantity = batch.quantityReceived;
    const typedQuantity = batchQuantities[batch.id];
    if (typedQuantity !== undefined) {
      const parsed = parseQuantity(typedQuantity);
      if (parsed === null || parsed < (batch.minQuantity ?? 0)) invalid.push(`qty:${batch.id}`);
      else if (parsed !== quantity) {
        accessoryQuantities.push({ batchId: batch.id, quantity: parsed });
        diff = diff.plus(decimal(cost).mul(parsed - quantity));
        quantity = parsed;
      }
    }
    if (quantity > 0) batchesLeft += 1;
  }
  const oldTotal = moneyNumber(contents.invoice.totalAmountUsd);
  const paid = moneyNumber(contents.invoice.paidAmountUsd);
  const newTotal = moneyNumber(decimal(oldTotal).plus(diff));
  const refund = Math.max(0, moneyNumber(decimal(paid).minus(newTotal)));
  return {
    oldTotal, newTotal, diff: moneyNumber(diff), paid, refund,
    debtBefore: moneyNumber(decimal(oldTotal).minus(paid)),
    debtAfter: moneyNumber(decimal(newTotal).minus(sumMoney([paid, -refund]))),
    prices, accessoryCosts, removeDeviceIds, accessoryQuantities, invalid,
    empty: removeDeviceIds.length + accessoryQuantities.length > 0 && removeDeviceIds.length === contents.devices.length && batchesLeft === 0,
  };
}

/** A model's name and specs as typed in the editor. */
export interface DeviceSpecDraft { brand: string; model: string; ram: string; storage: string; color: string }
export interface AccessoryNameDraft { brand: string; name: string; category: string; barcode: string }

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
  const accessoryNames: { productId: string; brand: string; name: string; category: string; barcode: string }[] = [];
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
    const next = { brand: clean(draft.brand), name: clean(draft.name), category: clean(draft.category), barcode: draft.barcode.replace(/\s+/g, '').toUpperCase() };
    if (!next.name || !next.category || !next.barcode) { invalid.push(batch.productId); continue; }
    if (next.brand === batch.brand && next.name === batch.name && next.category === (batch.category ?? '') && next.barcode === batch.barcode) continue;
    accessoryNames.push({ productId: batch.productId, ...next });
  }
  return { specs, accessoryNames, invalid };
}

/** A unit's codes as typed: IMEI 1/2, or a tablet's SN and additional SN. */
export interface DeviceCodeDraft { imei: string; imei2: string }

/**
 * The code corrections to save, by the receipt's rules: an IMEI is 15 digits, an SN 4–64 letters
 * and digits (upper-cased); the second code is optional, never the same as the first, and no code
 * is typed twice. `invalid` lists the device ids to fix.
 */
export function codeChanges(devices: InvoiceContentDevice[], drafts: Record<string, DeviceCodeDraft>) {
  const codes: { deviceId: string; imei: string; imei2: string | null }[] = [];
  const invalid = new Set<string>();
  const seen = new Map<string, string>();
  for (const device of devices) {
    const draft = drafts[device.id];
    if (!draft) continue;
    const tablet = device.category === 'TABLET';
    const clean = (raw: string) => (tablet ? normalizeSerial(raw) : raw.replace(/\s+/g, ''));
    const valid = (code: string) => (tablet ? isValidSerial(code) : /^\d{15}$/.test(code));
    const imei = clean(draft.imei);
    const imei2 = clean(draft.imei2) || null;
    if (!valid(imei) || (imei2 !== null && (!valid(imei2) || imei2 === imei))) { invalid.add(device.id); continue; }
    for (const code of [imei, imei2]) {
      if (!code) continue;
      const other = seen.get(code);
      if (other) { invalid.add(device.id); invalid.add(other); }
      seen.set(code, device.id);
    }
    if (imei === device.imei && imei2 === (device.imei2 || null)) continue;
    codes.push({ deviceId: device.id, imei, imei2 });
  }
  return { codes: codes.filter((c) => !invalid.has(c.deviceId)), invalid: [...invalid] };
}
