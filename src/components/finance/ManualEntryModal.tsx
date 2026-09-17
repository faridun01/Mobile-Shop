import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import type { CounterpartyType, LedgerCurrency } from '../../types';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Select } from '../ui/Input';
import { formatMoney } from '../../utils/formatMoney';

const COUNTERPARTY_LABELS: Record<CounterpartyType, string> = {
  SUPPLIER: 'Поставщик',
  CUSTOMER: 'Покупатель',
  EMPLOYEE: 'Сотрудник',
  OWNER: 'Владелец',
  OTHER: 'Другое',
};

interface ManualEntryModalProps {
  kind: 'RECEIPT' | 'EXPENSE';
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  defaultAccountId?: string;
}

/** Приход (RECEIPT) and Расход (EXPENSE) are the same document shape end to end — one
 * account, one amount/currency, one category, an optional counterparty — differing only
 * in label/tone and which endpoint they call. Kept as one component instead of two
 * near-identical copies. */
export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({ kind, open, onClose, onSuccess, onError, defaultAccountId }) => {
  const { financialAccounts, financialCategories, createCashReceipt, createCashExpense } = useAppFields(
    'financialAccounts', 'financialCategories', 'createCashReceipt', 'createCashExpense'
  );

  const isReceipt = kind === 'RECEIPT';
  const direction = isReceipt ? 'IN' : 'OUT';
  const accounts = useMemo(() => financialAccounts.filter((a) => a.active), [financialAccounts]);
  const categories = useMemo(() => financialCategories.filter((c) => c.active && c.direction === direction), [financialCategories, direction]);

  const [accountId, setAccountId] = useState('');
  const [currency, setCurrency] = useState<LedgerCurrency>('TJS');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [counterpartyType, setCounterpartyType] = useState<CounterpartyType | ''>('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [description, setDescription] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Generated once per logical attempt (when the form opens) and reused for any retry of
  // that same attempt — never regenerated per-click, or a double-tap/network retry would
  // get two different keys and the server-side dedupe would never see them as the same thing.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (!open) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    setAccountId(defaultAccountId || accounts[0]?.id || '');
    setCurrency('TJS');
    setAmount('');
    setCategoryId(categories[0]?.id || '');
    setCounterpartyType('');
    setCounterpartyName('');
    setDescription('');
    setComment('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  // A per-store cash till only ever holds TJS (mirrors Store.cashBalanceTjs) — the backend
  // rejects USD against one, so the currency picker is hidden entirely rather than letting
  // the user pick a value that will just come back as an error.
  const currencyLocked = !!selectedAccount?.storeId;

  useEffect(() => {
    if (currencyLocked) setCurrency('TJS');
  }, [currencyLocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const numericAmount = parseFloat(amount);
    if (!accountId) return onError('Выберите счёт');
    if (!numericAmount || numericAmount <= 0) return onError('Укажите положительную сумму');
    if (!categoryId) return onError('Выберите статью');
    if (!description.trim()) return onError('Укажите основание операции');

    setIsSubmitting(true);
    try {
      const action = isReceipt ? createCashReceipt : createCashExpense;
      const res = await action({
        accountId,
        amount: numericAmount,
        currency,
        categoryId,
        counterpartyType: counterpartyType || undefined,
        counterpartyName: counterpartyName.trim() || undefined,
        description: description.trim(),
        comment: comment.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (res.success) {
        onSuccess(isReceipt ? `Приход на сумму ${formatMoney(numericAmount, currency)} проведён` : `Расход на сумму ${formatMoney(numericAmount, currency)} проведён`);
        onClose();
      } else {
        onError(res.message || 'Не удалось провести операцию');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isReceipt ? 'Приход денежных средств' : 'Расход денежных средств'}
      footer={
        <>
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button variant={isReceipt ? 'primary' : 'danger'} fullWidth type="submit" form="manual-entry-form" loading={isSubmitting}>
            Провести
          </Button>
        </>
      }
    >
      <form id="manual-entry-form" onSubmit={handleSubmit} className="space-y-3.5">
        <FormField label="Счёт" required>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {formatMoney(a.balanceTjs, 'TJS')}{a.type === 'MAIN' ? ` / ${formatMoney(a.balanceUsd, 'USD')}` : ''}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-2.5">
          <FormField label={`Сумма (${currency})`} required>
            <input
              type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)}
              className={`w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent ${isReceipt ? 'text-success' : 'text-danger'}`}
            />
          </FormField>
          <FormField label="Валюта">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)} className="w-full" disabled={currencyLocked}>
              <option value="TJS">TJS</option>
              <option value="USD">USD</option>
            </Select>
          </FormField>
        </div>

        <FormField label="Статья" required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full">
            {categories.length === 0 && <option value="">Нет доступных категорий</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>

        <div className="grid grid-cols-2 gap-2.5">
          <FormField label="Контрагент">
            <Select value={counterpartyType} onChange={(e) => setCounterpartyType(e.target.value as CounterpartyType | '')} className="w-full">
              <option value="">—</option>
              {(Object.keys(COUNTERPARTY_LABELS) as CounterpartyType[]).map((t) => <option key={t} value={t}>{COUNTERPARTY_LABELS[t]}</option>)}
            </Select>
          </FormField>
          <FormField label="Имя / название">
            <input
              type="text" value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="Необязательно"
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
        </div>

        <FormField label="Основание" required>
          <input
            type="text" required value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={isReceipt ? 'Например: возврат от поставщика' : 'Например: канцтовары для офиса'}
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
