/** What a receipt position holds: phones by IMEI, tablets by SN, accessories by barcode + quantity. */
export type PurchaseCategory = 'PHONE' | 'TABLET' | 'ACCESSORY';

export interface PurchaseItem {
  /** A phone's "IMEI 1 / IMEI 2", or a tablet's main SN. */
  imei: string;
  /** A tablet's additional SN (e.g. its keyboard). */
  imei2?: string;
}

export interface PurchaseItemGroup {
  id: string;
  /** PHONE when absent. */
  category?: PurchaseCategory;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
  // Tablet
  connectivity?: string;
  screenSize?: string;
  // Accessory
  barcode?: string;
  name?: string;
  accessoryCategory?: string;
  attributes?: string;
  quantity?: number;
  /** The saved card a scanned barcode was found as (its fields then come from the card). */
  productId?: string | null;
  /** Barcode lookup state: found in the catalog, new (to be filled by hand), or being checked. */
  barcodeStatus?: 'idle' | 'loading' | 'found' | 'new';
  /** A found card: units on hand now and the unit cost of its latest batch. */
  stockQuantity?: number;
  lastUnitCostUsd?: number;
}

export interface PurchasePreviewGroup {
  category?: PurchaseCategory;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
  imeis: string[];
  connectivity?: string;
  screenSize?: string;
  barcode?: string;
  name?: string;
  accessoryCategory?: string;
  attributes?: string;
  quantity?: number;
}

export interface PurchasePreviewData {
  supplierId: string;
  invoiceNumber: string;
  date: string;
  isStorePurchase: boolean;
  storeId?: string;
  groups: PurchasePreviewGroup[];
  paidAmountUsd?: number;
}

/** All units an invoice received: its devices plus its accessory batches' quantities. */
export const invoiceUnits = (inv: { devicesCount?: number; accessoryBatches?: { quantityReceived: number }[] }) =>
  (inv.devicesCount || 0) + (inv.accessoryBatches ?? []).reduce((sum, b) => sum + b.quantityReceived, 0);

/** Units a preview position adds: its serialized items, or an accessory line's quantity. */
export const previewUnits = (g: PurchasePreviewGroup) => (g.category === 'ACCESSORY' ? g.quantity || 0 : g.items.length);

export const emptyGroup = (category: PurchaseCategory = 'PHONE'): PurchaseItemGroup => ({
  id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  category,
  brand: '',
  model: '',
  ram: '',
  storage: '',
  color: '',
  purchasePriceUsd: 0,
  items: category === 'ACCESSORY' ? [] : [{ imei: '' }],
  ...(category === 'TABLET' ? { connectivity: '', screenSize: '' } : {}),
  ...(category === 'ACCESSORY'
    ? { barcode: '', name: '', accessoryCategory: '', attributes: '', quantity: 1, productId: null, barcodeStatus: 'idle' as const }
    : {}),
});

export const formatInvoiceDate = (dateVal?: string): string => {
  if (!dateVal) return '-';
  try {
    const clean = dateVal.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return clean;
  } catch {
    return dateVal;
  }
};

export const getImeiPair = (value: string): [string, string] => {
  const [imei1 = '', imei2 = ''] = (value || '').split(/[\/,]/).map(part => part.trim());
  return [imei1, imei2];
};

/**
 * Compare two supplier invoices in descending order (newest first).
 * 1. Date/time descending (newest timestamp first).
 * 2. If timestamps are equal (e.g. both created on the same day or legacy midnight dates),
 *    natural numeric comparison of invoice numbers descending (e.g. INV-0010 before INV-0009).
 * 3. Tie-breaker: ID descending.
 */
export const compareInvoicesDesc = (
  a: { date?: string; invoiceNumber?: string; id?: string },
  b: { date?: string; invoiceNumber?: string; id?: string }
): number => {
  const timeA = new Date(a.date || 0).getTime();
  const timeB = new Date(b.date || 0).getTime();
  if (timeB !== timeA) {
    return timeB - timeA;
  }
  const numA = (a.invoiceNumber || '').trim();
  const numB = (b.invoiceNumber || '').trim();
  const numCompare = numB.localeCompare(numA, undefined, { numeric: true, sensitivity: 'base' });
  if (numCompare !== 0) {
    return numCompare;
  }
  return (b.id || '').localeCompare(a.id || '');
};
