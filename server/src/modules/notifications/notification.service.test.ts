import { beforeEach, describe, expect, it, vi } from 'vitest';

const broadcast = vi.hoisted(() => vi.fn());
vi.mock('../../websocket/websocket.gateway', () => ({ RealtimeSyncGateway: { broadcast } }));
vi.mock('./push.service', () => ({
  PushNotificationService: { sendPushToUser: vi.fn().mockResolvedValue(undefined), sendPushToRole: vi.fn().mockResolvedValue(undefined) },
}));
// Run after-commit callbacks immediately: these tests have no real transaction.
vi.mock('../../common/after-commit', () => ({ onCommit: (callback: () => void) => callback() }));

import { notifyStorePartners } from './notification.service';

function tx(partners: Array<{ id: string }>, existing: string[] = []) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(partners) },
    notification: {
      findUnique: vi.fn(async ({ where }: any) => (existing.includes(where.dedupeKey) ? { id: 'old' } : null)),
      create: vi.fn(),
    },
  } as any;
}

const alert = {
  actionType: 'STOCK_MINIMUM',
  dedupeKey: 'STOCK_MINIMUM:st-1:1',
  title: 'Минимальный остаток: Apple iPhone 15',
  message: 'Сиёма: осталось 2 шт. при минимуме 2 шт.',
  store: { id: 'store-1', name: 'Сиёма' },
  targetRoute: '/stock-thresholds',
};

describe('notifyStorePartners', () => {
  beforeEach(() => vi.clearAllMocks());

  it('addresses one notification to each active partner of the store', async () => {
    const db = tx([{ id: 'p1' }, { id: 'p2' }]);
    await notifyStorePartners(db, 'store-1', alert);

    expect(db.user.findMany).toHaveBeenCalledWith({ where: { role: 'PARTNER', storeId: 'store-1', active: true }, select: { id: true } });
    expect(db.notification.create).toHaveBeenCalledTimes(2);
    expect(db.notification.create.mock.calls[0][0].data).toMatchObject({
      targetRole: 'PARTNER', targetUserId: 'p1', dedupeKey: 'STOCK_MINIMUM:st-1:1:user:p1',
      title: alert.title, storeId: 'store-1', actionType: 'STOCK_MINIMUM',
    });
    // Only that store's partners are told to refresh.
    expect(broadcast).toHaveBeenCalledWith('NOTIFICATION_CREATED', { storeId: 'store-1' }, { roles: ['PARTNER'], storeIds: ['store-1'] });
  });

  it('does not repeat a notification a partner already has', async () => {
    const db = tx([{ id: 'p1' }], ['STOCK_MINIMUM:st-1:1:user:p1']);
    await notifyStorePartners(db, 'store-1', alert);
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('does nothing for a store without partners', async () => {
    const db = tx([]);
    await notifyStorePartners(db, 'main-warehouse', alert);
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
});
