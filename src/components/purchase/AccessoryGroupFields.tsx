import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, PackagePlus, RotateCcw, Scan } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatMoney } from '../../utils/money';
import { TypeaheadInput } from '../ui/TypeaheadInput';
import { ACCESSORY_CATEGORY_DEFAULTS, suggestCatalogValues } from '../../services/catalog';
import type { PurchaseItemGroup } from './types';

interface AccessoryGroupFieldsProps {
  group: PurchaseItemGroup;
  groupIdx: number;
  onUpdateGroup: (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => void;
  /** Looks the barcode up in the catalog (after a scan, Enter or leaving the field). */
  onBarcodeCommit: (groupIdx: number, barcode: string) => void;
  onScanBarcode: (groupIdx: number) => void;
  onClearBarcode: (groupIdx: number) => void;
  /** Set when the same barcode is already another position of this receipt. */
  duplicateOf?: number;
}

const fieldClass = 'h-8 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs';
const labelClass = 'block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate';

/**
 * An accessory position: the barcode comes first. A barcode already in the catalog fills the
 * card's data in by itself; a new one opens the manual fields (with suggestions while typing).
 * Then the quantity and this receipt's unit cost — each receipt is its own batch with its own cost.
 */
export const AccessoryGroupFields: React.FC<AccessoryGroupFieldsProps> = ({
  group,
  groupIdx,
  onUpdateGroup,
  onBarcodeCommit,
  onScanBarcode,
  onClearBarcode,
  duplicateOf,
}) => {
  const status = group.barcodeStatus ?? 'idle';
  const found = status === 'found';
  const isNew = status === 'new';
  const suggest = (field: string, withBrand = false) => (q: string) =>
    suggestCatalogValues('ACCESSORY', field, q, withBrand ? group.brand : undefined);
  const lineTotal = (group.quantity || 0) * (group.purchasePriceUsd || 0);

  return (
    <div className="space-y-2">
      {/* 1. Barcode first */}
      <div>
        <label className={labelClass} htmlFor={`barcode-${groupIdx}`}>
          Штрихкод товара <span className="text-danger">*</span>
        </label>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              id={`barcode-${groupIdx}`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              required
              readOnly={found}
              value={group.barcode || ''}
              onChange={(e) => onUpdateGroup(groupIdx, 'barcode', e.target.value)}
              onKeyDown={(e) => {
                // A USB/Bluetooth scanner ends the code with Enter: look it up, don't submit.
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onBarcodeCommit(groupIdx, e.currentTarget.value);
                }
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim() && status === 'idle') onBarcodeCommit(groupIdx, e.currentTarget.value);
              }}
              placeholder="Сканируйте или введите штрихкод"
              className={cn(
                'w-full h-9 rounded-lg bg-surface border px-2 pr-9 text-xs font-mono focus:outline-none shadow-2xs transition-colors',
                duplicateOf !== undefined
                  ? 'border-danger text-danger bg-danger/10'
                  : found
                    ? 'border-emerald-500/60 text-emerald-700 dark:text-emerald-300 font-bold'
                    : 'border-border text-fg focus:border-accent'
              )}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              {status === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-fg-subtle" /> : null}
            </span>
          </div>
          {found || isNew ? (
            <button
              type="button"
              onClick={() => onClearBarcode(groupIdx)}
              className="h-9 px-2.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
              title="Ввести другой штрихкод"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Другой</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onScanBarcode(groupIdx)}
              className="h-9 w-9 flex items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/25 text-accent cursor-pointer shrink-0"
              title="Сканировать штрихкод камерой"
              aria-label="Сканировать штрихкод камерой"
            >
              <Scan className="w-4 h-4" />
            </button>
          )}
        </div>
        {duplicateOf !== undefined && (
          <p className="flex items-center gap-1 text-[11px] text-danger font-semibold mt-1" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Этот штрихкод уже в позиции #{duplicateOf + 1} — укажите общее количество там
          </p>
        )}
        {found && (
          <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Товар найден в базе — укажите количество и цену закупки
          </p>
        )}
        {isNew && (
          <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
            <PackagePlus className="w-3.5 h-3.5 shrink-0" />
            Новый штрихкод — заполните карточку товара, она сохранится для следующих приходов
          </p>
        )}
      </div>

      {/* 2. Card data: from the catalog (read-only) or entered for a new barcode */}
      {found && (
        <div className="p-2 rounded-lg bg-surface-raised border border-border text-xs space-y-1.5">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
            <div className="col-span-2 sm:col-span-1 min-w-0">
              <dt className={labelClass}>Название</dt>
              <dd className="font-bold text-fg truncate">{group.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Категория</dt>
              <dd className="font-semibold text-fg truncate">{group.accessoryCategory}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>Бренд / производитель</dt>
              <dd className="font-semibold text-fg truncate">{group.brand}</dd>
            </div>
            <div className="min-w-0">
              <dt className={labelClass}>На складе сейчас</dt>
              <dd className="font-bold font-mono text-accent">{group.stockQuantity ?? 0} шт.</dd>
            </div>
          </dl>
          {(group.model || group.attributes || group.lastUnitCostUsd) && (
            <p className="text-[11px] text-fg-muted">
              {[group.model, group.attributes].filter(Boolean).join(' • ')}
              {group.lastUnitCostUsd ? `${group.model || group.attributes ? ' • ' : ''}прошлая цена закупки $${formatMoney(group.lastUnitCostUsd)} за шт.` : ''}
            </p>
          )}
        </div>
      )}
      {isNew && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 text-xs">
          <div>
            <label className={labelClass}>Бренд <span className="text-danger">*</span></label>
            <TypeaheadInput
              required
              value={group.brand}
              onChange={(v) => onUpdateGroup(groupIdx, 'brand', v)}
              fetchSuggestions={suggest('brand')}
              className={fieldClass}
              placeholder="Baseus"
              aria-label="Бренд аксессуара"
            />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelClass}>Название <span className="text-danger">*</span></label>
            <TypeaheadInput
              required
              value={group.name || ''}
              onChange={(v) => onUpdateGroup(groupIdx, 'name', v)}
              fetchSuggestions={suggest('name', true)}
              className={fieldClass}
              placeholder="Кабель USB-C 1 м"
              aria-label="Название аксессуара"
            />
          </div>
          <div>
            <label className={labelClass}>Категория <span className="text-danger">*</span></label>
            <TypeaheadInput
              required
              value={group.accessoryCategory || ''}
              onChange={(v) => onUpdateGroup(groupIdx, 'accessoryCategory', v)}
              fetchSuggestions={suggest('category')}
              options={ACCESSORY_CATEGORY_DEFAULTS}
              className={fieldClass}
              placeholder="Кабель"
              aria-label="Категория аксессуара"
            />
          </div>
          <div>
            <label className={labelClass}>Модель / тип</label>
            <TypeaheadInput
              value={group.model}
              onChange={(v) => onUpdateGroup(groupIdx, 'model', v)}
              fetchSuggestions={suggest('model', true)}
              className={fieldClass}
              placeholder="iPhone 15"
              aria-label="Модель или тип аксессуара"
            />
          </div>
          <div>
            <label className={labelClass}>Характеристики</label>
            <input
              type="text"
              value={group.attributes || ''}
              onChange={(e) => onUpdateGroup(groupIdx, 'attributes', e.target.value)}
              className={cn(fieldClass, 'w-full')}
              placeholder="Чёрный, 20 Вт"
              aria-label="Дополнительные характеристики"
            />
          </div>
        </div>
      )}

      {/* 3. Quantity and this receipt's unit cost */}
      {(found || isNew) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs items-end">
          <div>
            <label className={labelClass}>Количество, шт. <span className="text-danger">*</span></label>
            <input
              type="number"
              required
              min="1"
              step="1"
              inputMode="numeric"
              value={group.quantity || ''}
              onChange={(e) => onUpdateGroup(groupIdx, 'quantity', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className={cn(fieldClass, 'w-full font-bold font-mono')}
              placeholder="1"
              aria-label="Количество"
            />
          </div>
          <div>
            <label className={labelClass}>Цена закупки за 1 шт. ($) <span className="text-danger">*</span></label>
            <div className="relative flex items-center">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 pointer-events-none">$</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={group.purchasePriceUsd || ''}
                onChange={(e) => onUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                className={cn(fieldClass, 'w-full pl-5 font-bold font-mono text-emerald-600 dark:text-emerald-400')}
                placeholder="0"
                aria-label="Цена закупки за штуку в долларах"
              />
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 text-[11px] text-fg-subtle pb-2">
            Сумма позиции: <strong className="text-emerald-600 dark:text-emerald-400 font-mono">${formatMoney(lineTotal)}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
