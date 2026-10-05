import React, { useState, useEffect } from 'react';
import { CreditCard, X, Users, ArrowDownLeft, ArrowUpRight, Warehouse, Store, Loader2, AlertTriangle, Landmark } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { Store as StoreType, Owner } from '../../types';

interface OwnerTransactionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL';
    amountUsd: number;
    storeId: string;
    note?: string;
  }) => Promise<void>;
  displayOwners: Owner[];
  getOwnerDetails: (owner: Owner) => { name: string; roleTag: string; roleSub: string };
  stores: StoreType[];
  mainWarehouse?: StoreType;
  retailStores: StoreType[];
  rate: number;
  initialOwnerId?: string;
  initialTxType?: 'INVESTMENT' | 'WITHDRAWAL';
  isSubmitting: boolean;
}

export const OwnerTransactionModal: React.FC<OwnerTransactionModalProps> = ({
  open,
  onClose,
  onSubmit,
  displayOwners,
  getOwnerDetails,
  stores,
  mainWarehouse,
  retailStores,
  rate,
  initialOwnerId,
  initialTxType = 'INVESTMENT',
  isSubmitting,
}) => {
  const centralStore = mainWarehouse || stores.find(s => s.isMainWarehouse) || stores[0];
  const [selectedOwnerId, setSelectedOwnerId] = useState(initialOwnerId || displayOwners[0]?.id || '');
  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL'>(initialTxType);
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      const targetOwnerId = initialOwnerId || (displayOwners.length > 0 ? displayOwners[0].id : '');
      setSelectedOwnerId(targetOwnerId);
      setTxType(initialTxType);
      setAmountUsd('');
      setNote('');
    }
  }, [open, initialOwnerId, initialTxType, displayOwners]);

  if (!open) return null;

  const handleOwnerChange = (id: string) => {
    setSelectedOwnerId(id);
  };

  const selectedStore = centralStore;
  const selectedOwner = displayOwners.find(o => o.id === selectedOwnerId);
  const storeCash = selectedStore?.cashBalanceUsd ?? 0;
  const ownerCapital = selectedOwner?.capitalBalanceUsd ?? 0;
  const val = parseFloat(amountUsd) || 0;

  const isStoreCashInsufficient = txType === 'WITHDRAWAL' && val > 0 && val > storeCash;
  const isCapitalInsufficient = txType === 'WITHDRAWAL' && val > 0 && val > ownerCapital;
  const hasError = isStoreCashInsufficient || isCapitalInsufficient;
  const isSubmitDisabled = isSubmitting || val <= 0 || !selectedStore?.id || !selectedOwnerId || hasError;

  const maxWithdrawable = txType === 'WITHDRAWAL' ? Math.max(0, Math.min(storeCash, ownerCapital)) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled || !selectedStore) return;

    await onSubmit({
      ownerId: selectedOwnerId,
      type: txType,
      amountUsd: val,
      storeId: selectedStore.id,
      note: note.trim() || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-tx-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs"
    >
      <form
        onSubmit={handleSubmit}
        className="modal-card w-full max-w-sm max-h-[min(92vh,var(--visual-viewport-height,92vh))] overflow-y-auto rounded-2xl bg-surface border border-border p-4 sm:p-5 text-fg shadow-2xl space-y-3.5 text-xs"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-border">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-accent" />
            <h4 id="owner-tx-title" className="text-sm font-bold text-fg uppercase">
              Финансовая операция
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg p-1 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Учредитель *</label>
            <CustomSelect
              value={selectedOwnerId ?? ''}
              onChange={handleOwnerChange}
              options={displayOwners.map((o) => {
                const details = getOwnerDetails(o);
                return {
                  value: o.id,
                  label: details.name,
                  sublabel: txType === 'WITHDRAWAL' ? `Капитал: $${formatMoney(o.capitalBalanceUsd ?? 0)}` : details.roleTag,
                  icon: <Users className="w-3.5 h-3.5 text-accent" />,
                };
              })}
              title="Выберите учредителя"
              className="w-full"
              triggerClassName="w-full justify-between"
            />
            {txType === 'WITHDRAWAL' && selectedOwner && (
              <div className="flex items-center justify-between text-[11px] mt-1 px-2 py-1 rounded-lg bg-surface-raised border border-border/60">
                <span className="text-fg-subtle">Капитал учредителя:</span>
                <span className={`font-mono font-bold ${ownerCapital <= 0 ? 'text-danger' : 'text-fg'}`}>
                  ${formatMoney(ownerCapital)}
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Тип операции *</label>
            <CustomSelect
              value={txType}
              onChange={(val) => setTxType(val as 'INVESTMENT' | 'WITHDRAWAL')}
              options={[
                { value: 'INVESTMENT', label: 'Внесение капитала (Вложение)', icon: <ArrowDownLeft className="w-3.5 h-3.5 text-accent" /> },
                { value: 'WITHDRAWAL', label: 'Изъятие / вывод капитала', icon: <ArrowUpRight className="w-3.5 h-3.5 text-danger" /> },
              ]}
              title="Тип операции"
              className="w-full"
              triggerClassName="w-full justify-between"
            />
          </div>

          {/* Central Cash Field - Fixed / Locked */}
          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Касса (Централизованная) *</label>
            <div className="p-2.5 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                  <Landmark className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-fg truncate">Центральная касса</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-accent/15 text-accent border border-accent/25 shrink-0">
                      Всегда
                    </span>
                  </div>
                  <span className="text-[10px] text-fg-subtle block truncate">
                    {selectedStore?.name || 'Главный склад'}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <span className="text-[9px] text-fg-subtle uppercase block font-semibold">В кассе</span>
                <span className={`font-mono font-bold text-xs ${storeCash <= 0 ? 'text-danger' : 'text-accent'}`}>
                  ${formatMoney(storeCash)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-fg-subtle text-[11px] uppercase font-semibold">Сумма ($ USD) *</label>
              {maxWithdrawable !== null && maxWithdrawable > 0 && (
                <button
                  type="button"
                  onClick={() => setAmountUsd(String(maxWithdrawable))}
                  className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                >
                  Макс: ${formatMoney(maxWithdrawable)}
                </button>
              )}
            </div>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                required
                value={amountUsd ?? ''}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="1000"
                className={`w-full rounded-xl bg-surface-raised border px-3 py-2 text-base sm:text-sm font-bold font-mono focus:outline-none pr-8 ${
                  hasError
                    ? 'border-danger text-danger focus:border-danger'
                    : 'border-border text-accent focus:border-accent'
                }`}
              />
              <span className="absolute right-3 top-2.5 text-fg-subtle font-bold">$</span>
            </div>
            {amountUsd && parseFloat(amountUsd) > 0 && (
              <span className={`text-[11px] font-semibold block mt-1 font-mono ${hasError ? 'text-fg-subtle' : 'text-accent'}`}>
                ≈ {formatMoney((parseFloat(amountUsd) || 0) * rate)} TJS (по курсу {rate})
              </span>
            )}
          </div>

          {hasError && (
            <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-[11px] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Невозможно провести операцию</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] leading-snug">
                {isStoreCashInsufficient && (
                  <li>
                    В центральной кассе («{formatStoreName(selectedStore?.name || 'Центральная касса')}») доступно только <strong>${formatMoney(storeCash)}</strong>.
                  </li>
                )}
                {isCapitalInsufficient && (
                  <li>
                    Капитал учредителя составляет <strong>${formatMoney(ownerCapital)}</strong>.
                  </li>
                )}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Основание / Примечание</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Причина, реквизиты или источник..."
              className="w-full rounded-xl bg-surface-raised border border-border p-2.5 text-fg focus:border-accent focus:outline-none text-base sm:text-xs resize-none"
            />
          </div>
        </div>

        <div className="flex space-x-2 pt-2 border-t border-border">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'Сохранение…' : 'Провести'}
          </button>
        </div>
      </form>
    </div>
  );
};
