import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  Package,
  Truck,
  Users,
  HandCoins,
  ArrowUpRight,
  Clock,
  Landmark,
  Store as StoreIcon,
  Search,
  CheckCircle2,
  X,
  Smartphone,
  Banknote,
  Plus,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { CashDeskSummary } from '../../types';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { LoadingState } from '../ui/Skeleton';

interface CashDeskPanelProps {
  storeId?: string | null;
  onOpenExpenseModal?: () => void;
}

export const CashDeskPanel: React.FC<CashDeskPanelProps> = ({ storeId, onOpenExpenseModal }) => {
  const navigate = useNavigate();
  const { stores, currentUser } = useAppFields('stores', 'currentUser');
  const [data, setData] = useState<CashDeskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState<{ id: string; name: string; totalDebtTjs: number } | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentStoreId, setPaymentStoreId] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

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

  const handleOpenPaymentModal = (customer: { id: string; name: string; totalDebtTjs: number }) => {
    setPaymentCustomer(customer);
    setPaymentAmountInput(customer.totalDebtTjs.toString());
    const defaultStore = stores.find((s) => !s.isMainWarehouse);
    setPaymentStoreId(currentUser?.storeId || defaultStore?.id || stores[0]?.id || '');
    setPaymentNote('');
    setIsPaymentModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer || isSubmittingPayment) return;

    const amount = parseFloat(paymentAmountInput);
    if (!amount || amount <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму оплаты' });
      return;
    }

    if (!paymentStoreId) {
      setStatus({ tone: 'error', text: 'Выберите кассу магазина для внесения денег' });
      return;
    }

    setIsSubmittingPayment(true);
    try {
      await apiClient(`/customers/${paymentCustomer.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountTjs: amount,
          storeId: paymentStoreId,
          note: paymentNote.trim() || undefined,
        }),
      });

      setStatus({
        tone: 'success',
        text: `Оплата ${formatMoney(amount)} TJS от клиента «${paymentCustomer.name}» принята в кассу`,
      });
      setIsPaymentModalOpen(false);
      window.dispatchEvent(new CustomEvent('business-data-changed'));
      loadSummary();
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка проведения оплаты' });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const filteredDebtors = (data?.customers.debtors || []).filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase().trim();
    return c.name.toLowerCase().includes(q) || (c.phone && c.phone.toLowerCase().includes(q));
  });

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col h-full bg-bg items-center justify-center p-8">
        <LoadingState label="Загрузка данных кассы и балансов…" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-5 select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {error && (
        <div className="p-3 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
          {error}
        </div>
      )}

      {/* 4 PRIMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* 1. ДЕНЬГИ В КАССЕ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                Наличные в кассе
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-success mt-1">
                {formatMoney(data?.cash.totalTjs || 0)} TJS
              </div>
              <span className="text-xs font-semibold text-fg-subtle font-mono mt-0.5 block">
                ≈ ${formatMoney(data?.cash.totalUsd || 0)} USD
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/25 flex items-center justify-center text-success shrink-0">
              <Banknote className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-fg-subtle">
              Точек: <strong className="text-fg font-semibold">{data?.cash.stores.length || 0}</strong>
            </span>
            <button
              type="button"
              onClick={() => navigate('/cash-collection')}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <HandCoins className="w-3.5 h-3.5" /> Инкассация →
            </button>
          </div>
        </div>

        {/* 2. ТОВАРЫ НА СКЛАДЕ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                Товар на складе
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-accent mt-1">
                {data?.inventory.totalCount || 0} <span className="text-sm font-semibold">шт.</span>
              </div>
              <span className="text-xs font-semibold text-fg-subtle font-mono mt-0.5 block">
                Себестоимость: ${formatMoney(data?.inventory.totalCostUsd || 0)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-fg-subtle font-mono">
              ≈ {formatMoney(data?.inventory.totalCostTjs || 0)} TJS
            </span>
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Package className="w-3.5 h-3.5" /> Склад →
            </button>
          </div>
        </div>

        {/* 3. ДОЛГ ПОСТАВЩИКАМ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                Долг поставщикам
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-danger mt-1">
                ${formatMoney(data?.suppliers.totalDebtUsd || 0)} <span className="text-sm font-semibold">USD</span>
              </div>
              <span className="text-xs font-semibold text-danger/80 font-mono mt-0.5 block">
                ≈ {formatMoney(data?.suppliers.totalDebtTjs || 0)} TJS
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-danger/15 border border-danger/25 flex items-center justify-center text-danger shrink-0">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-fg-subtle">
              Поставщиков: <strong className="text-fg font-semibold">{data?.suppliers.debtorsCount || 0}</strong>
            </span>
            <button
              type="button"
              onClick={() => navigate('/suppliers')}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Поставщики →
            </button>
          </div>
        </div>

        {/* 4. ДОЛГИ КЛИЕНТОВ */}
        <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                Долги клиентов
              </span>
              <div className="text-xl sm:text-2xl font-black font-mono text-warning mt-1">
                {formatMoney(data?.customers.totalDebtTjs || 0)} TJS
              </div>
              <span className="text-xs font-semibold text-warning/80 font-mono mt-0.5 block">
                ≈ ${formatMoney(data?.customers.totalDebtUsd || 0)} USD
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/25 flex items-center justify-center text-warning shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="pt-3 mt-3 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-fg-subtle">
              Должников: <strong className="text-fg font-semibold">{data?.customers.debtorsCount || 0}</strong>
            </span>
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" /> База клиентов →
            </button>
          </div>
        </div>
      </div>

      {/* DETAIL TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Кассы магазинов (деньги) */}
        <div className="bg-surface rounded-2xl border border-border shadow-xs p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-fg">Остатки в кассах точек</h2>
            </div>
            <div className="flex items-center gap-2">
              {onOpenExpenseModal && (
                <button
                  type="button"
                  onClick={onOpenExpenseModal}
                  className="text-xs font-bold text-danger hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Расход
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/cash-collection')}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                Инкассация <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="divide-y divide-border overflow-y-auto max-h-80">
            {(data?.cash.stores || []).map((store) => (
              <div key={store.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-fg">{store.name}</span>
                    {store.isMainWarehouse && (
                      <span className="text-[10px] bg-accent/10 text-accent font-semibold px-2 py-0.2 rounded-full border border-accent/20">
                        Офис / Склад
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-fg-subtle font-mono">
                    ${formatMoney(store.cashUsd)} USD
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-fg block">
                    {formatMoney(store.cashTjs)} TJS
                  </span>
                  {!store.isMainWarehouse && store.cashUsd > 0 && (
                    <button
                      type="button"
                      onClick={() => navigate('/cash-collection')}
                      className="text-[11px] font-semibold text-accent hover:underline mt-0.5 inline-block cursor-pointer"
                    >
                      Инкассировать →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Долги поставщикам */}
        <div className="bg-surface rounded-2xl border border-border shadow-xs p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-danger" />
              <h2 className="text-sm font-bold text-fg">Долги перед поставщиками</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/suppliers')}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              Все поставщики <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-border overflow-y-auto max-h-80">
            {(data?.suppliers.suppliers || []).length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                Задолженности перед поставщиками нет
              </div>
            ) : (
              (data?.suppliers.suppliers || []).map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-fg block">{s.name}</span>
                    {s.phone && (
                      <span className="text-[11px] text-fg-subtle block">{s.phone}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold font-mono text-danger block">
                      ${formatMoney(s.totalDebtUsd)} USD
                    </span>
                    <span className="text-[11px] text-fg-subtle font-mono">
                      {formatMoney(s.totalDebtTjs)} TJS
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Клиенты в долг (Продажи в долг) */}
      <div className="bg-surface rounded-2xl border border-border shadow-xs p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" />
              <h2 className="text-sm font-bold text-fg">Клиенты с долгами (Продажи в долг)</h2>
            </div>
            <p className="text-[11px] text-fg-subtle mt-0.5">
              Нажмите «Принять оплату», чтобы погасить долг клиента в кассу
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Поиск должника..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full bg-surface-raised border border-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-fg focus:outline-none focus:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="text-xs font-bold text-accent hover:underline shrink-0 cursor-pointer"
            >
              Все клиенты →
            </button>
          </div>
        </div>

        <div className="divide-y divide-border overflow-y-auto max-h-96">
          {filteredDebtors.length === 0 ? (
            <div className="py-8 text-center text-xs text-fg-subtle">
              {customerSearch ? 'Клиенты по запросу не найдены' : 'Клиентов с активной задолженностью нет'}
            </div>
          ) : (
            filteredDebtors.map((c) => (
              <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-fg block">{c.name}</span>
                  <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
                    {c.phone && <span>{c.phone}</span>}
                    {c.note && <span>• {c.note}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-bold font-mono text-warning block">
                      {formatMoney(c.totalDebtTjs)} TJS
                    </span>
                    <span className="text-[10px] text-fg-subtle font-mono">
                      ≈ ${formatMoney(c.totalDebtTjs / (data?.exchangeRate || 10.9))} USD
                    </span>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleOpenPaymentModal(c)}
                    className="h-8 px-2.5 text-xs shrink-0 cursor-pointer"
                  >
                    Принять оплату
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL: ПРИЕМ ОПЛАТЫ ДОЛГА */}
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
              <strong className="text-warning font-mono">{formatMoney(paymentCustomer?.totalDebtTjs || 0)} TJS</strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Сумма оплаты (TJS) *
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
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Касса магазина (куда поступают деньги) *
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
            <label className="block text-xs font-semibold text-fg mb-1">
              Примечание
            </label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="Частичная оплата, наличные..."
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
    </div>
  );
};
