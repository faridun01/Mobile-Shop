import { expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ apiClient: request }));
import { fetchAllPages } from './pagination';
it('loads a full 601-record history without duplication or truncation', async () => {
  const records = Array.from({ length: 601 }, (_, i) => ({ id: String(i) }));
  request.mockImplementation(async (endpoint: string) => {
    const params = new URL(endpoint, 'http://test').searchParams;
    const offset = params.has('cursor') ? Number(params.get('cursor')) + 1 : 0;
    return records.slice(offset, offset + 200);
  });
  expect(await fetchAllPages('/transfers')).toEqual(records);
  expect(request).toHaveBeenCalledTimes(4);
});
