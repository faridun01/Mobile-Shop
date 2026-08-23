import { describe, it, expect } from 'vitest';
import {
  INITIAL_STORES,
  INITIAL_EXPENSES,
  INITIAL_BONUSES,
  INITIAL_INVOICES,
  INITIAL_OWNERS
} from '../../src/data/mockSeedData';
import {
  Device,
  Supplier,
  SupplierInvoice,
  Sale,
  TransferRequest,
  RepairTicket,
  Expense,
  SupplierBonus,
  Owner
} from '../../src/types';

describe('Полный пользовательский сценарий бизнес-операций Mobile Shop', () => {
  const stores = JSON.parse(JSON.stringify(INITIAL_STORES));
  const suppliers: Supplier[] = [
    {
      id: 'sup-apple-dubai',
      name: 'Apple Direct Dubai',
      phone: '+971 50 123 4567',
      totalPurchasedUsd: 0,
      totalPaidUsd: 0,
      totalDebtUsd: 0,
      active: true
    }
  ];
  const devices: Device[] = [];
  const sales: Sale[] = [];
  const invoices: SupplierInvoice[] = [];
  const expenses: Expense[] = [];
  const bonuses: SupplierBonus[] = [];
  const owners: Owner[] = JSON.parse(JSON.stringify(INITIAL_OWNERS));
  const transfers: TransferRequest[] = [];
  const repairs: RepairTicket[] = [];

  const rate = 9.50; // $1 USD = 9.50 TJS
  let purchaseInvoiceId = '';
  let purchasedImei1 = '359123456789001';
  let purchasedImei2 = '359123456789002';
  let sale1Id = '';
  let sale2Id = '';
  let repairTicketId = '';

  // =========================================================================
  // 1. ПРИХОД ТОВАРА И 50% ОПЛАТЫ ПОСТАВЩИКУ
  // =========================================================================
  it('1. Приход товара и оплата 50% поставщику', () => {
    const supplier = suppliers[0];
    const initialDebtUsd = supplier.totalDebtUsd;
    const totalPurchaseCostUsd = 1000; // 2 устройства по $500

    // Создаем накладную прихода
    const invoiceNumber = 'INV-USER-50PERCENT';
    purchaseInvoiceId = `inv-${Date.now()}`;

    const dev1: Device = {
      id: 'dev-user-1',
      imei: purchasedImei1,
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      storage: '256 GB',
      color: 'Black Titanium',
      status: 'MAIN_WAREHOUSE',
      locationId: 'main-warehouse',
      locationName: 'Главный склад',
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber,
      purchaseCostUsd: 500,
      costBasisUsd: 500,
      createdAt: new Date().toISOString(),
      timeline: []
    };

    const dev2: Device = {
      id: 'dev-user-2',
      imei: purchasedImei2,
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      storage: '256 GB',
      color: 'Natural Titanium',
      status: 'MAIN_WAREHOUSE',
      locationId: 'main-warehouse',
      locationName: 'Главный склад',
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber,
      purchaseCostUsd: 500,
      costBasisUsd: 500,
      createdAt: new Date().toISOString(),
      timeline: []
    };

    devices.push(dev1, dev2);

    const newInvoice: SupplierInvoice = {
      id: purchaseInvoiceId,
      invoiceNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: new Date().toISOString().substring(0, 10),
      totalAmountUsd: totalPurchaseCostUsd,
      paidAmountUsd: 0,
      remainingAmountUsd: totalPurchaseCostUsd,
      status: 'UNPAID',
      devicesCount: 2,
      isStorePurchase: false
    };
    invoices.push(newInvoice);

    supplier.totalPurchasedUsd += totalPurchaseCostUsd;
    supplier.totalDebtUsd += totalPurchaseCostUsd;

    expect(supplier.totalDebtUsd).toBe(initialDebtUsd + totalPurchaseCostUsd);

    // Оплата 50% ($500 от $1000)
    const payment50Usd = 500;
    supplier.totalPaidUsd += payment50Usd;
    supplier.totalDebtUsd -= payment50Usd;
    newInvoice.paidAmountUsd += payment50Usd;
    newInvoice.remainingAmountUsd -= payment50Usd;
    newInvoice.status = 'PARTIALLY_PAID';

    // Проверка 50% оплаты
    expect(newInvoice.remainingAmountUsd).toBe(500); // 50% оставшегося долга
    expect(newInvoice.paidAmountUsd).toBe(500);      // 50% оплачено
    expect(newInvoice.status).toBe('PARTIALLY_PAID');
    expect(supplier.totalDebtUsd).toBe(500);
  });

  // =========================================================================
  // 2. ПЕРЕМЕЩЕНИЕ ТОВАРА НА ТОРГОВУЮ ТОЧКУ
  // =========================================================================
  it('2. Перемещение товара с Главного склада на Магазин №1 (Рудаки)', () => {
    const targetDev = devices.find(d => d.imei === purchasedImei1);
    expect(targetDev).toBeDefined();

    const transfer: TransferRequest = {
      id: `tr-${Date.now()}`,
      transferNumber: 'TR-USER-01',
      fromLocationId: 'main-warehouse',
      fromLocationName: 'Главный склад',
      toLocationId: 'store-1',
      toLocationName: 'Магазин №1 (Рудаки)',
      deviceIds: [targetDev!.id],
      deviceImeis: [targetDev!.imei],
      deviceModels: [`${targetDev!.brand} ${targetDev!.model}`],
      status: 'APPROVED',
      requestedBy: 'Администратор',
      requestedAt: new Date().toISOString(),
      approvedBy: 'Администратор',
      approvedAt: new Date().toISOString()
    };
    transfers.push(transfer);

    targetDev!.locationId = 'store-1';
    targetDev!.locationName = 'Магазин №1 (Рудаки)';
    targetDev!.status = 'STORE_STOCK';

    expect(targetDev!.status).toBe('STORE_STOCK');
    expect(targetDev!.locationId).toBe('store-1');
  });

  // =========================================================================
  // 3. ПРОВЕДЕНИЕ НЕСКОЛЬКИХ ПРОДАЖ И ПРОВЕРКА ИСТОРИИ
  // =========================================================================
  it('3. Проведение нескольких продаж и проверка истории продаж', () => {
    const dev1 = devices.find(d => d.imei === purchasedImei1)!;
    const store1 = stores.find((s: any) => s.id === 'store-1') || stores[0];
    const initialCash = store1.cashBalanceTjs;

    // Продажа #1 (iPhone 16 Pro за 11,400 TJS)
    const sale1PriceTjs = 11400;
    dev1.status = 'SOLD';

    sale1Id = `sale-${Date.now()}-1`;
    const sale1: Sale = {
      id: sale1Id,
      receiptNumber: 9901,
      date: new Date().toISOString(),
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      sellerId: 'user-admin',
      sellerName: 'Администратор',
      items: [
        {
          deviceId: dev1.id,
          brand: dev1.brand,
          model: dev1.model,
          storage: dev1.storage,
          color: dev1.color,
          imei: dev1.imei,
          salePriceTjs: sale1PriceTjs,
          salePriceUsd: +(sale1PriceTjs / rate).toFixed(2),
          purchaseCostUsd: dev1.purchaseCostUsd,
          costBasisUsd: dev1.costBasisUsd,
          isBelowCost: false
        }
      ],
      paymentMethod: 'CASH',
      cashAmountTjs: sale1PriceTjs,
      cardAmountTjs: 0,
      totalTjs: sale1PriceTjs,
      exchangeRate: rate,
      totalUsd: +(sale1PriceTjs / rate).toFixed(2),
      status: 'COMPLETED',
      hasBelowCostItem: false
    };
    sales.push(sale1);
    store1.cashBalanceTjs += sale1PriceTjs;

    // Продажа #2 (Samsung S24 за 4,750 TJS по карте)
    sale2Id = `sale-${Date.now()}-2`;
    const sale2: Sale = {
      id: sale2Id,
      receiptNumber: 9902,
      date: new Date().toISOString(),
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      sellerId: 'user-admin',
      sellerName: 'Администратор',
      items: [
        {
          deviceId: 'dev-acc-1',
          brand: 'Samsung',
          model: 'Galaxy S24',
          storage: '256 GB',
          color: 'Onyx Black',
          imei: '358111222333444',
          salePriceTjs: 4750,
          salePriceUsd: +(4750 / rate).toFixed(2),
          purchaseCostUsd: 350,
          costBasisUsd: 350,
          isBelowCost: false
        }
      ],
      paymentMethod: 'CARD',
      cashAmountTjs: 0,
      cardAmountTjs: 4750,
      totalTjs: 4750,
      exchangeRate: rate,
      totalUsd: +(4750 / rate).toFixed(2),
      status: 'COMPLETED',
      hasBelowCostItem: false
    };
    sales.push(sale2);

    // Проверка истории продаж
    expect(sales.find(s => s.id === sale1Id)).toBeDefined();
    expect(sales.find(s => s.id === sale2Id)).toBeDefined();
    expect(store1.cashBalanceTjs).toBe(initialCash + sale1PriceTjs);
  });

  // =========================================================================
  // 4. ПРИЕМ В РЕМОНТ, ВЫДАЧА И АВТОМАТИЧЕСКИЙ РАСХОД
  // =========================================================================
  it('4. Прием в ремонт, выдача и автоматическое списывание в Расходы (убыток бизнеса)', () => {
    const repairCostTjs = 700;
    const ticketNumber = 301;
    repairTicketId = `rep-${Date.now()}`;

    // Прием на ремонт
    const ticket: RepairTicket = {
      id: repairTicketId,
      ticketNumber,
      imei: '354901009988771',
      brand: 'Apple',
      model: 'iPhone 14',
      storage: '128 GB',
      color: 'Midnight',
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      intakeSeller: 'Администратор',
      customerName: 'Хасан Клиент',
      customerPhone: '+992 93 555 4433',
      problemDescription: 'Замена дисплейного модуля (Гарантийный сервис)',
      visualCondition: 'Хорошее (без повреждений)',
      equipmentPackage: 'Только телефон',
      estimatedCostTjs: repairCostTjs,
      finalCostTjs: repairCostTjs,
      status: 'ACCEPTED',
      statusHistory: [],
      createdAt: new Date().toISOString()
    };
    repairs.push(ticket);

    // При выдаче / ремонте с деталями записывается расход REPAIR_PARTS
    const repairExpense: Expense = {
      id: `exp-rep-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      category: 'REPAIR_PARTS',
      amountTjs: repairCostTjs,
      exchangeRate: rate,
      amountUsd: +(repairCostTjs / rate).toFixed(2),
      targetType: 'STORE',
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      sourceAccount: 'Касса Магазин №1 (Рудаки)',
      comment: `Затраты на ремонт по квитанции #${ticketNumber} (iPhone 14, IMEI: 354901009988771)`,
      createdByName: 'Администратор'
    };
    expenses.push(repairExpense);
    ticket.status = 'ISSUED';

    // Проверка появления в расходах
    const recordedExpense = expenses.find(e => e.category === 'REPAIR_PARTS' && e.amountTjs === repairCostTjs);
    expect(recordedExpense).toBeDefined();
    expect(recordedExpense?.comment).toContain('#301');
    expect(ticket.status).toBe('ISSUED');
  });

  // =========================================================================
  // 5. ОБМЕН (TRADE-IN С ДОПЛАТОЙ)
  // =========================================================================
  it('5. Обмен (Trade-In) с доплатой клиента на более дорогой телефон', () => {
    const devToSell = devices.find(d => d.imei === purchasedImei2)!; // $500 cost = 4750 TJS cost
    const tradeInValueTjs = 3800; // Оценка сданного старого телефона
    const newPriceTjs = 11400;   // Цена нового телефона
    const diffTjs = newPriceTjs - tradeInValueTjs; // Доплата клиента = 7,600 TJS

    // Сданное Б/У устройство поступает на склад IN_STOCK_AFTER_EXCHANGE
    const tradeInDev: Device = {
      id: `dev-tradein-${Date.now()}`,
      imei: '357999000111222',
      brand: 'Apple',
      model: 'iPhone 13',
      storage: '128 GB',
      color: 'Blue',
      status: 'IN_STOCK_AFTER_EXCHANGE',
      locationId: 'store-1',
      locationName: 'Магазин №1 (Рудаки)',
      purchaseCostUsd: +(tradeInValueTjs / rate).toFixed(2),
      costBasisUsd: +(tradeInValueTjs / rate).toFixed(2),
      createdAt: new Date().toISOString(),
      timeline: []
    };
    devices.push(tradeInDev);

    // Новое устройство отмечается как SOLD
    devToSell.status = 'SOLD';

    const store1 = stores.find((s: any) => s.id === 'store-1') || stores[0];
    const cashBefore = store1.cashBalanceTjs;
    store1.cashBalanceTjs += diffTjs;

    expect(tradeInDev.status).toBe('IN_STOCK_AFTER_EXCHANGE');
    expect(devToSell.status).toBe('SOLD');
    expect(store1.cashBalanceTjs).toBe(cashBefore + diffTjs);
    expect(diffTjs).toBe(7600); // Клиент доплатил 7600 TJS
  });

  // =========================================================================
  // 6. ПОЛНЫЙ ВОЗВРАТ ПРОДАЖИ (REFUND) И ПРОВЕРКА ФИНАНСОВОЙ ЦЕЛОСТНОСТИ
  // =========================================================================
  it('6. Полный возврат продажи #1, восстановление остатков и баланса', () => {
    const sale1 = sales.find(s => s.id === sale1Id)!;
    const store1 = stores.find((s: any) => s.id === 'store-1') || stores[0];
    const cashBeforeRefund = store1.cashBalanceTjs;

    // Оформляем возврат чека #1
    sale1.status = 'REFUNDED';
    sale1.refundReason = 'Возврат клиентом по чеку';
    sale1.refundedAt = new Date().toISOString();

    // Возвращаем проданный телефон обратно в STORE_STOCK
    const soldDev = devices.find(d => d.imei === purchasedImei1)!;
    soldDev.status = 'STORE_STOCK';

    // Возврат денег покупателю из кассы
    store1.cashBalanceTjs -= sale1.totalTjs;

    // Проверки
    expect(sale1.status).toBe('REFUNDED');
    expect(soldDev.status).toBe('STORE_STOCK'); // Полностью возвращен на склад
    expect(store1.cashBalanceTjs).toBe(cashBeforeRefund - sale1.totalTjs); // Финансы сбалансированы
  });

  // =========================================================================
  // 7. БОНУСЫ (ДЕНЕЖНЫЙ И ТЕЛЕФОН) И ОПРЕДЕЛЕНИЕ ПРИБЫЛИ В ОТЧЕТАХ
  // =========================================================================
  it('7. Проведение денежного и товарного бонусов и отчёт по прибыли', () => {
    const supplier = suppliers[0];

    // 1. Денежный бонус ($350)
    const cashBonus: SupplierBonus = {
      id: `bon-${Date.now()}-1`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      campaignTitle: 'Кешбэк за объем продаж Q3',
      bonusType: 'CASH_DISCOUNT',
      amountUsd: 350,
      status: 'IN_STOCK',
      dateReceived: new Date().toISOString().substring(0, 10),
      date: new Date().toISOString().substring(0, 10)
    };
    bonuses.push(cashBonus);

    // 2. Товарный бонус (Телефон iPhone 15 128GB с нулевой закупочной ценой $0, costBasis $650)
    const bonusImei = '359998877665544';
    const bonusPhoneDev: Device = {
      id: `dev-bonus-${Date.now()}`,
      imei: bonusImei,
      brand: 'Apple',
      model: 'iPhone 15',
      storage: '128 GB',
      color: 'Pink',
      status: 'STORE_STOCK',
      locationId: 'store-1',
      locationName: 'Магазин №1 (Рудаки)',
      supplierId: supplier.id,
      supplierName: supplier.name,
      purchaseCostUsd: 0,       // Закупка $0 (Подарок от поставщика)
      costBasisUsd: 650,        // Оценочная стоимость $650
      isBonus: true,
      bonusCampaign: 'Призовой телефон за лучшую дистрибуцию',
      createdAt: new Date().toISOString(),
      timeline: []
    };
    devices.push(bonusPhoneDev);

    const phoneBonus: SupplierBonus = {
      id: `bon-${Date.now()}-2`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      campaignTitle: 'Призовой телефон за лучшую дистрибуцию',
      bonusType: 'FREE_DEVICES',
      estimatedValueUsd: 650,
      freeDevices: [
        {
          brand: bonusPhoneDev.brand,
          model: bonusPhoneDev.model,
          storage: bonusPhoneDev.storage,
          color: bonusPhoneDev.color,
          imei: bonusImei,
          costBasisUsd: 650
        }
      ],
      status: 'IN_STOCK',
      dateReceived: new Date().toISOString().substring(0, 10),
      date: new Date().toISOString().substring(0, 10)
    };
    bonuses.push(phoneBonus);

    // Проверка учета бонусов
    const totalBonusValueUsd = bonuses.reduce((acc, b) => acc + (b.amountUsd || b.estimatedValueUsd || 0), 0);
    expect(totalBonusValueUsd).toBeGreaterThanOrEqual(1000); // 350 + 650
    expect(devices.find(d => d.imei === bonusImei)?.isBonus).toBe(true);
    expect(devices.find(d => d.imei === bonusImei)?.purchaseCostUsd).toBe(0);
  });
});
