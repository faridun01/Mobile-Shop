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
    count: vi.fn(),
    aggregate: vi.fn(),
  });
  return {
    customer: model(),
    sale: model(),
    customerPayment: model(),
    customerPaymentAllocation: model(),
    store: model(),
  };
});

vi.mock('../../prisma/prisma.service', () => ({
  prisma: {
    ...db,
    $transaction: (fn: (tx: typeof db) => unknown) => fn(db),
  },
}));

import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('create', () => {
    it('throws if customer name is blank', async () => {
      await expect(
        CustomersService.create({ name: '   ' })
      ).rejects.toThrow('Имя клиента обязательно');
    });

    it('throws if customer phone is already registered', async () => {
      db.customer.findUnique.mockResolvedValue({ id: 'c-old', name: 'Существующий', phone: '+992900000000' });

      await expect(
        CustomersService.create({ name: 'Новый', phone: '+992900000000' })
      ).rejects.toThrow('уже существует');
    });

    it('creates customer successfully with trimmed values', async () => {
      db.customer.findUnique.mockResolvedValue(null);
      db.customer.create.mockResolvedValue({
        id: 'c-1',
        name: 'Рустам',
        phone: '+992900112233',
        note: 'Постоянный клиент',
        pushEnabled: true,
      });

      const customer = await CustomersService.create({
        name: '  Рустам  ',
        phone: ' +992900112233 ',
        note: ' Постоянный клиент ',
      });

      expect(customer.id).toBe('c-1');
      expect(db.customer.create).toHaveBeenCalledWith({
        data: {
          name: 'Рустам',
          phone: '+992900112233',
          note: 'Постоянный клиент',
          pushEnabled: true,
        },
      });
    });
  });

  describe('getById', () => {
    it('throws if customer not found', async () => {
      db.customer.findUnique.mockResolvedValue(null);
      await expect(CustomersService.getById('non-existent')).rejects.toThrow('Клиент не найден');
    });

    it('strips pushSubscription raw credentials from response', async () => {
      db.customer.findUnique.mockResolvedValue({
        id: 'c-1',
        name: 'Алишер',
        phone: '+992900000001',
        totalDebtTjs: '500.00',
        totalPaidTjs: '1000.00',
        pushSubscription: { endpoint: 'https://secret.push.service/123', keys: { auth: 'secret' } },
        sales: [],
        payments: [],
      });

      const result = await CustomersService.getById('c-1');
      expect(result.id).toBe('c-1');
      expect((result as any).pushSubscription).toBeUndefined();
      expect(result.hasPushSubscription).toBe(true);
      expect(result.totalDebtTjs).toBe(500);
    });
  });

  describe('update', () => {
    it('throws if customer does not exist', async () => {
      db.customer.findUnique.mockResolvedValue(null);
      await expect(CustomersService.update('c-404', { name: 'Имя' })).rejects.toThrow('Клиент не найден');
    });

    it('prevents duplicate phone numbers when updating', async () => {
      db.customer.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.id === 'c-1') return { id: 'c-1', name: 'Клиент 1', phone: '+992900000001' };
        if (where.phone === '+992900000002') return { id: 'c-2', name: 'Клиент 2', phone: '+992900000002' };
        return null;
      });

      await expect(
        CustomersService.update('c-1', { phone: '+992900000002' })
      ).rejects.toThrow('уже существует');
    });
  });
});
