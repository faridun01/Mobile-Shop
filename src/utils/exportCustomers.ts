import { Customer } from '../types';
import { downloadXlsx } from './exportReports';

export interface ExportCustomersOptions {
  customers: Customer[];
  filterLabel?: string;
  totalDebtTjs?: number;
  totalPaidTjs?: number;
  generatedBy?: string;
}

const XLSX_GREEN = 'FF16A34A';
const XLSX_DARK = 'FF0F172A';
const XLSX_MUTED = 'FF64748B';
const XLSX_LIGHT_BORDER = 'FFE2E8F0';
const XLSX_WHITE = 'FFFFFFFF';
const XLSX_AMBER_BG = 'FFFEF3C7';
const XLSX_ZEBRA = 'FFF8FAFC';

export async function buildCustomersWorkbook({
  customers,
  filterLabel = 'Все клиенты',
  totalDebtTjs,
  totalPaidTjs,
  generatedBy = 'Mobile Shop',
}: ExportCustomersOptions): Promise<import('exceljs').Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = generatedBy;
  const meta = workbook as unknown as { company?: string; subject?: string; title?: string };
  meta.company = 'Mobile Shop';
  meta.subject = 'База клиентов';
  meta.title = 'Экспорт базы клиентов';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet('Клиенты', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: true }],
    properties: { tabColor: { argb: XLSX_GREEN } },
  });

  // Calculate totals if not provided
  const calcTotalDebt = totalDebtTjs ?? customers.reduce((sum, c) => sum + (c.totalDebtTjs || 0), 0);
  const calcTotalPaid = totalPaidTjs ?? customers.reduce((sum, c) => sum + (c.totalPaidTjs || 0), 0);
  const debtorsCount = customers.filter((c) => (c.totalDebtTjs || 0) > 0).length;

  // Title Banner
  sheet.mergeCells('A1:K1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'База клиентов — Mobile Shop';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: XLSX_WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_DARK } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 32;

  // Subtitle Banner
  sheet.mergeCells('A2:K2');
  const subCell = sheet.getCell('A2');
  const dateFormatted = new Date().toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  subCell.value = `Дата выгрузки: ${dateFormatted}  •  Фильтр: ${filterLabel}  •  Клиентов: ${customers.length} (с долгом: ${debtorsCount})  •  Общий долг: ${calcTotalDebt.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TJS`;
  subCell.font = { name: 'Calibri', size: 10, color: { argb: XLSX_MUTED } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(2).height = 24;

  // Blank separator row
  sheet.getRow(3).height = 8;

  // Column Headers
  const headers = [
    '№',
    'Имя клиента',
    'Телефон',
    'Текущий долг (TJS)',
    'Оплачено долга (TJS)',
    'Покупок',
    'Оплат',
    'Последняя покупка',
    'Сумма посл. чека (TJS)',
    'Примечание',
    'Дата добавления',
  ];

  sheet.columns = [
    { key: 'num', width: 6 },
    { key: 'name', width: 28 },
    { key: 'phone', width: 18 },
    { key: 'debt', width: 22 },
    { key: 'paid', width: 22 },
    { key: 'sales', width: 12 },
    { key: 'payments', width: 12 },
    { key: 'lastSale', width: 24 },
    { key: 'lastSaleTotal', width: 22 },
    { key: 'note', width: 32 },
    { key: 'createdAt', width: 18 },
  ];

  const headerRow = sheet.getRow(4);
  headerRow.height = 28;
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_GREEN } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: XLSX_GREEN } },
      bottom: { style: 'medium', color: { argb: 'FF15803D' } },
      left: { style: 'thin', color: { argb: 'FF16A34A' } },
      right: { style: 'thin', color: { argb: 'FF16A34A' } },
    };
  });

  // Enable AutoFilter
  sheet.autoFilter = `A4:K${Math.max(customers.length + 4, 5)}`;

  // Populate data rows
  const moneyFormat = '#,##0.00;[Red]-#,##0.00;"-"';
  const countFormat = '#,##0;;"-"';

  customers.forEach((c, idx) => {
    const rowNumber = idx + 5;
    const row = sheet.getRow(rowNumber);
    row.height = 22;

    const isZebra = idx % 2 === 1;
    const hasDebt = (c.totalDebtTjs || 0) > 0;
    const lastSaleText = c.lastSale
      ? `${new Date(c.lastSale.createdAt).toLocaleDateString('ru-RU')} (№${c.lastSale.receiptNumber})`
      : '—';
    const lastSaleAmount = c.lastSale ? Number(c.lastSale.totalTjs) : null;
    const createdDateText = c.createdAt ? new Date(c.createdAt).toLocaleDateString('ru-RU') : '—';

    row.getCell(1).value = idx + 1;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell(2).value = c.name || '—';
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };

    row.getCell(3).value = c.phone || '—';
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };

    // Debt cell
    const debtCell = row.getCell(4);
    debtCell.value = Number(c.totalDebtTjs || 0);
    debtCell.numFmt = moneyFormat;
    debtCell.alignment = { vertical: 'middle', horizontal: 'right' };
    if (hasDebt) {
      debtCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } };
      debtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_AMBER_BG } };
    }

    // Paid cell
    const paidCell = row.getCell(5);
    paidCell.value = Number(c.totalPaidTjs || 0);
    paidCell.numFmt = moneyFormat;
    paidCell.alignment = { vertical: 'middle', horizontal: 'right' };

    // Sales count
    const salesCell = row.getCell(6);
    salesCell.value = Number(c.salesCount || 0);
    salesCell.numFmt = countFormat;
    salesCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Payments count
    const paymentsCell = row.getCell(7);
    paymentsCell.value = Number(c.paymentsCount || 0);
    paymentsCell.numFmt = countFormat;
    paymentsCell.alignment = { vertical: 'middle', horizontal: 'center' };

    // Last sale info
    row.getCell(8).value = lastSaleText;
    row.getCell(8).alignment = { vertical: 'middle', horizontal: 'left' };

    // Last sale amount
    const lastSaleCell = row.getCell(9);
    if (lastSaleAmount !== null) {
      lastSaleCell.value = lastSaleAmount;
      lastSaleCell.numFmt = moneyFormat;
    } else {
      lastSaleCell.value = '—';
    }
    lastSaleCell.alignment = { vertical: 'middle', horizontal: 'right' };

    // Note
    row.getCell(10).value = c.note || '—';
    row.getCell(10).alignment = { vertical: 'middle', horizontal: 'left' };

    // Created at
    row.getCell(11).value = createdDateText;
    row.getCell(11).alignment = { vertical: 'middle', horizontal: 'center' };

    // Default borders & zebra styling
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = {
        bottom: { style: 'thin', color: { argb: XLSX_LIGHT_BORDER } },
        right: { style: 'thin', color: { argb: XLSX_LIGHT_BORDER } },
        left: { style: 'thin', color: { argb: XLSX_LIGHT_BORDER } },
      };
      if (colNumber !== 4 && isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_ZEBRA } };
      }
    });
  });

  // Totals Row
  const totalRowNumber = customers.length + 5;
  const totalRow = sheet.getRow(totalRowNumber);
  totalRow.height = 26;

  totalRow.getCell(1).value = 'ИТОГО:';
  totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

  totalRow.getCell(2).value = `${customers.length} клиентов`;
  totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };

  totalRow.getCell(3).value = '';

  const lastDataRow = Math.max(customers.length + 4, 5);
  // Total Debt formula
  const debtTotalCell = totalRow.getCell(4);
  debtTotalCell.value = {
    formula: `SUM(D5:D${lastDataRow})`,
    result: calcTotalDebt,
    date1904: false,
  };
  debtTotalCell.numFmt = moneyFormat;
  debtTotalCell.alignment = { vertical: 'middle', horizontal: 'right' };

  // Total Paid formula
  const paidTotalCell = totalRow.getCell(5);
  paidTotalCell.value = {
    formula: `SUM(E5:E${lastDataRow})`,
    result: calcTotalPaid,
    date1904: false,
  };
  paidTotalCell.numFmt = moneyFormat;
  paidTotalCell.alignment = { vertical: 'middle', horizontal: 'right' };

  // Total Sales Count formula
  const salesTotalCell = totalRow.getCell(6);
  salesTotalCell.value = {
    formula: `SUM(F5:F${lastDataRow})`,
    result: customers.reduce((sum, c) => sum + (c.salesCount || 0), 0),
    date1904: false,
  };
  salesTotalCell.numFmt = countFormat;
  salesTotalCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Total Payments Count formula
  const paymentsTotalCell = totalRow.getCell(7);
  paymentsTotalCell.value = {
    formula: `SUM(G5:G${lastDataRow})`,
    result: customers.reduce((sum, c) => sum + (c.paymentsCount || 0), 0),
    date1904: false,
  };
  paymentsTotalCell.numFmt = countFormat;
  paymentsTotalCell.alignment = { vertical: 'middle', horizontal: 'center' };

  totalRow.getCell(8).value = '';
  totalRow.getCell(9).value = '';
  totalRow.getCell(10).value = '';
  totalRow.getCell(11).value = '';

  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: XLSX_WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_DARK } };
    cell.border = {
      top: { style: 'medium', color: { argb: XLSX_DARK } },
      bottom: { style: 'medium', color: { argb: XLSX_DARK } },
    };
  });

  return workbook;
}

export async function exportCustomersToExcel(options: ExportCustomersOptions): Promise<void> {
  const workbook = await buildCustomersWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().split('T')[0];
  const isDebtors = options.filterLabel?.includes('долг');
  const filename = isDebtors ? `baza_dolzhnikov_${dateStr}.xlsx` : `baza_klientov_${dateStr}.xlsx`;
  await downloadXlsx(buffer, filename);
}
