import { describe, expect, it } from 'vitest';
import { buildComprehensiveReportWorkbook, buildEventsReportTable, expenseRegisteredUsd, type ComprehensiveReportInput } from './exportReports';

const fixture: ComprehensiveReportInput = {
  generatedBy: 'Администратор',
  events: [
    {
      // Sold for 1200 TJS at 10: $120, of which $15 is bonus-phone profit (nobody's income).
      kind: 'SALE', date: '2026-09-09T10:00:00.000Z', saleId: 'sale-1', receiptNumber: 101,
      storeId: 'store-1', storeName: 'Сиёма', rate: 10, amountTjs: 1200, amountUsd: 120,
      costUsd: 70, profitUsd: 35, bonusUsd: 15, penaltyTjs: 0, penaltyUsd: 0,
    },
    {
      // An older 1100 TJS sale refunded at 10.5: 1000 TJS handed back = $95.24, 100 TJS withheld.
      kind: 'REFUND', date: '2026-09-10T12:00:00.000Z', saleId: 'sale-0', receiptNumber: 90,
      storeId: 'store-1', storeName: 'Сиёма', rate: 10, amountTjs: -1000, amountUsd: -95.24,
      costUsd: -60, profitUsd: -35.24, bonusUsd: 0, penaltyTjs: 100, penaltyUsd: 9.52,
    },
  ],
  expenses: [
    {
      // Registered at $20.00, paid later when 200 TJS cost $19.05.
      id: 'expense-1',
      date: '2026-09-09T11:00:00.000Z',
      category: 'RENT',
      amountTjs: 200,
      amountUsd: 19.05,
      paymentFxUsd: 0.95,
      exchangeRate: 10.5,
      targetType: 'STORE',
      storeId: 'store-1',
      storeName: 'Сиёма',
      sourceAccount: 'Центральная касса',
      comment: 'Аренда',
      createdByName: 'Администратор',
      status: 'PAID',
    },
  ],
  summary: {
    periodLabel: 'сентябрь 2026',
    storeName: 'Сиёма',
    unitsSold: 1,
    revenueUsd: 24.76,
    cogsUsd: 10,
    refundPenaltiesUsd: 9.52,
    debtFxUsd: 1.5,
    bonusDeviceProfitUsd: 15,
    profitUsd: 10.78,
    cashBonusesUsd: 5,
    expensesUsd: 20,
    expenseFxUsd: 0.95,
    netProfitUsd: -8.27,
  },
};

describe('comprehensive Excel report', () => {
  it('lists every operation on its own day and rebuilds the program’s net profit exactly', async () => {
    const workbook = await buildComprehensiveReportWorkbook(fixture);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Операции', 'Расходы', 'Итого']);
    const operations = workbook.getWorksheet('Операции')!;
    expect(operations.getCell('B5').value).toBe('Продажа');
    expect(operations.getCell('C5').value).toBe(101);
    expect(operations.getCell('B6').value).toBe('Возврат (чек № 90)');
    expect(operations.getCell('G6').value).toBe(-95.24);
    // The expense keeps the dollars it was registered at.
    expect(workbook.getWorksheet('Расходы')?.getCell('K5').value).toBe(20);

    const summarySheet = workbook.getWorksheet('Итого')!;
    expect(summarySheet.getCell('B7').value).toMatchObject({ result: 24.76 });
    expect(summarySheet.getCell('B12').value).toMatchObject({ formula: 'B9+B10+B11', result: 10.78 });
    expect(summarySheet.getCell('B15').value).toMatchObject({ formula: 'B12-B13+B14', result: -8.27 });
    // Control row against the program's total: 0 (ExcelJS drops a zero cached result).
    const control = summarySheet.getCell('B16').value as { formula: string; result?: number };
    expect(control.formula).toBe('ROUND(B15-(-8.27),2)');
    expect(control.result ?? 0).toBe(0);

    const serialized = await workbook.xlsx.writeBuffer();
    expect(serialized.byteLength).toBeGreaterThan(5_000);

    const ExcelJS = (await import('exceljs')).default;
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(serialized);
    expect(reopened.getWorksheet('Итого')?.getCell('B15').value).toMatchObject({ result: -8.27 });
  }, 60_000);

  it('values an expense paid later at the dollars it was registered at', () => {
    expect(expenseRegisteredUsd(fixture.expenses[0])).toBe(20);
  });
});

describe('report rows preview', () => {
  it('shows supplier cash bonuses for reference without adding them to profit', () => {
    const withBonus = buildEventsReportTable(fixture.events, 5);
    const withoutBonus = buildEventsReportTable(fixture.events, 0);
    expect(withBonus.totalsRow[8]).toBe(withoutBonus.totalsRow[8]);
    expect(withBonus.totalsRow[6]).toBe('24.76');
    expect(withBonus.rows.some((row) => String(row[1]).includes('справочно'))).toBe(true);
  });
});
