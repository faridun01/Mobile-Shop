import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DailyClosingService } from './daily-closing.service';
import { prisma } from '../../prisma/prisma.service';

vi.mock('../../prisma/prisma.service', () => {
  const store = { findUnique: vi.fn() };
  const dailyCashClosing = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() };
  const sale = { findMany: vi.fn() };
  const expense = { findMany: vi.fn() };
  const cashHandover = { findMany: vi.fn() };
  const auditLog = { create: vi.fn() };
  const notification = { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'n1' }) };
  const user = { findUnique: vi.fn() };

  const tx = { store, dailyCashClosing, sale, expense, cashHandover, auditLog, notification, user };

  return {
    prisma: {
      ...tx,
      $transaction: vi.fn((cb: any) => cb(tx)),
    },
  };
});

vi.mock('../../common/actor', () => ({
  resolveActor: vi.fn().mockResolvedValue({ id: 'u1', name: 'Alisher', role: 'SELLER' }),
}));

vi.mock('../../websocket/websocket.gateway', () => ({
  RealtimeSyncGateway: {
    broadcast: vi.fn(),
    notifyDataRefresh: vi.fn(),
  },
}));

describe('DailyClosingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly calculates expected cash when day is open', async () => {
    (prisma.store.findUnique as any).mockResolvedValue({
      id: 'store-1',
      name: 'Сиёма',
      isMainWarehouse: false,
      active: true,
    });

    // No existing closing today
    (prisma.dailyCashClosing.findUnique as any).mockResolvedValue(null);

    // Previous closing with 500 TJS and $50
    (prisma.dailyCashClosing.findFirst as any).mockResolvedValue({
      actualCashTjs: 500,
      actualCashUsd: 50,
      businessDate: '2026-10-05',
    });

    // Sales today: 1 cash sale of 1000 TJS, 1 card sale of 400 TJS
    (prisma.sale.findMany as any)
      .mockResolvedValueOnce([
        { id: 's1', cashAmountTjs: 1000, cardAmountTjs: 400, totalUsd: 100, exchangeRate: 10 },
      ])
      // Refunds: 0
      .mockResolvedValueOnce([]);

    // Expenses: 1 expense of 100 TJS and $10
    (prisma.expense.findMany as any).mockResolvedValue([
      { id: 'e1', amountTjs: 100, amountUsd: 0 },
      { id: 'e2', amountTjs: 0, amountUsd: 10 },
    ]);

    // Collections: 0
    (prisma.cashHandover.findMany as any).mockResolvedValue([]);

    const summary = await DailyClosingService.getSummary('store-1', '2026-10-06');

    expect(summary.alreadyClosed).toBe(false);
    expect(summary.openingCashTjs).toBe('500');
    expect(summary.openingCashUsd).toBe('50');
    expect(summary.salesCashTjs).toBe('1000');
    expect(summary.salesCardTjs).toBe('400');
    expect(summary.expensesCashTjs).toBe('100');
    expect(summary.expensesCashUsd).toBe('10');
    // Expected TJS = 500 + 1000 - 100 = 1400
    expect(summary.expectedCashTjs).toBe('1400');
    // Expected USD = 50 + 100 - 10 = 140
    expect(summary.expectedCashUsd).toBe('140');
  });

  it('detects shortage when actual cash is less than expected', async () => {
    (prisma.store.findUnique as any).mockResolvedValue({
      id: 'store-1',
      name: 'Сиёма',
      isMainWarehouse: false,
      active: true,
    });
    (prisma.dailyCashClosing.findUnique as any).mockResolvedValue(null);
    (prisma.dailyCashClosing.findFirst as any).mockResolvedValue({
      actualCashTjs: 200,
      actualCashUsd: 20,
      businessDate: '2026-10-05',
    });
    (prisma.sale.findMany as any).mockResolvedValue([]);
    (prisma.expense.findMany as any).mockResolvedValue([]);
    (prisma.cashHandover.findMany as any).mockResolvedValue([]);

    (prisma.dailyCashClosing.create as any).mockImplementation(({ data }: any) => ({
      id: 'dc-1',
      ...data,
    }));

    // Expected is 200 TJS / $20. Cashier counted 180 TJS / $20.
    const result = await DailyClosingService.closeDay('u1', {
      storeId: 'store-1',
      businessDate: '2026-10-06',
      actualCashTjs: 180,
      actualCashUsd: 20,
      comment: 'Не хватило 20 сомони',
    });

    expect(result.expectedCashTjs).toBe('200');
    expect(result.actualCashTjs).toBe('180');
    expect(result.differenceTjs).toBe('-20');
    expect(result.differenceUsd).toBe('0');
  });

  it('rejects duplicate closing for the same day with 409', async () => {
    (prisma.store.findUnique as any).mockResolvedValue({
      id: 'store-1',
      name: 'Сиёма',
      isMainWarehouse: false,
      active: true,
    });
    (prisma.dailyCashClosing.findUnique as any).mockResolvedValue({
      id: 'existing-closing',
      businessDate: '2026-10-06',
    });

    await expect(
      DailyClosingService.closeDay('u1', {
        storeId: 'store-1',
        businessDate: '2026-10-06',
        actualCashTjs: 100,
        actualCashUsd: 10,
      })
    ).rejects.toThrow('уже закрыта');
  });
});
