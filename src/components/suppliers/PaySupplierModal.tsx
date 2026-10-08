import React, { useState, useEffect } from 'react';
import { Supplier, Store } from '../../types';
import { formatMoney } from '../../utils/money';
import { Landmark, Loader2 } from 'lucide-react';

interface PaySupplierModalProps {
  open: boolean;
  supplier: Supplier | null;
  centralCashStore: Store | null;
  rateNumber: number;
  onClose: () => void;
  onPay: (data: { supplierId: string; amountUsd: number; sourceAccountId?: string; storeId?: string; note?: string }) => Promise<{ success: boolean; message?: string }>;
  onError: (msg: string) => void;
}

export const PaySupplierModal: React.FC<PaySupplierModalProps> = ({
  open,
  supplier,
  centralCashStore,
  rateNumber,
  onClose,
  onPay,
  onError,
}) => {
  const targetStoreId = centralCashStore?.id || 'main-warehouse';
  const cashBalance = Number(centralCashStore?.cashBalanceUsd) || 0;

  const [paymentAmountUsd, setPaymentAmountUsd] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState(targetStoreId);
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (supplier) {
      const initialAmount = (cashBalance > 0 && cashBalance < supplier.totalDebtUsd)
        ? cashBalance.toString()
        : supplier.totalDebtUsd.toString();
      setPaymentAmountUsd(initialAmount);
      setPaymentNote(`Оплата поставщику ${supplier.name}`);
      setSourceAccountId(targetStoreId);
    }
  }, [supplier, targetStoreId, cashBalance]);

  if (!open || !supplier) return null;

  const handleExecutePayment = async () => {
    if (isSubmitting) return;
    const amt = parseFloat(paymentAmountUsd) || 0;
    if (amt <= 0) {
      onError('Укажите сумму');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onPay({
        supplierId: supplier.id,
        amountUsd: amt,
        sourceAccountId: sourceAccountId || targetStoreId,
        storeId: targetStoreId,
        note: paymentNote.trim() || undefined,
      });

      if (res.success) {
        onClose();
      } else {
        onError(res.message || 'Ошибка оплаты');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedAmount = parseFloat(paymentAmountUsd) || 0;
  const isInsufficient = parsedAmount > 0 && parsedAmount > cashBalance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-fg">Выплата поставщику</h4>
          <span className="text-xs font-mono font-bold text-danger">
            Долг: ${formatMoney(supplier.totalDebtUsd)}
          </span>
        </div>

        <p className="text-xs text-fg-subtle mb-3">{supplier.name}</p>

        <div className="space-y-3 text-xs mb-4">
          <div>
            <label className="block text-fg-subtle mb-1">Сумма ($ USD):</label>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                value={paymentAmountUsd}
                onChange={(e) => setPaymentAmountUsd(e.target.value)}
                className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
              />
              <span className="absolute right-3 top-2 text-fg-subtle">$</span>
            </div>

            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setPaymentAmountUsd(supplier.totalDebtUsd.toString())}
                className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-[11px] text-fg-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                ${formatMoney(supplier.totalDebtUsd)}
              </button>
              {cashBalance > 0 && cashBalance < supplier.totalDebtUsd && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountUsd(cashBalance.toString())}
                  className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-[11px] text-accent font-semibold hover:bg-accent/25 transition-colors cursor-pointer"
                >
                  Касса: ${formatMoney(cashBalance)}
                </button>
              )}
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-surface-raised border border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-fg">Центральная касса</span>
            </div>
            <span className="text-xs font-bold text-accent font-mono">
              ${formatMoney(cashBalance)}
            </span>
          </div>

          {rateNumber > 0 && parsedAmount > 0 && (
            <div className="flex items-center justify-between text-xs px-1 text-fg-subtle">
              <span>В сомони:</span>
              <span className="font-semibold text-fg font-mono">
                {formatMoney(parsedAmount * rateNumber)} TJS
              </span>
            </div>
          )}

          {isInsufficient && (
            <div className="p-2 rounded-lg bg-danger/10 border border-danger/30 text-xs text-danger flex items-center justify-between gap-2">
              <span>В кассе ${formatMoney(cashBalance)}</span>
              {cashBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentAmountUsd(cashBalance.toString())}
                  className="px-2 py-0.5 rounded-md bg-accent text-accent-fg font-bold text-[10px] hover:bg-accent-strong transition-colors cursor-pointer"
                >
                  Вставить ${formatMoney(cashBalance)}
                </button>
              )}
            </div>
          )}

          <div>
            <label className="block text-fg-subtle mb-1">Примечание:</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              className="w-full rounded-lg bg-surface-raised border border-border px-3 py-1.5 text-fg focus:border-accent focus:outline-none text-xs"
            />
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSubmitting || parsedAmount <= 0}
            onClick={handleExecutePayment}
            className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs hover:shadow-md transition-all"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isSubmitting ? 'Оплата…' : 'Оплатить'}
          </button>
        </div>
      </div>
    </div>
  );
};
