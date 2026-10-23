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
  brand: string;
  name: string;
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
