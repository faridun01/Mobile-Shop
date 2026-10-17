import React from 'react';
import { AlertTriangle, Headphones, Minus, Plus, Trash2 } from 'lucide-react';
import type { AccessoryStockItem } from '../../types';
import { formatMoney } from '../../utils/money';
import { cn } from '../../utils/cn';
import { availableAt } from '../../hooks/useAccessoryStock';

/** An accessory in a cart (sale) or a transfer: a quantity of one card. */
export interface AccessoryCartItem {
  product: AccessoryStockItem;
  quantity: number;
  /** Sale only: the unit price in TJS. */
  unitPriceTjs?: number;
}

/** Cards matching a typed text (barcode, name, brand, category, model). */
export function filterAccessories(items: AccessoryStockItem[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) =>
    [item.barcode, item.name, item.brand, item.category, item.model].some((v) => v?.toLowerCase().includes(q)));
}

/** The card behind a scanned barcode, as printed (spaces dropped, any letter case). */
export function findAccessoryByCode(items: AccessoryStockItem[], code: string) {
  const c = code.replace(/\s+/g, '').toUpperCase();
  return c ? items.find((item) => item.barcode.toUpperCase() === c) : undefined;
}

/** Adds one unit of a card to a cart, or one more of it when it is already there. */
export function addAccessoryUnit(cart: AccessoryCartItem[], product: AccessoryStockItem, max: number): { cart: AccessoryCartItem[]; added: boolean } {
  const existing = cart.find((line) => line.product.id === product.id);
  if (existing) {
    if (existing.quantity >= max) return { cart, added: false };
    return { cart: cart.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line)), added: true };
  }
  if (max < 1) return { cart, added: false };
  return { cart: [...cart, { product, quantity: 1 }], added: true };
}

/** The accessories available at a location, with a button to add one unit. */
export const AccessoryPickList: React.FC<{
  items: AccessoryStockItem[];
  storeId: string | undefined;
  cart: AccessoryCartItem[];
  onAdd: (item: AccessoryStockItem) => void;
}> = ({ items, storeId, cart, onAdd }) => {
  const rows = items
    .map((item) => ({ item, free: availableAt(item, storeId) - (cart.find((l) => l.product.id === item.id)?.quantity ?? 0) }))
    .filter((row) => availableAt(row.item, storeId) > 0);
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="px-3.5 py-1.5 bg-surface-raised/40 border-y border-border text-[11px] text-fg-subtle flex items-center gap-1.5 font-semibold">
        <Headphones className="w-3.5 h-3.5 text-accent" />
        Аксессуары: <strong className="text-accent">{rows.reduce((s, r) => s + availableAt(r.item, storeId), 0)}</strong> шт.
      </div>
      <ul className="divide-y divide-border">
        {rows.map(({ item, free }) => (
          <li key={item.id} className="px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg truncate">{item.brand} {item.name}</p>
              <p className="text-[11px] text-fg-subtle truncate">
                {[item.category, item.model].filter(Boolean).join(' • ')}{item.category || item.model ? ' • ' : ''}
                <span className="font-mono">{item.barcode}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-fg-subtle tabular-nums">{free} шт.</span>
              <button
                type="button"
                disabled={free < 1}
                onClick={() => onAdd(item)}
                className="h-8 w-8 flex items-center justify-center rounded-lg bg-accent/10 border border-accent/25 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                aria-label={`Добавить ${item.name}`}
                title="Добавить 1 шт."
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** One accessory line of a cart: quantity (±, typed) and, for a sale, the unit price. */
export const AccessoryCartLine: React.FC<{
  line: AccessoryCartItem;
  max: number;
  withPrice: boolean;
  /** Sale only: the line is priced below its cost (answered by the server for store staff). */
  belowCost?: boolean;
  large?: boolean;
  onChange: (next: AccessoryCartItem) => void;
  onRemove: () => void;
}> = ({ line, max, withPrice, belowCost, large, onChange, onRemove }) => {
  const priceMissing = withPrice && !(line.unitPriceTjs && line.unitPriceTjs > 0);
  const setQuantity = (value: number) => onChange({ ...line, quantity: Math.max(1, Math.min(max, Math.floor(value) || 1)) });
  const height = large ? 'h-11' : 'h-8';
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('font-bold text-fg truncate', large ? 'text-sm' : 'text-xs')}>{line.product.brand} {line.product.name}</p>
          <p className="text-[10px] text-fg-subtle font-mono truncate">Штрихкод: {line.product.barcode} • в наличии {max} шт.</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-md text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors shrink-0 cursor-pointer"
          aria-label="Удалить позицию"
          title="Удалить позицию"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-bg shrink-0">
          <button type="button" onClick={() => setQuantity(line.quantity - 1)} disabled={line.quantity <= 1}
            className={cn(height, 'w-8 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer')} aria-label="Меньше">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={line.quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className={cn(height, 'w-12 text-center text-xs font-bold font-mono bg-transparent focus:outline-none')}
            aria-label="Количество"
          />
          <button type="button" onClick={() => setQuantity(line.quantity + 1)} disabled={line.quantity >= max}
            className={cn(height, 'w-8 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer')} aria-label="Больше">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {withPrice && (
          <div className="relative flex-1 min-w-0">
            <input
              type="number"
              step="0.01"
              min="0.01"
              inputMode="decimal"
              placeholder="Цена за шт."
              value={line.unitPriceTjs ?? ''}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                onChange({ ...line, unitPriceTjs: Number.isFinite(value) && value > 0 ? value : undefined });
              }}
              className={cn(
                height, 'w-full rounded-lg px-2.5 pr-14 text-xs font-bold font-mono bg-bg focus:outline-none focus:ring-1',
                priceMissing
                  ? 'border border-warning text-warning focus:ring-warning'
                  : belowCost
                    ? 'border border-danger text-danger focus:ring-danger'
                    : 'border border-border text-accent focus:ring-accent'
              )}
              aria-label="Цена за штуку, TJS"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-fg-subtle">TJS/шт</span>
          </div>
        )}
      </div>
      {withPrice && (
        priceMissing ? (
          <p className="flex items-center gap-1 text-[10px] text-warning font-medium"><AlertTriangle className="w-3 h-3" /> Укажите цену за штуку</p>
        ) : (
          <p className={cn('text-[10.5px] font-mono', belowCost ? 'text-danger' : 'text-fg-subtle')}>
            {line.quantity} × {formatMoney(line.unitPriceTjs)} = <strong>{formatMoney((line.unitPriceTjs ?? 0) * line.quantity)} TJS</strong>
            {belowCost ? ' — ниже себестоимости' : ''}
          </p>
        )
      )}
    </div>
  );
};
