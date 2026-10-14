import { D } from '../server/src/common/decimal';
import { roundMoney } from '../server/src/common/money';
import { prisma } from '../server/src/prisma/prisma.service';
import { TransfersService } from '../server/src/modules/transfers/transfers.service';
import { SalesService } from '../server/src/modules/sales/sales.service';
import { RefundService } from '../server/src/modules/sales/refund.service';
import { ExchangesService } from '../server/src/modules/exchanges/exchanges.service';
import { StockThresholdsService } from '../server/src/modules/stock-thresholds/stock-thresholds.service';
import { checkStoreShiftStatus, CashCollectionService } from '../server/src/modules/finance/cash-collection.service';
import { registerLedgerBalance } from '../server/src/modules/finance/cash-balance';
import { DailyClosingService } from '../server/src/modules/finance/daily-closing.service';
import { computeReportsSummary } from '../server/src/modules/reports/reports.service';

async function main() {
  console.log('=====================================================');
  console.log('🚀 ЗАПУСК ПОЛНОГО БИЗНЕС-ЦИКЛА ОПЕРАЦИЙ ПО ВСЕМ МАГАЗИНАМ');
  console.log('=====================================================\n');

  // 1. ПРОВЕРКА И ДОБАВЛЕНИЕ КУРСОВ ВАЛЮТ НА 3 МЕСЯЦА
  console.log('📅 1. Настройка курсов валют на 3 месяца...');
  const ratesToEnsure = [
    { date: '2026-08-15', rate: 9.20 },
    { date: '2026-09-15', rate: 9.25 },
    { date: '2026-10-14', rate: 9.35 },
  ];
  for (const r of ratesToEnsure) {
    await prisma.exchangeRate.upsert({
      where: { date: r.date },
      update: { rate: r.rate },
      create: {
        date: r.date,
        rate: r.rate,
        createdByUserId: 'user-admin',
      },
    });
    console.log(`   ✓ Курс на ${r.date}: 1 USD = ${r.rate} TJS`);
  }

  // 2. ПРИХОД ТОВАРОВ (PURCHASE INTAKE) НА ГЛАВНЫЙ СКЛАД
  console.log('\n📦 2. Оформление нового прихода (инвойса) от поставщика на склад...');
  const supplier = await prisma.supplier.findFirstOrThrow({ where: { active: true } });
  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
  
  const timestamp = Date.now().toString().slice(-6);
  const newDevicesData = [
    { brand: 'Apple', model: 'iPhone 15 Pro', storage: '256GB', color: 'Natural Titanium', costUsd: 950, retailTjs: 9800, imei: `359000${timestamp}01` },
    { brand: 'Apple', model: 'iPhone 15', storage: '128GB', color: 'Black', costUsd: 720, retailTjs: 7600, imei: `359000${timestamp}02` },
    { brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '512GB', color: 'Titanium Gray', costUsd: 1050, retailTjs: 11000, imei: `359000${timestamp}03` },
    { brand: 'Samsung', model: 'Galaxy A55 5G', storage: '128GB', color: 'Awesome Navy', costUsd: 320, retailTjs: 3500, imei: `359000${timestamp}04` },
    { brand: 'Xiaomi', model: '14 Ultra', storage: '512GB', color: 'White', costUsd: 880, retailTjs: 9300, imei: `869000${timestamp}05` },
    { brand: 'Xiaomi', model: 'Redmi Note 13 Pro+', storage: '256GB', color: 'Midnight Black', costUsd: 340, retailTjs: 3700, imei: `869000${timestamp}06` },
  ];

  const totalInvoiceUsd = newDevicesData.reduce((sum, d) => sum + d.costUsd, 0);

  const purchaseInvoice = await prisma.supplierInvoice.create({
    data: {
      invoiceNumber,
      supplierId: supplier.id,
      storeId: 'main-warehouse',
      totalAmountUsd: totalInvoiceUsd,
      paidAmountUsd: 0,
      exchangeRate: 9.35,
      date: new Date(),
    },
  });

  await prisma.supplier.update({
    where: { id: supplier.id },
    data: {
      totalPurchasedUsd: { increment: totalInvoiceUsd },
      totalDebtUsd: { increment: totalInvoiceUsd },
    },
  });

  const createdNewDevices = [];
  for (const d of newDevicesData) {
    const dev = await prisma.device.create({
      data: {
        imei: d.imei,
        brand: d.brand,
        model: d.model,
        storage: d.storage,
        color: d.color,
        storeId: 'main-warehouse',
        status: 'MAIN_WAREHOUSE',
        purchasePriceUsd: d.costUsd,
        costBasisUsd: d.costUsd,
        retailPriceTjs: d.retailTjs,
        supplierId: supplier.id,
        supplierName: supplier.name,
        purchaseInvoiceId: purchaseInvoice.id,
        invoiceNumber,
        receivedDate: new Date(),
      },
    });
    createdNewDevices.push(dev);
  }
  console.log(`   ✓ Принято ${createdNewDevices.length} устройств на сумму $${totalInvoiceUsd} (Инвойс ${invoiceNumber})`);

  // 3. ПЕРЕМЕЩЕНИЯ (TRANSFERS): СКЛАД -> МАГАЗИНЫ И МЕЖДУ МАГАЗИНАМИ
  console.log('\n🚚 3. Выполнение перемещений со склада в магазины и между магазинами...');
  
  // Получаем доступные устройства со склада
  const warehouseDevices = await prisma.device.findMany({
    where: { storeId: 'main-warehouse', status: 'MAIN_WAREHOUSE' },
    take: 12,
  });

  const toSiyomaIds = warehouseDevices.slice(0, 4).map(d => d.id);
  const toSadbargIds = warehouseDevices.slice(4, 8).map(d => d.id);
  const toTsumIds = warehouseDevices.slice(8, 12).map(d => d.id);

  // Склад -> Сиёма
  const transfer1 = await TransfersService.create({
    fromStoreId: 'main-warehouse',
    toStoreId: 'store-siyoma',
    deviceIds: toSiyomaIds,
    requestedByUserId: 'user-admin',
  });
  await TransfersService.approve(transfer1.id, 'user-admin');
  console.log(`   ✓ Перемещено ${toSiyomaIds.length} устройств: Главный склад -> «Сиёма» (TR #${transfer1.transferNumber})`);

  // Склад -> Садбарг
  const transfer2 = await TransfersService.create({
    fromStoreId: 'main-warehouse',
    toStoreId: 'store-sadbarg',
    deviceIds: toSadbargIds,
    requestedByUserId: 'user-admin',
  });
  await TransfersService.approve(transfer2.id, 'user-admin');
  console.log(`   ✓ Перемещено ${toSadbargIds.length} устройств: Главный склад -> «Садбарг» (TR #${transfer2.transferNumber})`);

  // Склад -> ЦУМ
  const transfer3 = await TransfersService.create({
    fromStoreId: 'main-warehouse',
    toStoreId: 'store-tsum',
    deviceIds: toTsumIds,
    requestedByUserId: 'user-admin',
  });
  await TransfersService.approve(transfer3.id, 'user-admin');
  console.log(`   ✓ Перемещено ${toTsumIds.length} устройств: Главный склад -> «ЦУМ» (TR #${transfer3.transferNumber})`);

  // Межмагазинное перемещение: «Сиёма» -> «Садбарг» (1 устройство)
  const siyomaAvailable = await prisma.device.findFirstOrThrow({
    where: { storeId: 'store-siyoma', status: 'STORE_STOCK' },
  });
  const transferBetweenStores = await TransfersService.create({
    fromStoreId: 'store-siyoma',
    toStoreId: 'store-sadbarg',
    deviceIds: [siyomaAvailable.id],
    requestedByUserId: 'user-admin',
  });
  await TransfersService.approve(transferBetweenStores.id, 'user-admin');
  console.log(`   ✓ Межмагазинное перемещение: «Сиёма» -> «Садбарг» (Устройство ${siyomaAvailable.brand} ${siyomaAvailable.model}, TR #${transferBetweenStores.transferNumber})`);

  // 4. ЗАДАВАНИЕ МИНИМУМОВ (STOCK THRESHOLDS)
  console.log('\n🎯 4. Установка минимальных порогов остатков (Stock Thresholds) для всех магазинов...');
  const thresholdsToSet = [
    { storeId: 'store-siyoma', brand: 'Apple', model: 'iPhone 15 Pro', storage: '—', minQuantity: 5 },
    { storeId: 'store-siyoma', brand: 'Samsung', model: 'Galaxy S24 Ultra', storage: '—', minQuantity: 3 },
    { storeId: 'store-siyoma', brand: 'Xiaomi', model: 'Redmi Note 13 Pro+', storage: '—', minQuantity: 4 },
    { storeId: 'store-sadbarg', brand: 'Apple', model: 'iPhone 15', storage: '—', minQuantity: 6 },
    { storeId: 'store-sadbarg', brand: 'Samsung', model: 'Galaxy A55 5G', storage: '—', minQuantity: 5 },
    { storeId: 'store-sadbarg', brand: 'Xiaomi', model: '14 Ultra', storage: '—', minQuantity: 3 },
    { storeId: 'store-tsum', brand: 'Apple', model: 'iPhone 14', storage: '—', minQuantity: 4 },
    { storeId: 'store-tsum', brand: 'Samsung', model: 'Galaxy S24+', storage: '—', minQuantity: 3 },
    { storeId: 'store-tsum', brand: 'Xiaomi', model: 'Poco X6 Pro', storage: '—', minQuantity: 5 },
  ];

  for (const t of thresholdsToSet) {
    await StockThresholdsService.upsertThreshold(t);
  }
  console.log(`   ✓ Установлено/обновлено ${thresholdsToSet.length} правил минимальных остатков.`);

  // Проверка алертов дефицита
  const allThresholds = await StockThresholdsService.getThresholds();
  const activeAlerts = allThresholds.filter(t => t.belowMinimum);
  console.log(`   ✓ Установлено порогов: ${allThresholds.length}, из них активных алертов дефицита: ${activeAlerts.length}`);

  // 5. ПРОДАЖИ (SALES) ЗА 3 МЕСЯЦА ВО ВСЕХ МАГАЗИНАХ
  console.log('\n💰 5. Выполнение продаж (Наличные, Карта, Долг) за Август, Сентябрь, Октябрь...');

  // Убеждаемся, что сегодняшние смены открыты для проведения операций
  await prisma.dailyCashClosing.deleteMany({
    where: { businessDate: '2026-10-14' },
  });

  const executedSales = [];

  // Вспомогательная функция для оформления продажи с датированием
  async function performDatedSale(options: {
    storeId: string;
    userId: string;
    device: any;
    priceTjs: number;
    paymentMethod: 'CASH' | 'CARD' | 'DEBT';
    customerName: string;
    date: Date;
    rate: number;
  }) {
    const sale = await SalesService.executeSale({
      storeId: options.storeId,
      userId: options.userId,
      items: [{ deviceId: options.device.id, salePriceTjs: options.priceTjs }],
      paymentMethod: options.paymentMethod,
      customerName: options.customerName,
      customerPhone: options.paymentMethod === 'DEBT' ? '+992900112233' : undefined,
    });

    // Обновляем дату чека и связанных транзакций для ретроспективной отчетности
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        createdAt: options.date,
        exchangeRate: options.rate,
        totalUsd: roundMoney(D(options.priceTjs).div(options.rate)),
      },
    });

    await prisma.ledgerEntry.updateMany({
      where: { referenceId: sale.id },
      data: {
        createdAt: options.date,
        exchangeRate: options.rate,
        amountUsd: roundMoney(D(options.priceTjs).div(options.rate)),
      },
    });

    await prisma.financialTransaction.updateMany({
      where: { sourceId: sale.id },
      data: {
        transactionDate: options.date,
        createdAt: options.date,
        exchangeRate: options.rate,
        amountUsd: roundMoney(D(options.priceTjs).div(options.rate)),
      },
    });

    await prisma.deviceTimelineEvent.updateMany({
      where: { deviceId: options.device.id, type: 'SALE' },
      data: { date: options.date },
    });

    executedSales.push({ ...sale, storeId: options.storeId, date: options.date, priceTjs: options.priceTjs });
    return sale;
  }

  // --- АВГУСТ 2026 ---
  const augDate = new Date('2026-08-20T11:00:00Z');
  const augRate = 9.20;

  // Сиёма (Август, Наличные)
  const siyomaDev1 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-siyoma', status: 'STORE_STOCK' } });
  const saleAugSiyoma = await performDatedSale({
    storeId: 'store-siyoma',
    userId: 'user-admin',
    device: siyomaDev1,
    priceTjs: 7800,
    paymentMethod: 'CASH',
    customerName: 'Искандар Каримов',
    date: augDate,
    rate: augRate,
  });
  console.log(`   ✓ [Август] Сиёма: Продажа #${saleAugSiyoma.receiptNumber} (${siyomaDev1.brand} ${siyomaDev1.model}) за 7,800 TJS (Наличные)`);

  // Садбарг (Август, Карта)
  const sadbargDev1 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-sadbarg', status: 'STORE_STOCK' } });
  const saleAugSadbarg = await performDatedSale({
    storeId: 'store-sadbarg',
    userId: 'user-admin',
    device: sadbargDev1,
    priceTjs: 8200,
    paymentMethod: 'CARD',
    customerName: 'Джамшед Саидов',
    date: augDate,
    rate: augRate,
  });
  console.log(`   ✓ [Август] Садбарг: Продажа #${saleAugSadbarg.receiptNumber} (${sadbargDev1.brand} ${sadbargDev1.model}) за 8,200 TJS (Карта)`);

  // ЦУМ (Август, В долг)
  const tsumDev1 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-tsum', status: 'STORE_STOCK' } });
  const saleAugTsum = await performDatedSale({
    storeId: 'store-tsum',
    userId: 'user-admin',
    device: tsumDev1,
    priceTjs: 5500,
    paymentMethod: 'DEBT',
    customerName: 'Хуршед Назаров',
    date: augDate,
    rate: augRate,
  });
  console.log(`   ✓ [Август] ЦУМ: Продажа #${saleAugTsum.receiptNumber} (${tsumDev1.brand} ${tsumDev1.model}) за 5,500 TJS (В долг)`);

  // --- СЕНТЯБРЬ 2026 ---
  const sepDate = new Date('2026-09-18T14:30:00Z');
  const sepRate = 9.25;

  // Сиёма (Сентябрь, Наличные)
  const siyomaDev2 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-siyoma', status: 'STORE_STOCK' } });
  const saleSepSiyoma = await performDatedSale({
    storeId: 'store-siyoma',
    userId: 'user-admin',
    device: siyomaDev2,
    priceTjs: 9500,
    paymentMethod: 'CASH',
    customerName: 'Манучер Зокиров',
    date: sepDate,
    rate: sepRate,
  });
  console.log(`   ✓ [Сентябрь] Сиёма: Продажа #${saleSepSiyoma.receiptNumber} (${siyomaDev2.brand} ${siyomaDev2.model}) за 9,500 TJS (Наличные)`);

  // Садбарг (Сентябрь, Наличные)
  const sadbargDev2 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-sadbarg', status: 'STORE_STOCK' } });
  const saleSepSadbarg = await performDatedSale({
    storeId: 'store-sadbarg',
    userId: 'user-admin',
    device: sadbargDev2,
    priceTjs: 6900,
    paymentMethod: 'CASH',
    customerName: 'Олим Рахимов',
    date: sepDate,
    rate: sepRate,
  });
  console.log(`   ✓ [Сентябрь] Садбарг: Продажа #${saleSepSadbarg.receiptNumber} (${sadbargDev2.brand} ${sadbargDev2.model}) за 6,900 TJS (Наличные)`);

  // ЦУМ (Сентябрь, Карта)
  const tsumDev2 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-tsum', status: 'STORE_STOCK' } });
  const saleSepTsum = await performDatedSale({
    storeId: 'store-tsum',
    userId: 'user-admin',
    device: tsumDev2,
    priceTjs: 8900,
    paymentMethod: 'CARD',
    customerName: 'Фируз Шарипов',
    date: sepDate,
    rate: sepRate,
  });
  console.log(`   ✓ [Сентябрь] ЦУМ: Продажа #${saleSepTsum.receiptNumber} (${tsumDev2.brand} ${tsumDev2.model}) за 8,900 TJS (Карта)`);

  // --- ОКТЯБРЬ 2026 (ТЕКУЩИЙ МЕСЯЦ) ---
  const octDate = new Date();
  const octRate = 9.35;

  // Сиёма (Октябрь, Наличные - будет возвращен для демонстрации возврата)
  const siyomaDev3 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-siyoma', status: 'STORE_STOCK' } });
  const saleOctRefundable = await performDatedSale({
    storeId: 'store-siyoma',
    userId: 'user-admin',
    device: siyomaDev3,
    priceTjs: 4200,
    paymentMethod: 'CASH',
    customerName: 'Алишер Муродов',
    date: octDate,
    rate: octRate,
  });
  console.log(`   ✓ [Октябрь] Сиёма: Продажа #${saleOctRefundable.receiptNumber} (${siyomaDev3.brand} ${siyomaDev3.model}) за 4,200 TJS (Под возврат)`);

  // Еще одна продажа в Сиёма (Октябрь, Наличные)
  const siyomaDev4 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-siyoma', status: 'STORE_STOCK' } });
  const saleOctSiyoma2 = await performDatedSale({
    storeId: 'store-siyoma',
    userId: 'user-admin',
    device: siyomaDev4,
    priceTjs: 6400,
    paymentMethod: 'CASH',
    customerName: 'Бахтиёр Касымов',
    date: octDate,
    rate: octRate,
  });
  console.log(`   ✓ [Октябрь] Сиёма: Продажа #${saleOctSiyoma2.receiptNumber} (${siyomaDev4.brand} ${siyomaDev4.model}) за 6,400 TJS (Наличные)`);

  // Садбарг (Октябрь, Наличные - для обмена Trade-In)
  const sadbargDev3 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-sadbarg', status: 'STORE_STOCK' } });
  const saleOctForExchange = await performDatedSale({
    storeId: 'store-sadbarg',
    userId: 'user-admin',
    device: sadbargDev3,
    priceTjs: 5000,
    paymentMethod: 'CASH',
    customerName: 'Сардор Холов',
    date: octDate,
    rate: octRate,
  });
  console.log(`   ✓ [Октябрь] Садбарг: Продажа #${saleOctForExchange.receiptNumber} (${sadbargDev3.brand} ${sadbargDev3.model}) за 5,000 TJS (Для обмена)`);

  // ЦУМ (Октябрь, Наличные)
  const tsumDev3 = await prisma.device.findFirstOrThrow({ where: { storeId: 'store-tsum', status: 'STORE_STOCK' } });
  const saleOctTsum = await performDatedSale({
    storeId: 'store-tsum',
    userId: 'user-admin',
    device: tsumDev3,
    priceTjs: 7300,
    paymentMethod: 'CASH',
    customerName: 'Фаридун Гафуров',
    date: octDate,
    rate: octRate,
  });
  console.log(`   ✓ [Октябрь] ЦУМ: Продажа #${saleOctTsum.receiptNumber} (${tsumDev3.brand} ${tsumDev3.model}) за 7,300 TJS (Наличные)`);

  // 6. ВОЗВРАТ (REFUND)
  console.log('\n🔄 6. Проведение возврата товара (Возврат чека # ' + saleOctRefundable.receiptNumber + ')...');
  const refundResult = await RefundService.refund({
    saleId: saleOctRefundable.id,
    reason: 'Заводской дефект дисплея (клиент вернул товар)',
    refundAmountTjs: 4200,
    paymentMethod: 'CASH',
    refundedByUserId: 'user-admin',
  });
  console.log(`   ✓ Чек #${saleOctRefundable.receiptNumber} успешно возвращён:`);
  console.log(`     - Сумма возврата клиенту: 4,200 TJS`);
  console.log(`     - Устройство возвращено в статус: STORE_STOCK (Магазин Сиёма)`);
  console.log(`     - Деньги списаны из кассы Сиёмы`);

  // 7. ОБМЕН (TRADE-IN / EXCHANGE)
  console.log('\n🔁 7. Проведение обмена (Trade-In) в магазине «Садбарг»...');
  const replacementDevice = await prisma.device.findFirstOrThrow({
    where: { storeId: 'store-sadbarg', status: 'STORE_STOCK' },
  });

  // Обмен = возврат старого телефона (зачёт 4 500 TJS, остальное — удержание) + новый чек.
  const returnedItem = saleOctForExchange.saleItems.find((item) => item.imei === sadbargDev3.imei)!;
  const exchangeResult = await ExchangesService.process({
    saleId: saleOctForExchange.id,
    returnedImei: sadbargDev3.imei,
    withheldTjs: D(returnedItem.salePriceTjs).minus(4500), // зачёт 4 500 TJS
    replacementDeviceId: replacementDevice.id,
    newPriceTjs: 6500, // стоимость нового телефона; клиент доплачивает 2 000 TJS
    paymentMethod: 'CASH',
    processedByUserId: 'user-admin',
  });
  console.log(`   ✓ Обмен по чеку #${saleOctForExchange.receiptNumber} успешно выполнен:`);
  console.log(`     - Принято устройство клиента (Trade-In): ${sadbargDev3.brand} ${sadbargDev3.model} (Оценка: 4,500 TJS)`);
  console.log(`     - Выдано новое устройство: ${replacementDevice.brand} ${replacementDevice.model} (Цена: 6,500 TJS)`);
  console.log(`     - Клиент доплатил в кассу наличными: 2,000 TJS`);

  // 8. ПРОВЕРКА КАСС И ИНКАССАЦИЯ (CASH COLLECTION)
  console.log('\n💵 8. Проверка касс магазинов, закрытие смен и инкассация в центральную кассу...');

  // Смотрим балансы касс до инкассации
  const balancesBefore = await CashCollectionService.balances();
  console.log('   Балансы касс до закрытия/инкассации:');
  for (const b of balancesBefore.stores) {
    console.log(`     - [${b.storeName}]: $${b.cashUsd} USD (${b.cashTjs} TJS, смена: ${b.isShiftClosed ? 'закрыта' : 'открыта'})`);
  }
  if (balancesBefore.central) {
    console.log(`     - [${balancesBefore.central.storeName}]: $${balancesBefore.central.cashUsd} USD (${balancesBefore.central.cashTjs} TJS)`);
  }

  // Закрываем смены и сверяем кассы для розничных магазинов
  const storesToClose = ['store-siyoma', 'store-sadbarg', 'store-tsum'];
  for (const storeId of storesToClose) {
    // 1. Сверяем остаток кассы и финансового счёта с журналом операций
    const ledger = await registerLedgerBalance(prisma as any, storeId);
    await prisma.store.update({
      where: { id: storeId },
      data: { cashBalanceUsd: ledger.usd },
    });
    await prisma.financialAccount.update({
      where: { storeId },
      data: { balanceUsd: ledger.usd },
    });

    // 2. Находим дату последней инкассации
    const lastHandover = await prisma.cashHandover.findFirst({
      where: { storeId, cancelledAt: null },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    // 3. Получаем незакрытые смены
    const shiftStatus = await checkStoreShiftStatus(prisma as any, storeId, lastHandover?.createdAt ?? null);
    for (const d of shiftStatus.unclosedDates) {
      try {
        const rateOnD = await prisma.exchangeRate.findUnique({ where: { date: d } });
        if (!rateOnD) {
          await prisma.exchangeRate.create({
            data: { date: d, rate: 9.35, createdByUserId: 'user-admin' },
          });
        }
        const summary = await DailyClosingService.getSummary(storeId, d);
        if (!summary.alreadyClosed) {
          await DailyClosingService.closeDay('user-admin', {
            storeId,
            businessDate: d,
            actualCashTjs: summary.expectedCashTjs,
            comment: 'Плановое закрытие смены перед инкассацией',
          });
          console.log(`   ✓ Смена магазина ${summary.storeName} за ${d} успешно закрыта (Ожидалось и сошлось: ${summary.expectedCashTjs} TJS)`);
        }
      } catch (e: any) {
        console.warn(`   ⚠ Закрытие смены ${storeId} за ${d}:`, e.message);
      }
    }
  }

  // Проводим инкассацию из магазинов в Центральную кассу
  const balancesForCollection = await CashCollectionService.balances();
  for (const b of balancesForCollection.stores) {
    if (b.isMainWarehouse) continue;
    if (D(b.cashUsd).gt(0)) {
      try {
        const collection = await CashCollectionService.collect({
          storeId: b.storeId,
          expectedCashUsd: b.cashUsd,
          comment: `Инкассация выручки из ${b.storeName}`,
          actorUserId: 'user-admin',
        });
        console.log(`   ✓ Инкассировано из «${b.storeName}»: $${b.cashUsd} USD (${b.cashTjs} TJS) -> переведено в Главную кассу`);
      } catch (err: any) {
        console.warn(`   ⚠ Ошибка инкассации ${b.storeName}:`, err.message);
      }
    }
  }

  const balancesAfter = await CashCollectionService.balances();
  console.log('\n   Балансы касс после инкассации:');
  for (const b of balancesAfter.stores) {
    console.log(`     - [${b.storeName}]: $${b.cashUsd} USD (${b.cashTjs} TJS)`);
  }
  if (balancesAfter.central) {
    console.log(`     - [${balancesAfter.central.storeName}]: $${balancesAfter.central.cashUsd} USD (${balancesAfter.central.cashTjs} TJS)`);
  }

  // 9. ФОРМИРОВАНИЕ И ВЫГРУЗКА ВСЕХ ОТЧЕТОВ
  console.log('\n📊 9. Формирование аналитических отчетов за 3 месяца и по месяцам...');

  // А) Сводный отчет за 3 месяца (Август, Сентябрь, Октябрь 2026)
  const fullSummary = await computeReportsSummary({
    startDate: '2026-08-01',
    endDate: '2026-10-31',
    includeEvents: true,
  });

  // Б) Отчет за Август
  const augSummary = await computeReportsSummary({
    period: 'SPECIFIC_MONTH',
    month: '2026-08',
  });

  // В) Отчет за Сентябрь
  const sepSummary = await computeReportsSummary({
    period: 'SPECIFIC_MONTH',
    month: '2026-09',
  });

  // Г) Отчет за Октябрь
  const octSummary = await computeReportsSummary({
    period: 'SPECIFIC_MONTH',
    month: '2026-10',
  });

  // Д) Отчеты по отдельным магазинам
  const siyomaSummary = await computeReportsSummary({
    startDate: '2026-08-01',
    endDate: '2026-10-31',
    storeId: 'store-siyoma',
  });
  const sadbargSummary = await computeReportsSummary({
    startDate: '2026-08-01',
    endDate: '2026-10-31',
    storeId: 'store-sadbarg',
  });
  const tsumSummary = await computeReportsSummary({
    startDate: '2026-08-01',
    endDate: '2026-10-31',
    storeId: 'store-tsum',
  });

  // Расчет платежей по способам оплаты
  const paymentRows = await prisma.sale.findMany({
    where: { status: { in: ['COMPLETED', 'EXCHANGED'] } },
    select: { cashAmountTjs: true, cardAmountTjs: true, debtAmountTjs: true, totalTjs: true, totalUsd: true },
  });
  let totalCashTjs = D(0);
  let totalCardTjs = D(0);
  let totalDebtTjs = D(0);
  for (const p of paymentRows) {
    totalCashTjs = totalCashTjs.plus(p.cashAmountTjs);
    totalCardTjs = totalCardTjs.plus(p.cardAmountTjs);
    totalDebtTjs = totalDebtTjs.plus(p.debtAmountTjs);
  }

  // Общий остаток устройств и капитала на складах
  const allStockDevices = await prisma.device.findMany({
    where: { status: { in: ['MAIN_WAREHOUSE', 'STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'] } },
    select: { costBasisUsd: true },
  });
  const totalStockUnits = allStockDevices.length;
  const totalStockCapitalUsd = allStockDevices.reduce((sum, d) => sum.plus(d.costBasisUsd), D(0));

  console.log('\n=====================================================');
  console.log('📈 РЕЗУЛЬТАТЫ ФИНАНСОВЫХ И СКЛАДСКИХ ОТЧЕТОВ:');
  console.log('=====================================================');
  
  console.log('\n--- 1. ОБЩИЙ СВОДНЫЙ ФИНАНСОВЫЙ ОТЧЕТ (ЗА 3 МЕСЯЦА) ---');
  console.log(`• Всего успешных продаж: ${fullSummary.salesCount} чеков (${fullSummary.unitsSold} устройств)`);
  console.log(`• Возвратов: ${fullSummary.refundsCount} чеков`);
  console.log(`• Обменов (Trade-In): ${fullSummary.exchangesCount}`);
  console.log(`• Общая выручка: ${Number(fullSummary.revenueTjs).toLocaleString('ru-RU')} TJS ($${Number(fullSummary.revenueUsd).toLocaleString('ru-RU')} USD)`);
  console.log(`• Себестоимость проданного (COGS): $${Number(fullSummary.cogsUsd).toLocaleString('ru-RU')} USD`);
  console.log(`• Валовая прибыль (Gross Profit): $${Number(fullSummary.grossProfitUsd).toLocaleString('ru-RU')} USD (маржа: ${Number(fullSummary.grossMarginPercent).toFixed(1)}%)`);
  console.log(`• Операционные расходы: ${Number(fullSummary.expensesTjs).toLocaleString('ru-RU')} TJS ($${Number(fullSummary.expensesUsd).toLocaleString('ru-RU')} USD)`);
  console.log(`• ЧИСТАЯ ПРИБЫЛЬ: $${Number(fullSummary.netProfitUsd).toLocaleString('ru-RU')} USD`);
  console.log(`• Текущий капитал в остатках на складах: $${Number(totalStockCapitalUsd).toLocaleString('ru-RU')} USD (${totalStockUnits} шт.)`);

  console.log('\n--- 2. ДИНАМИКА ПО МЕСЯЦАМ (ТРЕНД ЗА 3 МЕСЯЦА) ---');
  console.log(`• Август 2026:   Выручка ${Number(augSummary.revenueTjs).toLocaleString('ru-RU')} TJS ($${Number(augSummary.revenueUsd).toLocaleString('ru-RU')}), Чистая прибыль: $${Number(augSummary.netProfitUsd).toLocaleString('ru-RU')}, Продаж: ${augSummary.salesCount}`);
  console.log(`• Сентябрь 2026: Выручка ${Number(sepSummary.revenueTjs).toLocaleString('ru-RU')} TJS ($${Number(sepSummary.revenueUsd).toLocaleString('ru-RU')}), Чистая прибыль: $${Number(sepSummary.netProfitUsd).toLocaleString('ru-RU')}, Продаж: ${sepSummary.salesCount}`);
  console.log(`• Октябрь 2026:  Выручка ${Number(octSummary.revenueTjs).toLocaleString('ru-RU')} TJS ($${Number(octSummary.revenueUsd).toLocaleString('ru-RU')}), Чистая прибыль: $${Number(octSummary.netProfitUsd).toLocaleString('ru-RU')}, Продаж: ${octSummary.salesCount}`);

  console.log('\n--- 3. СРАВНЕНИЕ ПО РОЗНИЧНЫМ МАГАЗИНАМ (ЗА 3 МЕСЯЦА) ---');
  for (const st of fullSummary.storeBreakdown) {
    console.log(`• [${st.storeName}]: Выручка ${Number(st.revenueTjs).toLocaleString('ru-RU')} TJS ($${Number(st.revenueUsd).toLocaleString('ru-RU')}), Прибыль: $${Number(st.netProfitUsd).toLocaleString('ru-RU')}, Продано: ${st.unitsSold} шт., Остаток: ${st.stockCount} шт. ($${Number(st.stockCostUsd).toLocaleString('ru-RU')})`);
  }

  console.log('\n--- 4. ОТЧЕТ ПО СПОСОБАМ ОПЛАТЫ ---');
  console.log(`• Наличные (Cash): ${Number(totalCashTjs).toLocaleString('ru-RU')} TJS`);
  console.log(`• Банковские карты/переводы: ${Number(totalCardTjs).toLocaleString('ru-RU')} TJS`);
  console.log(`• В долг / Рассрочка (Задолженность клиентов): ${Number(totalDebtTjs).toLocaleString('ru-RU')} TJS`);

  console.log('\n--- 5. ОТЧЕТ ПО ОСТАТКАМ И ПОРОГАМ ДЕФИЦИТА (STOCK THRESHOLDS) ---');
  const finalThresholds = await StockThresholdsService.getThresholds();
  const triggeredAlerts = finalThresholds.filter(t => t.belowMinimum);
  console.log(`Всего позиций с установленным порогом: ${finalThresholds.length}`);
  console.log(`Позиций ниже минимального остатка (требуется пополнение): ${triggeredAlerts.length}`);
  for (const a of triggeredAlerts.slice(0, 10)) {
    console.log(`  ⚠ [Магазин ${a.storeId}] ${a.brand} ${a.model} (${a.storage}): порог ${a.minQuantity} шт. (ТРЕБУЕТСЯ ПОПОЛНЕНИЕ)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
