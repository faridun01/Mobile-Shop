import { app } from '../server/src/app';
import { prisma } from '../server/src/prisma/prisma.service';

async function runE2ETests() {
  console.log('🚀 STARTING IN-MEMORY E2E AUDIT SUITE...\n');
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address() as { port: number };
  const TEST_PORT = address.port;
  const API_BASE = `http://127.0.0.1:${TEST_PORT}/api`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✕ FAILED: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  try {
    // 1. AUTH & LOGIN TEST
    console.log('--- 1. AUTHENTICATION & LOGIN ---');
    let adminToken = '';
    let partnerToken = '';
    let sellerToken = '';

    const adminRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' })
    });
    const adminData = await adminRes.json();
    assert(adminRes.ok && !!adminData.token, 'Login ADMIN (admin / admin123)');
    adminToken = adminData.token;

    const partnerRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'partner', password: 'partner123' })
    });
    const partnerData = await partnerRes.json();
    assert(partnerRes.ok && !!partnerData.token, 'Login PARTNER (partner / partner123)');
    partnerToken = partnerData.token;

    const sellerRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'ahmad', password: 'seller123' })
    });
    const sellerData = await sellerRes.json();
    assert(sellerRes.ok && !!sellerData.token && sellerData.user.role === 'SELLER', 'Login SELLER (ahmad / seller123)');
    sellerToken = sellerData.token;

    const invalidRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'wrongpassword' })
    });
    assert(invalidRes.status === 401, 'Login Reject invalid password');

    // 2. USER MANAGEMENT & SELLER MANDATORY STORE VALIDATION
    console.log('\n--- 2. USERS & MANDATORY SELLER STORE BINDING ---');
    const noStoreSellerRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Test Seller No Store', login: `test_nostore_${Date.now()}`, password: 'password123', role: 'SELLER' })
    });
    assert(noStoreSellerRes.status === 400, 'Reject SELLER creation without storeId (400 Bad Request)');

    const validSellerLogin = `seller_audit_${Date.now()}`;
    const validSellerRes = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Audit Test Seller', login: validSellerLogin, password: 'password123', role: 'SELLER', storeId: 'store-siyoma' })
    });
    const validSellerData = await validSellerRes.json();
    assert(validSellerRes.status === 201 && validSellerData.storeId === 'store-siyoma', 'Create SELLER with mandatory storeId');

    const usersRes = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const users = await usersRes.json();
    assert(usersRes.ok && Array.isArray(users) && users.length >= 4, 'Fetch users list');

    if (validSellerData?.id) {
      await fetch(`${API_BASE}/users/${validSellerData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
    }

    // 3. STORE ISOLATION & STORES API
    console.log('\n--- 3. STORE MANAGEMENT & DATA ISOLATION ---');
    const adminStoresRes = await fetch(`${API_BASE}/stores`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminStores = await adminStoresRes.json();
    assert(adminStoresRes.ok && Array.isArray(adminStores) && adminStores.length >= 2, 'ADMIN fetches all stores');

    const sellerStoresRes = await fetch(`${API_BASE}/stores`, {
      headers: { Authorization: `Bearer ${sellerToken}` }
    });
    const sellerStores = await sellerStoresRes.json();
    assert(sellerStoresRes.ok && Array.isArray(sellerStores) && sellerStores.length === 1 && sellerStores[0].id === 'store-siyoma', 'SELLER fetches ONLY assigned store');

    const newStoreName = `Филиал Аудит ${Date.now()}`;
    const createStoreRes = await fetch(`${API_BASE}/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: newStoreName, address: 'ул. Рудаки 15' })
    });
    const newStore = await createStoreRes.json();
    assert(createStoreRes.status === 201 && newStore.name === newStoreName, 'ADMIN creates new store');

    if (newStore?.id) {
      const delStoreRes = await fetch(`${API_BASE}/stores/${newStore.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert(delStoreRes.ok, 'Delete created store');
    }

    // 4. SUPPLIERS & INVENTORIES / PURCHASES
    console.log('\n--- 4. SUPPLIERS & INVENTORY PURCHASES ---');
    let createdDeviceId = '';
    const suppliersRes = await fetch(`${API_BASE}/suppliers`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    let suppliers = await suppliersRes.json();
    assert(suppliersRes.ok && Array.isArray(suppliers), 'Fetch suppliers list');

    // Self-contained: don't assume a supplier already exists (e.g. right after a
    // clean database reset) — create one if the list is empty.
    if (suppliers.length === 0) {
      const createSupplierRes = await fetch(`${API_BASE}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'E2E Test Supplier' })
      });
      assert(createSupplierRes.ok, 'Create fallback supplier for e2e run');
      suppliers = [await createSupplierRes.json()];
    }

    const supplierId = suppliers[0].id;
    const testImei = `888${Date.now().toString().slice(-12)}`;
    const purchaseRes = await fetch(`${API_BASE}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        supplierId,
        invoiceNumber: `INV-AUDIT-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString(),
        storeId: 'main-warehouse',
        groups: [
          {
            brand: 'Apple',
            model: 'iPhone 15 Pro Audit',
            storage: '256GB',
            color: 'Natural Titanium',
            purchasePriceUsd: 900,
            items: [{ imei: testImei }]
          }
        ]
      })
    });
    const purchaseData = await purchaseRes.json();
    assert(purchaseRes.status === 201 && purchaseData.devices?.length === 1, 'Execute purchase intake for new devices');

    if (purchaseData.devices?.[0]?.id) {
      createdDeviceId = purchaseData.devices[0].id;
    }

    // 5. TRANSFERS BETWEEN STORES
    console.log('\n--- 5. TRANSFERS & WAREHOUSE MOVEMENTS ---');
    if (createdDeviceId) {
      const transferRes = await fetch(`${API_BASE}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          fromStoreId: 'main-warehouse',
          toStoreId: 'store-siyoma',
          deviceIds: [createdDeviceId]
        })
      });
      const transferData = await transferRes.json();
      assert(transferRes.status === 201 && transferData.status === 'PENDING_APPROVAL', 'Create transfer request from main warehouse to Siyoma store');

      if (transferData.id) {
        const approveRes = await fetch(`${API_BASE}/transfers/${transferData.id}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        const approvedData = await approveRes.json();
        assert(approveRes.ok && approvedData.status === 'APPROVED', 'Approve transfer request (moves device to store stock)');
      }
    } else {
      assert(false, 'Transfer request execution (no device created)');
    }

    // 6. POS SALES & REFUNDS
    console.log('\n--- 6. POS SALES & REFUNDS ---');
    let createdSaleId = '';
    if (createdDeviceId) {
      const saleRes = await fetch(`${API_BASE}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          storeId: 'store-siyoma',
          items: [{ deviceId: createdDeviceId, salePriceTjs: 10500 }],
          paymentMethod: 'CASH',
          cashAmountTjs: 10500,
          cardAmountTjs: 0,
          customerName: 'Покупатель Аудит'
        })
      });
      const saleData = await saleRes.json();
      assert(saleRes.status === 201 && saleData.totalTjs === 10500, 'Execute POS sale at store');
      if (saleData.id) createdSaleId = saleData.id;

      if (createdSaleId) {
        const refundRes = await fetch(`${API_BASE}/sales/${createdSaleId}/refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            reason: 'Тестовый возврат при аудите',
            refundAmountTjs: 10500,
            paymentMethod: 'CASH'
          })
        });
        const refundData = await refundRes.json();
        assert(refundRes.ok && refundData.status === 'REFUNDED', 'Process sale refund (restocks device back to inventory)');
      }
    }

    // 7. REPAIRS SERVICE
    console.log('\n--- 7. REPAIRS & SERVICE TICKETS ---');
    const repairImei = `357${Date.now().toString().slice(-12)}`;
    const repairRes = await fetch(`${API_BASE}/repairs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        storeId: 'store-siyoma',
        imei: repairImei,
        brand: 'Samsung',
        model: 'Galaxy S24 Repair Audit',
        storage: '256GB',
        color: 'Phantom Black',
        problemDescription: 'Замена дисплейного модуля'
      })
    });
    const repairData = await repairRes.json();
    assert(repairRes.status === 201 && repairData.status === 'ACCEPTED', 'Create repair ticket');

    if (repairData.id) {
      const updateStatusRes = await fetch(`${API_BASE}/repairs/${repairData.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'IN_PROGRESS', note: 'Диагностика завершена, ремонт начат' })
      });
      const updatedRepair = await updateStatusRes.json();
      assert(updateStatusRes.ok && updatedRepair.status === 'IN_PROGRESS', 'Update repair ticket status to IN_PROGRESS');
    }

    // 8. EXPENSES & FINANCIALS
    console.log('\n--- 8. EXPENSES & FINANCIALS ---');
    const expenseRes = await fetch(`${API_BASE}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        category: 'UTILITIES',
        amountTjs: 250,
        storeId: 'store-siyoma',
        paidFromCashRegister: false,
        description: 'Оплата коммунальных услуг за текущий месяц'
      })
    });
    const expenseData = await expenseRes.json();
    assert(expenseRes.status === 201 && expenseData.amountTjs === 250, 'Create expense entry');

    // 9. AUDIT LOGS & EXCHANGE RATES
    console.log('\n--- 9. AUDIT LOGS & SYSTEM METRICS ---');
    const auditRes = await fetch(`${API_BASE}/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditLogs = await auditRes.json();
    assert(auditRes.ok && Array.isArray(auditLogs) && auditLogs.length > 0, 'Fetch audit logs');

    const rateRes = await fetch(`${API_BASE}/exchange-rate/today`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const rateData = await rateRes.json();
    assert(rateRes.ok && !!rateData.rate, 'Fetch today exchange rate');

    // Cleanup created test device & purchase invoice
    if (createdDeviceId) {
      await prisma.transferItem.deleteMany({ where: { deviceId: createdDeviceId } });
      await prisma.transferRequest.deleteMany({ where: { items: { none: {} } } });
      await prisma.saleItem.deleteMany({ where: { deviceId: createdDeviceId } });
      if (createdSaleId) await prisma.sale.deleteMany({ where: { id: createdSaleId } });
      await prisma.device.deleteMany({ where: { id: createdDeviceId } });
    }
  } finally {
    server.close();
  }

  console.log(`\n==================================================`);
  console.log(`E2E AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runE2ETests().catch((err) => {
  console.error('Fatal E2E test execution error:', err);
  process.exit(1);
});
