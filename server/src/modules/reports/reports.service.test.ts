import { moneyJson } from '../../common/decimal';
import '../../common/decimal-test-setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';

const db = vi.hoisted(() => ({
  sale: { findMany: vi.fn() }, expense: { findMany: vi.fn() }, supplierBonus: { findMany: vi.fn() },
  supplier: { aggregate: vi.fn(), findMany: vi.fn() }, store: { findFirst: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn() }, device: { findMany: vi.fn() }, customerPaymentAllocation: { findMany: vi.fn() },
  saleReturn: { findMany: vi.fn() }, saleItem: { findMany: vi.fn() },
  financialTransaction: { findMany: vi.fn(async () => []) }, financialAccount: { findMany: vi.fn(async () => []) },
}));
vi.mock('../../prisma/prisma.service', () => ({ prisma: db }));
const rates = vi.hoisted(() => ({ byDay: new Map<string, number>(), fallback: 10 }));
vi.mock('../exchange-rate/exchange-rate.service', () => ({
  getRateForDate: async (d: Date) => rates.byDay.get(d.toISOString().slice(0, 10)) ?? rates.fallback,
}));
import { computeReportsSummary } from './reports.service';

const date = new Date('2026-09-15T09:00:00Z');
const stores = Array.from({ length: 20 }, (_, i) => ({ id: `store-${i}`, name: `Store ${i}`, cashBalanceUsd: 100 + i }));
const sales = Array.from({ length: 2000 }, (_, i) => ({
  id: `sale-${i}`, storeId: stores[i % 20].id, totalTjs: 3001.2, totalUsd: 300.12, exchangeRate: 10,
  createdAt: date, refundedAt: date, status: i % 13 === 0 ? 'REFUNDED' : 'COMPLETED', penaltyFeeUsd: 1.23, penaltyFeeTjs: 12.3,
  customerName: `Customer ${i}`, receiptNumber: i + 1, paymentMethod: 'CASH', cashAmountTjs: 3001.2, cardAmountTjs: 0, returns: [],
  saleItems: [{ deviceId: `device-${i}`, imei: String(350000000000000 + i), storage: '128GB', color: 'Black', brand: 'Phone', model: `M${i % 7}`, salePriceUsd: 300.12, salePriceTjs: 3001.2, costBasisUsd: i % 9 ? 200.01 : 0, purchaseCostUsd: 200.01 }],
}));
const expenses = Array.from({ length: 2000 }, (_, i) => ({ id: `expense-${i}`, storeId: stores[i % 20].id, createdAt: date, amountTjs: 12.34, amountUsd: 1.23, exchangeRate: 10, comment: `Expense ${i}`, category: 'OTHER', createdByUserId: 'user' }));
const logs = sales.map((sale, i) => ({ targetId: sale.id, action: 'SALE', financialDetails: { recognizedProfitUsd: i % 9 ? 100.11 : 300.12 } }));
let workload: { table: string; rows: number; bytes: number }[];

function project(row: any, select: any): any {
  if (!select) return row;
  return Object.fromEntries(Object.entries(select).map(([key, spec]) => [key,
    typeof spec === 'object' && spec && Array.isArray(row[key]) ? row[key].map((item: any) => project(item, (spec as any).select)) : row[key],
  ]));
}
function result(table: string, rows: any[], select?: any) {
  const values = rows.map((row) => project(row, select));
  workload.push({ table, rows: rows.length, bytes: Buffer.byteLength(JSON.stringify(values)) });
  return values;
}

beforeEach(() => {
  vi.clearAllMocks(); workload = [];
  rates.byDay.clear(); rates.fallback = 10;
  db.sale.findMany.mockImplementation(async ({ where, select }) => result('sales', sales.filter((sale) =>
    (!where.storeId || sale.storeId === where.storeId) && (!where.id || where.id.in.includes(sale.id)) &&
    (where.status !== 'REFUNDED' || sale.status === 'REFUNDED')), select));
  // The report reads a period's sale items as a flat query filtered through their sale.
  db.saleItem.findMany.mockImplementation(async ({ where, select }) => result('saleItems', sales
    .filter((sale) => !where.sale?.storeId || sale.storeId === where.sale.storeId)
    .flatMap((sale) => sale.saleItems.map((item) => ({ ...item, saleId: sale.id }))), select));
  db.expense.findMany.mockImplementation(async ({ where, select }) => result('expenses', expenses.filter((expense: any) => (!where?.storeId || expense.storeId === where.storeId) && (!where?.paymentFxUsd || Number(expense.paymentFxUsd ?? 0) !== 0)), select));
  db.auditLog.findMany.mockImplementation(async ({ where, select }) => {
    const ids = where.targetId ? new Set(where.targetId.in) : undefined;
    const actions: string[] = where.action.in ?? [where.action];
    return result('profitLogs', logs.filter((log) => (!ids || ids.has(log.targetId)) && actions.includes(log.action)), select);
  });
  db.supplierBonus.findMany.mockResolvedValue([{ bonusType: 'CASH_DISCOUNT', amountUsd: 25.5, exchangeRate: 10, dateReceived: date }, { bonusType: 'FREE_DEVICES', dateReceived: date, status: 'IN_STOCK' }]);
  db.customerPaymentAllocation.findMany.mockResolvedValue([]);
  db.saleReturn.findMany.mockResolvedValue([]);
  db.supplier.aggregate.mockResolvedValue({ _sum: { totalDebtUsd: 123.45 } });
  db.supplier.findMany.mockResolvedValue([{ id: 'supplier', name: 'Supplier', totalPurchasedUsd: 200, totalPaidUsd: 76.55, totalDebtUsd: 123.45 }]);
  db.store.findFirst.mockResolvedValue({ id: 'warehouse', cashBalanceUsd: 34.57 });
  db.store.findMany.mockImplementation(async ({ where } = {} as any) => stores.filter((store) => !where?.id || store.id === where.id));
  db.device.findMany.mockImplementation(async ({ where }) => where.storeId === 'warehouse'
    ? [{ costBasisUsd: 0, purchasePriceUsd: 200 }, { costBasisUsd: 100.01, purchasePriceUsd: 90 }]
    : stores.filter((store) => where.storeId.in.includes(store.id)).map((store) => ({ storeId: store.id, costBasisUsd: 99.99, purchasePriceUsd: 80 })));
});

describe('financial report query optimization preserves all totals', () => {
  it.each(['all', 'store-0', 'store-1'])('preserves the complete report for %s', async (storeId) => {
    const summary = await computeReportsSummary({ period: 'SPECIFIC_MONTH', month: '2026-09', storeId });
    expect(db.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) }));
    expect(moneyJson(summary)).toMatchSnapshot();
    if (process.env.REPORT_BENCHMARK_LABEL) {
      mkdirSync('output/performance', { recursive: true });
      writeFileSync(`output/performance/reports-${process.env.REPORT_BENCHMARK_LABEL}-${storeId}.json`, JSON.stringify({ storeId, workload,
        rows: workload.reduce((sum, row) => sum + row.rows, 0), bytes: workload.reduce((sum, row) => sum + row.bytes, 0) }, null, 2));
    }
  });
});

describe('a refund is reported by fact, on its own day', () => {
  it('reverses the dollars actually handed back, not the dollars the sale booked', async () => {
    const refundDay = new Date('2026-09-10T08:00:00Z');
    rates.byDay.set('2026-09-10', 11);
    rates.fallback = 12; // "today"
    const refunded = { id: 'refunded-1', storeId: 'store-0', status: 'REFUNDED', totalTjs: 2000, totalUsd: 200, exchangeRate: 10, returns: [],
      penaltyFeeUsd: 0, penaltyFeeTjs: 0, createdAt: new Date('2026-09-01T08:00:00Z'), updatedAt: refundDay, refundedAt: refundDay, saleItems: [] };
    db.sale.findMany.mockImplementation(async ({ where, select }) => (where.status === 'REFUNDED' ? [refunded] : []).map((row) => project(row, select)));
    db.auditLog.findMany.mockImplementation(async ({ where, select }) => {
      const actions: string[] = where.action.in ?? [where.action];
      const rows = actions.includes('REFUND')
        ? [{ targetId: 'refunded-1', action: 'REFUND', createdAt: refundDay, financialDetails: { fxGainUsd: 18.18 } }]
        : [];
      return rows.map((row) => project(row, select));
    });
    const summary = await computeReportsSummary({ period: 'SPECIFIC_MONTH', month: '2026-09', includeEvents: true });
    // 2000 TJS sold at 10 ($200), handed back at 11: $181.82 left the register.
    expect(Number(summary.refundsRevenueUsd)).toBe(181.82);
    expect(Number(summary.revenueUsd)).toBe(-181.82);
    expect(Number(summary.revenueTjs)).toBe(-2000);
    expect('periodRefundFxUsd' in summary).toBe(false);
    expect(summary.events).toHaveLength(1);
    expect(summary.events![0]).toMatchObject({ kind: 'REFUND', saleId: 'refunded-1', storeName: 'Store 0' });
    expect(Number(summary.events![0].amountUsd)).toBe(-181.82);
    expect(Number(summary.events![0].amountTjs)).toBe(-2000);
  });
});


describe('an exchange row shows the rate of its own day', () => {
  it.each([
    ['its recorded rate', { exchangeRate: 9.35 }],
    ['that day\'s rate for an older exchange without one', {}],
  ])('uses %s, never TJS ÷ the rounded USD (6500 / 695.19 = 9.3499)', async (_label, extra) => {
    const day = new Date('2026-09-14T08:00:00Z');
    rates.byDay.set('2026-09-14', 9.35);
    const sale = { id: 'exchanged-1', storeId: 'store-0', receiptNumber: 7 };
    db.sale.findMany.mockImplementation(async ({ where, select }) => (where.id ? [sale] : []).map((row) => project(row, select)));
    db.auditLog.findMany.mockImplementation(async ({ where, select }) => {
      const actions: string[] = where.action.in ?? [where.action];
      const exchange = { targetId: 'exchanged-1', action: 'EXCHANGE', createdAt: day, financialDetails: {
        newPriceTjs: 6500, newPriceUsd: 695.19, exchangeInValueTjs: 4500, exchangeInValueUsd: 481.28, exchangeProfitUsd: 50, ...extra } };
      const original = { targetId: 'exchanged-1', action: 'SALE', createdAt: new Date('2026-08-01T08:00:00Z'), financialDetails: { recognizedProfitUsd: 10 } };
      return [exchange, original].filter((row) => actions.includes(row.action)).map((row) => project(row, select));
    });
    const summary = await computeReportsSummary({ period: 'SPECIFIC_MONTH', month: '2026-09', includeEvents: true });
    const row = summary.events!.find((e) => e.kind === 'EXCHANGE')!;
    expect(Number(row.rate)).toBe(9.35);
    expect(Number(row.amountTjs)).toBe(2000);
    expect(Number(row.amountUsd)).toBe(213.91);
  });
});
