import React from 'react';
import { Supplier, Store, User } from '../../types';
import { PurchaseItemGroup, getImeiPair } from './types';
import { Combobox } from '../ui/Combobox';
import { normalizePhoneColor, formatPhoneColor } from '../../utils/phoneSpecs';
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
} from 'lucide-react';

interface NewPurchaseFormProps {
  suppliers: Supplier[];
  stores: Store[];
  currentUser: User | null;
  selectedSupplierId: string;
  onSelectSupplierId: (id: string) => void;
  groups: PurchaseItemGroup[];
  onUpdateGroup: (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => void;
  onAddGroup: () => void;
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
  statusMessage: { type: 'success' | 'error'; text: string } | null;
  isSubmitting: boolean;
  onBackToList: () => void;
  onOpenAddSupplier: () => void;
  onSubmitForm: (e: React.FormEvent) => void;
  onOpenScannerForImei2: (groupIdx: number, itemIdx: number) => void;
}

export const NewPurchaseForm: React.FC<NewPurchaseFormProps> = ({
  suppliers,
  stores: _stores,
  currentUser: _currentUser,
  selectedSupplierId,
  onSelectSupplierId,
  groups,
  onUpdateGroup,
  onAddGroup,
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
  statusMessage,
  isSubmitting,
  onBackToList,
  onOpenAddSupplier,
  onSubmitForm,
  onOpenScannerForImei2,
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
          {groups.map((group, groupIdx) => (
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
                    {group.brand || group.model ? `${group.brand} ${group.model}`.trim() : `Позиция #${groupIdx + 1}`}
                  </span>
                  {(group.storage || group.color) && (
                    <span className="text-[11px] text-fg-subtle truncate hidden sm:inline">
                      ({[group.storage, formatPhoneColor(group.color)].filter(Boolean).join(', ')})
                    </span>
                  )}
                </div>

                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveGroup(groupIdx)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                    title="Удалить позицию"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Group Specs Form */}
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
                    onChange={(v) => onUpdateGroup(groupIdx, 'color', normalizePhoneColor(v))}
                    className="h-7.5 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                    placeholder="Черный"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider mb-0.5 truncate">
                    Цена закупки ($)
                  </label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 pointer-events-none">$</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={group.purchasePriceUsd || ''}
                      onChange={(e) => onUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                      className="w-full h-7.5 rounded-lg bg-surface-raised border border-border pl-5 pr-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold font-mono focus:border-accent focus:bg-surface focus:outline-none transition-all shadow-2xs"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* IMEI Input List with Batch Paste */}
              <div className="pt-1.5 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="font-bold text-fg text-[11px]">
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
                    <span>+ Устройство</span>
                  </button>
                </div>

                {/* Batch Paste text helper */}
                <div>
                  <input
                    type="text"
                    placeholder="Быстрая вставка списка IMEI (через пробел, запятую или Enter)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onBatchImeiPaste(groupIdx, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim().length > 15) {
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
                    return (
                      <div key={itemIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-1 rounded-lg bg-surface-raised/40 border border-border/50">
                        <div>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={imei1}
                              onChange={(e) => onUpdateImei(groupIdx, itemIdx, `${e.target.value} / ${imei2}`.replace(/ \/ $/, ''))}
                              placeholder={`IMEI 1 #${itemIdx + 1}`}
                              className="w-full h-7 rounded-lg bg-surface border border-border px-2 pr-7 text-xs text-fg font-mono focus:border-accent focus:outline-none shadow-2xs"
                            />
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
                        </div>

                        <div className="flex items-center gap-1">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={imei2}
                              onChange={(e) => onUpdateImei2(groupIdx, itemIdx, e.target.value)}
                              placeholder="IMEI 2 (необязательно)"
                              className="w-full h-7 rounded-lg bg-surface border border-border px-2 pr-7 text-xs text-fg font-mono focus:border-accent focus:outline-none shadow-2xs"
                            />
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
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Button to add another position */}
          <button
            type="button"
            onClick={onAddGroup}
            className="w-full py-1.5 rounded-xl border border-dashed border-border hover:border-accent bg-surface-raised hover:bg-surface text-fg hover:text-accent text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-accent" />
            <span>+ Добавить ещё одну модель</span>
          </button>
        </div>

        {/* Bottom Actions & Total Bar (Sticky at bottom) */}
        <div className="sticky bottom-0 z-20 px-2.5 sm:px-4 py-1.5 border-t border-border bg-surface/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-lg font-mono text-xs">
          {statusMessage ? (
            <div className={`flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' ? 'text-accent' : 'text-danger'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-fg-subtle text-[11px]">
                Позиций: <strong className="text-fg">{groups.length}</strong> • Устройств: <strong className="text-accent font-bold">{totalFormUnits} шт.</strong>
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
              disabled={totalFormUnits === 0 || isSubmitting}
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
