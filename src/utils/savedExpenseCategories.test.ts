import { afterEach, expect, it, vi } from 'vitest';
import { readSavedExpenseCategories } from './savedExpenseCategories';

afterEach(() => vi.unstubAllGlobals());
it.each(['null', '{}', '12', 'invalid', '[null,12,{}, {"id":2,"label":"x"}]'])('ignores invalid persisted categories: %s', value => {
  vi.stubGlobal('localStorage', { getItem: () => value });
  expect(readSavedExpenseCategories()).toEqual([]);
});
it('retains valid categories in a mixed array', () => {
  vi.stubGlobal('localStorage', { getItem: () => '[null,{"id":"delivery","label":"Доставка"},{"id":"bad","label":null}]' });
  expect(readSavedExpenseCategories()).toEqual([{ id: 'delivery', label: 'Доставка' }]);
});
it('survives unavailable browser storage', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage unavailable'); } });
  expect(readSavedExpenseCategories()).toEqual([]);
});
