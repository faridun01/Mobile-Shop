import { beforeEach, describe, expect, it, vi } from 'vitest';
import { D } from '../../common/decimal';

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
    repairTicket: model(),
    device: model(),
    deviceTimelineEvent: model(),
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
    name: 'Мастер Тест',
    role: 'ADMIN',
  }),
}));

const { mockRequireTodayRate, mockCreateExpense } = vi.hoisted(() => ({
  mockRequireTodayRate: vi.fn(),
  mockCreateExpense: vi.fn(),
}));

vi.mock('../exchange-rate/exchange-rate.service', () => ({
  requireTodayRate: mockRequireTodayRate,
}));

vi.mock('../expenses/expenses.service', () => ({
  createExpense: mockCreateExpense,
}));

import { RepairsService } from './repairs.service';

describe('RepairsService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRequireTodayRate.mockResolvedValue(D(10.0));
    mockCreateExpense.mockResolvedValue({ id: 'exp-1' });
  });

  describe('create', () => {
    it('throws error when prepayment is greater than 0', async () => {
      await expect(
        RepairsService.create({
          storeId: 'store-1',
          userId: 'user-1',
          imei: '123456789012345',
          brand: 'Apple',
          model: 'iPhone 13',
          problemDescription: 'Broken screen',
          prepaymentTjs: 50,
        })
      ).rejects.toThrow('Приём предоплаты за ремонт не поддерживается');
    });

    it('creates repair ticket successfully and snapshots USD estimate', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1', imei: '123456789012345' });
      db.repairTicket.create.mockResolvedValue({
        id: 'ticket-1',
        ticketNumber: 101,
        imei: '123456789012345',
        brand: 'Apple',
        model: 'iPhone 13',
        status: 'ACCEPTED',
      });
      db.deviceTimelineEvent.create.mockResolvedValue({ id: 'timeline-1' });
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await RepairsService.create({
        storeId: 'store-1',
        userId: 'user-1',
        imei: '123456789012345',
        brand: 'Apple',
        model: 'iPhone 13',
        problemDescription: 'Broken screen',
        estimatedCostTjs: 200,
      });

      expect(result.id).toBe('ticket-1');
      expect(db.repairTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            storeId: 'store-1',
            brand: 'Apple',
          }),
        })
      );
      const callData = db.repairTicket.create.mock.calls[0][0].data;
      expect(String(callData.estimatedCostTjs)).toBe('200');
      expect(String(callData.estimatedCostUsd)).toBe('20');
      expect(db.deviceTimelineEvent.create).toHaveBeenCalled();
      expect(db.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('throws on invalid status', async () => {
      await expect(
        RepairsService.updateStatus('ticket-1', 'INVALID_STATUS', 'user-1')
      ).rejects.toThrow('Некорректный статус ремонта');
    });

    it('throws if ticket not found', async () => {
      db.repairTicket.findUnique.mockResolvedValue(null);
      await expect(
        RepairsService.updateStatus('ticket-1', 'IN_PROGRESS', 'user-1')
      ).rejects.toThrow('Ремонт не найден');
    });

    it('throws when trying to issue without being READY first', async () => {
      db.repairTicket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        status: 'IN_PROGRESS',
        updatedAt: new Date(),
      });

      await expect(
        RepairsService.updateStatus('ticket-1', 'ISSUED', 'user-1')
      ).rejects.toThrow('Сначала отметьте ремонт как готовый к выдаче');
    });

    it('throws if trying to reissue an already ISSUED ticket', async () => {
      db.repairTicket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        status: 'ISSUED',
        updatedAt: new Date(),
      });

      await expect(
        RepairsService.updateStatus('ticket-1', 'ISSUED', 'user-1')
      ).rejects.toThrow('Этот ремонт уже был выдан клиенту');
    });

    it('updates status to READY without booking expense', async () => {
      const now = new Date();
      db.repairTicket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        ticketNumber: 101,
        status: 'IN_PROGRESS',
        storeId: 'store-1',
        brand: 'Apple',
        model: 'iPhone 13',
        finalCostTjs: null,
        estimatedCostTjs: 150,
        finalCostUsd: null,
        exchangeRate: null,
        updatedAt: now,
      });
      db.repairTicket.update.mockResolvedValue({
        id: 'ticket-1',
        status: 'READY',
      });
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const updated = await RepairsService.updateStatus('ticket-1', 'READY', 'user-1');
      expect(updated.status).toBe('READY');
      expect(mockCreateExpense).not.toHaveBeenCalled();
    });

    it('books REPAIR_PARTS expense when issued with final cost', async () => {
      const now = new Date();
      db.repairTicket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        ticketNumber: 101,
        status: 'READY',
        storeId: 'store-1',
        brand: 'Apple',
        model: 'iPhone 13',
        finalCostTjs: null,
        estimatedCostTjs: 150,
        finalCostUsd: null,
        exchangeRate: null,
        updatedAt: now,
      });
      db.repairTicket.update.mockResolvedValue({
        id: 'ticket-1',
        status: 'ISSUED',
      });
      db.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      await RepairsService.updateStatus('ticket-1', 'ISSUED', 'user-1', 'Выдано клиенту', 250);

      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          category: 'REPAIR_PARTS',
          sourceAccount: 'Центральная касса',
        })
      );
      const expenseData = mockCreateExpense.mock.calls[0][1];
      expect(String(expenseData.amountTjs)).toBe('250');
    });
  });
});
