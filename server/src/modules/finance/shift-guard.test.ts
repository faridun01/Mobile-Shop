import { describe, expect, it, vi } from 'vitest';
import { assertShiftOpen } from './shift-guard';

function tx({ isMainWarehouse = false, closed = false } = {}) {
  return {
    $queryRaw: vi.fn(),
    store: { findUnique: vi.fn().mockResolvedValue({ name: 'Сиёма', isMainWarehouse }) },
    dailyCashClosing: { findUnique: vi.fn().mockResolvedValue(closed ? { id: 'dc-1' } : null) },
  } as any;
}

describe('assertShiftOpen', () => {
  it('lets an operation through while today\'s shift is open', async () => {
    const db = tx();
    await expect(assertShiftOpen(db, 'store-1')).resolves.toBeUndefined();
    // The store row is locked first, so the closing and the operation never interleave.
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.dailyCashClosing.findUnique.mock.invocationCallOrder[0]);
  });

  it('refuses an operation once today\'s shift is closed', async () => {
    await expect(assertShiftOpen(tx({ closed: true }), 'store-1')).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('уже закрыта'),
    });
  });

  it('never blocks Central Cash, which has no shifts', async () => {
    const db = tx({ isMainWarehouse: true, closed: true });
    await expect(assertShiftOpen(db, 'main')).resolves.toBeUndefined();
    expect(db.dailyCashClosing.findUnique).not.toHaveBeenCalled();
  });
});
