import { describe, expect, it } from 'vitest';
import { buildCustomersWorkbook } from './exportCustomers';
import { Customer } from '../types';

describe('exportCustomers', () => {
  const mockCustomers: Customer[] = [
    {
      id: 'cust-1',
      name: 'Алишер Каримов',
      phone: '+992900112233',
      totalDebtTjs: 500,
      totalPaidTjs: 1200,
      salesCount: 3,
      paymentsCount: 2,
      note: 'Постоянный клиент',
      lastSale: {
        createdAt: '2026-10-01T12:00:00.000Z',
        receiptNumber: 1045,
        totalTjs: 1500,
      },
      createdAt: '2026-01-15T08:00:00.000Z',
    },
    {
      id: 'cust-2',
      name: 'Рустам Саидов',
      phone: null,
      totalDebtTjs: 0,
      totalPaidTjs: 4000,
      salesCount: 5,
      paymentsCount: 0,
      note: null,
      lastSale: null,
      createdAt: '2026-03-20T10:00:00.000Z',
    },
  ];

  it('builds a customer workbook with correct columns and totals', async () => {
    const workbook = await buildCustomersWorkbook({
      customers: mockCustomers,
      filterLabel: 'Все клиенты',
      generatedBy: 'Администратор',
    });

    const sheet = workbook.getWorksheet('Клиенты');
    expect(sheet).toBeDefined();

    // Check title banner
    expect(sheet?.getCell('A1').value).toBe('База клиентов — Mobile Shop');

    // Check header row (row 4)
    expect(sheet?.getCell('A4').value).toBe('№');
    expect(sheet?.getCell('B4').value).toBe('Имя клиента');
    expect(sheet?.getCell('C4').value).toBe('Телефон');
    expect(sheet?.getCell('D4').value).toBe('Текущий долг (TJS)');

    // Check customer rows
    expect(sheet?.getCell('B5').value).toBe('Алишер Каримов');
    expect(sheet?.getCell('C5').value).toBe('+992900112233');
    expect(sheet?.getCell('D5').value).toBe(500);

    expect(sheet?.getCell('B6').value).toBe('Рустам Саидов');
    expect(sheet?.getCell('C6').value).toBe('—');
    expect(sheet?.getCell('D6').value).toBe(0);

    // Check totals row (row 7)
    expect(sheet?.getCell('A7').value).toBe('ИТОГО:');
    expect(sheet?.getCell('B7').value).toBe('2 клиентов');

    // Check xlsx serialization
    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('handles empty customer list gracefully', async () => {
    const workbook = await buildCustomersWorkbook({
      customers: [],
      filterLabel: 'Клиенты с задолженностью',
    });

    const sheet = workbook.getWorksheet('Клиенты');
    expect(sheet).toBeDefined();
    expect(sheet?.getCell('A5').value).toBe('ИТОГО:');
    expect(sheet?.getCell('B5').value).toBe('0 клиентов');
  });
});
