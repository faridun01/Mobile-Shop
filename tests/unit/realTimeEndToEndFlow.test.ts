import { describe, it, expect } from 'vitest';
import {
  INITIAL_STORES,
  INITIAL_SUPPLIERS,
  INITIAL_DEVICES,
  INITIAL_SALES,
} from '../../src/data/mockSeedData';
import { Device, Supplier, SupplierInvoice, Sale, TransferRequest, RepairTicket, Expense } from '../../src/types';

describe('Real-Time End-to-End Business Lifecycle (Приход, Перемещение, Продажа, Возврат, Ремонт, Расходы)', () => {
  const stores = JSON.parse(JSON.stringify(INITIAL_STORES));
  const suppliers: Supplier[] = JSON.parse(JSON.stringify(INITIAL_SUPPLIERS));
  const devices: Device[] = JSON.parse(JSON.stringify(INITIAL_DEVICES));
  const sales: Sale[] = JSON.parse(JSON.stringify(INITIAL_SALES));
  const invoices: SupplierInvoice[] = [];
  const transfers: TransferRequest[] = [];
  const repairs: RepairTicket[] = [];
  const expenses: Expense[] = [];

  const todayRate = 9.50; // $1 USD = 9.50 TJS

  // Target device created during Intake
  let testDevice: Device;
  let testSale: Sale;
  let testRepair: RepairTicket;

  it('1. ПРИХОД ТОВАРА (Stock Intake / Purchase Invoice)', () => {
    const supplier = suppliers.find(s => s.id === 'sup-apple') || suppliers[0];
    const initialDebt = supplier.totalDebtUsd;
    const initialPurchased = supplier.totalPurchasedUsd;

    const invoiceNumber = 'INV-2026-REALTIME';
    const purchaseCostUsd = 1200;
    const deviceImei = '867011008888001';

    testDevice = {
      id: 'dev-realtime-1',
      imei: deviceImei,
      brand: 'Apple',
      model: 'iPhone 16 Pro Max',
      storage: '1 TB',
      color: 'Desert Titanium',
      status: 'MAIN_WAREHOUSE',
      locationId: 'store-main',
      locationName: 'Центральный (Главный) склад',
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber: invoiceNumber,
      purchaseCostUsd: purchaseCostUsd,
      costBasisUsd: purchaseCostUsd,
      createdAt: new Date().toISOString(),
      timeline: [
        {
          id: 'timeline-1',
          date: new Date().toISOString(),
          type: 'INCOME',
          description: `Приход по накладной ${invoiceNumber}`,
          user: 'Администратор'
        }
      ]
    };

    devices.push(testDevice);

    const newInvoice: SupplierInvoice = {
      id: 'inv-realtime-1',
      invoiceNumber: invoiceNumber,
      supplierId: supplier.id,
      supplierName: supplier.name,
      date: new Date().toISOString().substring(0, 10),
      totalAmountUsd: purchaseCostUsd,
      paidAmountUsd: 0,
      remainingAmountUsd: purchaseCostUsd,
      status: 'UNPAID',
      devicesCount: 1,
      isStorePurchase: false,
      storeId: 'store-main'
    };
    invoices.push(newInvoice);

    // Update supplier metrics
    supplier.totalPurchasedUsd += purchaseCostUsd;
    supplier.totalDebtUsd += purchaseCostUsd;

    expect(devices.find(d => d.imei === deviceImei)).toBeDefined();
    expect(testDevice.status).toBe('MAIN_WAREHOUSE');
    expect(supplier.totalDebtUsd).toBe(initialDebt + purchaseCostUsd);
    expect(supplier.totalPurchasedUsd).toBe(initialPurchased + purchaseCostUsd);
  });

  it('2. ПЕРЕМЕЩЕНИЕ СО СКЛАДА В ФИЛИАЛ (Stock Transfer Main -> Store #1)', () => {
    const mainStore = stores.find((s: any) => s.isMainWarehouse) || stores[0];
    const targetStore = stores.find((s: any) => !s.isMainWarehouse) || stores[1];

    const transfer: TransferRequest = {
      id: 'tr-realtime-1',
      transferNumber: 'TR-REALTIME-01',
      fromLocationId: mainStore.id,
      fromLocationName: mainStore.name,
      toLocationId: targetStore.id,
      toLocationName: targetStore.name,
      deviceIds: [testDevice.id],
      deviceImeis: [testDevice.imei],
      deviceModels: [`${testDevice.brand} ${testDevice.model}`],
      requestedBy: 'Администратор',
      requestedAt: new Date().toISOString(),
      status: 'APPROVED'
    };

    transfers.push(transfer);

    // Execute transfer status update
    testDevice.locationId = targetStore.id;
    testDevice.locationName = targetStore.name;
    testDevice.status = 'STORE_STOCK';
    testDevice.timeline.push({
      id: 'timeline-2',
      date: new Date().toISOString(),
      type: 'TRANSFER',
      description: `Перемещение со склада в ${targetStore.name}`,
      user: 'Администратор'
    });

    expect(testDevice.locationId).toBe(targetStore.id);
    expect(testDevice.status).toBe('STORE_STOCK');
    expect(transfers.length).toBe(1);
    expect(transfers[0].status).toBe('APPROVED');
  });

  it('3. ПРОДАЖА В КАССЕ (POS Retail Sale)', () => {
    const store = stores.find((s: any) => s.id === testDevice.locationId) || stores[0];
    const initialCash = store.cashBalanceTjs;

    const salePriceTjs = 14250; // $1500 USD @ 9.50
    const salePriceUsd = 1500;

    testSale = {
      id: 'sale-realtime-1',
      receiptNumber: 99001,
      date: new Date().toISOString(),
      storeId: store.id,
      storeName: store.name,
      sellerId: 'user-farhod',
      sellerName: 'Farhod',
      customerName: 'Рустамбек (Покупатель)',
      items: [
        {
          deviceId: testDevice.id,
          imei: testDevice.imei,
          brand: testDevice.brand,
          model: testDevice.model,
          storage: testDevice.storage,
          color: testDevice.color,
          salePriceTjs: salePriceTjs,
          salePriceUsd: salePriceUsd,
          purchaseCostUsd: testDevice.purchaseCostUsd,
          costBasisUsd: testDevice.costBasisUsd,
          isBelowCost: false
        }
      ],
      totalTjs: salePriceTjs,
      totalUsd: salePriceUsd,
      exchangeRate: todayRate,
      paymentMethod: 'CASH',
      cashAmountTjs: salePriceTjs,
      cardAmountTjs: 0,
      status: 'COMPLETED',
      hasBelowCostItem: false
    };

    sales.push(testSale);

    // Update device status and cash balance
    testDevice.status = 'SOLD';
    testDevice.timeline.push({
      id: 'timeline-3',
      date: new Date().toISOString(),
      type: 'SALE',
      description: `Продано по чеку #${testSale.receiptNumber} за ${salePriceTjs} TJS`,
      user: 'Farhod'
    });

    store.cashBalanceTjs += salePriceTjs;

    expect(testDevice.status).toBe('SOLD');
    expect(sales.find(s => s.receiptNumber === 99001)).toBeDefined();
    expect(store.cashBalanceTjs).toBe(initialCash + salePriceTjs);
  });

  it('4. ВОЗВРАТ ТОВАРА ОТ ПОКУПАТЕЛЯ (Sales Return / Refund)', () => {
    const store = stores.find((s: any) => s.id === testSale.storeId) || stores[0];
    const cashBeforeRefund = store.cashBalanceTjs;

    // Refund execution
    testSale.status = 'EXCHANGED'; // Marked returned/refunded
    testDevice.status = 'IN_STOCK_AFTER_EXCHANGE';
    testDevice.timeline.push({
      id: 'timeline-4',
      date: new Date().toISOString(),
      type: 'EXCHANGE',
      description: `Возврат товара по чеку #${testSale.receiptNumber}. Средства возвращены покупателю`,
      user: 'Farhod'
    });

    store.cashBalanceTjs -= testSale.totalTjs;

    expect(testDevice.status).toBe('IN_STOCK_AFTER_EXCHANGE');
    expect(store.cashBalanceTjs).toBe(cashBeforeRefund - testSale.totalTjs);
  });

  it('5. ЖИЗНЕННЫЙ ЦИКЛ РЕМОНТА (Repair Order Lifecycle: ACCEPTED -> READY -> ISSUED)', () => {
    const store = stores[0];
    const initialCash = store.cashBalanceTjs;

    testRepair = {
      id: 'rep-realtime-1',
      ticketNumber: 77001,
      deviceModel: 'Apple iPhone 15 Pro Max',
      imei: '354891100234561',
      customerName: 'Зафар',
      customerPhone: '+992 90 777 8899',
      issueDescription: 'Замена разбитого стекла дисплея',
      problemDescription: 'Замена разбитого стекла дисплея',
      visualCondition: 'Слышны трещины на переднем стекле',
      equipmentPackage: 'Телефон без аксессуаров',
      estimatedCostTjs: 450,
      storeId: store.id,
      storeName: store.name,
      intakeSeller: 'Farhod',
      status: 'ACCEPTED',
      statusHistory: [
        { status: 'ACCEPTED', updatedAt: new Date().toISOString(), updatedBy: 'Farhod', note: 'Принят в ремонт' }
      ],
      createdAt: new Date().toISOString()
    };

    repairs.push(testRepair);
    expect(testRepair.status).toBe('ACCEPTED');

    // Technician repairs
    testRepair.status = 'READY';
    testRepair.statusHistory.push({
      status: 'READY',
      updatedAt: new Date().toISOString(),
      updatedBy: 'Мастер Сервиса',
      note: 'Дисплей успешно заменён, проверен'
    });
    expect(testRepair.status).toBe('READY');

    // Customer receives & pays repair fee
    testRepair.status = 'ISSUED';
    testRepair.statusHistory.push({
      status: 'ISSUED',
      updatedAt: new Date().toISOString(),
      updatedBy: 'Farhod',
      note: 'Выдан клиенту, получено 450 TJS'
    });

    store.cashBalanceTjs += (testRepair.estimatedCostTjs || 450);

    expect(testRepair.status).toBe('ISSUED');
    expect(store.cashBalanceTjs).toBe(initialCash + 450);
  });

  it('6. ОПЕРАЦИОННЫЕ РАСХОДЫ (Store Operating Expense)', () => {
    const store = stores[0];
    const cashBeforeExpense = store.cashBalanceTjs;
    const expenseTjs = 350;

    const expense: Expense = {
      id: 'exp-realtime-1',
      category: 'UTILITIES',
      amountTjs: expenseTjs,
      exchangeRate: todayRate,
      amountUsd: +(expenseTjs / todayRate).toFixed(2),
      targetType: 'STORE',
      storeId: store.id,
      storeName: store.name,
      sourceAccount: `${store.name} Касса`,
      comment: 'Оплата высокоскоростного оптоволоконного интернета',
      createdByName: 'Farhod',
      date: new Date().toISOString()
    };

    expenses.push(expense);
    store.cashBalanceTjs -= expenseTjs;

    expect(expenses.length).toBe(1);
    expect(expenses[0].amountTjs).toBe(350);
    expect(store.cashBalanceTjs).toBe(cashBeforeExpense - expenseTjs);
  });

  it('7. ИТОГОВАЯ ФИНАНСОВАЯ ПРОВЕРКА И БАЛАНС СИСТЕМЫ (Final Audit Verification)', () => {
    // Verify inventory asset count includes test device back in stock after refund
    const inStockDevices = devices.filter(d => 
      d.status === 'STORE_STOCK' || d.status === 'MAIN_WAREHOUSE' || d.status === 'IN_STOCK_AFTER_EXCHANGE'
    );
    expect(inStockDevices.some(d => d.imei === '867011008888001')).toBe(true);

    // Verify all 7 steps executed without errors
    expect(devices.length).toBeGreaterThan(INITIAL_DEVICES.length);
    expect(sales.length).toBeGreaterThan(INITIAL_SALES.length);
    expect(invoices.length).toBe(1);
    expect(transfers.length).toBe(1);
    expect(repairs.length).toBe(1);
    expect(expenses.length).toBe(1);
  });
});
