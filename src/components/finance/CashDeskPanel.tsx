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
    const centralStore = stores.find((st) => st.isMainWarehouse)?.id || stores[0]?.id || '';
    setSupplierPaymentStoreId(selectedStoreId !== 'all' ? selectedStoreId : centralStore);
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

  return (
    <div className="space-y-4 p-3 sm:p-5 select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {error && (
        <div className="p-3 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
          {error}
        </div>
      )}

      {/* 1. ДЕНЬГИ В КАССЕ (ОБЩАЯ СУММА) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Banknote className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
              Деньги в кассе
            </span>
            <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
              {formatMoney(data?.cash.totalTjs || 0)} TJS
            </div>
            <span className="text-xs font-semibold text-fg-subtle font-mono mt-0.5 block">
              ≈ ${formatMoney(data?.cash.totalUsd || 0)} USD
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <button
            type="button"
            onClick={() => navigate('/cash-collection')}
            className="px-3 py-2 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <HandCoins className="w-4 h-4" /> Инкассация →
          </button>
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

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск должника..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full h-8 bg-surface-raised border border-border rounded-xl pl-8 pr-3 text-xs text-fg focus:outline-none focus:border-accent"
                />
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
            {filteredDebtors.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                {customerSearch ? 'Должники по запросу не найдены' : 'Клиентов с активными долгами нет'}
              </div>
            ) : (
              filteredDebtors.map((c) => (
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

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Поиск поставщика..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="w-full h-8 bg-surface-raised border border-border rounded-xl pl-8 pr-3 text-xs text-fg focus:outline-none focus:border-accent"
                />
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
            {filteredSuppliers.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                {supplierSearch ? 'Поставщики по запросу не найдены' : 'Задолженностей перед поставщиками нет'}
              </div>
            ) : (
              filteredSuppliers.map((s) => (
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
              Касса списания (откуда списываются деньги) <span className="text-danger">*</span>
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
