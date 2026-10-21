import { describe, expect, it } from 'vitest';
import { accessoryCategoryOptions, matchesAccessoryCategory } from './accessoryCategories';

const items = [
  { category: 'Чехол' }, { category: 'Кабель' }, { category: 'чехол ' }, { category: 'Защитное  стекло' }, { category: '' },
];

describe('accessory category filter', () => {
  it('lists each category once, as first spelled, alphabetically after "Все категории"', () => {
    expect(accessoryCategoryOptions(items)).toEqual([
      { value: 'ALL', label: 'Все категории' },
      { value: 'защитное стекло', label: 'Защитное стекло' },
      { value: 'кабель', label: 'Кабель' },
      { value: 'чехол', label: 'Чехол' },
    ]);
  });

  it('matches a category however it was typed, and "ALL" matches everything', () => {
    expect(items.filter((item) => matchesAccessoryCategory(item, 'чехол'))).toHaveLength(2);
    expect(items.filter((item) => matchesAccessoryCategory(item, 'ALL'))).toHaveLength(items.length);
    expect(matchesAccessoryCategory({ category: 'Кабель' }, 'чехол')).toBe(false);
  });
});
