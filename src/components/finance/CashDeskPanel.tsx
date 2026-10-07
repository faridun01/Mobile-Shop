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
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryViewMode, setInventoryViewMode] = useState<'models' | 'items'>('models');

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

  // Filter inventory models by search
  const filteredModels = useMemo(() => {
    const list = data?.inventory?.models || [];
    if (!inventorySearch.trim()) return list;
    const q = inventorySearch.toLowerCase().trim();
    return list.filter(
      (m) =>
        m.brand.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        (m.color && m.color.toLowerCase().includes(q)) ||
        (m.storage && m.storage.toLowerCase().includes(q)) ||
        m.stores.some((st) => st.storeName.toLowerCase().includes(q))
    );
  }, [data?.inventory?.models, inventorySearch]);

  // Filter inventory items by search
  const filteredItems = useMemo(() => {
    const list = data?.inventory?.items || [];
    if (!inventorySearch.trim()) return list;
    const q = inventorySearch.toLowerCase().trim();
    return list.filter(
      (item) =>
        item.brand.toLowerCase().includes(q) ||
        item.model.toLowerCase().includes(q) ||
        (item.color && item.color.toLowerCase().includes(q)) ||
        (item.storage && item.storage.toLowerCase().includes(q)) ||
        item.imei.toLowerCase().includes(q) ||
        item.storeName.toLowerCase().includes(q)
    );
  }, [data?.inventory?.items, inventorySearch]);

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

      {/* 1. TOP METRICS GRID: КАССА (НАЛИЧНЫЕ) И ТОВАРЫ ПО СЕБЕСТОИМОСТИ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* КАРТОЧКА 1: ДЕНЬГИ В КАССЕ */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
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

            <button
              type="button"
              onClick={() => navigate('/cash-collection')}
              className="px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Перейти к инкассации"
            >
              <HandCoins className="w-4 h-4" />
              <span>Инкассация →</span>
            </button>
          </div>
          <div className="text-[11px] text-fg-subtle flex items-center gap-1.5">
            <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>
              {isCentral
                ? 'Наличные в кассах (общий баланс сети)'
                : `Наличные в кассе «${currentStoreName}»`}
            </span>
          </div>
        </div>

        {/* КАРТОЧКА 2: ТОВАРЫ ПО СЕБЕСТОИМОСТИ */}
        <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                    Товары по себестоимости
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {data?.inventory.totalCount || 0} шт.
                  </span>
                </div>
                <div className="text-2xl sm:text-3xl font-black font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                  ${formatMoney(data?.inventory.totalCostUsd || 0)} USD
                </div>
                <span className="text-xs font-semibold text-fg-subtle font-mono mt-0.5 block">
                  ≈ {formatMoney(data?.inventory.totalCostTjs || 0)} TJS
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="px-3 py-1.5 rounded-xl bg-surface-raised border border-border hover:bg-surface text-fg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Перейти на склад"
            >
              <ArrowUpRight className="w-4 h-4 text-accent" />
              <span>Склад →</span>
            </button>
          </div>
          <div className="text-[11px] text-fg-subtle flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>
              {isCentral
                ? 'Общий остаток всех товаров (все магазины и склад)'
                : `Товары в наличии магазина «${currentStoreName}»`}
            </span>
          </div>
        </div>
      </div>

      {/* 2. СЕКЦИЯ: ДЕТАЛИЗАЦИЯ ТОВАРОВ ПО СЕБЕСТОИМОСТИ */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs flex flex-col space-y-3">
        {/* Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-bold text-fg">
                {isCentral
                  ? 'Все товары по себестоимости (общий остаток сети)'
                  : `Товары в наличии: ${currentStoreName} (по себестоимости)`}
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {data?.inventory.totalCount || 0} шт.
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-xs font-semibold text-fg-subtle">Общая себестоимость:</span>
              <span className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                ${formatMoney(data?.inventory.totalCostUsd || 0)} USD
              </span>
              <span className="text-xs text-fg-subtle font-mono">
                (≈ {formatMoney(data?.inventory.totalCostTjs || 0)} TJS)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle: Models vs Individual Items */}
            <div className="flex items-center bg-surface-raised border border-border rounded-xl p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInventoryViewMode('models')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  inventoryViewMode === 'models'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                По моделям ({data?.inventory.models?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setInventoryViewMode('items')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  inventoryViewMode === 'items'
                    ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Поштучно ({data?.inventory.totalCount || 0})
              </button>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-48">
              <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Поиск товара..."
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
                className="w-full h-8 bg-surface-raised border border-border rounded-xl pl-8 pr-3 text-xs text-fg focus:outline-none focus:border-accent"
              />
            </div>

            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
              title="Перейти к полному управлению складом"
            >
              <span>Склад</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Inventory Content */}
        {inventoryViewMode === 'models' ? (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                {inventorySearch ? 'Товары по запросу не найдены' : 'Товаров в наличии нет'}
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-raised/40 text-fg-subtle text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-3">Модель / Бренд</th>
                    {isCentral && <th className="py-2.5 px-3">Магазины / Склад</th>}
                    <th className="py-2.5 px-3 text-center">Кол-во</th>
                    <th className="py-2.5 px-3 text-right">Себестоимость / шт.</th>
                    <th className="py-2.5 px-3 text-right">Итого себестоимость</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredModels.map((m) => (
                    <tr
                      key={m.key}
                      className="hover:bg-surface-raised/30 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-fg">
                          {m.brand} {m.model}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle mt-0.5">
                          {m.storage && <span className="px-1.5 py-0.2 rounded bg-surface-raised border border-border">{m.storage}</span>}
                          {m.color && <span className="px-1.5 py-0.2 rounded bg-surface-raised border border-border">{m.color}</span>}
                        </div>
                      </td>
                      {isCentral && (
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {m.stores.map((st) => (
                              <span
                                key={st.storeId}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised border border-border text-fg-subtle font-medium"
                              >
                                {st.storeName}: <strong className="text-fg">{st.count}</strong>
                              </span>
                            ))}
                          </div>
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center font-bold text-fg">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-surface-raised border border-border text-xs">
                          {m.count} шт.
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-fg">${formatMoney(m.avgCostUsd)}</div>
                        <div className="text-[10px] text-fg-subtle">
                          ≈ {formatMoney(m.count > 0 ? m.totalCostTjs / m.count : 0)} TJS
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                          ${formatMoney(m.totalCostUsd)}
                        </div>
                        <div className="text-[10px] text-fg-subtle">
                          ≈ {formatMoney(m.totalCostTjs)} TJS
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-fg-subtle">
                {inventorySearch ? 'Товары по запросу не найдены' : 'Товаров в наличии нет'}
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-raised/40 text-fg-subtle text-[11px] uppercase tracking-wider font-semibold">
                    <th className="py-2.5 px-3">Товар</th>
                    <th className="py-2.5 px-3">IMEI</th>
                    {isCentral && <th className="py-2.5 px-3">Магазин / Точка</th>}
                    <th className="py-2.5 px-3 text-right">Себестоимость</th>
                    <th className="py-2.5 px-3 text-right">Розница (TJS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-surface-raised/30 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-fg">
                          {item.brand} {item.model}
                        </div>
                        <div className="text-[11px] text-fg-subtle">
                          {[item.storage, item.color].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-fg-subtle">
                        {item.imei}
                      </td>
                      {isCentral && (
                        <td className="py-2.5 px-3">
                          <span className="text-[11px] font-medium text-fg-subtle flex items-center gap-1">
                            <StoreIcon className="w-3 h-3 text-accent shrink-0" />
                            <span>{item.storeName}</span>
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-indigo-600 dark:text-indigo-400">
                          ${formatMoney(item.costBasisUsd)}
                        </div>
                        <div className="text-[10px] text-fg-subtle">
                          ≈ {formatMoney(item.costBasisTjs)} TJS
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-fg">
                        {formatMoney(item.retailPriceTjs)} TJS
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
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
