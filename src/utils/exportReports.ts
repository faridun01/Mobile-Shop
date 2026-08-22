import { Sale, Device, Store } from '../types';

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
 * Exports sales report with detailed items breakdown and comprehensive summary totals.
 */
export function exportSalesReport(sales: Sale[], rate: number = 9.5) {
  const headers = [
    '№ Чека',
    'Дата и время',
    'Магазин',
    'Кассир',
    'Покупатель',
    'Товар / Модель',
    'IMEI',
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
        escapeCsvField(item.imei),
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
 * Exports current stock inventory report with full specs, locations and totals.
 */
export function exportInventoryReport(devices: Device[], stores: Store[], rate: number = 9.5) {
  const storeMap = new Map<string, string>();
  stores.forEach(s => storeMap.set(s.id, s.name));

  const headers = [
    'Бренд',
    'Модель',
    'Память',
    'Цвет',
    'IMEI 1',
    'IMEI 2',
    'Серийный номер',
    'Штрихкод',
    'Локация / Склад',
    'Статус',
    'Поставщик',
    'Себестоимость закупки ($)',
    'Ориентировочная розница ($)',
    'Ориентировочная розница (TJS)',
    'Дата прихода'
  ];

  const rows: string[][] = [];
  let totalUnits = 0;
  let totalCostBasisUsd = 0;
  let totalRetailUsd = 0;
  let totalRetailTjs = 0;

  devices.forEach((dev) => {
    totalUnits += 1;
    const costUsd = dev.costBasisUsd || dev.purchaseCostUsd || 0;
    const retailUsd = Math.round(costUsd * 1.15); // standard estimated markup
    const retailTjs = Math.round(retailUsd * rate);

    totalCostBasisUsd += costUsd;
    totalRetailUsd += retailUsd;
    totalRetailTjs += retailTjs;

    const locationName = storeMap.get(dev.locationId) || dev.locationName || dev.locationId;
    const statusText = 
      dev.status === 'MAIN_WAREHOUSE' ? 'Главный склад' :
      dev.status === 'STORE_STOCK' ? 'В наличии в магазине' :
      dev.status === 'SOLD' ? 'Продан' :
      dev.status === 'IN_STOCK_AFTER_EXCHANGE' ? 'Склад (после обмена)' :
      dev.status === 'IN_REPAIR' ? 'В ремонте' : 'Транзит';

    rows.push([
      escapeCsvField(dev.brand),
      escapeCsvField(dev.model),
      escapeCsvField(dev.storage || '-'),
      escapeCsvField(dev.color || '-'),
      escapeCsvField(dev.imei),
      escapeCsvField(dev.imei2 || '-'),
      escapeCsvField(dev.serialNumber || '-'),
      escapeCsvField(dev.barcode || '-'),
      escapeCsvField(locationName),
      escapeCsvField(statusText),
      escapeCsvField(dev.supplierName || '-'),
      escapeCsvField(costUsd.toFixed(2)),
      escapeCsvField(retailUsd.toFixed(2)),
      escapeCsvField(retailTjs.toFixed(2)),
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
    escapeCsvField(`Всего на складе: ${totalUnits} шт`),
    escapeCsvField(totalCostBasisUsd.toFixed(2)),
    escapeCsvField(totalRetailUsd.toFixed(2)),
    escapeCsvField(totalRetailTjs.toFixed(2)),
    escapeCsvField('')
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const fileName = `otchet_ostatki_sklada_${new Date().toISOString().split('T')[0]}.csv`;
  downloadCsv(csvContent, fileName);
}
