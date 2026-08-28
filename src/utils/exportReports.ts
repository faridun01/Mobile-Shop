import { Sale, Device, Store, Expense, RepairTicket } from '../types';

/**
 * Clean helper function to trigger CSV file download with UTF-8 BOM
 * ensuring full compatibility with Microsoft Excel, Apple Numbers and Google Sheets.
 */
function downloadCsv(content: string, fileName: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
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
 * Exports sales report with detailed items breakdown, IMEI numbers and comprehensive summary totals.
 */
export function exportSalesReport(sales: Sale[], rate: number = 9.5) {
  const headers = [
    '№ Чека',
    'Дата и время',
    'Магазин',
    'Кассир',
    'Покупатель',
    'Товар / Модель',
    'IMEI 1',
    'IMEI 2',
    'Количество (шт)',
    'Себестоимость ($)',
    'Цена продажи ($)',
    'Сумма продажи (TJS)',
    'Прибыль ($)',
    'Способ оплаты',
    'Статус'
  ];

  const rows: string[][] = [];
  let totalUnits = 0;
  let totalCostBasisUsd = 0;
  let totalRevenueUsd = 0;
  let totalRevenueTjs = 0;
  let totalProfitUsd = 0;

  sales.forEach((sale) => {
    const isRefunded = sale.status === 'REFUNDED';
    const dateFormatted = new Date(sale.date).toLocaleString('ru-RU');

    sale.items.forEach((item) => {
      totalUnits += 1;
      const costUsd = item.costBasisUsd || 0;
      const priceUsd = item.salePriceUsd || +(item.salePriceTjs / rate).toFixed(2);
      const priceTjs = item.salePriceTjs || +(item.salePriceUsd * rate).toFixed(2);
      const profitUsd = +(priceUsd - costUsd).toFixed(2);

      if (!isRefunded) {
        totalCostBasisUsd += costUsd;
        totalRevenueUsd += priceUsd;
        totalRevenueTjs += priceTjs;
        totalProfitUsd += profitUsd;
      }

      rows.push([
        escapeCsvField(sale.receiptNumber),
        escapeCsvField(dateFormatted),
        escapeCsvField(sale.storeName),
        escapeCsvField(sale.sellerName),
        escapeCsvField(sale.customerName || 'Розничный покупатель'),
        escapeCsvField(`${item.brand} ${item.model} ${item.storage || ''} ${item.color || ''}`.trim()),
        escapeCsvField(formatImeiForCsv(item.imei)),
        escapeCsvField(formatImeiForCsv(item.imei2)),
        escapeCsvField(1),
        escapeCsvField(costUsd.toFixed(2)),
        escapeCsvField(priceUsd.toFixed(2)),
        escapeCsvField(priceTjs.toFixed(2)),
        escapeCsvField(profitUsd.toFixed(2)),
        escapeCsvField(sale.paymentMethod === 'CASH' ? 'Наличные' : sale.paymentMethod === 'CARD' ? 'Карта' : 'Раздельная'),
        escapeCsvField(isRefunded ? 'ВОЗВРАТ' : 'ЗАВЕРШЕНА')
      ]);
    });
  });

  // Summary Row "ИТОГО"
  rows.push([]);
  rows.push([
    escapeCsvField('ИТОГО:'),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(`Всего позиций: ${rows.length - 1}`),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(totalUnits),
    escapeCsvField(totalCostBasisUsd.toFixed(2)),
    escapeCsvField(totalRevenueUsd.toFixed(2)),
    escapeCsvField(totalRevenueTjs.toFixed(2)),
    escapeCsvField(totalProfitUsd.toFixed(2)),
    escapeCsvField(''),
    escapeCsvField('')
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_prodazhi_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
}

/**
 * Exports current stock inventory report with full specs, IMEI numbers, locations and totals.
 */
export function exportInventoryReport(devices: Device[], stores: Store[], rate: number = 9.5) {
  const storeMap = new Map<string, string>();
  stores.forEach(s => storeMap.set(s.id, s.name));

  // Exclude SOLD devices from inventory stock export (sold items belong to sales history)
  const inStockDevices = devices.filter(dev => dev.status !== 'SOLD');

  const headers = [
    'Бренд',
    'Модель',
    'Память',
    'Цвет',
    'IMEI 1',
    'IMEI 2',
    'Серийный номер',
    'Локация / Склад',
    'Статус',
    'Поставщик',
    'Себестоимость закупки ($)',
    'Дата прихода'
  ];

  const rows: string[][] = [];
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
      escapeCsvField(dev.brand),
      escapeCsvField(dev.model),
      escapeCsvField(dev.storage || '-'),
      escapeCsvField(dev.color || '-'),
      escapeCsvField(formatImeiForCsv(dev.imei)),
      escapeCsvField(formatImeiForCsv(dev.imei2)),
      escapeCsvField(dev.serialNumber || '-'),
      escapeCsvField(locationName),
      escapeCsvField(statusText),
      escapeCsvField(dev.supplierName || '-'),
      escapeCsvField(costUsd.toFixed(2)),
      escapeCsvField(dev.createdAt ? dev.createdAt.split('T')[0] : '-')
    ]);
  });

  // Summary Row "ИТОГО"
  rows.push([]);
  rows.push([
    escapeCsvField('ИТОГО:'),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(`Всего позиций в остатке: ${totalUnits}`),
    escapeCsvField(totalCostBasisUsd.toFixed(2)),
    escapeCsvField('')
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_ostatki_sklada_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
}

/**
 * Exports operational expenses report.
 */
export function exportExpensesReport(expenses: Expense[], rate: number = 9.5) {
  const headers = [
    'ID Расхода',
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

  const rows: string[][] = [];
  let totalTjs = 0;
  let totalUsd = 0;

  expenses.forEach((e) => {
    totalTjs += e.amountTjs || 0;
    totalUsd += e.amountUsd || 0;
    rows.push([
      escapeCsvField(e.id),
      escapeCsvField(e.date),
      escapeCsvField(e.category),
      escapeCsvField((e.amountTjs || 0).toFixed(2)),
      escapeCsvField(e.exchangeRate || rate),
      escapeCsvField((e.amountUsd || 0).toFixed(2)),
      escapeCsvField(e.targetType || 'STORE'),
      escapeCsvField(e.storeName || 'Бизнес'),
      escapeCsvField(e.sourceAccount || 'Касса'),
      escapeCsvField(e.comment || '-'),
      escapeCsvField(e.createdByName || 'Администратор')
    ]);
  });

  rows.push([]);
  rows.push([
    escapeCsvField('ИТОГО:'),
    escapeCsvField(''),
    escapeCsvField(`Всего записей: ${expenses.length}`),
    escapeCsvField(totalTjs.toFixed(2)),
    escapeCsvField(''),
    escapeCsvField(totalUsd.toFixed(2)),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField('')
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_rashody_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
}

/**
 * Exports repair tickets journal report.
 */
export function exportRepairsReport(repairs: RepairTicket[]) {
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
    'Состояние / Комплект',
    'Статус',
    'Предв. стоимость (TJS)',
    'Финальная стоимость (TJS)'
  ];

  const rows: string[][] = [];
  let totalCostTjs = 0;

  repairs.forEach((r) => {
    const cost = r.finalCostTjs || r.estimatedCostTjs || 0;
    totalCostTjs += cost;
    rows.push([
      escapeCsvField(r.ticketNumber),
      escapeCsvField(r.createdAt ? r.createdAt.split('T')[0] : '-'),
      escapeCsvField(r.storeName || '-'),
      escapeCsvField(r.intakeSeller || '-'),
      escapeCsvField(r.customerName || '-'),
      escapeCsvField(r.customerPhone ? formatImeiForCsv(r.customerPhone) : '-'),
      escapeCsvField(r.brand || '-'),
      escapeCsvField(r.deviceModel || r.model || '-'),
      escapeCsvField(formatImeiForCsv(r.imei)),
      escapeCsvField(r.issueDescription || r.problemDescription || '-'),
      escapeCsvField(`${r.visualCondition || ''} / ${r.equipmentPackage || ''}`.trim()),
      escapeCsvField(r.status),
      escapeCsvField((r.estimatedCostTjs || 0).toFixed(2)),
      escapeCsvField((r.finalCostTjs || 0).toFixed(2))
    ]);
  });

  rows.push([]);
  rows.push([
    escapeCsvField('ИТОГО:'),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(''),
    escapeCsvField(`Всего квитанций: ${repairs.length}`),
    escapeCsvField(''),
    escapeCsvField(totalCostTjs.toFixed(2))
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_remonty_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
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

