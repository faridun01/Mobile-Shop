import type { Prisma } from '@prisma/client';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { D } from '../../common/decimal';
import { roundMoney } from '../../common/money';
import { normalizeBarcode, type PurchaseAccessory } from './purchase-items';

type Db = TransactionClient;

interface TabletUnit {
  id: string;
  category: string;
  brand: string;
  model: string;
  ram: string | null;
  storage: string;
  color: string;
  connectivity: string | null;
  screenSize: string | null;
}

const variantKey = (u: TabletUnit) => ({
  category: 'TABLET' as const,
  brand: u.brand,
  model: u.model,
  ram: u.ram ?? '',
  storage: u.storage ?? '',
  color: u.color ?? '',
  connectivity: u.connectivity ?? '',
  screenSize: u.screenSize ?? '',
});

/**
 * Saves each tablet variant the first time it is received and links every unit to it. A repeat
 * receipt of the same specs finds the existing variant, so variants are never duplicated.
 */
export async function linkTabletVariants(tx: Db, units: TabletUnit[]) {
  const byKey = new Map<string, { key: ReturnType<typeof variantKey>; ids: string[] }>();
  for (const unit of units) {
    if (unit.category !== 'TABLET') continue;
    const key = variantKey(unit);
    const id = JSON.stringify(key);
    const entry = byKey.get(id) ?? { key, ids: [] };
    entry.ids.push(unit.id);
    byKey.set(id, entry);
  }
  for (const { key, ids } of byKey.values()) {
    const variant = await tx.productVariant.upsert({
      where: { category_brand_model_ram_storage_color_connectivity_screenSize: key },
      create: key,
      update: {},
    });
    await tx.device.updateMany({ where: { id: { in: ids } }, data: { variantId: variant.id } });
  }
}

/**
 * A new card's category in the spelling the catalog already uses, so one category never splits
 * into several for filtering: spaces are collapsed and "чехол" becomes an existing "Чехол".
 */
export async function canonicalAccessoryCategory(tx: Db, raw: string) {
  const category = raw.trim().replace(/\s+/g, ' ');
  if (!category) return category;
  const existing = await tx.accessoryProduct.findFirst({
    where: { category: { equals: category, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
    select: { category: true },
  });
  return existing?.category ?? category;
}

/**
 * Receives accessory lines into a store: an existing barcode keeps its card (no duplicate is
 * created), a new barcode creates the card from the entered fields; each line becomes a batch
 * with its own quantity and unit cost.
 */
export async function receiveAccessories(
  tx: Db,
  lines: PurchaseAccessory[],
  context: { storeId: string; purchaseInvoiceId: string | null; supplierId: string | null; receivedAt: Date },
) {
  const batches = [];
  for (const line of lines) {
    let product = await tx.accessoryProduct.findUnique({ where: { barcode: line.barcode } });
    if (!product) {
      if (!line.brand || !line.name || !line.category) {
        throw new Error(`Новый штрихкод ${line.barcode}: укажите бренд, название и категорию товара`);
      }
      product = await tx.accessoryProduct.create({
        data: {
          barcode: line.barcode, brand: line.brand, name: line.name, category: await canonicalAccessoryCategory(tx, line.category),
          model: line.model, attributes: line.attributes,
        },
      });
    }
    const batch = await tx.accessoryBatch.create({
      data: {
        productId: product.id,
        storeId: context.storeId,
        purchaseInvoiceId: context.purchaseInvoiceId,
        supplierId: context.supplierId,
        quantityReceived: line.quantity,
        quantityRemaining: line.quantity,
        unitCostUsd: line.unitCostUsd,
        receivedAt: context.receivedAt,
      },
    });
    batches.push({ batch, product });
  }
  return batches;
}

export type SuggestKind = 'TABLET' | 'ACCESSORY';
const TABLET_FIELDS = ['brand', 'model', 'ram', 'storage', 'color', 'connectivity', 'screenSize'] as const;
const ACCESSORY_FIELDS = ['brand', 'name', 'category', 'model'] as const;
type TabletField = (typeof TABLET_FIELDS)[number];
type AccessoryField = (typeof ACCESSORY_FIELDS)[number];

export function isSuggestField(kind: SuggestKind, field: string): boolean {
  return kind === 'TABLET'
    ? (TABLET_FIELDS as readonly string[]).includes(field)
    : (ACCESSORY_FIELDS as readonly string[]).includes(field);
}

/** Matches that start with the typed text come first, then the rest alphabetically. */
function rank(values: string[], query: string, limit: number) {
  const q = query.toLowerCase();
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))]
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b, 'ru', { sensitivity: 'base', numeric: true });
    })
    .slice(0, limit);
}

/**
 * Saved values of one field that contain the typed text (case-insensitive), from the tablet
 * variants or the accessory cards. A model is narrowed to the chosen brand when one is given.
 */
export async function suggestValues(input: { kind: SuggestKind; field: string; query: string; brand?: string; limit?: number }) {
  const query = input.query.trim();
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  if (!query) return [];
  const brand = input.brand?.trim();
  const contains = { contains: query, mode: 'insensitive' as const };
  if (input.kind === 'TABLET') {
    const field = input.field as TabletField;
    const rows = await prisma.productVariant.findMany({
      where: {
        category: 'TABLET',
        [field]: contains,
        ...(field === 'model' && brand ? { brand: { equals: brand, mode: 'insensitive' as const } } : {}),
      } as Prisma.ProductVariantWhereInput,
      distinct: [field],
      select: { [field]: true } as Prisma.ProductVariantSelect,
      take: 50,
    });
    return rank(rows.map((row) => String((row as Record<string, unknown>)[field] ?? '')), query, limit);
  }
  const field = input.field as AccessoryField;
  const rows = await prisma.accessoryProduct.findMany({
    where: {
      [field]: contains,
      ...((field === 'model' || field === 'name') && brand ? { brand: { equals: brand, mode: 'insensitive' as const } } : {}),
    } as Prisma.AccessoryProductWhereInput,
    distinct: [field],
    select: { [field]: true } as Prisma.AccessoryProductSelect,
    take: 50,
  });
  return rank(rows.map((row) => String((row as Record<string, unknown>)[field] ?? '')), query, limit);
}

/** The accessory card behind a barcode, or null for a barcode never received. */
export async function findAccessoryByBarcode(raw: unknown) {
  const barcode = normalizeBarcode(raw);
  if (!barcode) return null;
  const product = await prisma.accessoryProduct.findUnique({ where: { barcode } });
  if (!product) return null;
  // For the receipt form: units on hand in every location and the unit cost of the latest batch.
  const [stock, last] = await Promise.all([
    prisma.accessoryBatch.aggregate({ where: { productId: product.id }, _sum: { quantityRemaining: true } }),
    prisma.accessoryBatch.findFirst({ where: { productId: product.id }, orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }], select: { unitCostUsd: true } }),
  ]);
  return { ...product, stockQuantity: stock._sum.quantityRemaining ?? 0, lastUnitCostUsd: last?.unitCostUsd ?? null };
}

/**
 * Accessory cards with their stock per location. Store staff see their own store only; the
 * cost of stock (sum of each batch's remaining units × its own unit cost) is ADMIN-only.
 */
export async function listAccessoryStock(options: { storeId?: string; includeCost: boolean; search?: string }) {
  const search = options.search?.trim();
  const products = await prisma.accessoryProduct.findMany({
    where: search
      ? {
          OR: [
            { barcode: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: [{ brand: 'asc' }, { name: 'asc' }],
    include: {
      batches: {
        where: { quantityRemaining: { gt: 0 }, ...(options.storeId ? { storeId: options.storeId } : {}) },
        select: { storeId: true, quantityRemaining: true, quantityReserved: true, unitCostUsd: true, store: { select: { name: true } } },
      },
    },
  });
  return products.map(({ batches, ...product }) => {
    const byStore = new Map<string, { storeId: string; storeName: string; quantity: number; reserved: number; costUsd: Prisma.Decimal }>();
    for (const batch of batches) {
      const entry = byStore.get(batch.storeId) ?? { storeId: batch.storeId, storeName: batch.store.name, quantity: 0, reserved: 0, costUsd: D(0) };
      entry.quantity += batch.quantityRemaining;
      entry.reserved += batch.quantityReserved;
      entry.costUsd = entry.costUsd.plus(D(batch.unitCostUsd).mul(batch.quantityRemaining));
      byStore.set(batch.storeId, entry);
    }
    // quantity: on hand (in-transit units included, as they still count in stock value);
    // available: what can be sold or moved now (units held by a pending transfer excluded).
    const stores = [...byStore.values()].map((s) => ({
      storeId: s.storeId, storeName: s.storeName, quantity: s.quantity, reserved: s.reserved, available: s.quantity - s.reserved,
      ...(options.includeCost ? { costUsd: roundMoney(s.costUsd) } : {}),
    }));
    const quantity = stores.reduce((sum, s) => sum + s.quantity, 0);
    return {
      ...product,
      quantity,
      available: stores.reduce((sum, s) => sum + s.available, 0),
      stores,
      ...(options.includeCost ? { stockCostUsd: roundMoney([...byStore.values()].reduce((sum, s) => sum.plus(s.costUsd), D(0))) } : {}),
    };
  });
}

/** Cost of accessory stock still on hand (remaining units × each batch's own unit cost), per store. */
export async function accessoryStockCost(db: Pick<Db, 'accessoryBatch'> = prisma, storeId?: string) {
  const batches = await db.accessoryBatch.findMany({
    where: { quantityRemaining: { gt: 0 }, ...(storeId ? { storeId } : {}) },
    select: { storeId: true, quantityRemaining: true, unitCostUsd: true },
  });
  const byStore = new Map<string, { quantity: number; costUsd: Prisma.Decimal }>();
  let totalUsd = D(0);
  let totalQuantity = 0;
  for (const batch of batches) {
    const cost = D(batch.unitCostUsd).mul(batch.quantityRemaining);
    const entry = byStore.get(batch.storeId) ?? { quantity: 0, costUsd: D(0) };
    entry.quantity += batch.quantityRemaining;
    entry.costUsd = entry.costUsd.plus(cost);
    byStore.set(batch.storeId, entry);
    totalUsd = totalUsd.plus(cost);
    totalQuantity += batch.quantityRemaining;
  }
  return { totalUsd: roundMoney(totalUsd), totalQuantity, byStore };
}
