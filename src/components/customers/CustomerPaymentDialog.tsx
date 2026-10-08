import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Store } from '../../types';
import { formatMoney } from '../../utils/money';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { PaymentTarget } from './types';

interface CustomerPaymentDialogProps {
  target: PaymentTarget | null;
  stores: Store[];
  onClose: () => void;
  /** Resolves true when the payment went through (the dialog then closes). */
  onSubmit: (amountTjs: number, storeId: string, note: string) => Promise<boolean>;
  onInvalidAmount: () => void;
}

/** Takes a debt repayment from a customer into a store register. */
export const CustomerPaymentDialog: React.FC<CustomerPaymentDialogProps> = ({ target, stores, onClose, onSubmit, onInvalidAmount }) => {
  const [amount, setAmount] = useState('');
  const [storeId, setStoreId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!target) return;
    setAmount(target.totalDebtTjs > 0 ? target.totalDebtTjs.toString() : '');
    setStoreId(stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id || '');
    setNote(`Оплата долга: ${target.name}`);
    // stores is stable for an open dialog; re-seeding on every store refresh would wipe edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount.replace(',', '.'));
    if (!value || value <= 0) {
      onInvalidAmount();
      return;
    }
    setSubmitting(true);
    try {
      if (await onSubmit(value, storeId, note.trim())) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={() => { if (!submitting) onClose(); }} title="Приём оплаты долга в кассу">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="p-3 bg-surface-raised rounded-xl border border-border text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-fg-subtle">Клиент:</span>
            <strong className="text-fg">{target?.name}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-fg-subtle">Общий долг:</span>
            <strong className="text-warning font-mono">{formatMoney(target?.totalDebtTjs || 0)} TJS</strong>
          </div>
        </div>

        <label className="block">
          <span className="block text-xs font-semibold text-fg mb-1">
            Сумма оплаты (TJS) <span className="text-danger">*</span>
          </span>
          <input
            type="text"
            inputMode="decimal"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-base font-bold font-mono text-fg focus:outline-none focus:border-accent"
            autoFocus
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-fg mb-1">
            Касса магазина <span className="text-danger">*</span>
          </span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.isMainWarehouse ? `Центральная касса (${s.name})` : s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-fg mb-1">Примечание</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full h-9 px-3 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={submitting} leftIcon={CheckCircle2} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">
            Провести оплату
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
