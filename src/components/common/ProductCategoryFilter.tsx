import type { Device } from '../../types';

export type ProductCategoryFilterValue = 'ALL' | 'PHONE' | 'TABLET' | 'ACCESSORY';
export function matchesProductCategory(device: Pick<Device, 'category'>, category: ProductCategoryFilterValue) {
  return category === 'ALL' || (device.category || 'PHONE') === category;
}

export function ProductCategoryFilter({ value, onChange, allLabel = 'Все товары' }: {
  value: ProductCategoryFilterValue;
  onChange: (value: ProductCategoryFilterValue) => void;
  allLabel?: string;
}) {
  return <div role="group" aria-label="Категория товара" className="flex gap-1.5 overflow-x-auto scrollbar-none">
    {([['ALL', 'Все товары'], ['PHONE', 'Телефоны'], ['TABLET', 'Планшеты'], ['ACCESSORY', 'Аксессуары']] as const).map(([category, label]) =>
      <button key={category} type="button" aria-pressed={value === category} onClick={() => onChange(category)}
        className={`min-h-11 shrink-0 whitespace-nowrap px-3 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${value === category ? 'bg-accent text-accent-fg border-accent' : 'bg-surface-raised text-fg-muted border-border hover:text-fg'}`}>
        {category === 'ALL' ? allLabel : label}
      </button>)}
  </div>;
}
