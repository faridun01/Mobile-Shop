import React, { useState, useEffect } from 'react';
import { SupplierInvoice, Store } from '../../types';
import { formatMoney } from '../../utils/money';
import { Landmark, Loader2 } from 'lucide-react';

interface PaySupplierInvoiceModalProps {
  open: boolean;
  invoice: SupplierInvoice | null;
  centralCashStore: Store | null;
  rateNumber: number;
  onClose: () => void;
  onPay: (data: { invoiceId: string; amountUsd: number; sourceAccountId?: string; storeId?: string }) => Promise<{ success: boolean; message?: string }>;
  onError: (msg: string) => void;
}

export const PaySupplierInvoiceModal: React.FC<PaySupplierInvoiceModalProps> = ({
  open,
  invoice,
  centralCashStore,
  rateNumber,
  onClose,
  onPay,
  onError,
}) => {
  const targetStoreId = centralCashStore?.id || 'main-warehouse';
  const cashBalance = Number(centralCashStore?.cashBalanceUsd) || 0;

  const [payInvoiceAmountUsd, setPayInvoiceAmountUsd] = useState('');
  const [payInvoiceSourceAccountId, setPayInvoiceSourceAccountId] = useState(targetStoreId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (invoice) {
      const initialAmount = (cashBalance > 0 && cashBalance < invoice.remainingAmountUsd)
        ? cashBalance.toString()
        : invoice.remainingAmountUsd.toString();
      setPayInvoiceAmountUsd(initialAmount);
      setPayInvoiceSourceAccountId(targetStoreId);
    }
  }, [invoice, targetStoreId, cashBalance]);

  if (!open || !invoice) return null;

  const handleExecuteInvoicePayment = async () => {
    if (isSubmitting) return;
    const amt = parseFloat(payInvoiceAmountUsd) || 0;
    if (amt <= 0) {
      onError('Укажите сумму');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onPay({
        invoiceId: invoice.id,
        amountUsd: amt,
        sourceAccountId: payInvoiceSourceAccountId || targetStoreId,
        storeId: targetStoreId,
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

  const parsedAmount = parseFloat(payInvoiceAmountUsd) || 0;
  const isInsufficient = parsedAmount > 0 && parsedAmount > cashBalance;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg-muted shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-fg">Оплата накладной</h4>
          <span className="text-xs font-mono font-bold text-danger">
            ${formatMoney(invoice.remainingAmountUsd)}
          </span>
        </div>

        <p className="text-xs text-fg-subtle mb-3">{invoice.invoiceNumber}</p>

        <div className="space-y-3 text-xs mb-4">
          <div>
            <label className="block text-fg-subtle mb-1">Сумма ($ USD):</label>
            <div className="relative">
              <input
                step="0.01"
                type="number"
                min="0.01"
                max={invoice.remainingAmountUsd}
                value={payInvoiceAmountUsd ?? ''}
                onChange={(e) => setPayInvoiceAmountUsd(e.target.value)}
                className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
              />
              <span className="absolute right-3 top-2 text-fg-subtle">$</span>
            </div>

            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => setPayInvoiceAmountUsd(invoice.remainingAmountUsd.toString())}
                className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-[11px] text-fg-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
              >
                ${formatMoney(invoice.remainingAmountUsd)}
              </button>
              {cashBalance > 0 && cashBalance < invoice.remainingAmountUsd && (
                <button
                  type="button"
                  onClick={() => setPayInvoiceAmountUsd(cashBalance.toString())}
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
                  onClick={() => setPayInvoiceAmountUsd(cashBalance.toString())}
                  className="px-2 py-0.5 rounded-md bg-accent text-accent-fg font-bold text-[10px] hover:bg-accent-strong transition-colors cursor-pointer"
                >
                  Вставить ${formatMoney(cashBalance)}
                </button>
              )}
            </div>
          )}
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
            onClick={handleExecuteInvoicePayment}
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
