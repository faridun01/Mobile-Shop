import React from 'react';
import { Check, Headphones, Minus, Plus } from 'lucide-react';
import type { AccessoryStockItem } from '../../types';
import { cn } from '../../utils/cn';

/** One card of the count: units on the books at the store, and units found so far. */
export interface AccessoryCountRow {
  product: AccessoryStockItem;
  expected: number;
  counted: number;
}

/**
 * Accessories of a stock revision, counted by units: each scan of a barcode adds one, and the
 * count can be typed. A card counted above its book quantity is a surplus, below — a shortage.
 */
export const AccessoryCountPanel: React.FC<{
  rows: AccessoryCountRow[];
  onChange: (productId: string, counted: number) => void;
}> = ({ rows, onChange }) => {
  if (rows.length === 0) return null;
  const expected = rows.reduce((sum, r) => sum + r.expected, 0);
  const counted = rows.reduce((sum, r) => sum + r.counted, 0);
  return (
    <div className="rounded-xl bg-surface border border-border shadow-2xs overflow-hidden" role="region" aria-label="Аксессуары">
      <div className="px-2.5 py-1.5 border-b border-border bg-surface-raised flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-fg flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5 text-accent" />
          Аксессуары (по штукам)
        </span>
        <span className="text-fg-subtle">
          Посчитано <strong className="font-mono text-fg">{counted}</strong> из <strong className="font-mono text-fg">{expected}</strong> шт.
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map(({ product, expected: exp, counted: cnt }) => {
          const diff = cnt - exp;
          const set = (value: number) => onChange(product.id, Math.max(0, Math.floor(value) || 0));
          return (
            <li key={product.id} className="px-2.5 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-fg truncate">{product.brand} {product.name}</p>
                <p className="text-[11px] text-fg-subtle truncate">
                  <span className="font-mono">{product.barcode}</span> · по учёту {exp} шт.
                  {cnt > 0 && diff !== 0 && (
                    <span className={cn('ml-1 font-semibold', diff < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-danger')}>
                      {diff < 0 ? `недостача ${-diff} шт.` : `излишек ${diff} шт.`}
                    </span>
                  )}
                  {cnt > 0 && diff === 0 && <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">сходится</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {cnt !== exp && (
                  <button
                    type="button"
                    data-compact="true"
                    onClick={() => set(exp)}
                    className="min-h-0 h-8 px-2 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 cursor-pointer flex items-center gap-1"
                    title="Отметить, что посчитано столько же, сколько по учёту"
                  >
                    <Check className="w-3.5 h-3.5" /> {exp}
                  </button>
                )}
                <div className="flex items-center rounded-lg border border-border bg-bg">
                  <button type="button" data-compact="true" onClick={() => set(cnt - 1)} disabled={cnt <= 0} className="min-h-0 h-8 w-7 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer" aria-label="Меньше">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={cnt}
                    onChange={(e) => set(Number(e.target.value))}
                    className="h-8 w-12 text-center text-xs font-bold font-mono bg-transparent focus:outline-none"
                    aria-label={`Посчитано: ${product.name}`}
                  />
                  <button type="button" data-compact="true" onClick={() => set(cnt + 1)} className="min-h-0 h-8 w-7 flex items-center justify-center text-fg-subtle hover:text-fg cursor-pointer" aria-label="Больше">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
