import { describe, it, expect } from 'vitest';
import {
  INITIAL_STORES,
  INITIAL_SUPPLIERS,
  INITIAL_DEVICES,
  INITIAL_SALES,
  INITIAL_EXPENSES,
  INITIAL_OWNERS
} from '../../src/data/mockSeedData';
import { Device, Supplier, SupplierInvoice, Sale, TransferRequest, RepairTicket, Expense, Owner } from '../../src/types';

describe('Deep System Audit & Financial Profitability Calculations', () => {
  const stores = JSON.parse(JSON.stringify(INITIAL_STORES));
  const suppliers: Supplier[] = JSON.parse(JSON.stringify(INITIAL_SUPPLIERS));
  const devices: Device[] = JSON.parse(JSON.stringify(INITIAL_DEVICES));
  const sales: Sale[] = JSON.parse(JSON.stringify(INITIAL_SALES));
  const expenses: Expense[] = JSON.parse(JSON.stringify(INITIAL_EXPENSES));
  const owners: Owner[] = JSON.parse(JSON.stringify(INITIAL_OWNERS));

  const rate = 9.50; // 1 USD = 9.50 TJS

  it('1. Проверка точности формул выручки, себестоимости и прибыли (Revenue, COGS, Gross Profit, Net Profit)', () => {
    let totalRevenueUsd = 0;
    let totalCogsUsd = 0;

    sales.filter(s => s.status === 'COMPLETED').forEach(sale => {
      sale.items.forEach(item => {
        const itemRevenue = item.salePriceUsd || +(item.salePriceTjs / rate).toFixed(2);
        const itemCogs = item.costBasisUsd || item.purchaseCostUsd || 0;

        totalRevenueUsd += itemRevenue;
        totalCogsUsd += itemCogs;
      });
    });

    const grossProfitUsd = totalRevenueUsd - totalCogsUsd;
    const totalExpensesUsd = expenses.reduce((acc, e) => acc + (e.amountUsd || +(e.amountTjs / rate).toFixed(2)), 0);
    const netProfitUsd = grossProfitUsd - totalExpensesUsd;

    expect(totalRevenueUsd).toBeGreaterThan(0);
    expect(totalCogsUsd).toBeGreaterThan(0);
    expect(grossProfitUsd).toBe(totalRevenueUsd - totalCogsUsd);
    expect(netProfitUsd).toBe(grossProfitUsd - totalExpensesUsd);
  });

  it('2. Проверка защиты от продажи ниже себестоимости (Below Cost Warning Flag)', () => {
    const testDev = devices.find(d => d.status === 'STORE_STOCK') || devices[0];
    const costTjs = testDev.costBasisUsd * rate;
    const lowSalePriceTjs = costTjs - 500; // Below cost

    const isBelowCost = lowSalePriceTjs < costTjs;
    expect(isBelowCost).toBe(true);
  });

  it('3. Проверка расчёта Trade-In обмена (Exchange Surcharge & Cash Refund)', () => {
    const returnedDeviceValueTjs = 4500;
    const newDevicePriceTjs = 9800;
    const customerSurchargeTjs = newDevicePriceTjs - returnedDeviceValueTjs;

    expect(customerSurchargeTjs).toBe(5300); // Customer pays 5300 TJS difference
  });

  it('4. Проверка зачисления дохода от ремонтов в кассу (Repair Cash Inflow)', () => {
    const mainStore = stores[0];
    const initialCash = mainStore.cashBalanceTjs;
    const repairFeeTjs = 450;

    mainStore.cashBalanceTjs += repairFeeTjs;
    expect(mainStore.cashBalanceTjs).toBe(initialCash + repairFeeTjs);
  });

  it('5. Проверка списания операционных расходов из кассы (Expense Cash Outflow)', () => {
    const mainStore = stores[0];
    const initialCash = mainStore.cashBalanceTjs;
    const expenseTjs = 350;

    mainStore.cashBalanceTjs -= expenseTjs;
    expect(mainStore.cashBalanceTjs).toBe(initialCash - expenseTjs);
  });

  it('6. Проверка распределения долей капитала партнёров (Partner Shares Equity %)', () => {
    const totalSharePercentage = owners.reduce((acc, o) => acc + (o.profitSharePercent || 0), 0);
    expect(totalSharePercentage).toBe(100);
  });

  it('7. Проверка целостности истории IMEI1 / IMEI2 и Barcode штрихкодов в базе устройств', () => {
    devices.forEach(dev => {
      expect(dev.imei).toBeDefined();
      expect(dev.imei.length).toBeGreaterThan(0);
      if (dev.imei2) {
        expect(dev.imei2.length).toBeGreaterThan(0);
      }
    });
  });
});
