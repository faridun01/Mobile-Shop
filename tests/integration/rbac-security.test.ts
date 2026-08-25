import { describe, it, expect, beforeAll } from 'vitest';
import { apiCall, login, isServerReachable } from './api-client';

/**
 * RBAC / store-scope / auth security regression suite.
 *
 * Exercises the real, running API (server/src/index.ts) against a real Postgres
 * database — no mocks. Requires the dev stack to be up: see tests/integration/README.md.
 *
 * Every case here corresponds to a concrete bypass found and fixed during the
 * 2026-08-25 security review:
 *  - SELLER could create a transfer FROM a store they don't belong to (fromStoreId spoofing)
 *  - SELLER could read/write expenses against another store's cash register
 *  - SELLER could read cross-store transfer/repair history
 *  - SELLER could tamper with another store's repair ticket status
 *  - SELLER could process a trade-in exchange against another store's sale
 *  - SELLER/PARTNER could read supplier debt data the UI hides from them
 *  - WebSocket accepted unauthenticated/forged-token connections and leaked cross-store events
 */

const serverUp = await isServerReachable();
if (!serverUp) {
  // eslint-disable-next-line no-console
  console.warn(
    `[rbac-security.test.ts] Skipping: no API server reachable at ${process.env.API_BASE_URL || 'http://localhost:3002'}. ` +
      'Start the dev stack (Postgres + `npx tsx server/src/index.ts`) to run this suite — see tests/integration/README.md.',
  );
}

let adminToken: string;
let partnerToken: string;
let sellerToken: string; // assigned to store-siyoma
const storeSiyomaId = 'store-siyoma';
const mainWarehouseId = 'main-warehouse';

beforeAll(async () => {
  if (!serverUp) return;
  adminToken = await login('admin', 'admin123');
  partnerToken = await login('partner', 'partner123');
  sellerToken = await login('ahmad', 'seller123');
});

describe.runIf(serverUp)('RBAC & store-scope security', () => {
  it('rejects requests with no token', async () => {
    const res = await apiCall(null, 'GET', '/api/owners');
    expect(res.status).toBe(401);
  });

  it('rejects a forged/invalid JWT', async () => {
    const res = await apiCall('not.a.real.jwt', 'GET', '/api/owners');
    expect(res.status).toBe(401);
  });

  it('SELLER cannot escalate to ADMIN-only routes (create user, view audit log, reset owner capital)', async () => {
    if (!serverUp) return;
    expect((await apiCall(sellerToken, 'POST', '/api/users', { login: 'x', password: 'x', name: 'x', role: 'ADMIN' })).status).toBe(403);
    expect((await apiCall(sellerToken, 'GET', '/api/audit-logs')).status).toBe(403);
    expect((await apiCall(sellerToken, 'POST', '/api/owners/reset-capital')).status).toBe(403);
  });

  it('PARTNER cannot escalate to ADMIN-only routes', async () => {
    if (!serverUp) return;
    expect((await apiCall(partnerToken, 'POST', '/api/users', { login: 'x', password: 'x', name: 'x', role: 'ADMIN' })).status).toBe(403);
    expect((await apiCall(partnerToken, 'GET', '/api/audit-logs')).status).toBe(403);
    expect((await apiCall(partnerToken, 'POST', '/api/owners/reset-capital')).status).toBe(403);
  });

  it('SELLER cannot create purchases, direct-transfer, or refund sales (ADMIN/PARTNER-only actions)', async () => {
    if (!serverUp) return;
    expect(
      (
        await apiCall(sellerToken, 'POST', '/api/purchases', {
          supplierId: 'sup-1', invoiceNumber: 'RBAC-T', date: new Date().toISOString(), storeId: storeSiyomaId, groups: [],
        })
      ).status,
    ).toBe(403);
    expect((await apiCall(sellerToken, 'POST', '/api/transfers/direct', { fromStoreId: storeSiyomaId, toStoreId: mainWarehouseId, deviceIds: [] })).status).toBe(403);

    const sale = (await apiCall(adminToken, 'GET', '/api/sales')).json[0];
    if (sale) {
      expect((await apiCall(sellerToken, 'POST', `/api/sales/${sale.id}/refund`, { reason: 'x', refundAmountTjs: 1, paymentMethod: 'CASH' })).status).toBe(403);
    }
  });

  it('SELLER cannot read supplier debt/invoice data hidden from their role', async () => {
    if (!serverUp) return;
    expect((await apiCall(sellerToken, 'GET', '/api/suppliers')).status).toBe(403);
    expect((await apiCall(sellerToken, 'GET', '/api/supplier-invoices')).status).toBe(403);
    expect((await apiCall(sellerToken, 'GET', '/api/supplier-bonuses')).status).toBe(403);
  });

  it("SELLER's device list is forced to their own store regardless of the storeId query param", async () => {
    if (!serverUp) return;
    const res = await apiCall<any[]>(sellerToken, 'GET', `/api/devices?storeId=${mainWarehouseId}`);
    expect(res.status).toBe(200);
    expect(res.json.some((d) => d.storeId === mainWarehouseId)).toBe(false);
  });

  it('SELLER cannot create a transfer FROM a store they are not assigned to (fromStoreId spoofing)', async () => {
    if (!serverUp) return;
    const mainDevices = (await apiCall<any[]>(adminToken, 'GET', `/api/devices?storeId=${mainWarehouseId}`)).json;
    const device = mainDevices.find((d) => d.status === 'MAIN_WAREHOUSE');
    const res = await apiCall(sellerToken, 'POST', '/api/transfers', {
      fromStoreId: mainWarehouseId,
      toStoreId: storeSiyomaId,
      deviceIds: device ? [device.id] : [],
    });
    expect(res.status).toBe(403);
  });

  it('SELLER cannot sell a device belonging to a different store by ID substitution', async () => {
    if (!serverUp) return;
    const mainDevices = (await apiCall<any[]>(adminToken, 'GET', `/api/devices?storeId=${mainWarehouseId}`)).json;
    const device = mainDevices.find((d) => d.status === 'MAIN_WAREHOUSE');
    const res = await apiCall(sellerToken, 'POST', '/api/sales', {
      storeId: mainWarehouseId, // body storeId is overridden server-side to the seller's own store
      items: device ? [{ deviceId: device.id, salePriceTjs: 100 }] : [],
      paymentMethod: 'CASH',
    });
    // Either 400 (device not found in the seller's actual store) — never a successful sale of foreign stock
    expect(res.status).not.toBe(201);
  });

  describe('cross-store isolation with two genuinely distinct stores', () => {
    let store2Id: string;
    let store2DeviceId: string;
    let store2DeviceImei: string;
    let store2SaleId: string;

    beforeAll(async () => {
      if (!serverUp) return;
      const store2 = await apiCall(adminToken, 'POST', '/api/stores', { name: `RBAC-Test-${Date.now()}` });
      store2Id = store2.json.id;

      const supplier = (await apiCall<any[]>(adminToken, 'GET', '/api/suppliers')).json[0];
      const purchase = await apiCall(adminToken, 'POST', '/api/purchases', {
        supplierId: supplier.id,
        invoiceNumber: `RBAC-INV-${Date.now()}`,
        date: new Date().toISOString(),
        isStorePurchase: true,
        storeId: store2Id,
        groups: [{ brand: 'RBACTest', model: 'RBACTest', storage: '1GB', color: 'x', purchasePriceUsd: 1, imeis: [`RBACIMEI${Date.now()}`] }],
      });
      store2DeviceId = purchase.json.devices[0].id;
      store2DeviceImei = purchase.json.devices[0].imei;

      const rate = await apiCall(adminToken, 'GET', '/api/exchange-rate/today');
      if (!rate.json) await apiCall(adminToken, 'POST', '/api/exchange-rate/today', { rate: 10 });

      const sale = await apiCall(adminToken, 'POST', '/api/sales', {
        storeId: store2Id,
        items: [{ deviceId: store2DeviceId, salePriceTjs: 500 }],
        paymentMethod: 'CASH',
      });
      store2SaleId = sale.json.id;
    });

    it('expenses booked against another store are invisible to a SELLER in a different store', async () => {
      if (!serverUp) return;
      const expense = await apiCall(adminToken, 'POST', '/api/expenses', {
        category: 'OTHER', amountTjs: 100, storeId: store2Id, comment: 'cross-store-isolation-check', paidFromCashRegister: false,
      });
      const sellerExpenses = await apiCall<any[]>(sellerToken, 'GET', '/api/expenses');
      expect(sellerExpenses.json.some((e) => e.id === expense.json.id)).toBe(false);
    });

    it('a SELLER-submitted expense storeId is forced to their own store, never an arbitrary one', async () => {
      if (!serverUp) return;
      const res = await apiCall(sellerToken, 'POST', '/api/expenses', { category: 'OTHER', amountTjs: 10, storeId: store2Id });
      expect(res.json.storeId).toBe(storeSiyomaId);
    });

    it('repair tickets from another store are invisible to, and cannot be tampered with by, a SELLER in a different store', async () => {
      if (!serverUp) return;
      const repair = await apiCall(adminToken, 'POST', '/api/repairs', {
        storeId: store2Id, imei: `REPAIR-RBAC-${Date.now()}`, brand: 'Test', model: 'Test', problemDescription: 'test',
      });
      const sellerRepairs = await apiCall<any[]>(sellerToken, 'GET', '/api/repairs');
      expect(sellerRepairs.json.some((r) => r.id === repair.json.id)).toBe(false);

      const tamper = await apiCall(sellerToken, 'PATCH', `/api/repairs/${repair.json.id}/status`, { status: 'IN_PROGRESS' });
      expect(tamper.status).toBe(403);
    });

    it('a SELLER cannot process a trade-in exchange against a sale from another store', async () => {
      if (!serverUp) return;
      const res = await apiCall(sellerToken, 'POST', '/api/exchanges', {
        saleId: store2SaleId,
        returnedImei: store2DeviceImei,
        returnedBrand: 'X',
        returnedModel: 'X',
        exchangeInValueTjs: 50,
        replacementDeviceId: 'irrelevant',
        newPriceTjs: 100,
      });
      expect(res.status).toBe(403);
    });

    it('transfer history is scoped to stores the SELLER actually belongs to', async () => {
      if (!serverUp) return;
      const transfers = await apiCall<any[]>(sellerToken, 'GET', '/api/transfers');
      expect(transfers.json.every((t) => t.fromStoreId === storeSiyomaId || t.toStoreId === storeSiyomaId)).toBe(true);
    });
  });
});
