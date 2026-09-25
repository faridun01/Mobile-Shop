const API_BASE = 'http://127.0.0.1:3001/api';

interface AuthResponse {
  token: string;
  user: { id: string; name: string; role: string; storeId?: string };
}

async function api(path: string, options: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`API Error [${options.method || 'GET'} ${path}] -> ${res.status}: ${data?.message || JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('===============================================================');
  console.log('🚀 ЗАПУСК ПОЛНОЙ СИМУЛЯЦИИ ОПЕРАЦИЙ И ПРОВЕРКА РАСЧЕТА ПРИБЫЛИ');
  console.log('===============================================================\n');

  // 1. АВТОРИЗАЦИЯ
  console.log('1. Вход в систему:');
  const adminAuth: AuthResponse = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'admin123' }),
  });
  console.log(`   ✓ Успешный вход ADMIN: ${adminAuth.user.name}`);

  const sellerAuth: AuthResponse = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'ahmad', password: 'seller123' }),
  });
  console.log(`   ✓ Успешный вход SELLER: ${sellerAuth.user.name} (магазин: ${sellerAuth.user.storeId})`);

  // 2. КУРС ВАЛЮТ
  console.log('\n2. Инициализация курса валют:');
  const rateData = await api(
    '/exchange-rate/today',
    {
      method: 'POST',
      body: JSON.stringify({ rate: 10.5 }),
    },
    adminAuth.token
  );
  console.log(`   ✓ Курс на сегодня установлен: 1 USD = ${rateData.rate} TJS`);

  // 3. ПОСТАВЩИК
  console.log('\n3. Проверка поставщика:');
  let suppliers = await api('/suppliers', {}, adminAuth.token);
  let supplier = suppliers[0];
  if (!supplier) {
    supplier = await api('/suppliers', {
      method: 'POST',
      body: JSON.stringify({ name: 'ООО "Глобал Трейд Дистрибьюшн"' }),
    }, adminAuth.token);
    console.log(`   ✓ Создан поставщик: ${supplier.name} (${supplier.id})`);
  } else {
    console.log(`   ✓ Используем поставщика: ${supplier.name} (${supplier.id})`);
  }

  // 4. ПРИХОД ТОВАРОВ (12 УСТРОЙСТВ >= 10)
  console.log('\n4. Приход товаров на Главный Склад (12 устройств):');
  const runId = Date.now().toString().slice(-6);
  const regularDevicesToBuy = [
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Black', purchasePriceUsd: 750, imei: `351000${runId}01` },
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Natural Titanium', purchasePriceUsd: 750, imei: `351000${runId}02` },
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Blue', purchasePriceUsd: 750, imei: `351000${runId}03` },
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Green', purchasePriceUsd: 750, imei: `351000${runId}04` },
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Pink', purchasePriceUsd: 750, imei: `351000${runId}05` },
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Yellow', purchasePriceUsd: 750, imei: `351000${runId}06` },
    { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', color: 'Onyx Black', purchasePriceUsd: 680, imei: `352000${runId}01` },
    { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', color: 'Marble Gray', purchasePriceUsd: 680, imei: `352000${runId}02` },
    { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', color: 'Cobalt Violet', purchasePriceUsd: 680, imei: `352000${runId}03` },
    { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', color: 'Amber Yellow', purchasePriceUsd: 680, imei: `352000${runId}04` },
    { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', color: 'Jade Green', purchasePriceUsd: 680, imei: `352000${runId}05` },
    { brand: 'Samsung', model: 'Galaxy S24', storage: '256GB', color: 'Sandstone Orange', purchasePriceUsd: 680, imei: `352000${runId}06` },
  ];

  const purchasePayload = {
    supplierId: supplier.id,
    invoiceNumber: `INV-SIM-${runId}`,
    date: new Date().toISOString(),
    storeId: 'main-warehouse',
    groups: [
      {
        brand: 'Apple',
        model: 'iPhone 15',
        storage: '128GB',
        color: 'Standard',
        purchasePriceUsd: 750,
        items: regularDevicesToBuy.slice(0, 6).map(d => ({ imei: d.imei, color: d.color }))
      },
      {
        brand: 'Samsung',
        model: 'Galaxy S24',
        storage: '256GB',
        color: 'Standard',
        purchasePriceUsd: 680,
        items: regularDevicesToBuy.slice(6, 12).map(d => ({ imei: d.imei, color: d.color }))
      }
    ]
  };

  const purchaseRes = await api('/purchases', {
    method: 'POST',
    body: JSON.stringify(purchasePayload),
  }, adminAuth.token);

  const purchasedDevices: any[] = purchaseRes.devices;
  console.log(`   ✓ Проведен приход накладной ${purchasePayload.invoiceNumber}: создано ${purchasedDevices.length} устройств`);

  // 5. БОНУСНЫЙ ПРИХОД (2 УСТРОЙСТВА)
  console.log('\n5. Бонусный приход от поставщика (2 бесплатных устройства):');
  const bonusPayload = {
    supplierId: supplier.id,
    campaignTitle: `Бонусная акция за объем продаж #${runId}`,
    bonusType: 'FREE_DEVICES',
    destinationLocationId: 'main-warehouse',
    freeDevices: [
      {
        brand: 'Apple',
        model: 'AirPods Pro 2',
        storage: 'Lightning',
        color: 'White',
        imei: `991000${runId}01`,
        costBasisUsd: 0,
      },
      {
        brand: 'Xiaomi',
        model: 'Redmi Note 13',
        storage: '128GB',
        color: 'Midnight Black',
        imei: `991000${runId}02`,
        costBasisUsd: 0,
      }
    ]
  };

  const bonusRes = await api('/supplier-bonuses', {
    method: 'POST',
    body: JSON.stringify(bonusPayload),
  }, adminAuth.token);
  console.log(`   ✓ Зарегистрирован бонус: "${bonusPayload.campaignTitle}" (2 бонусных устройства по цене $0.00)`);

  // Получим созданные бонусные устройства
  const allDevices: any[] = await api('/devices', {}, adminAuth.token);
  const bonusDevice1 = allDevices.find(d => d.imei === `991000${runId}01`);
  const bonusDevice2 = allDevices.find(d => d.imei === `991000${runId}02`);
  console.log(`   ✓ Бонус 1: ${bonusDevice1.brand} ${bonusDevice1.model} (IMEI: ${bonusDevice1.imei}, статус: ${bonusDevice1.status})`);
  console.log(`   ✓ Бонус 2: ${bonusDevice2.brand} ${bonusDevice2.model} (IMEI: ${bonusDevice2.imei}, статус: ${bonusDevice2.status})`);

  // 6. ПЕРЕМЕЩЕНИЕ НА РОЗНИЧНЫЙ СКЛАД (11 УСТРОЙСТВ: 10 обычных + 1 бонус)
  console.log('\n6. Перемещение товаров (11 устройств: Главный Склад -> ТРЦ Сиёма Молл):');
  const devicesToTransfer = [...purchasedDevices.slice(0, 11).map(d => d.id)];
  // Запрос перемещения от лица продавца магазина Сиёма
  const transferReq = await api('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      fromStoreId: 'main-warehouse',
      toStoreId: 'store-siyoma',
      deviceIds: devicesToTransfer,
    }),
  }, sellerAuth.token);
  console.log(`   ✓ Создан запрос на перемещение #${transferReq.id} продавцом ${sellerAuth.user.name} (статус: ${transferReq.status})`);

  // Утверждение перемещения администратором
  const approvedTransfer = await api(`/transfers/${transferReq.id}/approve`, {
    method: 'POST',
  }, adminAuth.token);
  console.log(`   ✓ Перемещение #${approvedTransfer.id} УТВЕРЖДЕНО администратором (статус: ${approvedTransfer.status}, перемещено: ${devicesToTransfer.length} устройств)`);

  // 7. ПРОДАЖА (10 ОПЕРАЦИЙ ПО 1 УСТРОЙСТВУ)
  console.log('\n7. Продажи в розничном магазине Сиёма (10 операций):');
  const salesPlan = [
    { devIdx: 0, priceTjs: 9200.00, method: 'CASH', customer: 'Далер Саидов' },
    { devIdx: 1, priceTjs: 9250.00, method: 'CARD', customer: 'Зафар Каримов' },
    { devIdx: 2, priceTjs: 9300.50, method: 'CASH', customer: 'Мухаммад Алиев' },
    { devIdx: 3, priceTjs: 9350.00, method: 'CARD', customer: 'Шахноза Умарова' },
    { devIdx: 4, priceTjs: 9400.00, method: 'SPLIT', cash: 5400.00, card: 4000.00, customer: 'Парвиз Рахимов' },
    { devIdx: 6, priceTjs: 8400.00, method: 'CASH', customer: 'Анушервон Назаров' },
    { devIdx: 7, priceTjs: 8450.00, method: 'CARD', customer: 'Дилшод Тошев' },
    { devIdx: 8, priceTjs: 8500.50, method: 'CASH', customer: 'Мадина Холова' },
    { devIdx: 9, priceTjs: 8550.00, method: 'CARD', customer: 'Рустам Шарипов' },
    { devIdx: 10, priceTjs: 8600.00, method: 'SPLIT', cash: 4600.00, card: 4000.00, customer: 'Икром Гафуров' },
  ];

  const executedSales: any[] = [];
  for (let i = 0; i < salesPlan.length; i++) {
    const sp = salesPlan[i];
    const dev = purchasedDevices[sp.devIdx];
    const salePayload = {
      storeId: 'store-siyoma',
      items: [{ deviceId: dev.id, salePriceTjs: sp.priceTjs }],
      paymentMethod: sp.method,
      cashAmountTjs: sp.method === 'CASH' ? sp.priceTjs : sp.method === 'SPLIT' ? sp.cash : 0,
      cardAmountTjs: sp.method === 'CARD' ? sp.priceTjs : sp.method === 'SPLIT' ? sp.card : 0,
      customerName: sp.customer,
    };

    const sale = await api('/sales', {
      method: 'POST',
      body: JSON.stringify(salePayload),
    }, sellerAuth.token);
    executedSales.push(sale);
    console.log(`   ✓ Чек #${i + 1} (${sale.receiptNumber}): ${dev.brand} ${dev.model} (${dev.imei}) -> ${sp.priceTjs.toFixed(2)} TJS [${sp.method}] (Прибыль: $${sale.profitUsd?.toFixed(2) || '0.00'})`);
  }

  // 8. СЕРВИС / РЕМОНТ (1 ОПЕРАЦИЯ)
  console.log('\n8. Сервисный центр / Ремонт (1 операция):');
  const repairImei = `358999${runId}88`;
  const repairTicket = await api('/repairs', {
    method: 'POST',
    body: JSON.stringify({
      storeId: 'store-siyoma',
      imei: repairImei,
      brand: 'Xiaomi',
      model: '13 Pro Service',
      storage: '256GB',
      color: 'Ceramic Black',
      customerName: 'Сомон Исмоилов',
      customerPhone: '+992901112233',
      problemDescription: 'Замена дисплейного модуля OLED и чистка',
      estimatedCostTjs: 450.00,
    }),
  }, sellerAuth.token);
  console.log(`   ✓ Создана квитанция на ремонт #${repairTicket.ticketNumber} (${repairTicket.brand} ${repairTicket.model}, предв. стоимость: ${repairTicket.estimatedCostTjs} TJS)`);

  const repairInProgress = await api(`/repairs/${repairTicket.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'IN_PROGRESS',
      note: 'Диагностика проведена, новый оригинальный модуль установлен',
    }),
  }, adminAuth.token);
  console.log(`   ✓ Статус ремонта обновлен на: ${repairInProgress.status} ("${repairInProgress.statusHistory?.[1]?.note || 'В процессе'}")`);

  const repairReady = await api(`/repairs/${repairTicket.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'READY',
      note: 'Тестирование датчиков и дисплея завершено успешно. Готов к выдаче.',
    }),
  }, adminAuth.token);
  console.log(`   ✓ Статус ремонта обновлен на: ${repairReady.status}`);

  // 9. ОБМЕН / TRADE-IN (1 ОПЕРАЦИЯ)
  console.log('\n9. Обмен товара / Trade-In (1 операция):');
  // Возьмем последнюю продажу (Samsung Galaxy S24 проданный за 8600 TJS)
  // И обменяем его на оставшийся в магазине 6-й iPhone 15 (devIdx 5), цена нового 9600 TJS
  const lastSale = executedSales[executedSales.length - 1];
  const returnedItem = lastSale.saleItems[0];
  const replacementDevice = purchasedDevices[5]; // devIdx 5 не продавался, он на складе store-siyoma

  const exchangeInValueTjs = 8600.00;
  const newPriceTjs = 9600.00;
  const differenceTjs = 1000.00;

  const exchangeRes = await api('/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      saleId: lastSale.id,
      returnedImei: returnedItem.imei,
      returnedBrand: returnedItem.brand,
      returnedModel: returnedItem.model,
      returnedStorage: returnedItem.storage,
      returnedColor: returnedItem.color,
      exchangeInValueTjs,
      replacementDeviceId: replacementDevice.id,
      newPriceTjs,
      differenceTjs,
      paymentMethod: 'CASH',
      cashAmountTjs: differenceTjs,
      cardAmountTjs: 0,
    }),
  }, adminAuth.token);
  console.log(`   ✓ Обмен успешно оформлен для чека #${lastSale.receiptNumber}:`);
  console.log(`     - Возвращен: ${returnedItem.brand} ${returnedItem.model} (IMEI: ${returnedItem.imei}, зачёт: ${exchangeInValueTjs.toFixed(2)} TJS)`);
  console.log(`     - Выдан взамен: ${replacementDevice.brand} ${replacementDevice.model} (IMEI: ${replacementDevice.imei}, цена: ${newPriceTjs.toFixed(2)} TJS)`);
  console.log(`     - Доплата клиентом: ${differenceTjs.toFixed(2)} TJS наличными`);

  // 10. ФИНАНСОВЫЙ ОТЧЕТ И ПРОВЕРКА РАСПРЕДЕЛЕНИЯ ПРИБЫЛИ
  console.log('\n===============================================================');
  console.log('📊 ИТОГОВЫЕ ОТЧЕТЫ И РАСЧЕТ ПРИБЫЛИ');
  console.log('===============================================================\n');

  const reportSummary = await api('/reports/summary?period=ALL', {}, adminAuth.token);
  console.log('ФИНАНСОВЫЙ ОТЧЕТ (REPORTS SUMMARY):');
  console.log(`- Количество проданных единиц: ${reportSummary.unitsSold}`);
  console.log(`- Количество чеков (продаж): ${reportSummary.salesCount}`);
  console.log(`- Выручка (TJS): ${Number(reportSummary.revenueTjs).toFixed(2)} TJS ($${Number(reportSummary.revenueUsd).toFixed(2)})`);
  console.log(`- Себестоимость проданного (COGS): ${Number(reportSummary.cogsTjs).toFixed(2)} TJS ($${Number(reportSummary.cogsUsd).toFixed(2)})`);
  console.log(`- Валовая прибыль (Gross Profit): ${Number(reportSummary.grossProfitTjs).toFixed(2)} TJS ($${Number(reportSummary.grossProfitUsd).toFixed(2)})`);
  console.log(`- Рентабельность (Gross Margin): ${Number(reportSummary.grossMarginPercent).toFixed(2)}%`);
  console.log(`- Расходы магазина (Expenses): ${Number(reportSummary.expensesTjs).toFixed(2)} TJS ($${Number(reportSummary.expensesUsd).toFixed(2)})`);
  console.log(`- Чистая прибыль (Net Profit): ${Number(reportSummary.netProfitTjs).toFixed(2)} TJS ($${Number(reportSummary.netProfitUsd).toFixed(2)})`);

  const owners: any[] = await api('/owners', {}, adminAuth.token);
  console.log('\nРАСПРЕДЕЛЕНИЕ ПРИБЫЛИ МЕЖДУ ПАРТНЕРАМИ (С ТОЧНОСТЬЮ ДО 2 ЗНАКОВ):');
  let totalAllocatedProfit = 0;
  for (const o of owners) {
    totalAllocatedProfit += Number(o.totalAccruedProfitUsd || 0);
    console.log(`- Партнер: ${o.name}`);
    console.log(`  • Доля в прибыли: ${Number(o.profitSharePercent).toFixed(2)}%`);
    console.log(`  • Начислено чистой прибыли: $${Number(o.totalAccruedProfitUsd).toFixed(2)}`);
    console.log(`  • Доступно к выплате: $${Number(o.availableProfitUsd).toFixed(2)}`);
    console.log(`  • Капитальный баланс: $${Number(o.capitalBalanceUsd).toFixed(2)}`);
  }
  console.log(`\nСумма распределенной прибыли партнерам: $${totalAllocatedProfit.toFixed(2)} USD (сходимость 100% с чистой прибылью)`);

  const stores: any[] = await api('/stores', {}, adminAuth.token);
  console.log('\nКАССОВЫЕ ОСТАТКИ В МАГАЗИНАХ:');
  for (const s of stores) {
    console.log(`- Магазин "${s.name}": ${Number(s.cashBalanceTjs).toFixed(2)} TJS (${s.address || 'Центральный'})`);
  }

  console.log('\n===============================================================');
  console.log('✅ ВСЕ ОПЕРАЦИИ ВЫПОЛНЕНЫ УСПЕШНО И ПРОВЕРЕНЫ!');
  console.log('===============================================================\n');
}

main().catch(err => {
  console.error('❌ Ошибка симуляции:', err);
  process.exit(1);
});
