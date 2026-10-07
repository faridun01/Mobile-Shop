import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ProfitReport } from '../finance/ProfitReport';
import { CashDeskPanel } from '../finance/CashDeskPanel';
import { DailyCashClosingListPanel } from '../finance/DailyCashClosingListPanel';
import { useStoreContext, formatStoreName } from '../../utils/storeContext';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { getBusinessDateKey } from '../../utils/businessDate';
import {
  Landmark,
  Plus,
  HandCoins,
  RefreshCw,
  Wallet,
  Receipt,
  FileCheck2,
  TrendingUp,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { STANDARD_CATEGORIES } from '../expenses/types';
import { ExpenseCategory } from '../../types';

type Tab = 'CASH' | 'REPORT' | 'CLOSINGS';

const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: 'CASH', label: 'Касса и долги', icon: Wallet },
  { value: 'REPORT', label: 'Прибыль и отчёт', icon: TrendingUp },
  { value: 'CLOSINGS', label: 'Закрытие смен', icon: FileCheck2 },
];

export const FinancePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, stores, todayRate, createExpense } = useAppFields(
    'currentUser',
    'stores',
    'todayRate',
    'createExpense'
  );
  const storeCtx = useStoreContext();

  const isSeller = currentUser?.role === 'SELLER';
  const isAdmin = currentUser?.role === 'ADMIN';
  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab')?.toUpperCase() as Tab | null;
  const tab: Tab = urlTab && ['CASH', 'REPORT', 'CLOSINGS'].includes(urlTab) ? urlTab : 'CASH';
  const setTab = (next: Tab) => setSearchParams(next === 'CASH' ? {} : { tab: next }, { replace: true });

  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Date filter state for ProfitReport
  const todayKey = getBusinessDateKey();
  const currentMonth = todayKey.substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleDateChange = (start: string, end: string, monthStr?: string) => {
    setStartDate(start);
    setEndDate(end);
    setSelectedMonth(monthStr || '');
  };

  const handleResetToCurrentMonth = () => {
    setSelectedMonth(currentMonth);
    setStartDate('');
    setEndDate('');
  };

  const activeMonth = selectedMonth || (startDate ? startDate.slice(0, 7) : currentMonth);

  // Quick Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('RENT');
  const [expenseStoreId, setExpenseStoreId] = useState<string>('');
  const [expenseNote, setExpenseNote] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  const retailStores = stores.filter((s) => !s.isMainWarehouse);

  const handleOpenExpenseModal = () => {
    setExpenseAmount('');
    setExpenseCategory('OTHER');
    setExpenseStoreId(storeCtx.storeId || retailStores[0]?.id || stores[0]?.id || '');
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

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('business-data-changed'));
    setStatus({ tone: 'success', text: 'Данные кассы и отчётов обновлены' });
  };

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел финансов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  const currentStore = stores.find((s) => s.id === storeCtx.storeId);
  const pageTitle = storeCtx.mode === 'STORE'
    ? `Касса: ${formatStoreName(currentStore?.name || 'Магазин')}`
    : 'Финансы и касса';

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            {storeCtx.mode === 'STORE' ? <Wallet className="w-5 h-5" /> : <Landmark className="w-5 h-5" />}
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight flex items-center gap-2">
              {pageTitle}
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                1 USD = {rate.toFixed(2)} TJS
              </span>
            </h1>
          </div>
        </div>

        {/* Quick Actions Header */}
        <div className="flex items-center gap-2 flex-wrap">
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

          <Button
            variant="secondary"
            size="sm"
            leftIcon={RefreshCw}
            onClick={handleRefresh}
            className="h-9 px-2.5 text-xs cursor-pointer"
            title="Обновить данные"
          >
            <span className="hidden sm:inline">Обновить</span>
          </Button>
        </div>
      </div>

      {/* Navigation Tabs Pill Bar */}
      <div className="border-b border-border bg-surface shrink-0 px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto">
        <FilterPillGroup
          options={TABS.map((t) => ({ value: t.value, label: t.label }))}
          value={tab}
          onChange={(val) => setTab(val as Tab)}
          scrollable
        />
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'CASH' ? (
          <CashDeskPanel
            storeId={storeCtx.storeId}
            onOpenExpenseModal={handleOpenExpenseModal}
          />
        ) : tab === 'CLOSINGS' ? (
          <div className="p-3 sm:p-5">
            <DailyCashClosingListPanel month={activeMonth} storeId={storeCtx.storeId} />
          </div>
        ) : (
          <ProfitReport
            key={tab}
            view="summary"
            month={selectedMonth}
            startDate={startDate}
            endDate={endDate}
            onDateChange={handleDateChange}
            onResetToCurrentMonth={handleResetToCurrentMonth}
          />
        )}
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
              Сумма расхода (TJS) *
            </label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              required
              value={expenseAmount}
              onChange={(e) => {
                const val = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                setExpenseAmount(val);
              }}
              placeholder="0.00"
              className="w-full h-11 px-3 bg-surface-raised border border-border rounded-xl text-lg font-bold font-mono text-danger focus:outline-none focus:border-danger"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Категория расхода *
            </label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
              className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
            >
              {STANDARD_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Касса магазина (откуда выдаются деньги) *
            </label>
            <select
              value={expenseStoreId}
              onChange={(e) => setExpenseStoreId(e.target.value)}
              className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isMainWarehouse ? `Центральная касса (${s.name})` : s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Примечание (на что потрачено)
            </label>
            <input
              type="text"
              value={expenseNote}
              onChange={(e) => setExpenseNote(e.target.value)}
              placeholder="Обед, такси, пакеты, моющие средства..."
              className="w-full h-9 px-3 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
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
