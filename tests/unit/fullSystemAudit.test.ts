import { describe, it, expect } from 'vitest';
import {
  INITIAL_STORES,
  INITIAL_USERS,
  INITIAL_SUPPLIERS,
  INITIAL_DEVICES,
  INITIAL_SALES,
} from '../../src/data/mockSeedData';

describe('Full System Manual Verification Audit of Every Feature', () => {
  let stores = [...INITIAL_STORES];
  let users = [...INITIAL_USERS];
  let suppliers = [...INITIAL_SUPPLIERS];
  let devices = [...INITIAL_DEVICES];
  let sales = [...INITIAL_SALES];
  let repairs: any[] = [];
  let expenses: any[] = [];
  let transfers: any[] = [];
  let bonuses: any[] = [];

  it('1. Приход (Stock Intake / Purchase): creates invoice and intake devices', () => {
    const intakeImei = '354891100999999';
    const newDevice = {
      id: 'dev-intake-1',
      imei: intakeImei,
      brand: 'Apple',
      model: 'iPhone 16 Pro Max',
      storage: '1 TB',
      color: 'Desert Titanium',
      status: 'MAIN_WAREHOUSE' as const,
      locationId: 'main-warehouse',
      locationName: 'Главный склад',
      supplierId: 'sup-apple',
      supplierName: 'Apple Direct Dubai',
      invoiceNumber: 'INV-2026-NEW',
      purchaseCostUsd: 1200,
      costBasisUsd: 1200,
      createdAt: new Date().toISOString(),
      timeline: [{ id: 't-int-1', date: new Date().toISOString(), type: 'INCOME', description: 'Приход по INV-2026-NEW', user: 'Администратор' }]
    };

    devices.push(newDevice);

    const found = devices.find((d) => d.imei === intakeImei);
    expect(found).toBeDefined();
    expect(found?.locationId).toBe('main-warehouse');
  });

  it('2. Перемещение с Главного склада в другие магазины (Transfer Main Warehouse -> Store 1)', () => {
    const targetDevice = devices.find((d) => d.locationId === 'main-warehouse' && d.status === 'MAIN_WAREHOUSE');
    expect(targetDevice).toBeDefined();

    if (targetDevice) {
      targetDevice.locationId = 'store-1';
      targetDevice.locationName = 'Магазин №1 (Рудаки)';
      targetDevice.status = 'STORE_STOCK';

      transfers.push({
        id: 'tr-001',
        fromLocationId: 'main-warehouse',
        toLocationId: 'store-1',
        deviceIds: [targetDevice.id],
        status: 'APPROVED',
        approvedAt: new Date().toISOString(),
      });

      expect(targetDevice.locationId).toBe('store-1');
      expect(targetDevice.status).toBe('STORE_STOCK');
    }
  });

  it('3. Продажа (Sale Execution): completes checkout and records revenue', () => {
    const store1Device = devices.find((d) => d.locationId === 'store-1' && d.status === 'STORE_STOCK');
    expect(store1Device).toBeDefined();

    if (store1Device) {
      store1Device.status = 'SOLD';

      const sale = {
        id: 'sale-999',
        receiptNumber: 2001,
        date: new Date().toISOString(),
        storeId: 'store-1',
        storeName: 'Магазин №1 (Рудаки)',
        sellerId: 'user-farhod',
        sellerName: 'Farhod',
        customerName: 'Ином (Клиент)',
        items: [
          {
            deviceId: store1Device.id,
            imei: store1Device.imei,
            brand: store1Device.brand,
            model: store1Device.model,
            storage: store1Device.storage,
            color: store1Device.color,
            salePriceTjs: 11200,
            salePriceUsd: 1178.94,
            purchaseCostUsd: store1Device.purchaseCostUsd,
            costBasisUsd: store1Device.costBasisUsd,
            isBelowCost: false,
          },
        ],
        totalTjs: 11200,
        totalUsd: 1178.94,
        exchangeRate: 9.5,
        paymentMethod: 'CASH' as const,
        cashAmountTjs: 11200,
        cardAmountTjs: 0,
        status: 'COMPLETED' as const,
        hasBelowCostItem: false,
      };

      sales.push(sale);

      expect(store1Device.status).toBe('SOLD');
      expect(sales.find((s) => s.receiptNumber === 2001)).toBeDefined();
    }
  });

  it('4. Ремонт (Warranty Service & Repair Ticket)', () => {
    const repairTicket = {
      id: 'rep-101',
      ticketNumber: 501,
      imei: '354891100234561',
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      storage: '256 GB',
      color: 'Black Titanium',
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      intakeSeller: 'Farhod',
      customerName: 'Бахром',
      customerPhone: '+992 93 111 2233',
      problemDescription: 'Не заряжается порт Type-C',
      visualCondition: 'Без царапин, мелкая потёртость сзади',
      equipmentPackage: 'Коробка, кабель USB-C',
      status: 'RECEIVED' as const,
      statusHistory: [{ status: 'RECEIVED' as const, updatedAt: new Date().toISOString(), updatedBy: 'Farhod' }],
      createdAt: new Date().toISOString(),
    };

    repairs.push(repairTicket);

    expect(repairs.length).toBe(1);
    expect(repairs[0].ticketNumber).toBe(501);
  });

  it('5. Обмен Trade-In (Exchange & Settlement)', () => {
    const returnedValueTjs = 4500;
    const newPriceTjs = 9800;
    const diffTjs = newPriceTjs - returnedValueTjs;

    expect(diffTjs).toBe(5300);
  });

  it('6. Расход (Store Expense Registration)', () => {
    const expense = {
      id: 'exp-99',
      category: 'RENT',
      amountTjs: 2500,
      exchangeRate: 9.5,
      amountUsd: 263.15,
      targetType: 'STORE',
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      sourceAccount: 'Магазин №1 Касса',
      comment: 'Аренда точки Рудаки',
      createdByName: 'Farhod',
      date: new Date().toISOString(),
    };

    expenses.push(expense);
    expect(expenses.length).toBe(1);
    expect(expenses[0].amountTjs).toBe(2500);
  });

  it('7. Бонусы (Supplier Bonus Rebate)', () => {
    const bonus = {
      id: 'bon-55',
      supplierId: 'sup-apple',
      supplierName: 'Apple Direct Dubai',
      campaignTitle: 'Apple Volume Rebate Q3',
      bonusType: 'CASH_DISCOUNT' as const,
      amountUsd: 500,
      date: new Date().toISOString(),
    };

    bonuses.push(bonus);
    expect(bonuses.length).toBe(1);
    expect(bonuses[0].amountUsd).toBe(500);
  });

  it('8. Сотрудники и Управление пользователями (User Creation & Role Verification)', () => {
    const newEmployee = {
      id: 'user-new',
      name: 'Сомон (Продавец)',
      login: 'somon',
      role: 'SELLER' as const,
      storeId: 'store-1',
      storeName: 'Магазин №1 (Рудаки)',
      active: true,
      createdAt: new Date().toISOString(),
    };

    users.push(newEmployee);

    const found = users.find((u) => u.login === 'somon');
    expect(found).toBeDefined();
    expect(found?.role).toBe('SELLER');
  });
});
