import React from 'react';
import { Supplier, Store, User } from '../../types';
import { PurchaseItemGroup, getImeiPair } from './types';
import { Combobox } from '../ui/Combobox';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Scan,
  AlertCircle,
  CheckCircle2,
  FileText,
  X,
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
  stores,
  currentUser,
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
    <div className="work-screen flex-1 flex flex-col h-full overflow-y-auto bg-bg text-fg-muted min-h-0">
      <form onSubmit={onSubmitForm} className="flex-1 flex flex-col min-h-full">
        {/* Top Header with Back Button */}
        <div className="p-3.5 sm:p-4 border-b border-border bg-surface space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onBackToList}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-muted hover:text-fg-muted text-xs font-bold transition-colors border border-border"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Список приходов</span>
              </button>
              <span className="text-fg-subtle">/</span>
              <h3 className="text-xs font-bold text-fg-muted tracking-wider">
                Новый приход товаров
              </h3>
            </div>
          </div>

          <div className="text-xs">
            <div>
              <label className="block text-fg-subtle mb-1 font-semibold">
                Поставщик <span className="text-danger">* (обязательно выберите)</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => onSelectSupplierId(e.target.value)}
                  className={`w-full rounded-lg bg-surface-raised border px-3 py-2 text-xs font-semibold focus:outline-none transition-colors ${
                    !selectedSupplierId
                      ? 'border-amber-500/70 text-fg-subtle focus:border-accent'
                      : 'border-border text-fg-muted focus:border-accent'
                  }`}
                >
                  <option value="">-- Выберите поставщика (обязательно) --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name} (Долг: ${s.totalDebtUsd})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onOpenAddSupplier}
                  title="Добавить нового поставщика"
                  className="shrink-0 p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-accent hover:border-accent transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {!selectedSupplierId && (
                <p className="text-[11px] text-amber-500 mt-1 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Поставщик не выбран. Обязательно выберите поставщика из списка перед продолжением.</span>
                </p>
              )}
            </div>
          </div>

          {/* Destination location: All receipts go to Main Warehouse */}
          <div className="pt-2 border-t border-border flex items-center gap-2 text-xs">
            <span className="text-fg-subtle font-medium">Склад поступления:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/10 border border-accent/25 text-accent font-semibold text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Главный склад (Центральный)
            </span>
          </div>
        </div>

        {/* Groups list */}
        <div className="flex-1 p-3.5 sm:p-4 space-y-4 bg-bg pb-8">
          {groups.map((group, groupIdx) => (
            <div
              key={group.id}
              className="rounded-xl border border-border bg-surface shadow-xs p-3.5 sm:p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-bold text-fg-muted tracking-wider font-mono">
                  Позиция #{groupIdx + 1}
                </span>

                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveGroup(groupIdx)}
                    className="text-fg-subtle hover:text-danger p-1 transition-colors"
                    title="Удалить позицию"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Group Specs Form */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs font-mono">
                <div>
                  <label className="block text-fg-subtle mb-1">Бренд</label>
                  <Combobox
                    required
                    options={brandOptions}
                    value={group.brand}
                    onChange={(v) => onUpdateGroup(groupIdx, 'brand', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="Apple"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Модель</label>
                  <Combobox
                    required
                    options={getModelOptions(group.brand)}
                    value={group.model}
                    onChange={(v) => onUpdateGroup(groupIdx, 'model', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="iPhone 16 Pro"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">
                    RAM (ОЗУ) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <Combobox
                    required
                    options={ramOptions}
                    value={group.ram || ''}
                    onChange={(v) => onUpdateGroup(groupIdx, 'ram', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="8 GB"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Память</label>
                  <Combobox
                    options={storageOptions}
                    value={group.storage}
                    onChange={(v) => onUpdateGroup(groupIdx, 'storage', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="256 GB"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Цвет</label>
                  <Combobox
                    options={colorOptions}
                    value={group.color}
                    onChange={(v) => onUpdateGroup(groupIdx, 'color', v)}
                    className="rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted focus:border-accent focus:outline-none"
                    placeholder="Black Titanium"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">
                    Цена закупки ($)
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={group.purchasePriceUsd || ''}
                    onChange={(e) => onUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-accent font-bold focus:border-accent focus:outline-none font-mono"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* IMEI Input List with Batch Paste */}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-fg-muted font-mono">
                      Список IMEI ({group.items.filter(i => i.imei.trim().length > 0).length} шт.)
                    </span>
                    <span className="text-[10px] text-fg-subtle font-mono">
                      Сумма: ${group.items.filter(i => i.imei.trim().length > 0).length * group.purchasePriceUsd}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onAddImeiToGroup(groupIdx)}
                      className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted text-xs font-mono font-medium flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Добавить устройство</span>
                    </button>
                  </div>
                </div>

                {/* Batch Paste text helper */}
                <div className="pt-1">
                  <input
                    type="text"
                    placeholder="Быстрая вставка списка IMEI..."
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
                    className="w-full rounded-lg bg-surface-raised border border-dashed border-border px-3 py-1 text-[11px] font-mono text-fg-muted placeholder-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1 font-mono">
                  {group.items.map((item, itemIdx) => {
                    const [imei1, imei2] = getImeiPair(item.imei);
                    return (
                      <div key={itemIdx} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-fg-subtle mb-1">IMEI 1</label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={imei1}
                              onChange={(e) => onUpdateImei(groupIdx, itemIdx, `${e.target.value} / ${imei2}`.replace(/ \/ $/, ''))}
                              placeholder="IMEI 1"
                              className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted font-mono focus:border-accent focus:outline-none pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => onScanImei(groupIdx, itemIdx)}
                              className="absolute right-1.5 top-1.5 text-fg-subtle hover:text-accent p-0.5"
                              title="Сканировать IMEI 1"
                              aria-label="Сканировать IMEI 1"
                            >
                              <Scan className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-end gap-1">
                          <div className="flex-1">
                            <label className="block text-fg-subtle mb-1">IMEI 2 <span className="text-fg-subtle/70">(необязательно)</span></label>
                            <div className="relative">
                              <input
                                type="text"
                                value={imei2}
                                onChange={(e) => onUpdateImei2(groupIdx, itemIdx, e.target.value)}
                                placeholder="IMEI 2 (необязательно)"
                                className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg-muted font-mono focus:border-accent focus:outline-none pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => onOpenScannerForImei2(groupIdx, itemIdx)}
                                className="absolute right-1.5 top-1.5 text-fg-subtle hover:text-accent p-0.5"
                                title="Сканировать IMEI 2"
                                aria-label="Сканировать IMEI 2"
                              >
                                <Scan className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {group.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onRemoveImeiFromGroup(groupIdx, itemIdx)}
                              className="text-fg-subtle hover:text-danger p-1"
                              title="Удалить устройство"
                              aria-label="Удалить устройство"
                            >
                              <X className="w-3.5 h-3.5" />
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
            className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-accent bg-surface-raised hover:bg-surface text-fg-muted hover:text-accent text-xs font-mono font-bold flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Добавить модель</span>
          </button>
        </div>

        {/* Bottom Actions & Total Bar (Sticky at bottom) */}
        <div className="sticky bottom-0 z-20 p-3.5 sm:p-4 border-t border-border bg-surface/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-lg font-mono">
          {statusMessage ? (
            <div className={`flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' ? 'text-accent' : 'text-danger'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          ) : (
            <div className="text-xs text-fg-subtle">
              Позиций: <strong className="text-fg-muted">{groups.length}</strong> • 
              Устройств: <strong className="text-accent font-bold text-sm ml-1">{totalFormUnits} шт.</strong>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <div className="text-left mr-auto sm:mr-2">
              <span className="text-[10px] text-fg-subtle block font-medium">Итого</span>
              <span className="text-base font-bold text-accent font-mono">
                ${totalFormUsd.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={onBackToList}
              className="px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={totalFormUnits === 0 || isSubmitting}
              className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>Просмотреть чек</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
