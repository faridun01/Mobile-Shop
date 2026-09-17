import { describe, expect, it, vi } from 'vitest';
import { readOwnerAllocations, replaceOwnerAllocations } from './owner-allocations';

describe('historical owner allocations', () => {
  it.each([null, undefined, {}, [{ ownerId: 'a', amountUsd: NaN }], [{ ownerId: 'a', amountUsd: -1 }], [{ ownerId: 'a', amountUsd: 1 }, { ownerId: 'a', amountUsd: 2 }]])('rejects missing or invalid history: %j', value => {
    expect(() => readOwnerAllocations(value)).toThrow('исходное распределение');
  });
  it('reverses the recorded expense amounts without looking up current shares', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await replaceOwnerAllocations({ owner: { updateMany } } as any, [{ ownerId: 'a', amountUsd: 60 }, { ownerId: 'b', amountUsd: 40 }], [], -1);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'a' }, data: { totalAccruedProfitUsd: { increment: 60 }, availableProfitUsd: { increment: 60 } } });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'b' }, data: { totalAccruedProfitUsd: { increment: 40 }, availableProfitUsd: { increment: 40 } } });
  });
  it('rejects a bonus reversal when historical profit is no longer available', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    await expect(replaceOwnerAllocations({ owner: { updateMany } } as any, [{ ownerId: 'a', amountUsd: 60 }], [], 1, true)).rejects.toThrow('сверка');
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a', availableProfitUsd: { gte: 60 } } }));
  });
});
