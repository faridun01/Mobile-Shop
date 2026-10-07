import { describe, it, expect } from 'vitest';
import { getTransferInvoiceItems, formatTransferInvoiceText } from './transferInvoice';
import { TransferRequest, Device } from '../types';

describe('transferInvoice utils', () => {
  const mockTransfer: TransferRequest = {
    id: 'tr-1',
    transferNumber: 'TR-20261007-001',
    fromLocationId: 'store-1',
    fromLocationName: 'Главный Склад',
    toLocationId: 'store-2',
    toLocationName: 'Магазин Рудаки',
    deviceIds: ['dev-1', 'dev-2'],
    deviceImeis: ['111222333444555', '999888777666555'],
    deviceBrands: ['Apple', 'Samsung'],
    deviceModels: ['iPhone 15 Pro', 'Galaxy S24 Ultra'],
    requestedBy: 'Алиджон',
    requestedAt: '2026-10-07T12:00:00.000Z',
    status: 'APPROVED',
    approvedBy: 'Фаррух',
    approvedAt: '2026-10-07T12:30:00.000Z',
  };

  const mockDevice1: Device = {
    id: 'dev-1',
    imei: '111222333444555',
    brand: 'Apple',
    model: 'iPhone 15 Pro',
    storage: '256GB',
    color: 'Natural Titanium',
    status: 'STORE_STOCK',
    locationId: 'store-2',
    locationName: 'Магазин Рудаки',
    purchaseCostUsd: 950,
    costBasisUsd: 950,
    createdAt: '2026-10-01T10:00:00.000Z',
    timeline: [],
  };

  const devicesById = new Map<string, Device>([['dev-1', mockDevice1]]);
  const devicesByImei = new Map<string, Device>([['111222333444555', mockDevice1]]);

  it('correctly maps transfer items with enriched device details', () => {
    const items = getTransferInvoiceItems(mockTransfer, devicesById, devicesByImei);
    expect(items).toHaveLength(2);

    expect(items[0]).toMatchObject({
      index: 1,
      deviceId: 'dev-1',
      imei: '111222333444555',
      fullName: 'Apple iPhone 15 Pro',
      storage: '256GB',
      color: 'Natural Titanium',
      costUsd: 950,
    });

    expect(items[1]).toMatchObject({
      index: 2,
      deviceId: 'dev-2',
      imei: '999888777666555',
      fullName: 'Samsung Galaxy S24 Ultra',
      costUsd: 0,
    });
  });

  it('formats clean plain text for waybill sharing', () => {
    const text = formatTransferInvoiceText(mockTransfer, devicesById, devicesByImei);
    expect(text).toContain('НАКЛАДНАЯ НА ПЕРЕМЕЩЕНИЕ №TR-20261007-001');
    expect(text).toContain('ОТПРАВИТЕЛЬ: Главный Склад');
    expect(text).toContain('ПОЛУЧАТЕЛЬ: Магазин Рудаки');
    expect(text).toContain('Apple iPhone 15 Pro 256GB (Natural Titanium)');
    expect(text).toContain('IMEI: 111222333444555');
    expect(text).toContain('Сдал: Алиджон');
    expect(text).toContain('Принял: Фаррух');
    expect(text).toContain('Всего позиций: 2 шт.');
  });
});
