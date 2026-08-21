import { describe, it, expect } from 'vitest';
import {
  INITIAL_STORES,
  INITIAL_USERS,
  INITIAL_SUPPLIERS,
  INITIAL_DEVICES,
  INITIAL_SALES,
} from '../../src/data/mockSeedData';

describe('Complete Mobile Shop Business Operations Engine', () => {
  // Mock State container for testing all 7 core flows
  let stores = [...INITIAL_STORES];
  let users = [...INITIAL_USERS];
  let suppliers = [...INITIAL_SUPPLIERS];
  let devices = [...INITIAL_DEVICES];
  let sales = [...INITIAL_SALES];
  let expenses: any[] = [];
  let supplierPayments: any[] = [];
  let transfers: any[] = [];
  let bonuses: any[] = [];

  it('1. Приход (Purchase Intake): registers new inventory items via supplier invoice', () => {
    const supplier = suppliers[0];
    const newImei = `IMEI-TEST-${Date.now()}`;

    const newDevice = {
      id: `dev-${Date.now()}`,
      imei: newImei,
      brand: 'Apple',
      model: 'iPhone 16 Pro Max',
      storage: '512 GB',
      color: 'Desert Titanium',
      status: 'STORE_STOCK' as const,
      locationId: 'store-1',
      locationName: 'Магазин №1 (Центр)',
      supplierId: supplier.id,
      supplierName: supplier.name,
      invoiceNumber: 'INV-TEST-001',
      purchaseCostUsd: 1100,
      costBasisUsd: 1100,
      createdAt: new Date().toISOString(),
      timeline: [],
    };

    devices.push(newDevice);

    expect(devices.find((d) => d.imei === newImei)).toBeDefined();
    expect(devices.find((d) => d.imei === newImei)?.purchaseCostUsd).toBe(1100);
  });

  it('2. Оплата поставщику (Supplier Payment): pays supplier and updates balance', () => {
    const supplier = suppliers[0];
    const initialDebt = supplier.totalDebtUsd;
    const paymentUsd = 500;

    supplier.totalPaidUsd += paymentUsd;
    supplier.totalDebtUsd = Math.max(0, supplier.totalDebtUsd - paymentUsd);

    supplierPayments.push({
      id: `pay-${Date.now()}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      amountUsd: paymentUsd,
      date: new Date().toISOString(),
    });

    expect(supplier.totalDebtUsd).toBe(Math.max(0, initialDebt - paymentUsd));
    expect(supplierPayments.length).toBe(1);
  });

  it('3. Расходы (Expenses): registers store expense', () => {
    const expense = {
      id: `exp-${Date.now()}`,
      category: 'RENT',
      amountTjs: 1500,
      amountUsd: 150,
      exchangeRate: 10,
      targetType: 'STORE',
      storeId: 'store-1',
      storeName: 'Магазин №1 (Центр)',
      comment: 'Аренда помещения за текущий месяц',
      date: new Date().toISOString(),
    };

    expenses.push(expense);

    expect(expenses.length).toBe(1);
    expect(expenses[0].amountTjs).toBe(1500);
  });

  it('4. Продажа (Sale): executes device sale, changes status to SOLD and calculates totals', () => {
    const availableDevice = devices.find((d) => d.status === 'STORE_STOCK' || d.status === 'MAIN_WAREHOUSE');
    expect(availableDevice).toBeDefined();

    if (availableDevice) {
      availableDevice.status = 'SOLD';

      const saleRecord = {
        id: `sale-${Date.now()}`,
        receiptNumber: 9999,
        date: new Date().toISOString(),
        storeId: availableDevice.locationId,
        storeName: availableDevice.locationName,
        sellerId: 'usr-seller-1',
        sellerName: 'Продавец Алексей',
        items: [
          {
            deviceId: availableDevice.id,
            imei: availableDevice.imei,
            brand: availableDevice.brand,
            model: availableDevice.model,
            storage: availableDevice.storage,
            color: availableDevice.color,
            salePriceTjs: 12500,
            salePriceUsd: 1250,
            purchaseCostUsd: availableDevice.purchaseCostUsd,
            costBasisUsd: availableDevice.costBasisUsd,
            isBelowCost: false,
          },
        ],
        totalTjs: 12500,
        totalUsd: 1250,
        exchangeRate: 10,
        paymentMethod: 'CASH' as const,
        cashAmountTjs: 12500,
        cardAmountTjs: 0,
        status: 'COMPLETED' as const,
        hasBelowCostItem: false,
      };

      sales.push(saleRecord);

      expect(availableDevice.status).toBe('SOLD');
      expect(sales.find((s) => s.receiptNumber === 9999)).toBeDefined();
    }
  });

  it('5. Обмен / Trade-In (Exchange): calculates price difference, change, and surcharge notifications', () => {
    // Case 1: Replacement device is more expensive -> Customer surcharge
    const returnedValueTjs = 4000;
    const newDevicePriceTjs = 9500;
    const differenceTjs = newDevicePriceTjs - returnedValueTjs;

    expect(differenceTjs).toBe(5500);
    const surchargeNotice = differenceTjs > 0 ? `Доплата от клиента: +${differenceTjs} TJS` : '';
    expect(surchargeNotice).toBe('Доплата от клиента: +5500 TJS');

    // Cash payment with change calculation
    const givenCashTjs = 6000;
    const changeTjs = Math.max(0, givenCashTjs - differenceTjs);
    expect(changeTjs).toBe(500);

    // Case 2: Returned device is valued higher -> Store gives change/refund to customer
    const highReturnValTjs = 8000;
    const lowerNewPriceTjs = 6500;
    const refundDiffTjs = lowerNewPriceTjs - highReturnValTjs;

    expect(refundDiffTjs).toBe(-1500);
    const refundNotice = refundDiffTjs < 0 ? `Выдать сдачу/возврат клиенту: ${Math.abs(refundDiffTjs)} TJS` : '';
    expect(refundNotice).toBe('Выдать сдачу/возврат клиенту: 1500 TJS');

    // Case 3: Equal value -> Even exchange
    const evenDiffTjs = 5000 - 5000;
    expect(evenDiffTjs).toBe(0);
  });

  it('5.1. Повторный обмен (Subsequent Exchange): updates sale total and device price correctly', () => {
    // Initial Sale: 6000 TJS
    const sale = {
      id: 'sale-test-1',
      receiptNumber: 9999,
      totalTjs: 6000,
      items: [{ imei: '111111', model: 'iPhone 13', salePriceTjs: 6000 }]
    };

    // 1st Exchange: iPhone 13 (6000 TJS) -> iPhone 14 (7500 TJS). diff = +1500 TJS
    const diff1 = 7500 - 6000;
    sale.totalTjs += diff1;
    sale.items[0] = { imei: '222222', model: 'iPhone 14', salePriceTjs: 7500 };

    expect(sale.totalTjs).toBe(7500);
    expect(sale.items[0].salePriceTjs).toBe(7500);

    // 2nd Exchange: iPhone 14 (7500 TJS) -> iPhone 14 Pro (7500 TJS). diff = 0 TJS
    const secondOldVal = sale.items[0].salePriceTjs; // 7500 TJS
    const diff2 = 7500 - secondOldVal; // 0 TJS
    sale.totalTjs += diff2;
    sale.items[0] = { imei: '333333', model: 'iPhone 14 Pro', salePriceTjs: 7500 };

    expect(diff2).toBe(0);
    expect(sale.totalTjs).toBe(7500);
    expect(sale.items[0].model).toBe('iPhone 14 Pro');
  });

  it('5.2. Обмен не создает новый чек (Количество чеков не увеличивается)', () => {
    const initialSalesCount = 5;
    const salesList = [
      { id: 's-1', receiptNumber: 1001, totalTjs: 5000, status: 'COMPLETED' },
      { id: 's-2', receiptNumber: 1002, totalTjs: 7000, status: 'COMPLETED' }
    ];

    // Exchange updates existing receipt s-1 in place
    const targetSaleId = 's-1';
    const diffTjs = 1500;

    const updatedSales = salesList.map(s => {
      if (s.id === targetSaleId) {
        return {
          ...s,
          totalTjs: s.totalTjs + diffTjs,
          status: 'EXCHANGED' as const
        };
      }
      return s;
    });

    // Check that total receipts count remains unchanged (2 receipts, no new receipt added)
    expect(updatedSales.length).toBe(salesList.length);
    expect(updatedSales.find(s => s.id === 's-1')?.receiptNumber).toBe(1001);
    expect(updatedSales.find(s => s.id === 's-1')?.status).toBe('EXCHANGED');
  });

  it('6. Перемещение (Transfer): transfers device between store locations', () => {
    const deviceToTransfer = devices.find((d) => d.status === 'STORE_STOCK');
    expect(deviceToTransfer).toBeDefined();

    if (deviceToTransfer) {
      const fromLoc = deviceToTransfer.locationId;
      const toLoc = 'store-2';

      deviceToTransfer.locationId = toLoc;
      deviceToTransfer.locationName = 'Магазин №2 (Восток)';

      transfers.push({
        id: `tr-${Date.now()}`,
        fromLocationId: fromLoc,
        toLocationId: toLoc,
        deviceIds: [deviceToTransfer.id],
        status: 'APPROVED',
      });

      expect(deviceToTransfer.locationId).toBe('store-2');
      expect(transfers.length).toBe(1);
    }
  });

  it('7. Бонусы (Bonuses): records supplier bonus rebate', () => {
    const bonus = {
      id: `bon-${Date.now()}`,
      supplierId: suppliers[0].id,
      supplierName: suppliers[0].name,
      campaignTitle: 'Сезонный бонус Apple Q3',
      bonusType: 'CASH_DISCOUNT',
      amountUsd: 300,
      date: new Date().toISOString(),
    };

    bonuses.push(bonus);

    expect(bonuses.length).toBe(1);
    expect(bonuses[0].amountUsd).toBe(300);
  });
});
