import { describe, expect, it } from 'vitest';
import { buildComprehensiveReportWorkbook, type ComprehensiveReportInput } from './exportReports';

const fixture: ComprehensiveReportInput = {
  generatedBy: 'Администратор',
  sales: [
    {
      id: 'sale-1',
      receiptNumber: 101,
      date: '2026-09-09T10:00:00.000Z',
      storeId: 'store-1',
      storeName: 'Сиёма',
      sellerId: 'user-1',
      sellerName: 'Фарход',
      customerName: 'Покупатель',
      items: [
        {
          deviceId: 'device-1',
          imei: '123456789012345',
          brand: 'Apple',
          model: 'iPhone 15',
          storage: '128 GB',
          color: 'Black',
          salePriceTjs: 1200,
          salePriceUsd: 120,
          purchaseCostUsd: 70,
          costBasisUsd: 70,
        },
      ],
      totalTjs: 1200,
      totalUsd: 120,
      recognizedProfitUsd: 50,
      exchangeRate: 10,
      paymentMethod: 'CASH',
      cashAmountTjs: 1200,
      cardAmountTjs: 0,
      status: 'COMPLETED',
    },
  ],
  expenses: [
    {
      id: 'expense-1',
      date: '2026-09-09T11:00:00.000Z',
      category: 'RENT',
      amountTjs: 200,
      amountUsd: 20,
      exchangeRate: 10,
      targetType: 'STORE',
      storeId: 'store-1',
      storeName: 'Сиёма',
      sourceAccount: 'Касса',
      comment: 'Аренда',
      createdByName: 'Администратор',
    },
  ],
  summary: {
    periodLabel: 'сентябрь 2026',
    storeName: 'Сиёма',
    exchangeRate: 10,
    unitsSold: 1,
    revenueTjs: 1200,
    revenueUsd: 120,
    cogsTjs: 700,
    cogsUsd: 70,
    grossProfitTjs: 500,
    grossProfitUsd: 50,
    refundPenaltiesTjs: 100,
    refundPenaltiesUsd: 10,
    profitTjs: 600,
    profitUsd: 60,
    cashBonusesTjs: 50,
    cashBonusesUsd: 5,
    expensesTjs: 200,
    expensesUsd: 20,
    netProfitTjs: 450,
    netProfitUsd: 45,
  },
};

describe('comprehensive Excel report', () => {
  it('creates three reconciled sheets with a formula-driven net profit', async () => {
    const workbook = await buildComprehensiveReportWorkbook(fixture);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Продажи', 'Расходы', 'Итого']);
    expect(workbook.getWorksheet('Продажи')?.getCell('A5').value).toBe(101);
    expect(workbook.getWorksheet('Расходы')?.getCell('I5').value).toBe(200);

    const netTjs = workbook.getWorksheet('Итого')?.getCell('B14').value;
    const netUsd = workbook.getWorksheet('Итого')?.getCell('C14').value;
    expect(netTjs).toMatchObject({ formula: 'B11+B12-B13', result: 450 });
    expect(netUsd).toMatchObject({ formula: 'C11+C12-C13', result: 45 });

    const serialized = await workbook.xlsx.writeBuffer();
    expect(serialized.byteLength).toBeGreaterThan(5_000);

    const ExcelJS = (await import('exceljs')).default;
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(serialized);
    expect(reopened.getWorksheet('Итого')?.getCell('B14').value).toMatchObject({ result: 450 });
  }, 60_000);
});
