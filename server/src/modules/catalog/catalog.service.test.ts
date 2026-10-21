import '../../common/decimal-test-setup';
import { describe, expect, it, vi } from 'vitest';
import { D } from '../../common/decimal';

vi.mock('../../prisma/prisma.service', () => ({ prisma: {} }));
import { receiveAccessories } from './catalog.service';
import type { PurchaseAccessory } from './purchase-items';

/** An in-memory accessory catalog with the queries receiveAccessories makes. */
function fakeTx(existing: { barcode: string; category: string }[]) {
  const products = existing.map((p, i) => ({ id: `p${i}`, brand: 'B', name: 'N', model: '', attributes: '', createdAt: new Date(2026, 0, i + 1), ...p }));
  return {
    products,
    accessoryProduct: {
      findUnique: vi.fn(async ({ where }: any) => products.find((p) => p.barcode === where.barcode) ?? null),
      findFirst: vi.fn(async ({ where }: any) => {
        const wanted = String(where.category.equals).toLowerCase();
        return [...products].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).find((p) => p.category.toLowerCase() === wanted) ?? null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const product = { id: `p${products.length}`, createdAt: new Date(), ...data };
        products.push(product);
        return product;
      }),
    },
    accessoryBatch: { create: vi.fn(async ({ data }: any) => ({ id: 'batch', ...data })) },
  };
}

const line = (barcode: string, category: string): PurchaseAccessory => ({
  barcode, brand: 'Baseus', name: 'Чехол iPhone 15', category, model: '', attributes: '', quantity: 1, unitCostUsd: D(2),
});
const context = { storeId: 'main', purchaseInvoiceId: null, supplierId: null, receivedAt: new Date() };

describe('a new accessory card keeps the category spelling already in use', () => {
  it('reuses an existing category typed in another letter case or with extra spaces', async () => {
    const tx = fakeTx([{ barcode: 'OLD', category: 'Чехол' }]);
    const [{ product }] = await receiveAccessories(tx as any, [line('NEW1', '  чехол ')], context);
    expect(product.category).toBe('Чехол');
  });

  it('collapses inner spaces of a new category and keeps it as typed otherwise', async () => {
    const tx = fakeTx([]);
    const [{ product }] = await receiveAccessories(tx as any, [line('NEW1', 'Защитное   стекло')], context);
    expect(product.category).toBe('Защитное стекло');
  });

  it('two new cards of one receipt with differently typed categories share the first spelling', async () => {
    const tx = fakeTx([]);
    const [first, second] = await receiveAccessories(tx as any, [line('NEW1', 'Кабель'), line('NEW2', 'КАБЕЛЬ')], context);
    expect(first.product.category).toBe('Кабель');
    expect(second.product.category).toBe('Кабель');
  });

  it('an existing barcode keeps its card unchanged', async () => {
    const tx = fakeTx([{ barcode: 'OLD', category: 'Зарядка' }]);
    const [{ product }] = await receiveAccessories(tx as any, [line('OLD', 'чехол')], context);
    expect(product.category).toBe('Зарядка');
    expect(tx.accessoryProduct.create).not.toHaveBeenCalled();
  });
});
