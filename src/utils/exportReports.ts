import { Sale, Device, Store, Expense, RepairTicket } from '../types';

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
export function buildSalesReportTable(sales: Sale[], rate: number = 9.5): ReportTable {
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

    sale.items.forEach((item) => {
      totalUnits += 1;
      const costUsd = item.costBasisUsd || 0;
      const priceUsd = item.salePriceUsd || +(item.salePriceTjs / operationRate).toFixed(2);
      const priceTjs = item.salePriceTjs || +(item.salePriceUsd * operationRate).toFixed(2);
      // A refunded sale's original margin is void — it never counts toward totals, and
      // showing the stale pre-refund number here would misleadingly suggest it still does.
      const profitUsd = isRefunded ? 0 : +(priceUsd - costUsd).toFixed(2);

      if (!isRefunded) {
        totalCostBasisUsd += costUsd;
        totalRevenueUsd += priceUsd;
        totalRevenueTjs += priceTjs;
        totalProfitUsd += profitUsd;
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
        profitUsd.toFixed(2),
        sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная',
        isRefunded ? 'ВОЗВРАТ' : 'ЗАВЕРШЕНА'
      ]);
    });

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
        penaltyUsd.toFixed(2),
        sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная',
        'ВОЗВРАТ (ШТРАФ)'
      ]);
    }
  });

  const totalsRow = [
    'ИТОГО:', '', '', '',
    `Всего позиций: ${rows.length}`,
    totalUnits,
    totalCostBasisUsd.toFixed(2),
    totalRevenueUsd.toFixed(2),
    totalRevenueTjs.toFixed(2),
    totalProfitUsd.toFixed(2),
    '', ''
  ];

  return { headers, rows, totalsRow };
}

/**
 * Exports sales report with detailed items breakdown, IMEI numbers and comprehensive summary totals.
 */
export function exportSalesReport(sales: Sale[], rate: number = 9.5) {
  const table = buildSalesReportTable(sales, rate);
  const fileName = `otchet_prodazhi_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(tableToCsv(table), fileName);
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
    totalTjs += e.amountTjs || 0;
    totalUsd += e.amountUsd || 0;
    rows.push([
      e.date,
      EXPENSE_CATEGORY_LABELS[e.category as string] || e.category,
      (e.amountTjs || 0).toFixed(2),
      e.exchangeRate || rate,
      (e.amountUsd || 0).toFixed(2),
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
export function buildRepairsReportTable(repairs: RepairTicket[]): ReportTable {
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
    'Финальная стоимость (TJS)'
  ];

  const rows: (string | number)[][] = [];
  let totalCostTjs = 0;

  repairs.forEach((r) => {
    const cost = r.finalCostTjs || r.estimatedCostTjs || 0;
    totalCostTjs += cost;
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
      (r.finalCostTjs || 0).toFixed(2)
    ]);
  });

  const totalsRow = [
    'ИТОГО:', '', '', '', '', '', '', '', '', '',
    `Всего квитанций: ${repairs.length}`,
    totalCostTjs.toFixed(2)
  ];

  return { headers, rows, totalsRow };
}

/**
 * Exports repair tickets journal report.
 */
export function exportRepairsReport(repairs: RepairTicket[]) {
  const table = buildRepairsReportTable(repairs);
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
