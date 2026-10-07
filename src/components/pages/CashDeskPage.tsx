import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { formatStoreName } from '../../utils/storeContext';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import {
  Wallet,
  Plus,
  HandCoins,
  CheckCircle2,
  Store as StoreIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { STANDARD_CATEGORIES } from '../expenses/types';
import { ExpenseCategory } from '../../types';
import { CashDeskPanel } from '../finance/CashDeskPanel';

export const CashDeskPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, stores, createExpense, selectedStoreId, setSelectedStoreId } = useAppFields(
    'currentUser',
    'stores',
    'createExpense',
    'selectedStoreId',
    'setSelectedStoreId'
  );

  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Quick Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('RENT');
  const [expenseStoreId, setExpenseStoreId] = useState<string>('');
  const [expenseNote, setExpenseNote] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const retailStores = stores.filter((s) => !s.isMainWarehouse);

  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';

  const effectiveStoreId =
    isPartner && currentUser?.storeId
      ? currentUser.storeId
      : (selectedStoreId || 'all');

  const isCentral = effectiveStoreId === 'all';
  const currentStore = stores.find((s) => s.id === effectiveStoreId);
  const pageTitle = isCentral
    ? 'Центральная касса (Общий итог по всем магазинам)'
    : currentStore?.isMainWarehouse
    ? `Центральная касса (${currentStore.name})`
    : `Касса: ${formatStoreName(currentStore?.name || 'Магазин')}`;

  const handleOpenExpenseModal = () => {
    setExpenseAmount('');
    setExpenseCategory('OTHER');
    setExpenseStoreId(effectiveStoreId || retailStores[0]?.id || stores[0]?.id || '');
    setExpenseNote('');
    setIsExpenseModalOpen(true);
  };

  const handleCreateQuickExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expenseAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму расхода' });
      return;
    }
    if (!expenseStoreId) {
      setStatus({ tone: 'error', text: 'Выберите кассу магазина' });
      return;
    }

    setIsSubmittingExpense(true);
    try {
      const res = await createExpense({
        category: expenseCategory,
        amountTjs: amount,
        storeId: expenseStoreId,
        description: expenseNote.trim() || undefined,
        paidFromCashRegister: true,
      });

      if (res.success) {
        setStatus({
          tone: 'success',
          text: `Расход на сумму ${amount.toLocaleString()} TJS успешно списан из кассы`,
        });
        setIsExpenseModalOpen(false);
        window.dispatchEvent(new CustomEvent('business-data-changed'));
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка списания расхода' });
      }
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел кассы доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight">
              {pageTitle}
            </h1>
            <p className="text-[11px] text-fg-subtle">
              Наличные деньги в кассе, должники и поставщики
            </p>
          </div>
        </div>

        {/* Quick Actions Header */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Store Selector (Admin) */}
          {isAdmin && stores.length > 0 && (
            <div className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-xl px-2.5 h-9 shrink-0">
              <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
              <select
                value={effectiveStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="bg-transparent text-xs font-bold text-fg focus:outline-none cursor-pointer"
                title="Выбрать кассу / магазин"
              >
                <option value="all">
                  Центральная касса (Общий итог)
                </option>
                {retailStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {stores.filter((s) => s.isMainWarehouse).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Главный склад)
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenExpenseModal}
            leftIcon={Plus}
            className="h-9 px-2.5 text-xs text-danger border-danger/30 hover:border-danger hover:bg-danger/10 cursor-pointer"
            title="Быстро списать расход из кассы"
          >
            Расход
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/cash-collection')}
            leftIcon={HandCoins}
            className="h-9 px-2.5 text-xs text-accent cursor-pointer"
            title="Перейти к инкассации"
          >
            Инкассация
          </Button>
        </div>
      </div>

      {/* Main Cash & Z-Report Content */}
      <div className="flex-1 overflow-y-auto">
        <CashDeskPanel
          storeId={effectiveStoreId}
          onOpenExpenseModal={handleOpenExpenseModal}
        />
      </div>

      {/* QUICK EXPENSE MODAL */}
      <Dialog
        open={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="Списание расхода из кассы"
      >
        <form onSubmit={handleCreateQuickExpense} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Сумма расхода (TJS) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="any"
              required
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="0.00"
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-fg text-sm focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Категория расхода
            </label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-fg text-sm focus:outline-none focus:border-accent"
            >
              {STANDARD_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Касса списания
            </label>
            <select
              value={expenseStoreId}
              onChange={(e) => setExpenseStoreId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-fg text-sm focus:outline-none focus:border-accent"
            >
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}{st.isMainWarehouse ? ' (Центральная касса)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Примечание (необязательно)
            </label>
            <input
              type="text"
              value={expenseNote}
              onChange={(e) => setExpenseNote(e.target.value)}
              placeholder="Например: аренда за октябрь, хозтовары..."
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-fg text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsExpenseModalOpen(false)}
              disabled={isSubmittingExpense}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={isSubmittingExpense}
              leftIcon={CheckCircle2}
            >
              Списать из кассы
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
