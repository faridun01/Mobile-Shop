import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Customer } from '../../types';
import {
  HandCoins,
  DollarSign,
  AlertCircle,
  ChevronRight,
  X,
  Edit,
  Loader2,
  Search,
} from 'lucide-react';

const formatDateStr = (dateVal?: string) => {
  if (!dateVal) return '-';
  const clean = dateVal.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return clean;
};

export const CustomersPage: React.FC = () => {
  const { currentUser, customers, sales, stores, updateCustomer, payCustomerDebt } = useApp();

  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [paymentAmountTjs, setPaymentAmountTjs] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState(stores[0]?.id || 'main-warehouse');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-fg-subtle">
        <p className="text-sm font-medium text-fg">Доступ ограничен</p>
        <p className="text-xs mt-1">Раздел клиентов доступен только Администраторам и Партнерам</p>
      </div>
    );
  }

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) || null;

  const filteredCustomers = customers
    .filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.totalDebtTjs - a.totalDebtTjs);

  const totalAllDebt = customers.reduce((acc, c) => acc + c.totalDebtTjs, 0);

  const debtSalesFor = (customerId: string) =>
    sales
      .filter((s) => s.customerId === customerId && (s.debtAmountTjs ?? 0) > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const paidOffSalesFor = (customerId: string) =>
    sales
      .filter((s) => s.customerId === customerId && (s.debtAmountTjs ?? 0) <= 0 && s.paymentMethod === 'DEBT')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleOpenPay = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setPaymentAmountTjs(customer.totalDebtTjs.toString());
    setIsPayModalOpen(true);
  };

  const handleExecutePayment = async () => {
    if (!selectedCustomer || isSubmitting) return;
    const amt = parseFloat(paymentAmountTjs) || 0;
    if (amt <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите положительную сумму оплаты' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await payCustomerDebt({
        customerId: selectedCustomer.id,
        amountTjs: amt,
        sourceAccountId,
      });
      if (res.success) {
        setIsPayModalOpen(false);
        setStatusMessage(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка оплаты' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCustomer(customer);
    setEditName(customer.name);
    setEditPhone(customer.phone || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editName.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await updateCustomer(editingCustomer.id, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
      });
      if (res.success) {
        setEditingCustomer(null);
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления клиента' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCustomerDetail = () => {
    if (!selectedCustomer) return null;
    const openSales = debtSalesFor(selectedCustomer.id);
    const closedSales = paidOffSalesFor(selectedCustomer.id);

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <h4 className="text-base font-bold text-fg">{selectedCustomer.name}</h4>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs mt-1">
              {selectedCustomer.phone && <span className="text-fg-muted">{selectedCustomer.phone}</span>}
              <span className="text-fg-muted">Выплачено: <strong className="text-accent">{selectedCustomer.totalPaidTjs.toLocaleString()} TJS</strong></span>
              <span className="text-fg-muted">Остаток долга: <strong className="text-danger">{selectedCustomer.totalDebtTjs.toLocaleString()} TJS</strong></span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleOpenPay(selectedCustomer)}
              disabled={selectedCustomer.totalDebtTjs <= 0}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <DollarSign className="w-4 h-4" />
              <span>Погасить долг (FIFO)</span>
            </button>
            <button
              onClick={() => handleStartEdit(selectedCustomer)}
              className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg transition-colors"
              title="Редактировать клиента"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg lg:hidden"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-border bg-surface-raised text-xs font-semibold text-fg-muted">
          Незакрытые продажи в долг ({openSales.length})
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
          {openSales.length === 0 && closedSales.length === 0 && (
            <div className="p-6 text-center text-fg-subtle text-xs">У клиента нет продаж в долг</div>
          )}
          {openSales.map((sale) => (
            <div key={sale.id} className="p-4 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-fg">Чек #{sale.receiptNumber}</span>
                <span className="block text-fg-subtle mt-0.5">{formatDateStr(sale.date)}</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-danger">{(sale.debtAmountTjs ?? 0).toLocaleString()} TJS</span>
                <span className="block text-[10px] text-fg-subtle">из {sale.totalTjs.toLocaleString()} TJS</span>
              </div>
            </div>
          ))}
          {closedSales.length > 0 && (
            <>
              <div className="p-3 bg-surface-raised text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
                Погашенные продажи в долг
              </div>
              {closedSales.map((sale) => (
                <div key={sale.id} className="p-4 flex items-center justify-between text-xs opacity-70">
                  <div>
                    <span className="font-bold text-fg">Чек #{sale.receiptNumber}</span>
                    <span className="block text-fg-subtle mt-0.5">{formatDateStr(sale.date)}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-accent">Погашено</span>
                    <span className="block text-[10px] text-fg-subtle">{sale.totalTjs.toLocaleString()} TJS</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-fg-muted">
          Общий долг клиентов: <strong className="text-danger">{totalAllDebt.toLocaleString()} TJS</strong>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени/телефону"
            className="pl-8 pr-3 py-1.5 rounded-xl bg-surface-raised border border-border text-xs text-fg focus:border-accent focus:outline-none w-48 sm:w-64"
          />
        </div>
      </div>

      {statusMessage && statusMessage.type === 'error' && (
        <div className="mx-4 mt-3 p-2.5 rounded-lg text-xs flex items-center justify-between shrink-0 bg-danger/10 text-danger border border-danger/30">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="hover:text-fg ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
        <div className="lg:col-span-1 flex flex-col overflow-hidden bg-surface">
          <div className="p-3 border-b border-border bg-surface-raised font-bold text-xs text-fg uppercase tracking-wide">
            Клиенты в долг ({filteredCustomers.length})
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
            {filteredCustomers.length === 0 && (
              <div className="p-6 text-center text-fg-subtle text-xs">
                {customers.length === 0 ? 'Пока нет клиентов с продажами в долг' : 'Ничего не найдено'}
              </div>
            )}
            {filteredCustomers.map((c) => {
              const isSelected = selectedCustomer?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCustomerId(c.id)}
                  className={`group w-full text-left p-3.5 hover:bg-surface-raised flex items-center justify-between transition-colors ${
                    isSelected ? 'bg-accent/10 border-l-4 border-accent font-semibold' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <h4 className="text-sm font-semibold text-fg">{c.name}</h4>
                      <ChevronRight className="w-3.5 h-3.5 text-fg-subtle lg:hidden" />
                    </div>
                    {c.phone && <p className="text-[11px] text-fg-subtle mt-0.5">{c.phone}</p>}
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="text-right">
                      <span className={`text-xs font-bold ${c.totalDebtTjs > 0 ? 'text-danger' : 'text-fg-subtle'}`}>
                        {c.totalDebtTjs.toLocaleString()} TJS
                      </span>
                      <span className="block text-[10px] text-fg-subtle">Долг</span>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleStartEdit(c, e)}
                        className="p-1.5 rounded-lg text-fg-subtle hover:text-accent hover:bg-surface"
                        title="Редактировать клиента"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:flex lg:col-span-2 flex-col overflow-hidden bg-bg">
          {selectedCustomer ? (
            renderCustomerDetail()
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-fg-subtle p-8 text-center">
              <HandCoins className="w-10 h-10 mb-3 opacity-40" />
              <p className="text-sm">Выберите клиента слева, чтобы посмотреть долг и принять оплату</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile fullscreen detail overlay */}
      {selectedCustomer && (
        <div className="lg:hidden fixed inset-0 z-40 bg-bg flex flex-col">
          {renderCustomerDetail()}
        </div>
      )}

      {/* MODAL: Pay customer debt (FIFO across their debt sales) */}
      {isPayModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl">
            <h4 className="text-sm font-bold text-fg mb-1">Приём оплаты от клиента</h4>
            <p className="text-xs text-fg-subtle mb-4">{selectedCustomer.name} (Текущий долг: {selectedCustomer.totalDebtTjs.toLocaleString()} TJS)</p>

            <div className="space-y-3 text-xs mb-4">
              <div>
                <label className="block text-fg-subtle mb-1">Сумма оплаты (TJS):</label>
                <input
                  type="number"
                  min="1"
                  value={paymentAmountTjs ?? ''}
                  onChange={(e) => setPaymentAmountTjs(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-accent text-sm font-bold focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle mb-1">Зачислить в кассу:</label>
                <select
                  value={sourceAccountId ?? ''}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Остаток: {(s.cashBalanceTjs ?? 0).toLocaleString()} TJS)
                    </option>
                  ))}
                  <option value="owner-funds">Основной счёт (без кассы магазина)</option>
                </select>
              </div>

              <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/30 text-[11px] text-accent">
                Автоматическое погашение: средства распределятся по старейшим непогашенным чекам (FIFO).
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                disabled={isSubmitting}
                onClick={() => setIsPayModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleExecutePayment}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSubmitting ? 'Оплата…' : 'Принять оплату'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Edit customer name/phone */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 shadow-2xl text-xs">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-sm font-bold text-fg">Редактировать клиента</h3>
              <button onClick={() => setEditingCustomer(null)} className="p-1 rounded text-fg-subtle hover:text-fg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-fg-subtle mb-1">Имя клиента *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-fg-subtle mb-1">Телефон</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingCustomer(null)}
                  className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted uppercase disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
