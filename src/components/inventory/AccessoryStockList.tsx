import React, { useEffect, useState } from 'react';
import { Headphones, Loader2, Search, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { mapAccessoryStockItem } from '../../api/mappers';
import type { AccessoryStockItem } from '../../types';
import { formatMoney } from '../../utils/money';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { EmptyState } from '../ui/EmptyState';

interface AccessoryStockListProps {
  /** A location id, or 'ALL'/'all' for every location (ADMIN); store staff always get their own store. */
  locationId?: string;
  isAdmin: boolean;
}

/**
 * Accessories on hand: one row per card (barcode) with its quantity by location. Quantities are
 * the units left in its receipt batches; the stock cost (each batch at its own unit cost) is
 * shown to the admin only.
 */
export const AccessoryStockList: React.FC<AccessoryStockListProps> = ({ locationId, isAdmin }) => {
  const refreshRevision = useDataRefreshRevision();
  const [items, setItems] = useState<AccessoryStockItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (locationId && locationId.toLowerCase() !== 'all') params.set('storeId', locationId);
    if (query) params.set('search', query);
    apiClient<unknown[]>(`/accessories${params.toString() ? `?${params}` : ''}`)
      .then((rows) => {
        if (cancelled) return;
        setItems((rows || []).map(mapAccessoryStockItem));
        setError(null);
      })
      .catch(() => { if (!cancelled) setError('Не удалось загрузить аксессуары. Проверьте связь и обновите страницу'); });
    return () => { cancelled = true; };
  }, [locationId, query, refreshRevision]);

  const inStock = (items ?? []).filter((item) => item.quantity > 0);
  const totalUnits = inStock.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = inStock.reduce((sum, item) => sum + (item.stockCostUsd ?? 0), 0);

  return (
    <div className="p-2 sm:p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Штрихкод, название, бренд, категория…"
            aria-label="Поиск аксессуаров"
            className="w-full h-9 pl-8 pr-8 rounded-xl bg-surface-raised border border-border text-xs text-fg focus:outline-none focus:border-accent"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-fg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-fg-subtle">
          В наличии: <strong className="text-fg font-mono">{totalUnits} шт.</strong>
          {isAdmin && <> • себестоимость <strong className="text-fg font-mono">${formatMoney(totalCost)}</strong></>}
        </span>
      </div>

      {error ? (
        <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl p-3" role="alert">{error}</p>
      ) : items === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs text-fg-subtle">
          <Loader2 className="w-4 h-4 animate-spin" /> Загрузка аксессуаров…
        </div>
      ) : inStock.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title={query ? 'Ничего не найдено' : 'Аксессуаров нет в наличии'}
          description={query ? 'Измените запрос поиска' : 'Аксессуары появятся здесь после прихода по штрихкоду'}
        />
      ) : (
        <ul className="space-y-1.5">
          {inStock.map((item) => (
            <li key={item.id} className="p-2.5 rounded-xl bg-surface border border-border shadow-2xs flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold text-fg truncate">{item.brand} {item.name}</p>
                <p className="text-[11px] text-fg-muted truncate mt-0.5">
                  {[item.category, item.model, item.attributes].filter(Boolean).join(' • ')}
                </p>
                <p className="text-[10px] font-mono text-fg-subtle mt-0.5">Штрихкод: {item.barcode}</p>
                {item.stores.length > 1 && (
                  <p className="text-[10px] text-fg-subtle mt-0.5">
                    {item.stores.map((s) => `${s.storeName}: ${s.quantity}`).join(' • ')}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-black font-mono text-accent block">{item.quantity} шт.</span>
                {item.stores.length === 1 && <span className="text-[10px] text-fg-subtle block">{item.stores[0].storeName}</span>}
                {isAdmin && item.stockCostUsd !== undefined && (
                  <span className="text-[10px] font-mono text-fg-subtle block">${formatMoney(item.stockCostUsd)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
