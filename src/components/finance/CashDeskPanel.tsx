import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Users,
  Truck,
  Search,
  CheckCircle2,
  HandCoins,
  ArrowUpRight,
  Package,
  Boxes,
  Store as StoreIcon,
  Smartphone,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatMoney } from '../../utils/money';
import { CashDeskSummary } from '../../types';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { LoadingState } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useAppFields } from '../../context/AppContext';

interface CashDeskPanelProps {
  storeId?: string | null;
  onOpenExpenseModal?: () => void;
}

export const CashDeskPanel: React.FC<CashDeskPanelProps> = ({ storeId }) => {
  const navigate = useNavigate();
  const { stores, paySupplier } = useAppFields('stores', 'paySupplier');

  const [data, setData] = useState<CashDeskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Search filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  // Customer debt repayment modal state
  const [paymentCustomer, setPaymentCustomer] = useState<{ id: string; name: string; totalDebtTjs: number } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentStoreId, setPaymentStoreId] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Supplier payment modal state
  const [paymentSupplier, setPaymentSupplier] = useState<{ id: string; name: string; totalDebtUsd: number; totalDebtTjs: number } | null>(null);
  const [isSupplierPaymentModalOpen, setIsSupplierPaymentModalOpen] = useState(false);
  const [supplierPaymentAmountUsd, setSupplierPaymentAmountUsd] = useState('');
  const [supplierPaymentStoreId, setSupplierPaymentStoreId] = useState('');
  const [supplierPaymentNote, setSupplierPaymentNote] = useState('');
  const [isSubmittingSupplierPayment, setIsSubmittingSupplierPayment] = useState(false);

  const selectedStoreId = storeId || 'all';

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/cash-desk/summary${selectedStoreId !== 'all' ? `?storeId=${encodeURIComponent(selectedStoreId)}` : ''}`;
      const res = await apiClient<CashDeskSummary>(url);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить данные кассы');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const handleUpdate = () => loadSummary();
    window.addEventListener('business-data-changed', handleUpdate);
    return () => window.removeEventListener('business-data-changed', handleUpdate);
  }, [loadSummary]);

  // Sorting states
  const [debtorSort, setDebtorSort] = useState<'DEBT_DESC' | 'DEBT_ASC' | 'NAME_ASC' | 'NAME_DESC'>('DEBT_DESC');
  const [supplierSort, setSupplierSort] = useState<'DEBT_DESC' | 'DEBT_ASC' | 'NAME_ASC' | 'NAME_DESC'>('DEBT_DESC');

  // Filter debtors by search
  const filteredDebtors = useMemo(() => {
    if (!data?.customers?.debtors) return [];
    if (!customerSearch.trim()) return data.customers.debtors;
    const q = customerSearch.toLowerCase().trim();
    return data.customers.debtors.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.note && c.note.toLowerCase().includes(q))
    );
  }, [data?.customers?.debtors, customerSearch]);

  // Sort debtors
  const sortedDebtors = useMemo(() => {
    return [...filteredDebtors].sort((a, b) => {
      switch (debtorSort) {
        case 'DEBT_DESC':
          return (b.totalDebtTjs || 0) - (a.totalDebtTjs || 0);
        case 'DEBT_ASC':
          return (a.totalDebtTjs || 0) - (b.totalDebtTjs || 0);
        case 'NAME_ASC':
          return a.name.localeCompare(b.name, 'ru');
        case 'NAME_DESC':
          return b.name.localeCompare(a.name, 'ru');
        default:
          return 0;
      }
    });
  }, [filteredDebtors, debtorSort]);

  // Filter suppliers by search
  const filteredSuppliers = useMemo(() => {
    if (!data?.suppliers?.suppliers) return [];
    if (!supplierSearch.trim()) return data.suppliers.suppliers;
    const q = supplierSearch.toLowerCase().trim();
    return data.suppliers.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q))
    );
  }, [data?.suppliers?.suppliers, supplierSearch]);

  // Sort suppliers
  const sortedSuppliers = useMemo(() => {
    return [...filteredSuppliers].sort((a, b) => {
      switch (supplierSort) {
        case 'DEBT_DESC':
          return (b.totalDebtUsd || 0) - (a.totalDebtUsd || 0);
        case 'DEBT_ASC':
          return (a.totalDebtUsd || 0) - (b.totalDebtUsd || 0);
        case 'NAME_ASC':
          return a.name.localeCompare(b.name, 'ru');
        case 'NAME_DESC':
          return b.name.localeCompare(a.name, 'ru');
        default:
          return 0;
      }
    });
  }, [filteredSuppliers, supplierSort]);


  // Open customer payment modal
  const handleOpenPaymentModal = (c: any) => {
    setPaymentCustomer(c);
    setPaymentAmountInput(c.totalDebtTjs.toString());
    const defaultStore = stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id || '';
    setPaymentStoreId(selectedStoreId !== 'all' ? selectedStoreId : defaultStore);
    setPaymentNote(`Оплата долга: ${c.name}`);
    setIsPaymentModalOpen(true);
  };

  // Submit customer debt payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer) return;
    const amount = parseFloat(paymentAmountInput);
    if (!amount || amount <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму оплаты' });
      return;
    }
    setIsSubmittingPayment(true);
    try {
      await apiClient(`/customers/${paymentCustomer.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountTjs: amount,
          storeId: paymentStoreId || undefined,
          note: paymentNote.trim() || undefined,
        }),
      });
      setStatus({
        tone: 'success',
        text: `Оплата ${formatMoney(amount)} TJS от клиента ${paymentCustomer.name} принята в кассу`,
      });
      setIsPaymentModalOpen(false);
      loadSummary();
      window.dispatchEvent(new CustomEvent('business-data-changed'));
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка проведения оплаты' });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open supplier payment modal
  const handleOpenSupplierPaymentModal = (s: any) => {
    setPaymentSupplier(s);
    setSupplierPaymentAmountUsd(s.totalDebtUsd.toString());
    const centralStore = stores.find((st) => st.isMainWarehouse)?.id || stores.find((st) => st.id === 'main-warehouse')?.id || 'main-warehouse';
    setSupplierPaymentStoreId(centralStore);
    setSupplierPaymentNote(`Оплата поставщику ${s.name}`);
    setIsSupplierPaymentModalOpen(true);
  };

  // Submit supplier payment
  const handleRecordSupplierPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSupplier) return;
    const amount = parseFloat(supplierPaymentAmountUsd);
    if (!amount || amount <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму оплаты в USD' });
      return;
    }
    setIsSubmittingSupplierPayment(true);
    try {
      const res = await paySupplier({
        supplierId: paymentSupplier.id,
        amountUsd: amount,
        storeId: supplierPaymentStoreId || undefined,
        note: supplierPaymentNote.trim() || undefined,
      });
      if (res.success) {
        setStatus({
          tone: 'success',
          text: `Оплата $${formatMoney(amount)} USD поставщику ${paymentSupplier.name} списана из кассы`,
        });
        setIsSupplierPaymentModalOpen(false);
        loadSummary();
        window.dispatchEvent(new CustomEvent('business-data-changed'));
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка проведения оплаты' });
      }
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка проведения оплаты' });
    } finally {
      setIsSubmittingSupplierPayment(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col h-full bg-bg items-center justify-center p-8">
        <LoadingState label="Загрузка данных кассы…" />
      </div>
    );
  }

  const isCentral = selectedStoreId === 'all';
  const currentStore = stores.find((s) => s.id === selectedStoreId);
  const currentStoreName = currentStore?.name || (isCentral ? 'Все магазины и склад' : 'Магазин');

  return (
    <div className="space-y-4 p-3 sm:p-5 select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {error && (
        <div className="p-3 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
          {error}
        </div>
      )}

      {/* 1. TOP METRICS GRID: КАССА, ТОВАРЫ ПО СЕБЕСТОИМОСТИ, ДОЛЖНИКИ, ПОСТАВЩИКИ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* КАРТОЧКА 1: ДЕНЬГИ В КАССЕ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Деньги в кассе
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  {formatMoney(data?.cash.totalTjs || 0)} TJS
                </div>
                <span className="text-[11px] font-semibold text-fg-subtle font-mono block truncate">
                  ≈ ${formatMoney(data?.cash.totalUsd || 0)} USD
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/cash-collection')}
              className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors cursor-pointer shrink-0"
              title="Перейти к инкассации"
            >
              <HandCoins className="w-4 h-4" />
            </button>
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center gap-1.5 pt-1.5 border-t border-border/50 truncate">
            <StoreIcon className="w-3 h-3 text-accent shrink-0" />
            <span className="truncate">
              {isCentral ? 'Общий баланс касс сети' : `Касса «${currentStoreName}»`}
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 2: ТОВАРЫ ПО СЕБЕСТОИМОСТИ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                    Товары по себестоимости
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono">
                    {data?.inventory.totalCount || 0} шт.
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
                  ${formatMoney(data?.inventory.totalCostUsd || 0)} USD
                </div>
                <span className="text-[11px] font-semibold text-fg-subtle font-mono block truncate">
                  ≈ {formatMoney(data?.inventory.totalCostTjs || 0)} TJS
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="p-1.5 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти на склад"
            >
              <ArrowUpRight className="w-4 h-4 text-accent" />
            </button>
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center gap-1.5 pt-1.5 border-t border-border/50 truncate">
            <Boxes className="w-3 h-3 text-indigo-500 shrink-0" />
            <span className="truncate">
              {isCentral ? 'Общий остаток склада и магазинов' : `Остаток «${currentStoreName}»`}
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 3: ДОЛГИ КЛИЕНТОВ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                    Долги клиентов
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
                    {data?.customers.debtorsCount || 0}
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                  {formatMoney(data?.customers.totalDebtTjs || 0)} TJS
                </div>
                <span className="text-[11px] font-semibold text-fg-subtle font-mono block truncate">
                  ≈ ${formatMoney(data?.customers.totalDebtUsd || 0)} USD
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="p-1.5 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти к клиентам"
            >
              <ArrowUpRight className="w-4 h-4 text-accent" />
            </button>
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center gap-1.5 pt-1.5 border-t border-border/50 truncate">
            <Users className="w-3 h-3 text-amber-500 shrink-0" />
            <span className="truncate">
              {data?.customers.debtorsCount || 0} клиентов с долгом
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 4: ДОЛГИ ПОСТАВЩИКАМ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-2xs flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-danger/15 border border-danger/25 flex items-center justify-center text-danger shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                    Долг поставщикам
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-danger/10 text-danger border border-danger/20 font-mono">
                    {data?.suppliers.debtorsCount || 0}
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-danger mt-0.5 truncate">
                  ${formatMoney(data?.suppliers.totalDebtUsd || 0)} USD
                </div>
                <span className="text-[11px] font-semibold text-fg-subtle font-mono block truncate">
                  ≈ {formatMoney(data?.suppliers.totalDebtTjs || 0)} TJS
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/suppliers')}
              className="p-1.5 rounded-lg bg-surface-raised border border-border hover:bg-surface text-fg transition-colors cursor-pointer shrink-0"
              title="Перейти к поставщикам"
            >
              <ArrowUpRight className="w-4 h-4 text-accent" />
            </button>
          </div>
          <div className="text-[10px] text-fg-subtle flex items-center gap-1.5 pt-1.5 border-t border-border/50 truncate">
            <Truck className="w-3 h-3 text-danger shrink-0" />
            <span className="truncate">
              {data?.suppliers.debtorsCount || 0} поставщиков с долгом
            </span>
          </div>
        </div>
      </div>

      {/* 3. ДОЛЖНИКИ И ПОСТАВЩИКИ (В ДВЕ КОЛОНКИ НА БОЛЬШИХ ЭКРАНАХ) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ДОЛЖНИКИ (КЛИЕНТЫ С ДОЛГАМИ) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-warning" />
                <h2 className="text-sm font-bold text-fg">Должники (клиенты)</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning border border-warning/20">
                  {data?.customers.debtorsCount || 0}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xs font-semibold text-fg-subtle">Общий долг:</span>
                <span className="text-sm font-black font-mono text-warning">
                  {formatMoney(data?.customers.totalDebtTjs || 0)} TJS
                </span>
                <span className="text-xs text-fg-subtle font-mono">
                  (≈ ${formatMoney(data?.customers.totalDebtUsd || 0)} USD)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-44">
                <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск должника..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full h-8 bg-surface-raised border border-border rounded-xl pl-8 pr-3 text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              {/* Sorting selector */}
              <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-xl px-2 h-8 shrink-0">
                <ArrowUpDown className="w-3 h-3 text-accent shrink-0" />
                <select
                  value={debtorSort}
                  onChange={(e) => setDebtorSort(e.target.value as any)}
                  className="bg-transparent text-[11px] font-semibold text-fg focus:outline-none cursor-pointer"
                  title="Сортировка должников"
                >
                  <option value="DEBT_DESC">Долг ↓</option>
                  <option value="DEBT_ASC">Долг ↑</option>
                  <option value="NAME_ASC">Имя (А-Я)</option>
                  <option value="NAME_DESC">Имя (Я-А)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => navigate('/customers')}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
                title="Перейти к списку всех клиентов"
              >
                <span>Все</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-border/60 overflow-y-auto max-h-96 mt-2 flex-1">
            {sortedDebtors.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                {customerSearch ? 'Должники по запросу не найдены' : 'Клиентов с активными долгами нет'}
              </div>
            ) : (
              sortedDebtors.map((c) => (
                <div
                  key={c.id}
                  className="py-2.5 sm:py-3 flex items-center justify-between gap-3 text-xs hover:bg-surface-raised/30 transition-colors px-1"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-fg truncate">{c.name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-fg-subtle mt-0.5 flex-wrap">
                      {c.phone && <span>{c.phone}</span>}
                      {c.note && <span>• {c.note}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <p className="font-black font-mono text-sm text-warning tabular-nums">
                        {formatMoney(c.totalDebtTjs)} TJS
                      </p>
                      <p className="text-[10px] text-fg-subtle font-mono tabular-nums">
                        ≈ ${formatMoney(data?.exchangeRate ? c.totalDebtTjs / data.exchangeRate : 0)}
                      </p>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleOpenPaymentModal(c)}
                      className="h-7 px-2 text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Принять оплату
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ПОСТАВЩИКИ (ДОЛГИ ПОСТАВЩИКАМ) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-danger" />
                <h2 className="text-sm font-bold text-fg">Поставщики</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-danger/10 text-danger border border-danger/20">
                  {data?.suppliers.debtorsCount || 0}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xs font-semibold text-fg-subtle">Общий долг:</span>
                <span className="text-sm font-black font-mono text-danger">
                  ${formatMoney(data?.suppliers.totalDebtUsd || 0)} USD
                </span>
                <span className="text-xs text-fg-subtle font-mono">
                  ({formatMoney(data?.suppliers.totalDebtTjs || 0)} TJS)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-44">
                <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск поставщика..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="w-full h-8 bg-surface-raised border border-border rounded-xl pl-8 pr-3 text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              {/* Sorting selector */}
              <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-xl px-2 h-8 shrink-0">
                <ArrowUpDown className="w-3 h-3 text-accent shrink-0" />
                <select
                  value={supplierSort}
                  onChange={(e) => setSupplierSort(e.target.value as any)}
                  className="bg-transparent text-[11px] font-semibold text-fg focus:outline-none cursor-pointer"
                  title="Сортировка поставщиков"
                >
                  <option value="DEBT_DESC">Долг ↓</option>
                  <option value="DEBT_ASC">Долг ↑</option>
                  <option value="NAME_ASC">Имя (А-Я)</option>
                  <option value="NAME_DESC">Имя (Я-А)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => navigate('/suppliers')}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
                title="Перейти к списку всех поставщиков"
              >
                <span>Все</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-border/60 overflow-y-auto max-h-96 mt-2 flex-1">
            {sortedSuppliers.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                {supplierSearch ? 'Поставщики по запросу не найдены' : 'Задолженностей перед поставщиками нет'}
              </div>
            ) : (
              sortedSuppliers.map((s) => (
                <div
                  key={s.id}
                  className="py-2.5 sm:py-3 flex items-center justify-between gap-3 text-xs hover:bg-surface-raised/30 transition-colors px-1"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-fg truncate">{s.name}</p>
                    {s.phone && <p className="text-[11px] text-fg-subtle mt-0.5">{s.phone}</p>}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-right">
                      <p className="font-black font-mono text-sm text-danger tabular-nums">
                        ${formatMoney(s.totalDebtUsd)} USD
                      </p>
                      <p className="text-[10px] text-fg-subtle font-mono tabular-nums">
                        {formatMoney(s.totalDebtTjs)} TJS
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenSupplierPaymentModal(s)}
                      className="h-7 px-2 text-xs font-semibold text-danger border-danger/30 hover:bg-danger/10 hover:border-danger shrink-0 cursor-pointer"
                    >
                      Оплатить
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* МОДАЛКА: ПРИЕМ ОПЛАТЫ ДОЛГА ОТ КЛИЕНТА В КАССУ */}
      <Dialog
        open={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Приём оплаты долга в кассу"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4 pt-1">
          <div className="p-3 bg-surface-raised rounded-xl border border-border text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Клиент:</span>
              <strong className="text-fg">{paymentCustomer?.name}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Общий долг:</span>
              <strong className="text-warning font-mono">
                {formatMoney(paymentCustomer?.totalDebtTjs || 0)} TJS
              </strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Сумма оплаты (TJS) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={paymentAmountInput}
              onChange={(e) => {
                const val = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                setPaymentAmountInput(val);
              }}
              placeholder="0.00"
              className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-base font-bold font-mono text-fg focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Касса магазина (куда поступают деньги) <span className="text-danger">*</span>
            </label>
            <select
              value={paymentStoreId}
              onChange={(e) => setPaymentStoreId(e.target.value)}
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
            <label className="block text-xs font-semibold text-fg mb-1">Примечание</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="Наличные, частичная оплата..."
              className="w-full h-9 px-3 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsPaymentModalOpen(false)}
              disabled={isSubmittingPayment}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmittingPayment}
              leftIcon={CheckCircle2}
            >
              Провести оплату
            </Button>
          </div>
        </form>
      </Dialog>

      {/* МОДАЛКА: ОПЛАТА ПОСТАВЩИКУ ИЗ КАССЫ */}
      <Dialog
        open={isSupplierPaymentModalOpen}
        onClose={() => setIsSupplierPaymentModalOpen(false)}
        title="Оплата поставщику из кассы"
      >
        <form onSubmit={handleRecordSupplierPayment} className="space-y-4 pt-1">
          <div className="p-3 bg-surface-raised rounded-xl border border-border text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Поставщик:</span>
              <strong className="text-fg">{paymentSupplier?.name}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-subtle">Задолженность:</span>
              <strong className="text-danger font-mono">
                ${formatMoney(paymentSupplier?.totalDebtUsd || 0)} USD ({formatMoney(paymentSupplier?.totalDebtTjs || 0)} TJS)
              </strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Сумма оплаты (USD) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={supplierPaymentAmountUsd}
              onChange={(e) => {
                const val = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                setSupplierPaymentAmountUsd(val);
              }}
              placeholder="0.00"
              className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-base font-bold font-mono text-fg focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Касса списания <span className="text-danger">*</span>
            </label>
            <select
              value={supplierPaymentStoreId}
              onChange={(e) => setSupplierPaymentStoreId(e.target.value)}
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
            <label className="block text-xs font-semibold text-fg mb-1">Примечание</label>
            <input
              type="text"
              value={supplierPaymentNote}
              onChange={(e) => setSupplierPaymentNote(e.target.value)}
              placeholder="Оплата за партию, наличные..."
              className="w-full h-9 px-3 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSupplierPaymentModalOpen(false)}
              disabled={isSubmittingSupplierPayment}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="danger"
              loading={isSubmittingSupplierPayment}
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
