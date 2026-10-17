export function readSavedExpenseCategories(): { id: string; label: string }[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('custom_expense_categories') || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((row): row is { id: string; label: string } =>
      row !== null && typeof row === 'object' &&
      typeof row.id === 'string' && Boolean(row.id.trim()) &&
      typeof row.label === 'string' && Boolean(row.label.trim()));
  } catch {
    return [];
  }
}
