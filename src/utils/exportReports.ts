import { Expense } from '../types';

/**
 * One dated row behind the report totals, as the server returns it (/reports/summary?events=1):
 * a sale, an exchange or a refund, each in its own day's TJS, rate and USD — never restated
 * when the rate changes later.
 */
export interface ReportEventRow {
  kind: 'SALE' | 'EXCHANGE' | 'REFUND';
  date: string;
  saleId: string;
  receiptNumber: number | null;
  refundReason?: string | null;
  storeId: string;
  storeName: string;
  rate: number;
  amountTjs: number;
  amountUsd: number;
  costUsd: number;
  /** Owners' profit (bonus-phone profit excluded, shown in bonusUsd). */
  profitUsd: number;
  bonusUsd: number;
  penaltyTjs: number;
  penaltyUsd: number;
}

/** Report totals in USD, as the server computed them for the same period and store. */
export interface ComprehensiveReportSummary {
  periodLabel: string;
  storeName: string;
  unitsSold: number;
  revenueUsd: number;
  cogsUsd: number;
  refundPenaltiesUsd: number;
  /** Difference when a customer repays a TJS debt at another day's rate. */
  debtFxUsd: number;
  /** Profit of sold free bonus phones: nobody's income, shown for reference and left out of profit. */
  bonusDeviceProfitUsd: number;
  profitUsd: number;
  cashBonusesUsd: number;
  expensesUsd: number;
  /** Difference when an unpaid expense is paid later at another day's rate. */
  expenseFxUsd: number;
  netProfitUsd: number;
}

export interface ComprehensiveReportInput {
  events: ReportEventRow[];
  expenses: Expense[];
  summary: ComprehensiveReportSummary;
  generatedBy?: string;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Аренда помещения',
  SALARY: 'Зарплата сотрудников',
  EMPLOYEE_ADVANCE: 'Аванс сотрудника',
  UTILITIES: 'Коммуналка и интернет',
  MARKETING: 'Реклама и маркетинг',
  REPAIR_PARTS: 'Запчасти для ремонта',
  TAXES: 'Налоги и сборы',
  SUPPLIES: 'Расходные материалы',
  OTHER: 'Прочие расходы',
  CASH_SHORTAGE: 'Недостача кассы',
};

const EVENT_LABELS: Record<ReportEventRow['kind'], string> = {
  SALE: 'Продажа',
  EXCHANGE: 'Обмен',
  REFUND: 'Возврат',
};

export interface ReportTable {
  headers: string[];
  rows: (string | number)[][];
  /** Trailing "ИТОГО" row, kept separate from `rows` so the on-screen preview can style it distinctly. */
  totalsRow: (string | number)[];
}

/**
 * Clean helper function to trigger CSV file download with UTF-8 BOM
 * ensuring full compatibility with Microsoft Excel, Apple Numbers and Google Sheets.
 */
async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  // 0. The iOS/Android app: save through the system share sheet (a download link does nothing there).
  const { shareFileNatively } = await import('../services/nativeFileShare');
  if (await shareFileNatively(blob, fileName)) return;

  // 1. Mobile browsers (iOS Safari, iOS PWA, Android):
  // Use Web Share API if supported for files - this allows "Save to Files" or opening in Excel natively
  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], fileName, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return;
      }
    } catch (shareErr: any) {
      if (shareErr.name === 'AbortError') {
        return; // User cancelled the share dialog
      }
      console.warn('Web Share failed, falling back to download link:', shareErr);
    }
  }

  // 2. Standard browser download link fallback:
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Important: Delay revoke so Safari and mobile browsers have time to process the download
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}

function downloadCsv(content: string, fileName: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, fileName).catch((error) => {
    console.error('Failed to save CSV', error);
    window.alert('Не удалось сохранить файл. Попробуйте ещё раз.');
  });
}

function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

/** A rate always has 2 decimals (it is set that way): 9.35 → "9.35", 10 → "10.00". */
export function formatRate(rate: number): string {
  return (Number(rate) || 0).toFixed(2);
}

/** Cent-exact sum of money amounts (each already rounded to cents). */
function sumCents(values: number[]): number {
  return values.reduce((acc, value) => acc + Math.round((Number(value) || 0) * 100), 0) / 100;
}

/**
 * The on-screen preview of the report rows: every sale, exchange and refund of the period on
 * its own day, in TJS, that day's rate and USD. Its totals are the report's totals.
 */
export function buildEventsReportTable(events: ReportEventRow[], cashBonusesUsd: number = 0): ReportTable {
  const headers = [
    'Дата и время',
    'Операция',
    '№ чека',
    'Магазин',
    'Курс',
    'Сумма (TJS)',
    'Сумма ($)',
    'Себестоимость ($)',
    'Прибыль ($)',
    'Удержание ($)',
  ];

  const rows: (string | number)[][] = events.map((event) => {
    const isRefund = event.kind === 'REFUND';
    const operationLabel = isRefund
      ? (event.receiptNumber ? `Возврат (чек № ${event.receiptNumber})` : 'Возврат')
      : EVENT_LABELS[event.kind];
    const receiptLabel = event.receiptNumber ? `Чек № ${event.receiptNumber}` : '';

    return [
      new Date(event.date).toLocaleString('ru-RU'),
      operationLabel,
      receiptLabel,
      event.storeName,
      formatRate(event.rate),
      Number(event.amountTjs).toFixed(2),
      Number(event.amountUsd).toFixed(2),
      Number(event.costUsd).toFixed(2),
      Number(event.profitUsd).toFixed(2),
      Number(event.penaltyUsd).toFixed(2),
    ];
  });

  // Supplier cash bonuses are nobody's income: shown once for reference, never added to profit.
  if (cashBonusesUsd !== 0) {
    rows.push(['', 'Бонусы поставщиков за период — справочно, не входят в прибыль', '', '', '', '', '', '', cashBonusesUsd.toFixed(2), '']);
  }

  const totalsRow = [
    'ИТОГО:',
    `Операций: ${events.length}`,
    '', '', '',
    sumCents(events.map((e) => e.amountTjs)).toFixed(2),
    sumCents(events.map((e) => e.amountUsd)).toFixed(2),
    sumCents(events.map((e) => e.costUsd)).toFixed(2),
    sumCents(events.map((e) => e.profitUsd)).toFixed(2),
    sumCents(events.map((e) => e.penaltyUsd)).toFixed(2),
  ];

  return { headers, rows, totalsRow };
}

/** An expense in the dollars it was registered at, on its own day (a later payment never restates it). */
export function expenseRegisteredUsd(expense: Expense): number {
  const rate = Number(expense.exchangeRate) || 0;
  const usd = expense.amountUsd ?? (rate > 0 ? (expense.amountTjs || 0) / rate : 0);
  return Math.round(((usd || 0) + (Number(expense.paymentFxUsd) || 0)) * 100) / 100;
}

const XLSX_GREEN = 'FF16A34A';
const XLSX_DARK = 'FF0F172A';
const XLSX_MUTED = 'FF64748B';
const XLSX_LIGHT = 'FFF1F5F9';
const XLSX_BORDER = 'FFE2E8F0';
const XLSX_WHITE = 'FFFFFFFF';
const XLSX_RED = 'FFDC2626';
const XLSX_MONEY_FORMAT = '#,##0.00;[Red](#,##0.00);-';
/** A rate always has 2 decimals (it is set that way). */
const RATE_FORMAT = '0.00';

function safeWorksheetText(value: string | undefined | null, fallback = '-'): string {
  const text = value?.trim();
  return text || fallback;
}

function transliterate(str: string): string {
  const ru: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
  };
  return str.toLowerCase().split('').map((char) => ru[char] || char).join('');
}

function safeFilePart(value: string): string {
  return transliterate(value)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'report';
}

export async function downloadXlsx(content: ArrayBuffer, fileName: string): Promise<void> {
  const blob = new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await downloadBlob(blob, fileName);
}

/**
 * One management workbook with three sheets. «Операции» lists every sale, exchange and refund
 * of the period on its own day (TJS, that day's rate, USD); «Расходы» lists the expenses at the
 * dollars they were registered at; «Итого» builds the result in USD from the two sheets' sums,
 * with a control row against the server's total that must be 0.
 */
export async function buildComprehensiveReportWorkbook({
  events,
  expenses,
  summary,
  generatedBy,
}: ComprehensiveReportInput): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = generatedBy || 'Mobile Shop';
  const meta = workbook as unknown as { company?: string; subject?: string; title?: string };
  meta.company = 'Mobile Shop';
  meta.subject = `Финансовый отчёт — ${summary.periodLabel}`;
  meta.title = `Отчёт — ${summary.storeName}`;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const cellFormula = (formula: string, result: number) => ({
    formula,
    result,
    date1904: false,
  });

  // Create every sheet before writing cross-sheet formulas.
  const eventsSheet = workbook.addWorksheet('Операции', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    properties: { tabColor: { argb: XLSX_GREEN } },
  });
  const expensesSheet = workbook.addWorksheet('Расходы', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    properties: { tabColor: { argb: 'FFF59E0B' } },
  });
  const summarySheet = workbook.addWorksheet('Итого', {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    properties: { tabColor: { argb: 'FF2563EB' } },
  });

  const styleTitle = (sheet: import('exceljs').Worksheet, endColumn: string, title: string) => {
    sheet.mergeCells(`A1:${endColumn}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = title;
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: XLSX_WHITE } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_DARK } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(`A2:${endColumn}2`);
    const subtitleCell = sheet.getCell('A2');
    subtitleCell.value = `Период: ${summary.periodLabel}  •  Магазин: ${summary.storeName}  •  Каждая строка — по курсу своего дня, итоги в USD`;
    subtitleCell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_MUTED } };
    subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_LIGHT } };
    subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(2).height = 22;
  };

  const styleHeader = (row: import('exceljs').Row) => {
    row.height = 30;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_GREEN } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: XLSX_GREEN } } };
    });
  };

  const styleTotalRow = (row: import('exceljs').Row, color = XLSX_DARK) => {
    row.height = 23;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_WHITE } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.border = { top: { style: 'thin', color: { argb: XLSX_BORDER } } };
    });
  };

  // OPERATIONS: sales, exchanges and refunds, each a fact of its own day.
  styleTitle(eventsSheet, 'L', 'Продажи, обмены и возвраты');
  eventsSheet.columns = [
    { width: 19 }, { width: 12 }, { width: 10 }, { width: 20 }, { width: 11 }, { width: 17 },
    { width: 16 }, { width: 18 }, { width: 16 }, { width: 20 }, { width: 17 }, { width: 16 },
  ];
  const eventsHeader = eventsSheet.getRow(4);
  eventsHeader.values = [
    'Дата и время', 'Операция', '№ чека', 'Магазин', 'Курс', 'Сумма (TJS)', 'Сумма ($)',
    'Себестоимость ($)', 'Прибыль ($)', 'Прибыль бонусных телефонов ($)', 'Удержание (TJS)', 'Удержание ($)',
  ];
  styleHeader(eventsHeader);

  for (const event of events) {
    const isRefund = event.kind === 'REFUND';
    const operationName = isRefund && event.receiptNumber ? `Возврат (чек № ${event.receiptNumber})` : EVENT_LABELS[event.kind];
    const row = eventsSheet.addRow([
      new Date(event.date),
      operationName,
      event.receiptNumber ?? '',
      safeWorksheetText(event.storeName),
      Math.round(Number(event.rate) * 100) / 100,
      Math.round(Number(event.amountTjs) * 100) / 100,
      Math.round(Number(event.amountUsd) * 100) / 100,
      Math.round(Number(event.costUsd) * 100) / 100,
      Math.round(Number(event.profitUsd) * 100) / 100,
      Math.round(Number(event.bonusUsd) * 100) / 100,
      Math.round(Number(event.penaltyTjs) * 100) / 100,
      Math.round(Number(event.penaltyUsd) * 100) / 100,
    ]);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: columnNumber >= 5 ? 'right' : 'left' };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
    });
    row.getCell(1).numFmt = 'dd.mm.yyyy hh:mm';
    row.getCell(5).numFmt = RATE_FORMAT;
    for (let column = 6; column <= 12; column += 1) row.getCell(column).numFmt = XLSX_MONEY_FORMAT;
    if (event.kind === 'REFUND') row.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_RED } };
  }
  eventsSheet.autoFilter = { from: 'A4', to: 'L4' };

  const firstEventRow = 5;
  const lastEventRow = Math.max(firstEventRow, firstEventRow + events.length - 1);
  const eventsTotalRow = eventsSheet.addRow(['ИТОГО:']);
  const eventsTotalNumber = eventsTotalRow.number;
  const eventSum = (column: string, values: number[]) =>
    cellFormula(events.length ? `SUM(${column}${firstEventRow}:${column}${lastEventRow})` : '0', sumCents(values));
  eventsTotalRow.getCell(6).value = eventSum('F', events.map((e) => e.amountTjs));
  eventsTotalRow.getCell(7).value = eventSum('G', events.map((e) => e.amountUsd));
  eventsTotalRow.getCell(8).value = eventSum('H', events.map((e) => e.costUsd));
  eventsTotalRow.getCell(9).value = eventSum('I', events.map((e) => e.profitUsd));
  eventsTotalRow.getCell(10).value = eventSum('J', events.map((e) => e.bonusUsd));
  eventsTotalRow.getCell(11).value = eventSum('K', events.map((e) => e.penaltyTjs));
  eventsTotalRow.getCell(12).value = eventSum('L', events.map((e) => e.penaltyUsd));
  styleTotalRow(eventsTotalRow);
  for (let column = 6; column <= 12; column += 1) eventsTotalRow.getCell(column).numFmt = XLSX_MONEY_FORMAT;

  // EXPENSES: each at the dollars it was registered at on its own day.
  styleTitle(expensesSheet, 'K', 'Отчёт по расходам');
  expensesSheet.columns = [
    { width: 19 }, { width: 28 }, { width: 16 }, { width: 19 }, { width: 20 }, { width: 20 },
    { width: 20 }, { width: 36 }, { width: 18 }, { width: 12 }, { width: 18 },
  ];
  const expensesHeader = expensesSheet.getRow(4);
  expensesHeader.values = [
    'Дата и время', 'Категория', 'Тип', 'Магазин', 'Источник списания', 'Сотрудник',
    'Создал', 'Назначение', 'Сумма (TJS)', 'Курс', 'Сумма ($)',
  ];
  styleHeader(expensesHeader);

  const expenseUsd = expenses.map(expenseRegisteredUsd);
  expenses.forEach((expense, index) => {
    const amountUsd = expenseUsd[index];
    const row = expensesSheet.addRow([
      new Date(expense.date),
      EXPENSE_CATEGORY_LABELS[expense.category] || expense.category,
      expense.targetType === 'BUSINESS' ? 'Бизнес' : 'Магазин',
      safeWorksheetText(expense.storeName, 'Весь бизнес'),
      safeWorksheetText(expense.sourceAccount, 'Касса'),
      safeWorksheetText(expense.employeeName),
      safeWorksheetText(expense.createdByName),
      safeWorksheetText(expense.comment || expense.description),
      Math.round((expense.amountTjs || 0) * 100) / 100,
      Number(expense.exchangeRate) ? Math.round(Number(expense.exchangeRate) * 100) / 100 : (amountUsd ? Math.round(((expense.amountTjs || 0) / amountUsd) * 100) / 100 : 0),
      Math.round((amountUsd || 0) * 100) / 100,
    ]);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: columnNumber >= 9 ? 'right' : 'left', wrapText: columnNumber === 8 };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
    });
    row.getCell(1).numFmt = 'dd.mm.yyyy hh:mm';
    row.getCell(9).numFmt = XLSX_MONEY_FORMAT;
    row.getCell(10).numFmt = RATE_FORMAT;
    row.getCell(11).numFmt = XLSX_MONEY_FORMAT;
  });
  expensesSheet.autoFilter = { from: 'A4', to: 'K4' };

  const firstExpenseRow = 5;
  const lastExpenseRow = Math.max(firstExpenseRow, firstExpenseRow + expenses.length - 1);
  const expenseTotalRow = expensesSheet.addRow(['ИТОГО РАСХОДОВ:']);
  const expenseTotalRowNumber = expenseTotalRow.number;
  expenseTotalRow.getCell(9).value = cellFormula(
    expenses.length ? `SUM(I${firstExpenseRow}:I${lastExpenseRow})` : '0',
    sumCents(expenses.map((e) => e.amountTjs || 0)),
  );
  expenseTotalRow.getCell(11).value = cellFormula(
    expenses.length ? `SUM(K${firstExpenseRow}:K${lastExpenseRow})` : '0',
    sumCents(expenseUsd),
  );
  styleTotalRow(expenseTotalRow, 'FFF59E0B');
  expenseTotalRow.getCell(9).numFmt = XLSX_MONEY_FORMAT;
  expenseTotalRow.getCell(11).numFmt = XLSX_MONEY_FORMAT;

  // SUMMARY (USD)
  styleTitle(summarySheet, 'B', 'Итоговый финансовый отчёт (USD)');
  summarySheet.columns = [{ width: 52 }, { width: 22 }];
  summarySheet.getCell('A3').value = `Сформирован: ${new Date().toLocaleString('ru-RU')}${generatedBy ? `  •  Пользователь: ${generatedBy}` : ''}`;
  summarySheet.mergeCells('A3:B3');
  summarySheet.getCell('A3').font = { italic: true, size: 9, color: { argb: XLSX_MUTED } };

  const summaryHeader = summarySheet.getRow(5);
  summaryHeader.values = ['Показатель', 'USD'];
  styleHeader(summaryHeader);

  const ops = (column: string) => `'Операции'!${column}${eventsTotalNumber}`;
  const salesProfitUsd = sumCents(events.map((e) => e.profitUsd));
  const penaltiesUsd = sumCents(events.map((e) => e.penaltyUsd));
  const profitAfterReturns = Math.round((salesProfitUsd + penaltiesUsd + summary.debtFxUsd) * 100) / 100;
  const expensesUsd = sumCents(expenseUsd);
  const netUsd = Math.round((profitAfterReturns - expensesUsd + summary.expenseFxUsd) * 100) / 100;

  // Rows 6..: the result is built from the sheets above; references below use these row numbers.
  const rows: [string, number | ReturnType<typeof cellFormula>][] = [
    ['Количество проданных устройств', summary.unitsSold],                                             // 6
    ['Выручка: продажи и обмены за вычетом возвратов', cellFormula(ops('G'), sumCents(events.map((e) => e.amountUsd)))], // 7
    ['Себестоимость', cellFormula(ops('H'), sumCents(events.map((e) => e.costUsd)))],                   // 8
    ['Прибыль от продаж (без бонусных телефонов)', cellFormula(ops('I'), salesProfitUsd)],             // 9
    ['Удержано при возвратах', cellFormula(ops('L'), penaltiesUsd)],                                    // 10
    ['Разница при погашении долгов (TJS по курсу дня оплаты)', summary.debtFxUsd],                     // 11
    ['Прибыль с учётом возвратов', cellFormula('B9+B10+B11', profitAfterReturns)],                      // 12
    ['Расходы (по курсу дня регистрации)', cellFormula(`'Расходы'!K${expenseTotalRowNumber}`, expensesUsd)], // 13
    ['Разница при оплате расходов позже', summary.expenseFxUsd],                                        // 14
  ];
  for (const values of rows) summarySheet.addRow(values);

  const netProfitRow = summarySheet.addRow(['ЧИСТАЯ ПРИБЫЛЬ']);                                          // 15
  const netProfitRowNumber = netProfitRow.number;
  netProfitRow.getCell(2).value = cellFormula('B12-B13+B14', netUsd);
  styleTotalRow(netProfitRow, netUsd >= 0 ? XLSX_GREEN : XLSX_RED);

  const checkRow = summarySheet.addRow(['Контроль: расхождение с итогом программы (должно быть 0)']);
  checkRow.getCell(2).value = cellFormula(`ROUND(B${netProfitRowNumber}-(${summary.netProfitUsd}),2)`, Math.round((netUsd - summary.netProfitUsd) * 100) / 100 || 0);
  checkRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  summarySheet.addRow([]);
  const reference = [
    summarySheet.addRow(['Прибыль бонусных телефонов (справочно, не доход)', cellFormula(ops('J'), sumCents(events.map((e) => e.bonusUsd)))]),
    summarySheet.addRow(['Денежные бонусы поставщиков (справочно, не доход)', summary.cashBonusesUsd]),
  ];

  for (let rowNumber = 6; rowNumber <= checkRow.number; rowNumber += 1) {
    const row = summarySheet.getRow(rowNumber);
    row.height = 23;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(2).numFmt = rowNumber === 6 ? '#,##0' : XLSX_MONEY_FORMAT;
    if (rowNumber !== netProfitRowNumber) {
      row.eachCell((cell) => {
        cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
      });
    }
  }
  for (const row of reference) {
    row.getCell(2).numFmt = XLSX_MONEY_FORMAT;
    row.font = { color: { argb: XLSX_MUTED } };
  }
  const noteRowNumber = reference[reference.length - 1].number + 2;
  summarySheet.getCell(`A${noteRowNumber}`).value = 'Каждая операция записана по курсу своего дня и не пересчитывается. Возврат отражён в день возврата отдельной строкой. Чистая прибыль = прибыль с учётом возвратов − расходы. Бонусы — справочно: это не доход, их деньги хранятся на Бонусном счёте.';
  summarySheet.mergeCells(`A${noteRowNumber}:B${noteRowNumber}`);
  summarySheet.getCell(`A${noteRowNumber}`).font = { italic: true, size: 9, color: { argb: XLSX_MUTED } };
  summarySheet.getCell(`A${noteRowNumber}`).alignment = { wrapText: true, vertical: 'top' };
  summarySheet.getRow(noteRowNumber).height = 48;

  return workbook;
}

export async function exportComprehensiveReport(input: ComprehensiveReportInput): Promise<void> {
  const workbook = await buildComprehensiveReportWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().split('T')[0];
  await downloadXlsx(buffer, `finansovyi_otchet_${safeFilePart(input.summary.storeName)}_${date}.xlsx`);
}

/**
 * Exports security audit log report.
 */
export function exportAuditLogsReport(logs: any[]) {
  const headers = ['ID', 'Дата и время', 'Действие', 'Сотрудник', 'Роль', 'Детали'];
  const rows = logs.map(l => [
    escapeCsvField(l.id),
    escapeCsvField(l.timestamp ? new Date(l.timestamp).toLocaleString('ru-RU') : '-'),
    escapeCsvField(l.action),
    escapeCsvField(l.userName),
    escapeCsvField(l.userRole || '-'),
    escapeCsvField(l.details)
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_audit_log_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
}
