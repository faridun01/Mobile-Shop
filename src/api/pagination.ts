import { apiClient } from './client';

/** Read every history page instead of silently presenting the first 500 as complete. */
export async function fetchAllPages<T extends { id: string }>(endpoint: string): Promise<T[]> {
  const records = new Map<string, T>();
  let cursor: string | undefined;
  while (true) {
    const params = new URLSearchParams({ limit: '200', ...(cursor ? { cursor } : {}) });
    const page = await apiClient<T[]>(`${endpoint}?${params}`);
    for (const record of page) records.set(record.id, record);
    if (page.length < 200) return [...records.values()];
    const next = page.at(-1)!.id;
    if (next === cursor) throw new Error('Сервер не продвинул страницу истории');
    cursor = next;
  }
}
