/** One key per category however it was typed: "Чехол", "чехол " and "ЧЕХОЛ" are one category. */
export function accessoryCategoryKey(category: string | null | undefined): string {
  return (category ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
}

/**
 * Category filter options for the accessories on screen: "Все категории" first, then each
 * category once (shown as first spelled), alphabetically. The option value is the category key.
 */
export function accessoryCategoryOptions(items: { category: string }[]): { value: string; label: string }[] {
  const labels = new Map<string, string>();
  for (const item of items) {
    const key = accessoryCategoryKey(item.category);
    if (key && !labels.has(key)) labels.set(key, item.category.trim().replace(/\s+/g, ' '));
  }
  const options = [...labels].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  return [{ value: 'ALL', label: 'Все категории' }, ...options];
}

/** Whether an accessory belongs to the chosen category option ('ALL' matches every one). */
export function matchesAccessoryCategory(item: { category: string }, value: string): boolean {
  return value === 'ALL' || accessoryCategoryKey(item.category) === value;
}
