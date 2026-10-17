import React from 'react';
import { AlertCircle, Plus, Scan, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { isValidSerial, normalizeSerial } from '../../utils/deviceCode';
import { TypeaheadInput } from '../ui/TypeaheadInput';
import { suggestCatalogValues, TABLET_DEFAULTS } from '../../services/catalog';
import type { PurchaseItemGroup } from './types';

interface TabletGroupFieldsProps {
  group: PurchaseItemGroup;
  groupIdx: number;
  onUpdateGroup: (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => void;
  onUpdateSerial: (groupIdx: number, itemIdx: number, slot: 1 | 2, value: string) => void;
  onScanSerial: (groupIdx: number, itemIdx: number, slot: 1 | 2) => void;
  onAddUnit: (groupIdx: number) => void;
  onRemoveUnit: (groupIdx: number, itemIdx: number) => void;
  /** Normalized SN → why it can't be received (already registered, repeated in this receipt). */
  codeErrors: Record<string, string>;
}

const fieldClass = 'h-8 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs';
const labelClass = 'block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate';

/** Moves focus within the form (a USB/Bluetooth scanner ends each code with Enter). */
function focusSelector(from: HTMLElement, selector: string) {
  const next = from.closest('form')?.querySelector<HTMLInputElement>(selector);
  next?.focus();
  next?.select?.();
}

/**
 * A tablet position: one row per unit with its main SN (required) and additional SN (optional,
 * e.g. the keyboard's), then brand, model, RAM, storage, colour, other characteristics and the
 * purchase price — each in its own field. Suggestions appear only while typing, and choosing
 * one fills that field alone: picking a model never fills RAM, storage or colour.
 */
export const TabletGroupFields: React.FC<TabletGroupFieldsProps> = ({
  group,
  groupIdx,
  onUpdateGroup,
  onUpdateSerial,
  onScanSerial,
  onAddUnit,
  onRemoveUnit,
  codeErrors,
}) => {
  const suggest = (field: string, withBrand = false) => (q: string) =>
    suggestCatalogValues('TABLET', field, q, withBrand ? group.brand : undefined);
  const filledUnits = group.items.filter((i) => normalizeSerial(i.imei)).length;

  const serialInput = (itemIdx: number, slot: 1 | 2) => {
    const raw = slot === 1 ? group.items[itemIdx].imei : group.items[itemIdx].imei2 || '';
    const sn = normalizeSerial(raw);
    const error = sn ? codeErrors[sn] : undefined;
    const invalid = sn.length > 0 && !isValidSerial(sn);
    return (
      <div className="min-w-0">
        <label className={labelClass} htmlFor={`sn-${groupIdx}-${itemIdx}-${slot}`}>
          {slot === 1 ? <>Основной SN <span className="text-danger">*</span></> : 'Дополнительный SN (необязательно)'}
        </label>
        <div className="relative flex items-center">
          <input
            id={`sn-${groupIdx}-${itemIdx}-${slot}`}
            data-sn={`${groupIdx}-${itemIdx}-${slot}`}
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required={slot === 1}
            value={raw}
            onChange={(e) => onUpdateSerial(groupIdx, itemIdx, slot, e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (slot === 1) focusSelector(e.currentTarget, `[data-sn="${groupIdx}-${itemIdx}-2"]`);
              else if (itemIdx + 1 < group.items.length) focusSelector(e.currentTarget, `[data-sn="${groupIdx}-${itemIdx + 1}-1"]`);
              else focusSelector(e.currentTarget, `[data-field="${groupIdx}-brand"]`);
            }}
            placeholder={slot === 1 ? 'Сканируйте или введите SN' : 'SN клавиатуры / второй номер'}
            aria-invalid={Boolean(error || invalid)}
            className={cn(
              'w-full h-8 rounded-lg bg-surface border px-2 pr-8 text-xs font-mono uppercase focus:outline-none shadow-2xs transition-colors',
              error || invalid
                ? 'border-danger text-danger bg-danger/10'
                : sn
                  ? 'border-emerald-500/60 text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'border-border text-fg focus:border-accent'
            )}
          />
          <button
            type="button"
            onClick={() => onScanSerial(groupIdx, itemIdx, slot)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-fg-subtle hover:text-accent cursor-pointer"
            title={slot === 1 ? 'Сканировать основной SN камерой' : 'Сканировать дополнительный SN камерой'}
            aria-label={slot === 1 ? 'Сканировать основной SN камерой' : 'Сканировать дополнительный SN камерой'}
          >
            <Scan className="w-3.5 h-3.5" />
          </button>
        </div>
        {(error || invalid) && (
          <p className="flex items-start gap-1 text-[11px] text-danger font-semibold mt-1" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{error ? `SN ${sn} ${error}` : 'SN: от 4 до 64 латинских букв и цифр'}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* 1–2. Serial numbers, one row per unit */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-fg flex items-center gap-1">
            <Scan className="w-3.5 h-3.5 text-accent" />
            Серийные номера: <span className="text-accent">{filledUnits} шт.</span>
          </span>
          <button
            type="button"
            onClick={() => onAddUnit(groupIdx)}
            className="h-7 px-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg hover:text-accent text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
          >
            <Plus className="w-3 h-3 text-accent" />
            <span>Ещё планшет</span>
          </button>
        </div>
        {group.items.map((_, itemIdx) => (
          <div key={itemIdx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-1.5 p-1.5 rounded-lg border border-border/60 bg-surface-raised/40 items-start">
            {serialInput(itemIdx, 1)}
            {serialInput(itemIdx, 2)}
            {group.items.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveUnit(groupIdx, itemIdx)}
                className="self-end sm:mt-4 h-8 w-8 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                title="Убрать этот планшет"
                aria-label="Убрать этот планшет"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 3–9. Characteristics and price, each in its own field */}
      <div className="pt-2 border-t border-border grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 text-xs">
        <div>
          <label className={labelClass}>Бренд <span className="text-danger">*</span></label>
          <TypeaheadInput
            required
            value={group.brand}
            onChange={(v) => onUpdateGroup(groupIdx, 'brand', v)}
            fetchSuggestions={suggest('brand')}
            options={TABLET_DEFAULTS.brand}
            className={fieldClass}
            placeholder="Xiaomi"
            aria-label="Бренд планшета"
            inputRef={(node) => { if (node) node.dataset.field = `${groupIdx}-brand`; }}
          />
        </div>
        <div>
          <label className={labelClass}>Модель <span className="text-danger">*</span></label>
          <TypeaheadInput
            required
            value={group.model}
            onChange={(v) => onUpdateGroup(groupIdx, 'model', v)}
            fetchSuggestions={suggest('model', true)}
            className={fieldClass}
            placeholder="Redmi Pad Pro"
            aria-label="Модель планшета"
          />
        </div>
        <div>
          <label className={labelClass}>ОЗУ (RAM)</label>
          <TypeaheadInput
            value={group.ram}
            onChange={(v) => onUpdateGroup(groupIdx, 'ram', v)}
            fetchSuggestions={suggest('ram')}
            options={TABLET_DEFAULTS.ram}
            className={fieldClass}
            placeholder="8 GB"
            inputMode="text"
            aria-label="ОЗУ планшета"
          />
        </div>
        <div>
          <label className={labelClass}>Встроенная память <span className="text-danger">*</span></label>
          <TypeaheadInput
            required
            value={group.storage}
            onChange={(v) => onUpdateGroup(groupIdx, 'storage', v)}
            fetchSuggestions={suggest('storage')}
            options={TABLET_DEFAULTS.storage}
            className={fieldClass}
            placeholder="256 GB"
            aria-label="Встроенная память планшета"
          />
        </div>
        <div>
          <label className={labelClass}>Цвет <span className="text-danger">*</span></label>
          <TypeaheadInput
            required
            value={group.color}
            onChange={(v) => onUpdateGroup(groupIdx, 'color', v)}
            fetchSuggestions={suggest('color')}
            options={TABLET_DEFAULTS.color}
            className={fieldClass}
            placeholder="Gray"
            aria-label="Цвет планшета"
          />
        </div>
        <div>
          <label className={labelClass}>Связь</label>
          <TypeaheadInput
            value={group.connectivity || ''}
            onChange={(v) => onUpdateGroup(groupIdx, 'connectivity', v)}
            fetchSuggestions={suggest('connectivity')}
            options={TABLET_DEFAULTS.connectivity}
            className={fieldClass}
            placeholder="Wi-Fi"
            aria-label="Тип подключения"
          />
        </div>
        <div>
          <label className={labelClass}>Экран</label>
          <TypeaheadInput
            value={group.screenSize || ''}
            onChange={(v) => onUpdateGroup(groupIdx, 'screenSize', v)}
            fetchSuggestions={suggest('screenSize')}
            options={TABLET_DEFAULTS.screenSize}
            className={fieldClass}
            placeholder='12.1"'
            aria-label="Размер экрана"
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
              aria-label="Цена закупки планшета в долларах"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
