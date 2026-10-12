import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    delete: vi.fn(),
  });
  return {
    transferRequest: model(),
    store: model(),
    device: model(),
    deviceTimelineEvent: model(),
    ledgerEntry: model(),
    notification: model(),
    auditLog: model(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
  },
}));

vi.mock('../../common/actor', () => ({
  resolveActor: async (_tx: any, userId: string) => ({
    id: userId,
    name: 'Тест Пользователь',
    role: 'ADMIN',
  }),
}));

vi.mock('../notifications/notification.service', () => ({
  notifyAdmins: vi.fn().mockResolvedValue({ id: 'notif-1' }),
}));

vi.mock('../stock-thresholds/stock-alerts', () => ({
  syncStockAlerts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../websocket/websocket.gateway', () => ({
  RealtimeSyncGateway: {
    broadcast: vi.fn(),
  },
}));

import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('throws if deviceIds is empty', async () => {
      await expect(
        TransfersService.create({
          fromStoreId: 'store-1',
          toStoreId: 'store-2',
          deviceIds: [],
          requestedByUserId: 'user-1',
        })
      ).rejects.toThrow('Выберите устройства для перемещения');
    });

    it('throws if fromStoreId and toStoreId are identical', async () => {
      db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Склад 1', isMainWarehouse: false });

      await expect(
        TransfersService.create({
          fromStoreId: 'store-1',
          toStoreId: 'store-1',
          deviceIds: ['dev-1'],
          requestedByUserId: 'user-1',
        })
      ).rejects.toThrow('Магазин отправления и назначения не могут совпадать');
    });

    it('creates transfer in PENDING_APPROVAL and sets devices to TRANSFER_PENDING', async () => {
      db.store.findUnique.mockImplementation(async ({ where: { id } }: any) => {
        if (id === 'store-1') return { id: 'store-1', name: 'Склад', isMainWarehouse: true };
        if (id === 'store-2') return { id: 'store-2', name: 'Магазин', isMainWarehouse: false };
        return null;
      });

      db.device.findMany.mockResolvedValue([
        { id: 'dev-1', imei: '111', brand: 'Samsung', model: 'S24', storeId: 'store-1', status: 'MAIN_WAREHOUSE' },
      ]);
      db.transferRequest.create.mockResolvedValue({
        id: 'tr-1',
        transferNumber: 'TR-1001',
        status: 'PENDING_APPROVAL',
        items: [{ deviceId: 'dev-1' }],
      });
      db.device.updateMany.mockResolvedValue({ count: 1 });
      db.deviceTimelineEvent.createMany.mockResolvedValue({ count: 1 });
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const transfer = await TransfersService.create({
        fromStoreId: 'store-1',
        toStoreId: 'store-2',
        deviceIds: ['dev-1'],
        requestedByUserId: 'user-1',
      });

      expect(transfer.id).toBe('tr-1');
      expect(db.device.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'TRANSFER_PENDING' },
        })
      );
    });
  });

  describe('createDirect', () => {
    it('creates transfer directly in APPROVED status and updates device location', async () => {
      db.store.findUnique.mockImplementation(async ({ where: { id } }: any) => {
        if (id === 'store-1') return { id: 'store-1', name: 'Склад', isMainWarehouse: true };
        if (id === 'store-2') return { id: 'store-2', name: 'Магазин', isMainWarehouse: false };
        return null;
      });

      db.device.findMany.mockResolvedValue([
        { id: 'dev-1', imei: '111', brand: 'Samsung', model: 'S24', storeId: 'store-1', status: 'MAIN_WAREHOUSE' },
      ]);
      db.transferRequest.create.mockResolvedValue({
        id: 'tr-direct',
        transferNumber: 'TR-DIR-1',
        status: 'APPROVED',
        items: [{ deviceId: 'dev-1' }],
      });
      db.device.updateMany.mockResolvedValue({ count: 1 });
      db.deviceTimelineEvent.createMany.mockResolvedValue({ count: 1 });
      db.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const transfer = await TransfersService.createDirect({
        fromStoreId: 'store-1',
        toStoreId: 'store-2',
        deviceIds: ['dev-1'],
        requestedByUserId: 'user-1',
      });

      expect(transfer.id).toBe('tr-direct');
      expect(db.device.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { storeId: 'store-2', status: 'STORE_STOCK' },
        })
      );
    });
  });

  describe('approve', () => {
    it('approves pending transfer and updates devices to destination status', async () => {
      db.transferRequest.findUnique.mockResolvedValue({
        id: 'tr-1',
        transferNumber: 'TR-1001',
        status: 'PENDING_APPROVAL',
        fromStoreId: 'store-1',
        toStoreId: 'store-2',
        fromStore: { name: 'Склад', isMainWarehouse: true },
        toStore: { name: 'Магазин', isMainWarehouse: false },
        items: [{ deviceId: 'dev-1' }],
      });
      db.device.updateMany.mockResolvedValue({ count: 1 });
      db.transferRequest.update.mockResolvedValue({ id: 'tr-1', status: 'APPROVED' });
      db.deviceTimelineEvent.createMany.mockResolvedValue({ count: 1 });
      db.ledgerEntry.create.mockResolvedValue({ id: 'ledger-1' });
      db.notification.updateMany.mockResolvedValue({ count: 1 });
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await TransfersService.approve('tr-1', 'admin-1');

      expect(result.status).toBe('APPROVED');
      expect(db.device.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['dev-1'] }, status: 'TRANSFER_PENDING' },
          data: { storeId: 'store-2', status: 'STORE_STOCK' },
        })
      );
    });

    it('throws if transfer is not in PENDING_APPROVAL status', async () => {
      db.transferRequest.findUnique.mockResolvedValue({
        id: 'tr-1',
        status: 'APPROVED',
        fromStore: { name: 'Склад', isMainWarehouse: true },
        toStore: { name: 'Магазин', isMainWarehouse: false },
        items: [],
      });

      await expect(TransfersService.approve('tr-1', 'admin-1')).rejects.toThrow(
        'Этот запрос уже обработан'
      );
    });
  });
});
