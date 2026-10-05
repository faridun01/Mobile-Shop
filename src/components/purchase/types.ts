export interface PurchaseItem {
  imei: string;
}

export interface PurchaseItemGroup {
  id: string;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  items: PurchaseItem[];
}

export interface PurchasePreviewGroup {
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

