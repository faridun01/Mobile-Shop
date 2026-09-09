import { Sale, Device, Store, Expense, RepairTicket } from '../types';

export interface ComprehensiveReportSummary {
  periodLabel: string;
  storeName: string;
  exchangeRate: number;
  unitsSold: number;
  revenueTjs: number;
  revenueUsd: number;
  cogsTjs: number;
  cogsUsd: number;
  grossProfitTjs: number;
  grossProfitUsd: number;
  refundPenaltiesTjs: number;
  refundPenaltiesUsd: number;
  profitTjs: number;
  profitUsd: number;
  cashBonusesTjs: number;
  cashBonusesUsd: number;
  expensesTjs: number;
  expensesUsd: number;
  netProfitTjs: number;
  netProfitUsd: number;
}

export interface ComprehensiveReportInput {
  sales: Sale[];
  expenses: Expense[];
  summary: ComprehensiveReportSummary;
  generatedBy?: string;
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: 'Аренда помещения',
  SALARY: 'Зарплата сотрудников',
  EMPLOYEE_ADVANCE: 'Аванс / Подотчет сотрудника',
  UTILITIES: 'Коммуналка и интернет',
  MARKETING: 'Реклама и маркетинг',
  REPAIR_PARTS: 'Запчасти для ремонта',
  TAXES: 'Налоги и сборы',
  SUPPLIES: 'Расходные материалы',
  OTHER: 'Прочие расходы',
};

const REPAIR_STATUS_LABELS: Record<string, string> = {
  ACCEPTED: 'Принят',
  IN_PROGRESS: 'В работе',
  READY: 'Готов к выдаче',
  ISSUED: 'Выдан клиенту',
  DIAGNOSTICS: 'Диагностика',
  IN_REPAIR: 'В ремонте',
  DELIVERED: 'Доставлен',
  UNREPAIRABLE: 'Не подлежит ремонту',
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
function downloadCsv(content: string, fileName: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsvField(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field);
  return `"${str.replace(/"/g, '""')}"`;
}

function tableToCsv(table: ReportTable): string {
  const lines = [table.headers.join(',')];
  for (const row of table.rows) lines.push(row.map(escapeCsvField).join(','));
  lines.push('');
  lines.push(table.totalsRow.map(escapeCsvField).join(','));
  return lines.join('\r\n');
}

/**
 * Format IMEI so Microsoft Excel displays full 15-digit string without scientific notation (3.55E+14)
 */
function formatImeiForCsv(imei?: string): string {
  if (!imei) return '-';
  const clean = imei.trim();
  if (!clean) return '-';
  return `\t${clean}`;
}

/**
 * Builds the sales report table (headers/rows/totals) shared by the on-screen
 * preview and the CSV export, so what the user previews is exactly what downloads.
 */
export function buildSalesReportTable(sales: Sale[], rate: number = 9.5, cashBonusesUsd: number = 0): ReportTable {
  const headers = [
    '№ Чека',
    'Дата и время',
    'Магазин',
    'Кассир',
    'Товар / Модель',
    'Количество (шт)',
    'Себестоимость ($)',
    'Цена продажи ($)',
    'Сумма продажи (TJS)',
    'Курс на момент продажи',
    'Прибыль ($)',
    'Способ оплаты',
    'Статус'
  ];

  const rows: (string | number)[][] = [];
  let totalUnits = 0;
  let totalCostBasisUsd = 0;
  let totalRevenueUsd = 0;
  let totalRevenueTjs = 0;
  let totalProfitUsd = 0;

  sales.forEach((sale) => {
    const isRefunded = sale.status === 'REFUNDED';
    const dateFormatted = new Date(sale.date).toLocaleString('ru-RU');
    const operationRate = sale.exchangeRate || rate;
    let saleNaiveProfitUsd = 0;

    sale.items.forEach((item) => {
      totalUnits += 1;
      const costUsd = item.costBasisUsd || 0;
      const priceUsd = item.salePriceUsd || +(item.salePriceTjs / operationRate).toFixed(2);
      const priceTjs = item.salePriceTjs || +(item.salePriceUsd * operationRate).toFixed(2);
      // A refunded sale's original margin is void — it never counts toward totals, and
      // showing the stale pre-refund number here would misleadingly suggest it still does.
      const profitUsd = isRefunded ? 0 : +(priceUsd - costUsd).toFixed(2);
      saleNaiveProfitUsd += profitUsd;

      if (!isRefunded) {
        totalCostBasisUsd += costUsd;
        totalRevenueUsd += priceUsd;
        totalRevenueTjs += priceTjs;
      }

      rows.push([
        sale.receiptNumber,
        dateFormatted,
        sale.storeName,
        sale.sellerName,
        `${item.brand} ${item.model} ${item.storage || ''} ${item.color || ''}`.trim(),
        1,
        costUsd.toFixed(2),
        priceUsd.toFixed(2),
        priceTjs.toFixed(2),
        operationRate.toFixed(2),
        profitUsd.toFixed(2),
        sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная',
        isRefunded ? 'ВОЗВРАТ' : 'ЗАВЕРШЕНА'
      ]);
    });

    // Recognized profit is a sale-level figure (accounts for below-cost sign-off and
    // exchange corrections that don't split cleanly across items), so the total is summed
    // once per sale from it — not from the naive per-item price-minus-cost rows above —
    // to match every other recognized-profit figure in Reports (see reports.service.ts).
    // Falls back to the naive sum only for older sales with no recognizedProfitUsd on record.
    if (!isRefunded) {
      totalProfitUsd += sale.recognizedProfitUsd ?? saleNaiveProfitUsd;
    }

    // The only profit a refunded sale actually leaves behind is the withheld penalty —
    // recorded as its own line so it shows up in the history and counts toward the total,
    // instead of silently vanishing along with the reversed original sale.
    if (isRefunded && (sale.penaltyFeeUsd ?? 0) > 0) {
      const penaltyUsd = sale.penaltyFeeUsd ?? 0;
      const penaltyTjs = sale.penaltyFeeTjs ?? 0;
      totalProfitUsd += penaltyUsd;

      rows.push([
        sale.receiptNumber,
        dateFormatted,
        sale.storeName,
        sale.sellerName,
        'Штраф за возврат (прибыль)',
        '',
        '',
        '',
        penaltyTjs.toFixed(2),
        // The penalty is converted at the refund's own rate, not this sale's original rate —
        // back the implied rate out of the two amounts already shown instead of reusing
        // operationRate, which would silently misstate it whenever the two days' rates differ.
        penaltyUsd > 0 ? (penaltyTjs / penaltyUsd).toFixed(2) : '',
        penaltyUsd.toFixed(2),
        sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная',
        'ВОЗВРАТ (ШТРАФ)'
      ]);
    }
  });

  // Supplier cash bonuses are tied to the supplier/main warehouse, not any one store, so
  // this isn't this store's own money — it's appended once, clearly labeled, rather than
  // silently folded into totalProfitUsd where it would look like the store earned it.
  if (cashBonusesUsd !== 0) {
    totalProfitUsd += cashBonusesUsd;
    rows.push([
      '', '', '', '',
      'Бонусы поставщиков за период (наличными, по всему бизнесу)',
      '', '', '', '', '',
      cashBonusesUsd.toFixed(2),
      '', 'БОНУС'
    ]);
  }

  const totalsRow = [
    'ИТОГО:', '', '', '',
    `Всего позиций: ${rows.length}`,
    totalUnits,
    totalCostBasisUsd.toFixed(2),
    totalRevenueUsd.toFixed(2),
    totalRevenueTjs.toFixed(2),
    '',
    totalProfitUsd.toFixed(2),
    '', ''
  ];

  return { headers, rows, totalsRow };
}

/**
 * Exports sales report with detailed items breakdown, IMEI numbers and comprehensive summary totals.
 */
export function exportSalesReport(sales: Sale[], rate: number = 9.5, cashBonusesUsd: number = 0) {
  const table = buildSalesReportTable(sales, rate, cashBonusesUsd);
  const fileName = `otchet_prodazhi_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(tableToCsv(table), fileName);
}

const XLSX_GREEN = 'FF16A34A';
const XLSX_DARK = 'FF0F172A';
const XLSX_MUTED = 'FF64748B';
const XLSX_LIGHT = 'FFF1F5F9';
const XLSX_BORDER = 'FFE2E8F0';
const XLSX_WHITE = 'FFFFFFFF';
const XLSX_RED = 'FFDC2626';
const XLSX_MONEY_FORMAT = '#,##0.00;[Red](#,##0.00);-';

function paymentMethodLabel(method: Sale['paymentMethod']): string {
  if (method === 'CASH') return 'Наличные';
  if (method === 'CARD') return 'Карта';
  if (method === 'DEBT') return 'В долг';
  return 'Раздельная оплата';
}

function saleStatusLabel(status: Sale['status']): string {
  if (status === 'REFUNDED') return 'Возврат';
  if (status === 'EXCHANGED') return 'Обмен';
  return 'Завершена';
}

function safeWorksheetText(value: string | undefined | null, fallback = '-'): string {
  const text = value?.trim();
  return text || fallback;
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'report';
}

function downloadXlsx(content: ArrayBuffer, fileName: string) {
  const blob = new Blob([content], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Downloads one management workbook with three auditable sheets. The Summary sheet
 * references totals from Sales and Expenses, while the supplied server summary is used
 * as the reconciliation source for exchanges, refunds and historical rounding.
 */
export async function buildComprehensiveReportWorkbook({
  sales,
  expenses,
  summary,
  generatedBy,
}: ComprehensiveReportInput): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = generatedBy || 'Mobile Shop';
  workbook.company = 'Mobile Shop';
  workbook.subject = `Финансовый отчёт — ${summary.periodLabel}`;
  workbook.title = `Отчёт — ${summary.storeName}`;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  // Create every sheet before writing cross-sheet formulas.
  const salesSheet = workbook.addWorksheet('Продажи', {
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
    subtitleCell.value = `Период: ${summary.periodLabel}  •  Магазин: ${summary.storeName}  •  Курс: 1 USD = ${summary.exchangeRate.toFixed(4)} TJS`;
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

  // SALES
  styleTitle(salesSheet, 'V', 'Отчёт по продажам и прибыли');
  salesSheet.columns = [
    { key: 'receipt', width: 12 },
    { key: 'date', width: 19 },
    { key: 'store', width: 18 },
    { key: 'seller', width: 18 },
    { key: 'customer', width: 18 },
    { key: 'products', width: 34 },
    { key: 'imei', width: 21 },
    { key: 'quantity', width: 10 },
    { key: 'status', width: 13 },
    { key: 'payment', width: 17 },
    { key: 'rate', width: 12 },
    { key: 'originalTjs', width: 17 },
    { key: 'originalUsd', width: 17 },
    { key: 'revenueTjs', width: 18 },
    { key: 'revenueUsd', width: 18 },
    { key: 'cogsTjs', width: 20 },
    { key: 'cogsUsd', width: 20 },
    { key: 'profitTjs', width: 17 },
    { key: 'profitUsd', width: 17 },
    { key: 'penaltyTjs', width: 20 },
    { key: 'penaltyUsd', width: 20 },
    { key: 'note', width: 31 },
  ];

  const salesHeader = salesSheet.getRow(4);
  salesHeader.values = [
    '№ чека', 'Дата и время', 'Магазин', 'Кассир', 'Покупатель', 'Товары', 'IMEI', 'Кол-во',
    'Статус', 'Оплата', 'Курс', 'Сумма чека (TJS)', 'Сумма чека ($)', 'Учтённая выручка (TJS)',
    'Учтённая выручка ($)', 'Себестоимость (TJS)', 'Себестоимость ($)', 'Прибыль (TJS)',
    'Прибыль ($)', 'Штраф при возврате (TJS)', 'Штраф при возврате ($)', 'Примечание',
  ];
  styleHeader(salesHeader);

  let salesDataRevenueTjs = 0;
  let salesDataRevenueUsd = 0;
  let salesDataCogsTjs = 0;
  let salesDataCogsUsd = 0;
  let salesDataProfitTjs = 0;
  let salesDataProfitUsd = 0;

  for (const sale of sales) {
    const refunded = sale.status === 'REFUNDED';
    const operationRate = sale.exchangeRate || summary.exchangeRate;
    const revenueTjs = refunded ? 0 : sale.totalTjs || 0;
    const revenueUsd = refunded ? 0 : sale.totalUsd || +(revenueTjs / operationRate).toFixed(2);
    const fallbackCostUsd = sale.items.reduce((total, item) => total + (item.costBasisUsd || item.purchaseCostUsd || 0), 0);
    const recognizedProfitUsd = refunded ? 0 : (sale.recognizedProfitUsd ?? +(revenueUsd - fallbackCostUsd).toFixed(2));
    const cogsUsd = refunded ? 0 : +(revenueUsd - recognizedProfitUsd).toFixed(2);
    const cogsTjs = refunded ? 0 : +(cogsUsd * operationRate).toFixed(2);
    const recognizedProfitTjs = refunded ? 0 : +(revenueTjs - cogsTjs).toFixed(2);

    salesDataRevenueTjs += revenueTjs;
    salesDataRevenueUsd += revenueUsd;
    salesDataCogsTjs += cogsTjs;
    salesDataCogsUsd += cogsUsd;
    salesDataProfitTjs += recognizedProfitTjs;
    salesDataProfitUsd += recognizedProfitUsd;

    const row = salesSheet.addRow([
      sale.receiptNumber,
      new Date(sale.date),
      safeWorksheetText(sale.storeName),
      safeWorksheetText(sale.sellerName),
      safeWorksheetText(sale.customerName),
      sale.items.map((item) => `${item.brand} ${item.model} ${item.storage || ''} ${item.color || ''}`.trim()).join('\n') || '-',
      sale.items.map((item) => [item.imei, item.imei2].filter(Boolean).join(' / ')).join('\n') || '-',
      sale.items.length,
      saleStatusLabel(sale.status),
      paymentMethodLabel(sale.paymentMethod),
      operationRate,
      sale.totalTjs || 0,
      sale.totalUsd || 0,
      revenueTjs,
      revenueUsd,
      cogsTjs,
      cogsUsd,
      recognizedProfitTjs,
      recognizedProfitUsd,
      sale.penaltyFeeTjs || 0,
      sale.penaltyFeeUsd || 0,
      refunded
        ? `Возврат: ${safeWorksheetText(sale.refundReason, 'причина не указана')}`
        : sale.hasBelowCostItem
          ? 'Продажа ниже себестоимости'
          : '',
    ]);
    row.height = Math.max(20, sale.items.length * 15);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_DARK } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: columnNumber >= 11 && columnNumber <= 21 ? 'right' : 'left',
        wrapText: columnNumber === 6 || columnNumber === 7 || columnNumber === 22,
      };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
    });
    row.getCell(2).numFmt = 'dd.mm.yyyy hh:mm';
    row.getCell(11).numFmt = '0.0000';
    for (let column = 12; column <= 21; column += 1) row.getCell(column).numFmt = XLSX_MONEY_FORMAT;
    if (recognizedProfitUsd < 0) {
      row.getCell(18).font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_RED } };
      row.getCell(19).font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_RED } };
    }
  }

  salesSheet.autoFilter = { from: 'A4', to: 'V4' };
  const firstSalesRow = 5;
  const lastSalesRow = Math.max(firstSalesRow, firstSalesRow + sales.length - 1);
  const salesRawTotalRow = salesSheet.addRow(['ИТОГО ПО СТРОКАМ:']);
  const salesRawTotalNumber = salesRawTotalRow.number;
  const salesSum = (column: string, result: number) => ({
    formula: sales.length ? `SUM(${column}${firstSalesRow}:${column}${lastSalesRow})` : '0',
    result: +result.toFixed(2),
  });
  salesRawTotalRow.getCell(14).value = salesSum('N', salesDataRevenueTjs);
  salesRawTotalRow.getCell(15).value = salesSum('O', salesDataRevenueUsd);
  salesRawTotalRow.getCell(16).value = salesSum('P', salesDataCogsTjs);
  salesRawTotalRow.getCell(17).value = salesSum('Q', salesDataCogsUsd);
  salesRawTotalRow.getCell(18).value = salesSum('R', salesDataProfitTjs);
  salesRawTotalRow.getCell(19).value = salesSum('S', salesDataProfitUsd);
  styleTotalRow(salesRawTotalRow, XLSX_MUTED);

  const reconciliationRow = salesSheet.addRow(['СВЕРКА С СЕРВЕРОМ (обмены и округления):']);
  reconciliationRow.getCell(14).value = +(summary.revenueTjs - salesDataRevenueTjs).toFixed(2);
  reconciliationRow.getCell(15).value = +(summary.revenueUsd - salesDataRevenueUsd).toFixed(2);
  reconciliationRow.getCell(16).value = +(summary.cogsTjs - salesDataCogsTjs).toFixed(2);
  reconciliationRow.getCell(17).value = +(summary.cogsUsd - salesDataCogsUsd).toFixed(2);
  reconciliationRow.getCell(18).value = +(summary.grossProfitTjs - salesDataProfitTjs).toFixed(2);
  reconciliationRow.getCell(19).value = +(summary.grossProfitUsd - salesDataProfitUsd).toFixed(2);
  reconciliationRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  const recognizedRow = salesSheet.addRow(['ПРИЗНАННАЯ ПРИБЫЛЬ ОТ ПРОДАЖ:']);
  const recognizedRowNumber = recognizedRow.number;
  for (const [column, serverValue] of [
    [14, summary.revenueTjs], [15, summary.revenueUsd], [16, summary.cogsTjs], [17, summary.cogsUsd],
    [18, summary.grossProfitTjs], [19, summary.grossProfitUsd],
  ] as const) {
    const letter = salesSheet.getColumn(column).letter;
    recognizedRow.getCell(column).value = {
      formula: `${letter}${salesRawTotalNumber}+${letter}${reconciliationRow.number}`,
      result: serverValue,
    };
  }
  styleTotalRow(recognizedRow);

  const penaltyRow = salesSheet.addRow(['ШТРАФЫ ЗА ВОЗВРАТЫ ЗА ПЕРИОД:']);
  const penaltyRowNumber = penaltyRow.number;
  penaltyRow.getCell(18).value = summary.refundPenaltiesTjs;
  penaltyRow.getCell(19).value = summary.refundPenaltiesUsd;
  penaltyRow.font = { bold: true, color: { argb: XLSX_DARK } };

  const profitAfterReturnsRow = salesSheet.addRow(['ПРИБЫЛЬ С УЧЁТОМ ВОЗВРАТОВ:']);
  const profitAfterReturnsRowNumber = profitAfterReturnsRow.number;
  profitAfterReturnsRow.getCell(18).value = {
    formula: `R${recognizedRowNumber}+R${penaltyRowNumber}`,
    result: summary.profitTjs,
  };
  profitAfterReturnsRow.getCell(19).value = {
    formula: `S${recognizedRowNumber}+S${penaltyRowNumber}`,
    result: summary.profitUsd,
  };
  styleTotalRow(profitAfterReturnsRow, XLSX_GREEN);

  const bonusRow = salesSheet.addRow(['БОНУСЫ ПОСТАВЩИКОВ:']);
  const bonusRowNumber = bonusRow.number;
  bonusRow.getCell(18).value = summary.cashBonusesTjs;
  bonusRow.getCell(19).value = summary.cashBonusesUsd;
  bonusRow.font = { bold: true, color: { argb: XLSX_GREEN } };

  for (let rowNumber = salesRawTotalNumber; rowNumber <= bonusRowNumber; rowNumber += 1) {
    for (let column = 12; column <= 21; column += 1) salesSheet.getRow(rowNumber).getCell(column).numFmt = XLSX_MONEY_FORMAT;
  }

  // EXPENSES
  styleTitle(expensesSheet, 'K', 'Отчёт по расходам');
  expensesSheet.columns = [
    { width: 19 }, { width: 28 }, { width: 16 }, { width: 19 }, { width: 20 }, { width: 20 },
    { width: 20 }, { width: 36 }, { width: 18 }, { width: 12 }, { width: 18 },
  ];
  const expensesHeader = expensesSheet.getRow(4);
  expensesHeader.values = [
    'Дата и время', 'Категория', 'Тип', 'Магазин', 'Источник списания', 'Сотрудник',
    'Создал', 'Комментарий / назначение', 'Сумма (TJS)', 'Курс', 'Сумма ($)',
  ];
  styleHeader(expensesHeader);

  let expenseRowsTjs = 0;
  let expenseRowsUsd = 0;
  for (const expense of expenses) {
    const operationRate = expense.exchangeRate || summary.exchangeRate;
    const amountUsd = expense.amountUsd ?? +((expense.amountTjs || 0) / operationRate).toFixed(2);
    expenseRowsTjs += expense.amountTjs || 0;
    expenseRowsUsd += amountUsd;
    const row = expensesSheet.addRow([
      new Date(expense.date),
      EXPENSE_CATEGORY_LABELS[expense.category] || expense.category,
      expense.targetType === 'BUSINESS' ? 'Бизнес' : 'Магазин',
      safeWorksheetText(expense.storeName, 'Весь бизнес'),
      safeWorksheetText(expense.sourceAccount, 'Касса'),
      safeWorksheetText(expense.employeeName),
      safeWorksheetText(expense.createdByName),
      safeWorksheetText(expense.comment || expense.description),
      expense.amountTjs || 0,
      operationRate,
      amountUsd,
    ]);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_DARK } };
      cell.alignment = { vertical: 'middle', horizontal: columnNumber >= 9 ? 'right' : 'left', wrapText: columnNumber === 8 };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
    });
    row.getCell(1).numFmt = 'dd.mm.yyyy hh:mm';
    row.getCell(9).numFmt = XLSX_MONEY_FORMAT;
    row.getCell(10).numFmt = '0.0000';
    row.getCell(11).numFmt = XLSX_MONEY_FORMAT;
  }
  expensesSheet.autoFilter = { from: 'A4', to: 'K4' };

  const firstExpenseRow = 5;
  const lastExpenseRow = Math.max(firstExpenseRow, firstExpenseRow + expenses.length - 1);
  const rawExpenseTotalRow = expensesSheet.addRow(['ИТОГО ПО СТРОКАМ:']);
  rawExpenseTotalRow.getCell(9).value = {
    formula: expenses.length ? `SUM(I${firstExpenseRow}:I${lastExpenseRow})` : '0',
    result: +expenseRowsTjs.toFixed(2),
  };
  rawExpenseTotalRow.getCell(11).value = {
    formula: expenses.length ? `SUM(K${firstExpenseRow}:K${lastExpenseRow})` : '0',
    result: +expenseRowsUsd.toFixed(2),
  };
  styleTotalRow(rawExpenseTotalRow, XLSX_MUTED);

  const expenseReconciliationRow = expensesSheet.addRow(['СВЕРКА С СЕРВЕРОМ:']);
  expenseReconciliationRow.getCell(9).value = +(summary.expensesTjs - expenseRowsTjs).toFixed(2);
  expenseReconciliationRow.getCell(11).value = +(summary.expensesUsd - expenseRowsUsd).toFixed(2);
  expenseReconciliationRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  const expenseTotalRow = expensesSheet.addRow(['ИТОГО РАСХОДОВ:']);
  const expenseTotalRowNumber = expenseTotalRow.number;
  expenseTotalRow.getCell(9).value = {
    formula: `I${rawExpenseTotalRow.number}+I${expenseReconciliationRow.number}`,
    result: summary.expensesTjs,
  };
  expenseTotalRow.getCell(11).value = {
    formula: `K${rawExpenseTotalRow.number}+K${expenseReconciliationRow.number}`,
    result: summary.expensesUsd,
  };
  styleTotalRow(expenseTotalRow, 'FFF59E0B');
  for (let rowNumber = rawExpenseTotalRow.number; rowNumber <= expenseTotalRowNumber; rowNumber += 1) {
    expensesSheet.getRow(rowNumber).getCell(9).numFmt = XLSX_MONEY_FORMAT;
    expensesSheet.getRow(rowNumber).getCell(11).numFmt = XLSX_MONEY_FORMAT;
  }

  // SUMMARY
  styleTitle(summarySheet, 'C', 'Итоговый финансовый отчёт');
  summarySheet.columns = [{ width: 43 }, { width: 22 }, { width: 22 }];
  summarySheet.getCell('A3').value = `Сформирован: ${new Date().toLocaleString('ru-RU')}${generatedBy ? `  •  Пользователь: ${generatedBy}` : ''}`;
  summarySheet.mergeCells('A3:C3');
  summarySheet.getCell('A3').font = { italic: true, size: 9, color: { argb: XLSX_MUTED } };

  const summaryHeader = summarySheet.getRow(5);
  summaryHeader.values = ['Показатель', 'TJS', 'USD'];
  styleHeader(summaryHeader);

  const summaryRows = [
    ['Количество проданных устройств', summary.unitsSold, ''],
    ['Выручка', { formula: `'Продажи'!N${recognizedRowNumber}`, result: summary.revenueTjs }, { formula: `'Продажи'!O${recognizedRowNumber}`, result: summary.revenueUsd }],
    ['Себестоимость', { formula: `'Продажи'!P${recognizedRowNumber}`, result: summary.cogsTjs }, { formula: `'Продажи'!Q${recognizedRowNumber}`, result: summary.cogsUsd }],
    ['Прибыль от продаж', { formula: `'Продажи'!R${recognizedRowNumber}`, result: summary.grossProfitTjs }, { formula: `'Продажи'!S${recognizedRowNumber}`, result: summary.grossProfitUsd }],
    ['Штрафы, удержанные при возвратах', { formula: `'Продажи'!R${penaltyRowNumber}`, result: summary.refundPenaltiesTjs }, { formula: `'Продажи'!S${penaltyRowNumber}`, result: summary.refundPenaltiesUsd }],
    ['Прибыль с учётом возвратов', { formula: `'Продажи'!R${profitAfterReturnsRowNumber}`, result: summary.profitTjs }, { formula: `'Продажи'!S${profitAfterReturnsRowNumber}`, result: summary.profitUsd }],
    ['Бонусы поставщиков', { formula: `'Продажи'!R${bonusRowNumber}`, result: summary.cashBonusesTjs }, { formula: `'Продажи'!S${bonusRowNumber}`, result: summary.cashBonusesUsd }],
    ['Расходы', { formula: `'Расходы'!I${expenseTotalRowNumber}`, result: summary.expensesTjs }, { formula: `'Расходы'!K${expenseTotalRowNumber}`, result: summary.expensesUsd }],
  ];
  for (const values of summaryRows) summarySheet.addRow(values);

  const netProfitRow = summarySheet.addRow(['ЧИСТАЯ ПРИБЫЛЬ ПОСЛЕ РАСХОДОВ']);
  const netProfitRowNumber = netProfitRow.number;
  netProfitRow.getCell(2).value = {
    formula: `B11+B12-B13`,
    result: summary.netProfitTjs,
  };
  netProfitRow.getCell(3).value = {
    formula: `C11+C12-C13`,
    result: summary.netProfitUsd,
  };
  styleTotalRow(netProfitRow, summary.netProfitUsd >= 0 ? XLSX_GREEN : XLSX_RED);

  const checkRow = summarySheet.addRow(['Контроль расхождения с серверным итогом']);
  checkRow.getCell(2).value = { formula: `B${netProfitRowNumber}-${summary.netProfitTjs}`, result: 0 };
  checkRow.getCell(3).value = { formula: `C${netProfitRowNumber}-${summary.netProfitUsd}`, result: 0 };
  checkRow.font = { italic: true, color: { argb: XLSX_MUTED } };

  for (let rowNumber = 6; rowNumber <= checkRow.number; rowNumber += 1) {
    const row = summarySheet.getRow(rowNumber);
    row.height = 23;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(2).numFmt = rowNumber === 6 ? '#,##0' : XLSX_MONEY_FORMAT;
    row.getCell(3).numFmt = rowNumber === 6 ? '#,##0' : XLSX_MONEY_FORMAT;
    if (rowNumber !== netProfitRowNumber) {
      row.eachCell((cell) => {
        cell.border = { bottom: { style: 'hair', color: { argb: XLSX_BORDER } } };
      });
    }
  }
  const noteRowNumber = checkRow.number + 2;
  summarySheet.getCell(`A${noteRowNumber}`).value = 'Формула: прибыль с учётом возвратов + бонусы поставщиков − расходы.';
  summarySheet.mergeCells(`A${noteRowNumber}:C${noteRowNumber}`);
  summarySheet.getCell(`A${noteRowNumber}`).font = { italic: true, size: 9, color: { argb: XLSX_MUTED } };

  return workbook;
}

export async function exportComprehensiveReport(input: ComprehensiveReportInput): Promise<void> {
  const workbook = await buildComprehensiveReportWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Date().toISOString().split('T')[0];
  downloadXlsx(buffer, `finansovyi_otchet_${safeFilePart(input.summary.storeName)}_${date}.xlsx`);
}

/**
 * Builds the current-stock inventory report table (excludes SOLD devices).
 */
export function buildInventoryReportTable(devices: Device[], stores: Store[], rate: number = 9.5): ReportTable {
  const storeMap = new Map<string, string>();
  stores.forEach(s => storeMap.set(s.id, s.name));

  const inStockDevices = devices.filter(dev => dev.status !== 'SOLD');

  const headers = [
    'Бренд',
    'Модель',
    'Память',
    'Цвет',
    'IMEI 1',
    'IMEI 2',
    'Локация / Склад',
    'Статус',
    'Поставщик',
    'Себестоимость закупки ($)',
    'Дата прихода'
  ];

  const rows: (string | number)[][] = [];
  let totalUnits = 0;
  let totalCostBasisUsd = 0;

  inStockDevices.forEach((dev) => {
    totalUnits += 1;
    const costUsd = dev.costBasisUsd || dev.purchaseCostUsd || 0;
    totalCostBasisUsd += costUsd;

    const locationName = storeMap.get(dev.locationId) || dev.locationName || dev.locationId;
    const statusText =
      dev.status === 'MAIN_WAREHOUSE' ? 'Главный склад' :
      dev.status === 'STORE_STOCK' ? 'В наличии в магазине' :
      dev.status === 'IN_STOCK_AFTER_EXCHANGE' ? 'Склад (после обмена)' :
      dev.status === 'IN_REPAIR' ? 'В ремонте' : 'Транзит';

    rows.push([
      dev.brand,
      dev.model,
      dev.storage || '-',
      dev.color || '-',
      formatImeiForCsv(dev.imei),
      formatImeiForCsv(dev.imei2),
      locationName,
      statusText,
      dev.supplierName || '-',
      costUsd.toFixed(2),
      dev.createdAt ? dev.createdAt.split('T')[0] : '-'
    ]);
  });

  const totalsRow = [
    'ИТОГО:', '', '', '', '', '', '', '', '',
    `${totalCostBasisUsd.toFixed(2)} (${totalUnits} шт.)`,
    ''
  ];

  return { headers, rows, totalsRow };
}

/**
 * Exports current stock inventory report with full specs, IMEI numbers, locations and totals.
 */
export function exportInventoryReport(devices: Device[], stores: Store[], rate: number = 9.5) {
  const table = buildInventoryReportTable(devices, stores, rate);
  const fileName = `otchet_ostatki_sklada_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(tableToCsv(table), fileName);
}

/**
 * Builds the operational expenses report table.
 */
export function buildExpensesReportTable(expenses: Expense[], rate: number = 9.5): ReportTable {
  const headers = [
    'Дата',
    'Категория',
    'Сумма (TJS)',
    'Курс валюты',
    'Эквивалент ($)',
    'Тип / Направление',
    'Филиал / Магазин',
    'Источник списания',
    'Комментарий / Назначение',
    'Сотрудник'
  ];

  const rows: (string | number)[][] = [];
  let totalTjs = 0;
  let totalUsd = 0;

  expenses.forEach((e) => {
    const amountUsd = e.amountUsd ?? ((e.amountTjs || 0) / (e.exchangeRate || rate));
    totalTjs += e.amountTjs || 0;
    totalUsd += amountUsd;
    rows.push([
      e.date,
      EXPENSE_CATEGORY_LABELS[e.category as string] || e.category,
      (e.amountTjs || 0).toFixed(2),
      e.exchangeRate || rate,
      amountUsd.toFixed(2),
      e.targetType || 'STORE',
      e.storeName || 'Бизнес',
      e.sourceAccount || 'Касса',
      e.comment || '-',
      e.createdByName || 'Администратор'
    ]);
  });

  const totalsRow = [
    'ИТОГО:', `Всего записей: ${expenses.length}`,
    totalTjs.toFixed(2), '', totalUsd.toFixed(2), '', '', '', '', ''
  ];

  return { headers, rows, totalsRow };
}

/**
 * Exports operational expenses report.
 */
export function exportExpensesReport(expenses: Expense[], rate: number = 9.5) {
  const table = buildExpensesReportTable(expenses, rate);
  const fileName = `otchet_rashody_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(tableToCsv(table), fileName);
}

/**
 * Builds the repair tickets journal report table.
 */
export function buildRepairsReportTable(repairs: RepairTicket[], rate: number = 9.5): ReportTable {
  const headers = [
    '№ Квитанции',
    'Дата приема',
    'Магазин',
    'Принял продавец',
    'Клиент (ФИО)',
    'Телефон клиента',
    'Бренд',
    'Модель',
    'IMEI',
    'Неисправность',
    'Статус',
    'Курс валюты',
    'Финальная стоимость (TJS)',
    'Финальная стоимость ($)'
  ];

  const rows: (string | number)[][] = [];
  let totalCostTjs = 0;
  let totalCostUsd = 0;

  repairs.forEach((r) => {
    const costTjs = r.finalCostTjs || r.estimatedCostTjs || 0;
    // Ticket never stored its own rate for the general case, so this falls back to
    // whatever the caller passed in (today's rate) only when no historical rate could
    // be resolved server-side — same amountUsd-first pattern as expenses.
    const operationRate = r.exchangeRate || rate;
    const costUsd = r.finalCostUsd ?? r.estimatedCostUsd ?? +(costTjs / operationRate).toFixed(2);
    totalCostTjs += costTjs;
    totalCostUsd += costUsd;
    rows.push([
      r.ticketNumber,
      r.createdAt ? r.createdAt.split('T')[0] : '-',
      r.storeName || '-',
      r.intakeSeller || '-',
      r.customerName || '-',
      r.customerPhone ? formatImeiForCsv(r.customerPhone) : '-',
      r.brand || '-',
      r.deviceModel || r.model || '-',
      formatImeiForCsv(r.imei),
      r.issueDescription || r.problemDescription || '-',
      REPAIR_STATUS_LABELS[r.status as string] || r.status,
      operationRate,
      costTjs.toFixed(2),
      costUsd.toFixed(2)
    ]);
  });

  const totalsRow = [
    'ИТОГО:', '', '', '', '', '', '', '', '', '',
    `Всего квитанций: ${repairs.length}`,
    '',
    totalCostTjs.toFixed(2),
    totalCostUsd.toFixed(2)
  ];

  return { headers, rows, totalsRow };
}

/**
 * Exports repair tickets journal report.
 */
export function exportRepairsReport(repairs: RepairTicket[], rate: number = 9.5) {
  const table = buildRepairsReportTable(repairs, rate);
  const fileName = `otchet_remonty_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(tableToCsv(table), fileName);
}

/**
 * Exports security audit log report.
 */
export function exportAuditLogsReport(logs: any[]) {
  const headers = ['ID Записи', 'Дата и время', 'Действие / Событие', 'Сотрудник / Пользователь', 'Роль', 'Детали события'];
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
