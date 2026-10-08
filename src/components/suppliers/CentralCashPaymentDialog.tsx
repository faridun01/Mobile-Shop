import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatMoney } from '../../utils/money';

interface CentralCashPaymentDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  /** What is owed, in USD. */
  dueUsd: number;
  /** Central Cash balance, in USD. */
  cashBalanceUsd: number;
  rateNumber: number;
  withNote?: boolean;
  defaultNote?: string;
  onClose: () => void;
  onSubmit: (amountUsd: number, note?: string) => Promise<boolean>;
}

const parseAmount = (value: string) => {
  const n = parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** A supplier payment from Central Cash: one amount field, quick fills, the cash balance. */
export const CentralCashPaymentDialog: React.FC<CentralCashPaymentDialogProps> = ({
  open,
  title,
  subtitle,
  dueUsd,
  cashBalanceUsd,
  rateNumber,
  withNote,
  defaultNote = '',
  onClose,
  onSubmit,
}) => {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Default to the whole debt, or to what Central Cash can cover when that is less.
    const initial = cashBalanceUsd > 0 && cashBalanceUsd < dueUsd ? cashBalanceUsd : dueUsd;
    setAmount(initial > 0 ? initial.toFixed(2) : '');
    setNote(defaultNote);
  }, [open, dueUsd, cashBalanceUsd, defaultNote]);

  const parsed = parseAmount(amount);
  const overCash = parsed > cashBalanceUsd + 0.0001;
  const overDue = parsed > dueUsd + 0.0001;
  const amountError = parsed <= 0 ? null : overCash ? `В кассе только $${formatMoney(cashBalanceUsd)}` : overDue ? `Долг $${formatMoney(dueUsd)}` : null;

  const handleSubmit = async () => {
    if (submitting || parsed <= 0 || amountError) return;
    setSubmitting(true);
    try {
      if (await onSubmit(Math.round(parsed * 100) / 100, withNote ? note.trim() || undefined : undefined)) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!submitting) onClose(); }}
      title={title}
      subtitle={subtitle}
      maxWidth="sm"
      footer={
        <div className="w-full grid grid-cols-2 gap-2">
          <Button variant="secondary" fullWidth disabled={submitting} onClick={onClose}>Отмена</Button>
          <Button fullWidth loading={submitting} disabled={parsed <= 0 || Boolean(amountError)} onClick={handleSubmit}>
            {parsed > 0 ? `Оплатить $${formatMoney(parsed)}` : 'Оплатить'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-surface-raised border border-border">
            <span className="text-[11px] text-fg-subtle block">Долг</span>
            <span className="text-lg font-black font-mono text-danger">${formatMoney(dueUsd)}</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-raised border border-border">
            <span className="text-[11px] text-fg-subtle flex items-center gap-1"><Landmark className="w-3.5 h-3.5 text-accent" />Центральная касса</span>
            <span className="text-lg font-black font-mono text-accent">${formatMoney(cashBalanceUsd)}</span>
          </div>
        </div>

        <label className="block">
          <span className="block text-xs font-semibold text-fg-muted mb-1">Сумма, USD</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={Boolean(amountError)}
            className={`w-full rounded-xl bg-surface-raised border px-3 py-2.5 text-xl font-black font-mono text-accent focus:outline-none ${amountError ? 'border-danger' : 'border-border focus:border-accent'}`}
          />
          {amountError ? (
            <span className="block text-xs text-danger mt-1">{amountError}</span>
          ) : rateNumber > 0 && parsed > 0 ? (
            <span className="block text-xs text-fg-subtle mt-1">≈ {formatMoney(parsed * rateNumber)} TJS</span>
          ) : null}
        </label>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAmount(dueUsd.toFixed(2))}>
            Весь долг ${formatMoney(dueUsd)}
          </Button>
          {cashBalanceUsd > 0 && cashBalanceUsd < dueUsd && (
            <Button variant="secondary" size="sm" onClick={() => setAmount(cashBalanceUsd.toFixed(2))}>
              Вся касса ${formatMoney(cashBalanceUsd)}
            </Button>
          )}
        </div>

        {withNote && (
          <label className="block">
            <span className="block text-xs font-semibold text-fg-muted mb-1">Примечание</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          </label>
        )}
      </div>
    </Dialog>
  );
};
