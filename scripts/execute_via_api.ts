async function run() {
  const API = 'http://localhost:3002/api';

  console.log('1. Checking health...');
  const healthRes = await fetch(`${API}/health`);
  console.log('Health:', await healthRes.json());

  console.log('2. Logging in as admin...');
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'admin', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  console.log('Logged in! Admin name:', loginData.user?.name);

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // 1. Get stores or create new store
  console.log('3. Getting stores...');
  const storesRes = await fetch(`${API}/stores`, { headers: authHeaders });
  const stores = await storesRes.json();
  console.log('Stores list:', stores.map((s: any) => `${s.name} (${s.id})`));

  let newStore = stores.find((s: any) => s.name === 'Магазин №2 Сомони');
  if (!newStore) {
    console.log('Creating new store...');
    const createStoreRes = await fetch(`${API}/stores`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: 'Магазин №2 Сомони', address: 'пр. Рудаки 15' }),
    });
    newStore = await createStoreRes.json();
    console.log('Created Store:', newStore.name, newStore.id);
  } else {
    console.log('Store already exists:', newStore.name);
  }

  // 2. Get users / employees or create new seller
  console.log('4. Getting users...');
  const usersRes = await fetch(`${API}/users`, { headers: authHeaders });
  const users = await usersRes.json();
  let seller = users.find((u: any) => u.login === 'bahodur');
  if (!seller) {
    console.log('Creating new seller...');
    const createUserRes = await fetch(`${API}/users`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Баходур Продавец',
        login: 'bahodur',
        password: 'seller123',
        role: 'SELLER',
        storeId: newStore.id,
      }),
    });
    seller = await createUserRes.json();
    console.log('Created Seller:', seller.name);
  } else {
    console.log('Seller already exists:', seller.name);
  }

  // 3. Intake 3 phones
  console.log('5. Intake of 3 phones...');
  const suppliersRes = await fetch(`${API}/suppliers`, { headers: authHeaders });
  const suppliers = await suppliersRes.json();
  const mainWarehouse = stores.find((s: any) => s.isMainWarehouse) || stores[0];

  const intakeBody = {
    supplierId: suppliers[0]?.id || 'sup-dubai',
    invoiceNumber: `INV-${Date.now().toString().slice(-5)}`,
    storeId: mainWarehouse.id,
    isStorePurchase: false,
    groups: [
      {
        brand: 'Apple',
        model: 'iPhone 15 Pro',
        storage: '256GB',
        color: 'Black',
        purchasePriceUsd: 800,
        items: [{ imei: '358912345678901' }],
      },
      {
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        storage: '512GB',
        color: 'Titanium',
        purchasePriceUsd: 900,
        items: [{ imei: '358912345678902' }],
      },
      {
        brand: 'Xiaomi',
        model: '14 Ultra',
        storage: '512GB',
        color: 'Black',
        purchasePriceUsd: 700,
        items: [{ imei: '358912345678903' }],
      },
    ],
  };

  const purchaseRes = await fetch(`${API}/purchases`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(intakeBody),
  });
  const purchaseResult = await purchaseRes.json();
  console.log('Purchase result:', purchaseRes.status, purchaseResult.message || `Created ${purchaseResult.devices?.length} devices`);

  // Get devices list
  const devRes = await fetch(`${API}/devices`, { headers: authHeaders });
  const allDevices = await devRes.json();
  console.log('Total devices count:', allDevices.length);

  const phone1 = allDevices.find((d: any) => d.imei === '358912345678901');
  const phone2 = allDevices.find((d: any) => d.imei === '358912345678902');
  const phone3 = allDevices.find((d: any) => d.imei === '358912345678903');

  // 4. Transfer 3 phones to New Store
  console.log('6. Transferring 3 phones to New Store...');
  const transferDeviceIds = [phone1?.id, phone2?.id, phone3?.id].filter(Boolean);
  if (transferDeviceIds.length > 0) {
    const transferRes = await fetch(`${API}/transfers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        fromStoreId: mainWarehouse.id,
        toStoreId: newStore.id,
        deviceIds: transferDeviceIds,
      }),
    });
    const transferResult = await transferRes.json();
    console.log('Transfer status:', transferRes.status, transferResult);

    // If transfer needs approval or auto-approved
    if (transferResult.id) {
      await fetch(`${API}/transfers/${transferResult.id}/approve`, {
        method: 'POST',
        headers: authHeaders,
      });
      console.log('Transfer approved!');
    }
  }

  // 5. Make 2 Sales in New Store
  console.log('7. Making 2 Sales...');
  if (phone1) {
    const sale1Res = await fetch(`${API}/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storeId: newStore.id,
        customerName: 'Давлат',
        paymentMethod: 'CASH',
        cashAmountTjs: 9500,
        totalTjs: 9500,
        items: [
          {
            deviceId: phone1.id,
            salePriceTjs: 9500,
            salePriceUsd: 1000,
          },
        ],
      }),
    });
    console.log('Sale 1 status:', sale1Res.status);
  }

  if (phone2) {
    const sale2Res = await fetch(`${API}/sales`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storeId: newStore.id,
        customerName: 'Собир',
        paymentMethod: 'CARD',
        cardAmountTjs: 10500,
        totalTjs: 10500,
        items: [
          {
            deviceId: phone2.id,
            salePriceTjs: 10500,
            salePriceUsd: 1105.26,
          },
        ],
      }),
    });
    console.log('Sale 2 status:', sale2Res.status);
  }

  // 6. Make 1 Trade-In / Exchange
  console.log('8. Making 1 Exchange...');
  if (phone3) {
    const exchangeRes = await fetch(`${API}/exchanges`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storeId: newStore.id,
        customerName: 'Алишер',
        returnedDevice: {
          imei: '351111111111111',
          brand: 'Apple',
          model: 'iPhone 13',
          storage: '128GB',
          color: 'Blue',
          estimatedValueTjs: 4000,
        },
        replacementDeviceId: phone3.id,
        newPriceTjs: 8200,
        paymentMethod: 'CASH',
        cashAmountTjs: 4200,
      }),
    });
    console.log('Exchange status:', exchangeRes.status);
  }

  // 7. Make 1 Repair intake
  console.log('9. Creating 1 Repair ticket...');
  const repairRes = await fetch(`${API}/repairs`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      storeId: newStore.id,
      imei: '357777777777777',
      brand: 'Apple',
      model: 'iPhone 12',
      storage: '128GB',
      color: 'Black',
      customerName: 'Ислом Каримов',
      customerPhone: '+992931112233',
      problemDescription: 'Замена оригинального дисплея',
      estimatedCostTjs: 550,
    }),
  });
  console.log('Repair status:', repairRes.status);

  // 8. Add 1 Expense
  console.log('10. Creating 1 Expense...');
  const expenseRes = await fetch(`${API}/expenses`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      category: 'Аренда и коммунальные',
      amountTjs: 350,
      storeId: newStore.id,
      description: 'Оплата интернета и аренды помещения точки №2',
      paidFromCashRegister: true,
    }),
  });
  console.log('Expense status:', expenseRes.status);

  console.log('=== ALL STEPS COMPLETED VIA LIVE API! ===');
}

run().catch(console.error);
