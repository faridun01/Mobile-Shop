import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import type { LedgerCurrency } from '../../types';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Select } from '../ui/Input';
import { formatMoney } from '../../utils/formatMoney';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  defaultAccountId?: string;
}

export const TransferModal: React.FC<TransferModalProps> = ({ open, onClose, onSuccess, onError, defaultAccountId }) => {
  const { financialAccounts, createTransfer } = useAppFields('financialAccounts', 'createTransfer');
  const accounts = useMemo(() => financialAccounts.filter((a) => a.active), [financialAccounts]);

  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [currency, setCurrency] = useState<LedgerCurrency>('TJS');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Same "generate once per attempt, reuse on retry" contract as ManualEntryModal.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    const initialSource = defaultAccountId || accounts[0]?.id || '';
    setAccountId(initialSource);
    setDestinationAccountId(accounts.find((a) => a.id !== initialSource)?.id || '');
    setCurrency('TJS');
    setAmount('');
    setDescription('');
    setComment('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sourceAccount = accounts.find((a) => a.id === accountId);
  const destinationOptions = accounts.filter((a) => a.id !== accountId);
  // Both sides of a transfer touching a per-store till must be TJS (see ManualEntryModal) —
  // only a transfer where both ends are the Main Account (or one end is) can move USD.
  const currencyLocked = !!sourceAccount?.storeId || !!accounts.find((a) => a.id === destinationAccountId)?.storeId;

  useEffect(() => {
    if (currencyLocked) setCurrency('TJS');
  }, [currencyLocked]);

  useEffect(() => {
    if (destinationAccountId === accountId) {
      setDestinationAccountId(destinationOptions[0]?.id || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const numericAmount = parseFloat(amount);
    if (!accountId || !destinationAccountId) return onError('Выберите оба счёта');
    if (accountId === destinationAccountId) return onError('Счёт списания и зачисления должны отличаться');
    if (!numericAmount || numericAmount <= 0) return onError('Укажите положительную сумму');
    if (!description.trim()) return onError('Укажите основание перевода');

    setIsSubmitting(true);
    try {
      const res = await createTransfer({
        accountId, destinationAccountId, amount: numericAmount, currency,
        description: description.trim(), comment: comment.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (res.success) {
        onSuccess(`Перевод на сумму ${formatMoney(numericAmount, currency)} выполнен`);
        onClose();
      } else {
        onError(res.message || 'Не удалось выполнить перевод');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Перевод между счетами"
      footer={
        <>
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button variant="primary" fullWidth type="submit" form="transfer-form" loading={isSubmitting}>Выполнить перевод</Button>
        </>
      }
    >
      <form id="transfer-form" onSubmit={handleSubmit} className="space-y-3.5">
        <FormField label="Счёт списания" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {formatMoney(a.balanceTjs, 'TJS')}{a.type === 'MAIN' ? ` / ${formatMoney(a.balanceUsd, 'USD')}` : ''}</option>
            ))}
          </Select>
        </FormField>

        <FormField label="Счёт зачисления" required>
          <Select value={destinationAccountId} onChange={(e) => setDestinationAccountId(e.target.value)} className="w-full">
            {destinationOptions.length === 0 && <option value="">Нет доступных счетов</option>}
            {destinationOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {formatMoney(a.balanceTjs, 'TJS')}{a.type === 'MAIN' ? ` / ${formatMoney(a.balanceUsd, 'USD')}` : ''}</option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-2.5">
          <FormField label={`Сумма (${currency})`} required>
            <input
              type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
          <FormField label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)} className="w-full" disabled={currencyLocked}>
              <option value="TJS">TJS</option>
              <option value="USD">USD</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Основание" required>
          <input
            type="text" required value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Например: инкассация выручки"
            className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>

        <FormField label="Комментарий">
          <input
            type="text" value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="Необязательно"
            className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>
      </form>
    </Dialog>
  );
};
