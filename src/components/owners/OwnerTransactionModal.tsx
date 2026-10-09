import React, { useState, useEffect } from 'react';
import { X, Users, ArrowDownLeft, ArrowUpRight, Store, Loader2, AlertTriangle, Landmark } from 'lucide-react';
import { CustomSelect } from '../ui/CustomSelect';
import { decimal, formatMoney, moneyNumber } from '../../utils/money';
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
  retailStores: _retailStores,
  rate,
  initialOwnerId,
  initialTxType = 'INVESTMENT',
  isSubmitting,
}) => {
  const centralStore = mainWarehouse || stores.find(s => s.isMainWarehouse) || stores[0];
  const [selectedOwnerId, setSelectedOwnerId] = useState(initialOwnerId || displayOwners[0]?.id || '');
  const [selectedStoreId, setSelectedStoreId] = useState(centralStore?.id || stores[0]?.id || '');
  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL'>(initialTxType);
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      const targetOwnerId = initialOwnerId || (displayOwners.length > 0 ? displayOwners[0].id : '');
      setSelectedOwnerId(targetOwnerId);
      setTxType(initialTxType);
      const defaultStoreId = centralStore?.id || stores[0]?.id || '';
      setSelectedStoreId(defaultStoreId);
      setAmountUsd('');
      setNote('');
    }
  }, [open, initialOwnerId, initialTxType, displayOwners, centralStore, stores]);

  if (!open) return null;

  const handleOwnerChange = (id: string) => {
    setSelectedOwnerId(id);
  };

  const selectedStore = stores.find(s => s.id === selectedStoreId) || centralStore || stores[0];
  const selectedOwner = displayOwners.find(o => o.id === selectedOwnerId);
  const storeCash = selectedStore?.cashBalanceUsd ?? 0;
  // Profit owed back (negative available profit) can't be withdrawn — the server enforces the same.
  const profitOwedUsd = Math.max(0, -(selectedOwner?.availableProfitUsd ?? 0));
  const ownerCapital = moneyNumber(decimal(selectedOwner?.capitalBalanceUsd ?? 0).minus(profitOwedUsd));

  // Handle numeric input with comma/dot normalization for iOS Russian keyboard
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value;
    input = input.replace(',', '.');
    input = input.replace(/[^0-9.]/g, '');
    const parts = input.split('.');
    if (parts.length > 2) {
      input = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts[1] && parts[1].length > 2) {
      input = parts[0] + '.' + parts[1].slice(0, 2);
    }
    setAmountUsd(input);
  };

  const val = parseFloat(amountUsd.replace(',', '.')) || 0;

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overscroll-contain"
    >
      <form
        onSubmit={handleSubmit}
        className="modal-card w-full max-w-sm max-h-[min(90vh,var(--visual-viewport-height,90vh))] overflow-y-auto rounded-2xl bg-surface border border-border p-4 sm:p-5 text-fg shadow-2xl space-y-3.5 text-xs touch-pan-y"
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-border">
          <div className="flex items-center gap-2.5">
            {txType === 'WITHDRAWAL' ? (
              <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            )}
            <div>
              <h4 id="owner-tx-title" className="text-sm font-bold text-fg">
                {txType === 'WITHDRAWAL' ? 'Вывод капитала' : 'Внесение капитала'}
              </h4>
              <p className="text-[11px] text-fg-subtle">
                {txType === 'WITHDRAWAL'
                  ? 'Выплата средств учредителю из кассы'
                  : 'Пополнение капитала учредителя в кассу'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg p-1.5 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
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

          {/* Cash Register Selection */}
          <div>
            <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">Касса / Магазин *</label>
            <CustomSelect
              value={selectedStore?.id || ''}
              onChange={(id) => setSelectedStoreId(id)}
              options={stores.map((s) => ({
                value: s.id,
                label: s.isMainWarehouse ? `Центральная касса (${s.name})` : s.name,
                sublabel: `В кассе: $${formatMoney(s.cashBalanceUsd ?? 0)}`,
                icon: s.isMainWarehouse ? <Landmark className="w-3.5 h-3.5 text-accent" /> : <Store className="w-3.5 h-3.5 text-fg-subtle" />,
              }))}
              title="Выберите кассу"
              className="w-full"
              triggerClassName="w-full justify-between"
            />
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
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                value={amountUsd}
                onChange={handleAmountChange}
                placeholder="1000"
                className={`w-full rounded-xl bg-surface-raised border px-3 py-2 text-base font-bold font-mono focus:outline-none pr-8 ${
                  hasError
                    ? 'border-danger text-danger focus:border-danger'
                    : 'border-border text-accent focus:border-accent'
                }`}
              />
              <span className="absolute right-3 top-2 text-fg-subtle font-bold text-base">$</span>
            </div>
            {val > 0 && (
              <span className={`text-[11px] font-semibold block mt-1 font-mono ${hasError ? 'text-fg-subtle' : 'text-accent'}`}>
                ≈ {formatMoney(val * rate)} TJS (по курсу {rate})
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
                    В кассе («{formatStoreName(selectedStore?.name || 'Касса')}») доступно только <strong>${formatMoney(storeCash)}</strong>.
                  </li>
                )}
                {isCapitalInsufficient && (
                  <li>
                    {profitOwedUsd > 0
                      ? <>Можно вывести <strong>${formatMoney(Math.max(0, ownerCapital))}</strong>: капитал <strong>${formatMoney(selectedOwner?.capitalBalanceUsd ?? 0)}</strong> минус <strong>${formatMoney(profitOwedUsd)}</strong> к удержанию из будущей прибыли.</>
                      : <>Капитал учредителя составляет <strong>${formatMoney(ownerCapital)}</strong>.</>}
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
            className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg border border-border uppercase disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 ${
              txType === 'WITHDRAWAL'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-accent hover:bg-accent-strong text-accent-fg'
            }`}
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting
              ? 'Сохранение…'
              : txType === 'WITHDRAWAL'
              ? 'Вывести'
              : 'Внести'}
          </button>
        </div>
      </form>
    </div>
  );
};
