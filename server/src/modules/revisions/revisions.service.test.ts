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
    user: model(),
    store: model(),
    device: model(),
    stockRevision: model(),
    auditLog: model(),
    notification: model(),
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
    name: userId === 'user-seller' ? 'Алишер' : 'Админ',
    role: userId === 'user-seller' ? 'SELLER' : 'ADMIN',
  }),
}));

vi.mock('../notifications/notification.service', () => ({
  notifyAdmins: vi.fn().mockResolvedValue({ id: 'notif-1' }),
}));

vi.mock('../../websocket/websocket.gateway', () => ({
  RealtimeSyncGateway: {
    broadcast: vi.fn(),
  },
}));

import { StockRevisionService } from './revisions.service';

describe('StockRevisionService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('saves revision with status MATCH when all store devices are checked and no surplus', async () => {
      db.user.findUnique.mockResolvedValue({ id: 'user-admin', storeId: null, role: 'ADMIN' });
      db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Магазин 1', isMainWarehouse: false });
      db.device.findMany.mockResolvedValue([
        { id: 'dev-1', imei: '111111111111111', imei2: null, brand: 'Apple', model: 'iPhone 15', storage: '128', color: 'Black', purchasePriceUsd: 700 },
        { id: 'dev-2', imei: '222222222222222', imei2: '333333333333333', brand: 'Samsung', model: 'S24', storage: '256', color: 'Gray', purchasePriceUsd: 650 },
      ]);
      db.stockRevision.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'rev-1', ...data }));
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await StockRevisionService.create(
        { userId: 'user-admin', role: 'ADMIN' },
        {
          storeId: 'store-1',
          checkedImeis: ['111111111111111', '333333333333333'], // Matches dev-1 via imei and dev-2 via imei2
          comment: 'Все на месте',
        }
      );

      expect(result.status).toBe('MATCH');
      expect(result.totalExpected).toBe(2);
      expect(result.totalChecked).toBe(2);
      expect(result.totalMissing).toBe(0);
      expect(result.totalSurplus).toBe(0);
      expect(result.missingDevices).toEqual([]);
      expect(result.comment).toBe('Все на месте');
      expect(db.stockRevision.create).toHaveBeenCalledTimes(1);
    });

    it('records DISCREPANCY with missing and surplus devices', async () => {
      db.user.findUnique.mockResolvedValue({ id: 'user-seller', storeId: 'store-1', role: 'SELLER' });
      db.store.findUnique.mockResolvedValue({ id: 'store-1', name: 'Магазин 1', isMainWarehouse: false });
      db.device.findMany.mockResolvedValue([
        { id: 'dev-1', imei: '111111111111111', imei2: null, brand: 'Apple', model: 'iPhone 15', storage: '128', color: 'Black', purchasePriceUsd: 700 },
        { id: 'dev-2', imei: '222222222222222', imei2: null, brand: 'Xiaomi', model: '14', storage: '256', color: 'Green', purchasePriceUsd: 400 },
      ]);
      db.stockRevision.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'rev-2', ...data }));
      db.auditLog.create.mockResolvedValue({ id: 'audit-2' });

      const result = await StockRevisionService.create(
        { userId: 'user-seller', role: 'SELLER', storeId: 'store-1' },
        {
          storeId: 'store-1',
          checkedImeis: ['111111111111111'],
          surplusDevices: [{ code: '999999999999999', note: 'Лишний телефон' }],
          comment: 'Не нашли Xiaomi 14',
        }
      );

      expect(result.status).toBe('DISCREPANCY');
      expect(result.totalExpected).toBe(2);
      expect(result.totalChecked).toBe(1);
      expect(result.totalMissing).toBe(1);
      expect(result.totalSurplus).toBe(1);
      expect(result.missingDevices).toHaveLength(1);
      expect((result.missingDevices as any)[0].imei).toBe('222222222222222');
      expect(result.surplusDevices).toEqual([{ code: '999999999999999', note: 'Лишний телефон' }]);
    });
  });

  describe('list', () => {
    it('returns stock revisions for the requested store', async () => {
      db.stockRevision.findMany.mockResolvedValue([
        { id: 'rev-1', storeId: 'store-1', status: 'MATCH', totalExpected: 5, totalChecked: 5 },
      ]);

      const list = await StockRevisionService.list(
        { userId: 'user-admin', role: 'ADMIN' },
        { storeId: 'store-1' }
      );

      expect(list).toHaveLength(1);
      expect(db.stockRevision.findMany).toHaveBeenCalledWith({
        where: { storeId: 'store-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });

    it('enforces storeId for seller users', async () => {
      db.user.findUnique.mockResolvedValue({ id: 'user-seller', storeId: 'store-seller', role: 'SELLER' });
      db.stockRevision.findMany.mockResolvedValue([]);

      await StockRevisionService.list(
        { userId: 'user-seller', role: 'SELLER', storeId: 'store-seller' },
        { storeId: 'other-store' }
      );

      expect(db.stockRevision.findMany).toHaveBeenCalledWith({
        where: { storeId: 'store-seller' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    });
  });

  describe('getById', () => {
    it('returns revision by id', async () => {
      db.stockRevision.findUnique.mockResolvedValue({
        id: 'rev-1',
        storeId: 'store-1',
        status: 'MATCH',
      });

      const item = await StockRevisionService.getById(
        { userId: 'user-admin', role: 'ADMIN' },
        'rev-1'
      );

      expect(item.id).toBe('rev-1');
    });

    it('throws 403 if seller tries to view another store revision', async () => {
      db.user.findUnique.mockResolvedValue({ id: 'user-seller', storeId: 'store-1', role: 'SELLER' });
      db.stockRevision.findUnique.mockResolvedValue({
        id: 'rev-other',
        storeId: 'store-2',
      });

      await expect(
        StockRevisionService.getById(
          { userId: 'user-seller', role: 'SELLER', storeId: 'store-1' },
          'rev-other'
        )
      ).rejects.toThrow('Нет доступа к этой сверке');
    });
  });
});
