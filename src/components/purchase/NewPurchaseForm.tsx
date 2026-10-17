import React from 'react';
import { Supplier, Store, User } from '../../types';
import { PurchaseCategory, PurchaseItemGroup, getImeiPair } from './types';
import { Combobox } from '../ui/Combobox';
import { TabletGroupFields } from './TabletGroupFields';
import { AccessoryGroupFields } from './AccessoryGroupFields';
import { normalizePhoneColor, formatPhoneColor } from '../../utils/phoneSpecs';
import { cn } from '../../utils/cn';
import { CopyImeiButton } from '../common/CopyImeiButton';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Scan,
  AlertCircle,
  CheckCircle2,
  FileText,
  X,
  Truck,
  Sparkles,
  RotateCcw,
  Smartphone,
  Tablet,
  Headphones,
} from 'lucide-react';

const CATEGORY_TABS: { value: PurchaseCategory; label: string; icon: typeof Smartphone }[] = [
  { value: 'PHONE', label: 'Телефон', icon: Smartphone },
  { value: 'TABLET', label: 'Планшет', icon: Tablet },
  { value: 'ACCESSORY', label: 'Аксессуар', icon: Headphones },
];

interface NewPurchaseFormProps {
  suppliers: Supplier[];
  stores: Store[];
  currentUser: User | null;
  selectedSupplierId: string;
  onSelectSupplierId: (id: string) => void;
  groups: PurchaseItemGroup[];
  onUpdateGroup: (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => void;
  onClearGroupSpecs?: (idx: number) => void;
  onResetGroup?: (idx: number) => void;
  onAddGroup: (category?: PurchaseCategory) => void;
  /** Switches a position to phones, tablets or accessories (its fields start empty). */
  onChangeGroupCategory: (idx: number, category: PurchaseCategory) => void;
  onRemoveGroup: (idx: number) => void;
  onAddImeiToGroup: (groupIdx: number) => void;
  onRemoveImeiFromGroup: (groupIdx: number, itemIdx: number) => void;
  onUpdateImei: (groupIdx: number, itemIdx: number, val: string) => void;
  onUpdateImei2: (groupIdx: number, itemIdx: number, val: string) => void;
  onScanImei: (groupIdx: number, itemIdx: number) => void;
  onBatchImeiPaste: (groupIdx: number, text: string) => void;
  brandOptions: string[];
  getModelOptions: (brand: string) => string[];
  ramOptions: string[];
  storageOptions: string[];
  colorOptions: string[];
  totalFormUnits: number;
  totalFormUsd: number;
  hasIncompleteImeis?: boolean;
  imeiErrorsMap?: Record<string, string>;
  hasExistingImeis?: boolean;
  firstExistingImei?: string;
  statusMessage: { type: 'success' | 'error'; text: string } | null;
  isSubmitting: boolean;
  onBackToList: () => void;
  onOpenAddSupplier: () => void;
  onSubmitForm: (e: React.FormEvent) => void;
  onOpenScannerForImei2: (groupIdx: number, itemIdx: number) => void;
  // Tablets
  onUpdateSerial: (groupIdx: number, itemIdx: number, slot: 1 | 2, value: string) => void;
  onScanSerial: (groupIdx: number, itemIdx: number, slot: 1 | 2) => void;
  // Accessories
  onBarcodeCommit: (groupIdx: number, barcode: string) => void;
  onScanBarcode: (groupIdx: number) => void;
  onClearBarcode: (groupIdx: number) => void;
  /** Position index → the earlier position holding the same barcode. */
  accessoryDuplicates?: Record<number, number>;
  /** Why the receipt can't be previewed yet (shown on the disabled button). */
  submitBlockedReason?: string;
}

export const NewPurchaseForm: React.FC<NewPurchaseFormProps> = ({
  suppliers,
  stores: _stores,
  currentUser: _currentUser,
  selectedSupplierId,
  onSelectSupplierId,
  groups,
  onUpdateGroup,
  onClearGroupSpecs,
  onResetGroup,
  onAddGroup,
  onChangeGroupCategory,
  onRemoveGroup,
  onAddImeiToGroup,
  onRemoveImeiFromGroup,
  onUpdateImei,
  onUpdateImei2,
  onScanImei,
  onBatchImeiPaste,
  brandOptions,
  getModelOptions,
  ramOptions,
  storageOptions,
  colorOptions,
  totalFormUnits,
  totalFormUsd,
  hasIncompleteImeis = false,
  imeiErrorsMap = {},
  hasExistingImeis = false,
  firstExistingImei = '',
  statusMessage,
  isSubmitting,
  onBackToList,
  onOpenAddSupplier,
  onSubmitForm,
  onOpenScannerForImei2,
  onUpdateSerial,
  onScanSerial,
  onBarcodeCommit,
  onScanBarcode,
  onClearBarcode,
  accessoryDuplicates = {},
  submitBlockedReason,
}) => {
  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-y-auto bg-bg text-fg select-none min-h-0">
      <form onSubmit={onSubmitForm} className="flex-1 flex flex-col min-h-full">
        {/* Compact Sticky Top Bar */}
        <div className="px-2 sm:px-4 py-1.5 sm:py-2 border-b border-border bg-surface shrink-0 sticky top-0 z-20 shadow-2xs space-y-1.5">
          {/* Row 1: Back + Title + Warehouse Badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onBackToList}
                className="h-7 px-2 sm:px-2.5 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg hover:text-accent text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-2xs shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">К списку</span>
                <span className="xs:hidden">Назад</span>
              </button>
              <h1 className="text-xs sm:text-sm font-bold text-fg truncate">
                Новый приход (партия)
              </h1>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Главный склад
              </span>
            </div>
          </div>

          {/* Row 2: Supplier Selection Bar */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-lg bg-surface-raised border border-border/80 text-xs">
            <div className="flex items-center gap-1 text-fg font-bold shrink-0 pl-1">
              <Truck className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="hidden sm:inline text-xs">Поставщик:</span>
            </div>

            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <select
                required
                value={selectedSupplierId}
                onChange={(e) => onSelectSupplierId(e.target.value)}
                className={`flex-1 min-w-0 h-7 rounded-lg bg-surface border px-2 text-xs font-semibold focus:outline-none transition-all cursor-pointer shadow-2xs truncate ${
                  !selectedSupplierId
                    ? 'border-amber-500/70 text-amber-600 dark:text-amber-400 focus:border-accent'
                    : 'border-border text-fg focus:border-accent'
                }`}
              >
                <option value="">-- Выберите поставщика (обязательно) --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onOpenAddSupplier}
                title="Добавить нового поставщика"
                className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-raised border border-border text-fg hover:text-accent flex items-center gap-1 font-semibold transition-all cursor-pointer shadow-2xs shrink-0 text-xs"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <span className="hidden sm:inline">Новый</span>
              </button>
            </div>
          </div>
        </div>

        {/* Groups list */}
        <div className="flex-1 p-2 sm:p-3 space-y-2.5 bg-bg pb-4 max-w-7xl mx-auto w-full">
          {groups.map((group, groupIdx) => {
            const category: PurchaseCategory = group.category ?? 'PHONE';
            const title = category === 'ACCESSORY'
              ? [group.brand, group.name].filter(Boolean).join(' ') || group.barcode || ''
              : `${group.brand} ${group.model}`.trim();
            const touched = Boolean(title || group.items.some((i) => i.imei.trim()) || group.barcode);
            return (
            <div
              key={group.id}
              className="rounded-xl border border-border bg-surface shadow-2xs p-2.5 sm:p-3 space-y-2 relative transition-all"
            >
              {/* Position Header */}
              <div className="flex items-center justify-between pb-1.5 border-b border-border gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="px-1.5 py-0.2 rounded-md bg-accent/10 border border-accent/25 text-accent text-[11px] font-bold font-mono">
                    #{groupIdx + 1}
                  </span>
                  <span className="text-xs font-bold text-fg truncate">
                    {title || `Позиция #${groupIdx + 1}`}
                  </span>
                  {category !== 'ACCESSORY' && (group.storage || group.color) && (
                    <span className="text-[11px] text-fg-subtle truncate hidden sm:inline">
                      ({[group.storage, formatPhoneColor(group.color)].filter(Boolean).join(', ')})
                    </span>
                  )}
                </div>

                {/* What this position holds; switching starts its fields over */}
                <div role="radiogroup" aria-label={`Тип товара позиции #${groupIdx + 1}`} className="ml-auto flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-raised border border-border shrink-0">
                  {CATEGORY_TABS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={category === value}
                      onClick={() => category !== value && onChangeGroupCategory(groupIdx, value)}
                      title={label}
                      className={cn(
                        'h-7 px-1.5 sm:px-2 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer',
                        category === value ? 'bg-accent text-accent-fg shadow-2xs' : 'text-fg-subtle hover:text-fg'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>

                {groups.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemoveGroup(groupIdx)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                    title="Удалить позицию"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  touched && onResetGroup && (
                    <button
                      type="button"
                      onClick={() => onResetGroup(groupIdx)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors text-[10px] font-semibold cursor-pointer border border-border select-none active:scale-95"
                      title="Очистить позицию целиком"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="hidden sm:inline">Сбросить позицию</span>
                    </button>
                  )
                )}
              </div>

              {category === 'TABLET' ? (
                <TabletGroupFields
                  group={group}
                  groupIdx={groupIdx}
                  onUpdateGroup={onUpdateGroup}
                  onUpdateSerial={onUpdateSerial}
                  onScanSerial={onScanSerial}
                  onAddUnit={onAddImeiToGroup}
                  onRemoveUnit={onRemoveImeiFromGroup}
                  codeErrors={imeiErrorsMap}
                />
              ) : category === 'ACCESSORY' ? (
                <AccessoryGroupFields
                  group={group}
                  groupIdx={groupIdx}
                  onUpdateGroup={onUpdateGroup}
                  onBarcodeCommit={onBarcodeCommit}
                  onScanBarcode={onScanBarcode}
                  onClearBarcode={onClearBarcode}
                  duplicateOf={accessoryDuplicates[groupIdx]}
                />
              ) : (<>
              {/* 1. IMEI Input List with Batch Paste (placed FIRST for instant autofill) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="font-bold text-fg text-[11px] flex items-center gap-1">
                      <Scan className="w-3.5 h-3.5 text-accent" />
                      IMEI устройств:
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full bg-accent/10 text-accent font-bold text-[10px] font-mono">
                      {group.items.filter((i) => i.imei.trim().length > 0).length} шт.
                    </span>
                    <span className="text-[11px] text-fg-subtle font-mono hidden sm:inline">
                      • Сумма: <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">${(group.items.filter((i) => i.imei.trim().length > 0).length * (group.purchasePriceUsd || 0)).toLocaleString()}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddImeiToGroup(groupIdx)}
                    className="h-6 px-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg hover:text-accent text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3 h-3 text-accent" />
                    <span>Устройство</span>
                  </button>
                </div>

                {/* Batch Paste text helper — not on phones: there IMEIs are scanned or typed one by one */}
                <div className="hidden md:block">
                  <input
                    type="text"
                    placeholder="Быстрая вставка списка IMEI (по 15 цифр через пробел, запятую или Enter)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onBatchImeiPaste(groupIdx, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim().length >= 15) {
                        onBatchImeiPaste(groupIdx, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full h-6.5 rounded-lg bg-surface-raised border border-dashed border-border px-2 text-[11px] font-mono text-fg placeholder:text-fg-subtle focus:border-accent focus:bg-surface focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1 font-mono">
                  {group.items.map((item, itemIdx) => {
                    const [imei1, imei2] = getImeiPair(item.imei);
                    const clean1 = imei1.replace(/\D/g, '').slice(0, 15);
                    const clean2 = imei2.replace(/\D/g, '').slice(0, 15);
                    const is1Incomplete = clean1.length > 0 && clean1.length < 15;
                    const is1Valid = clean1.length === 15;
                    const is2Incomplete = clean2.length > 0 && clean2.length < 15;
                    const is2Valid = clean2.length === 15;

                    const error1 = clean1.length === 15 ? imeiErrorsMap[clean1] : undefined;
                    const is1Error = Boolean(error1);
                    const error2 = clean2.length === 15 ? imeiErrorsMap[clean2] : undefined;
                    const is2Error = Boolean(error2);
                    const hasRowError = is1Error || is2Error;

                    return (
                      <div
                        key={itemIdx}
                        className={cn(
                          'grid grid-cols-1 sm:grid-cols-2 gap-1 p-1 rounded-lg border transition-all',
                          hasRowError
                            ? 'bg-danger/5 border-danger/40 ring-1 ring-danger/20'
                            : 'bg-surface-raised/40 border-border/50'
                        )}
                      >
                        <div>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="\d{15}"
                              maxLength={15}
                              required
                              value={clean1}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
                                onUpdateImei(groupIdx, itemIdx, clean2 ? `${digits} / ${clean2}` : digits);
                              }}
                              placeholder={`IMEI 1 #${itemIdx + 1} (15 цифр)`}
                              className={cn(
                                'w-full h-7 rounded-lg bg-surface border px-2 text-xs font-mono focus:outline-none shadow-2xs transition-colors',
                                is1Error
                                  ? 'border-danger focus:border-danger bg-danger/10 text-danger font-bold pr-24'
                                  : is1Incomplete
                                    ? 'border-amber-500/80 dark:border-amber-400/80 bg-amber-50/15 dark:bg-amber-950/20 pr-24 text-amber-700 dark:text-amber-300'
                                    : is1Valid
                                      ? 'border-emerald-500/60 dark:border-emerald-400/60 pr-24 text-emerald-700 dark:text-emerald-300 font-bold'
                                      : 'border-border text-fg focus:border-accent pr-7'
                              )}
                            />
                            {clean1.length > 0 && (
                              <span
                                className={cn(
                                  'absolute right-17 text-[10px] font-bold font-mono pointer-events-none select-none',
                                  is1Error
                                    ? 'text-danger'
                                    : is1Incomplete
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                )}
                              >
                                {is1Error ? '(!) В базе' : is1Valid ? '15 ✓' : `${clean1.length}/15`}
                              </span>
                            )}
                            {clean1.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onUpdateImei(groupIdx, itemIdx, clean2 ? ` / ${clean2}` : '')}
                                className="absolute right-11 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-danger p-0.5 cursor-pointer rounded transition-colors"
                                title="Очистить IMEI 1"
                                aria-label="Очистить IMEI 1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {clean1.length > 0 && (
                              <CopyImeiButton
                                imei={clean1}
                                className="absolute right-6 top-1/2 -translate-y-1/2"
                                title="Скопировать IMEI 1"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => onScanImei(groupIdx, itemIdx)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-accent p-0.5 cursor-pointer"
                              title="Сканировать IMEI 1"
                              aria-label="Сканировать IMEI 1"
                            >
                              <Scan className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {is1Error && (
                            <div className="flex items-center gap-1 text-[11px] text-danger font-bold mt-1 px-0.5 animate-in fade-in">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-danger" />
                              <span className="truncate">IMEI {clean1} {error1}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <div className="relative flex-1 flex items-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="\d{15}"
                                maxLength={15}
                                value={clean2}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, '').slice(0, 15);
                                  onUpdateImei2(groupIdx, itemIdx, digits);
                                }}
                                placeholder="IMEI 2 (необязательно, 15 цифр)"
                                className={cn(
                                  'w-full h-7 rounded-lg bg-surface border px-2 text-xs font-mono focus:outline-none shadow-2xs transition-colors',
                                  is2Error
                                    ? 'border-danger focus:border-danger bg-danger/10 text-danger font-bold pr-24'
                                    : is2Incomplete
                                      ? 'border-amber-500/80 dark:border-amber-400/80 bg-amber-50/15 dark:bg-amber-950/20 pr-24 text-amber-700 dark:text-amber-300'
                                      : is2Valid
                                        ? 'border-emerald-500/60 dark:border-emerald-400/60 pr-24 text-emerald-700 dark:text-emerald-300 font-bold'
                                        : 'border-border text-fg focus:border-accent pr-7'
                                )}
                              />
                              {clean2.length > 0 && (
                                <span
                                  className={cn(
                                    'absolute right-17 text-[10px] font-bold font-mono pointer-events-none select-none',
                                    is2Error
                                      ? 'text-danger'
                                      : is2Incomplete
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-emerald-600 dark:text-emerald-400'
                                  )}
                                >
                                  {is2Error ? '(!) В базе' : is2Valid ? '15 ✓' : `${clean2.length}/15`}
                                </span>
                              )}
                              {clean2.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateImei2(groupIdx, itemIdx, '')}
                                  className="absolute right-11 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-danger p-0.5 cursor-pointer rounded transition-colors"
                                  title="Очистить IMEI 2"
                                  aria-label="Очистить IMEI 2"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {clean2.length > 0 && (
                                <CopyImeiButton
                                  imei={clean2}
                                  className="absolute right-6 top-1/2 -translate-y-1/2"
                                  title="Скопировать IMEI 2"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenScannerForImei2(groupIdx, itemIdx)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-accent p-0.5 cursor-pointer"
                                title="Сканировать IMEI 2"
                                aria-label="Сканировать IMEI 2"
                              >
                                <Scan className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {group.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => onRemoveImeiFromGroup(groupIdx, itemIdx)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0"
                                title="Удалить устройство"
                                aria-label="Удалить устройство"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {is2Error && (
                            <div className="flex items-center gap-1 text-[11px] text-danger font-bold mt-1 px-0.5 animate-in fade-in">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-danger" />
                              <span className="truncate">IMEI 2 {clean2} {error2}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Group Specs Form (Placed BELOW IMEI - auto-filled from scanned IMEI) */}
              <div className="pt-2 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                      Спецификации и цена
                    </span>
                    {(group.brand || group.model) && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Автозаполнение по IMEI
                      </span>
                    )}
                  </div>

                  {(group.brand || group.model || group.ram || group.storage || group.color || Boolean(group.purchasePriceUsd)) && onClearGroupSpecs && (
                    <button
                      type="button"
                      onClick={() => onClearGroupSpecs(groupIdx)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-raised hover:bg-danger/10 text-fg-subtle hover:text-danger border border-border text-[10px] font-semibold transition-all cursor-pointer select-none active:scale-95 shadow-2xs"
                      title="Очистить все поля модели (бренд, модель, RAM, память, цвет, цену)"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Очистить поля</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                      Бренд
                    </label>
                    <Combobox
                      required
                      options={brandOptions}
                      value={group.brand}
                      onChange={(v) => onUpdateGroup(groupIdx, 'brand', v)}
                      className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                      placeholder="Apple"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                      Модель
                    </label>
                    <Combobox
                      required
                      options={getModelOptions(group.brand)}
                      value={group.model}
                      onChange={(v) => onUpdateGroup(groupIdx, 'model', v)}
                      className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                      placeholder="iPhone 16 Pro"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                      ОЗУ (RAM) <span className="text-danger">*</span>
                    </label>
                    <Combobox
                      required
                      options={ramOptions}
                      value={group.ram || ''}
                      onChange={(v) => onUpdateGroup(groupIdx, 'ram', v)}
                      className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                      placeholder="8 GB"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                      Память
                    </label>
                    <Combobox
                      options={storageOptions}
                      value={group.storage}
                      onChange={(v) => onUpdateGroup(groupIdx, 'storage', v)}
                      className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                      placeholder="256 GB"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                      Цвет
                    </label>
                    <Combobox
                      options={colorOptions}
                      value={group.color}
                      onChange={(v) => onUpdateGroup(groupIdx, 'color', v)}
                      className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                      placeholder="Black"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                      Цена закупки ($)
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 pointer-events-none">$</span>
                      <input
                        type="number"
                        required
                        min="0.01"
                        step="0.01"
                        value={group.purchasePriceUsd || ''}
                        onChange={(e) => onUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                        className="w-full h-7.5 rounded-lg bg-surface-raised border border-border pl-5 pr-6 text-xs text-emerald-600 dark:text-emerald-400 font-bold font-mono focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                        placeholder="0"
                      />
                      {Boolean(group.purchasePriceUsd) && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => onUpdateGroup(groupIdx, 'purchasePriceUsd', 0)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-fg-subtle hover:text-fg hover:bg-surface transition-colors cursor-pointer"
                          title="Очистить цену"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              </>)}
            </div>
            );
          })}

          {/* Add another position: a phone model, a tablet model or an accessory */}
          <div className="grid grid-cols-3 gap-1.5">
            {CATEGORY_TABS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onAddGroup(value)}
                className="py-2 rounded-xl border border-dashed border-border hover:border-accent bg-surface-raised hover:bg-surface text-fg hover:text-accent text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs min-h-10"
              >
                <Plus className="w-3.5 h-3.5 text-accent" />
                <Icon className="w-3.5 h-3.5 text-accent hidden xs:inline" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Actions & Total Bar (Sticky at bottom) */}
        <div className="sticky bottom-0 z-20 px-2.5 sm:px-4 py-1.5 border-t border-border bg-surface/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-lg font-mono text-xs">
          {hasExistingImeis ? (
            <div className="flex items-center gap-1.5 text-xs text-danger font-bold bg-danger/10 border border-danger/30 px-2.5 py-1 rounded-lg animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
              <span>IMEI/SN {firstExistingImei} уже зарегистрирован</span>
            </div>
          ) : statusMessage ? (
            <div className={`flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' ? 'text-accent' : 'text-danger'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-fg-subtle text-[11px]">
                Позиций: <strong className="text-fg">{groups.length}</strong> • Товаров: <strong className="text-accent font-bold">{totalFormUnits} шт.</strong>
              </span>
              <span className="text-border">|</span>
              <div className="flex items-center gap-1 font-mono">
                <span className="text-fg-subtle text-[11px]">Итого:</span>
                <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                  ${totalFormUsd.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onBackToList}
              className="h-7.5 px-3 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold transition-all cursor-pointer"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={totalFormUnits === 0 || hasIncompleteImeis || hasExistingImeis || Boolean(submitBlockedReason) || isSubmitting}
              title={
                hasExistingImeis
                  ? `Невозможно просмотреть чек: IMEI/SN ${firstExistingImei} уже зарегистрирован`
                  : hasIncompleteImeis
                    ? 'Каждый указанный IMEI должен содержать ровно 15 цифр'
                    : submitBlockedReason
              }
              className="h-7.5 px-3.5 rounded-lg bg-accent hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-fg shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Просмотреть чек</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
