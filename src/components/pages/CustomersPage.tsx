import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  PlusCircle,
  Edit2,
  Trash2,
  Check,
  Copy,
  MessageCircle,
  HandCoins,
  X,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAppFields } from '../../context/AppContext';
import { Customer } from '../../types';
import { formatMoney } from '../../utils/money';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { LoadingState } from '../ui/Skeleton';
import { CustomerDetailDialog } from '../customers/CustomerDetailDialog';
import { CustomerPaymentDialog } from '../customers/CustomerPaymentDialog';
import { CustomerFormDialog } from '../customers/CustomerFormDialog';
import { CustomerDetailResponse, CustomerFormValues, PaymentTarget, getInitials, getWhatsAppLink } from '../customers/types';

interface CustomerListResponse {
  items: Customer[];
  total: number;
  summary: {
    totalCustomers: number;
    totalDebtTjs: number;
    totalPaidTjs: number;
    debtorsCount: number;
    pushSubscribedCount: number;
  };
}

export type CustomerTab = 'ALL' | 'DEBTORS' | 'WITH_PHONE' | 'PUSH';

export const CustomersPage: React.FC = () => {
  const { currentUser, stores } = useAppFields('currentUser', 'stores');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerListResponse['summary']>({
    totalCustomers: 0,
    totalDebtTjs: 0,
    totalPaidTjs: 0,
    debtorsCount: 0,
    pushSubscribedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<CustomerTab>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Customer debt payment dialog
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);

  // Add / Edit dialog
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Detail Modal (Contact Card & DB History)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailCustomerFull, setDetailCustomerFull] = useState<CustomerDetailResponse | null>(null);
  const [loadingCustomerFull, setLoadingCustomerFull] = useState(false);

  // Delete Confirm
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  const isAdmin = currentUser?.role === 'ADMIN';

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (activeTab === 'DEBTORS') params.append('debtorsOnly', 'true');
      params.append('limit', '200');

      const res = await apiClient<CustomerListResponse>(`/customers?${params.toString()}`);
      setCustomers(res.items || []);
      setSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить базу клиентов');
    } finally {
      setLoading(false);
    }
  }, [search, activeTab]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    const handleUpdate = () => loadCustomers();
    window.addEventListener('business-data-changed', handleUpdate);
    return () => window.removeEventListener('business-data-changed', handleUpdate);
  }, [loadCustomers]);

  // Load detailed customer info (sales & payment history from DB) when detailCustomer opens
  useEffect(() => {
    if (!detailCustomer) {
      setDetailCustomerFull(null);
      return;
    }
    let cancelled = false;
    setLoadingCustomerFull(true);
    apiClient<CustomerDetailResponse>(`/customers/${detailCustomer.id}`)
      .then((res) => {
        if (!cancelled) setDetailCustomerFull(res);
      })
      .catch((err) => {
        console.error('Failed to load customer details:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingCustomerFull(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailCustomer]);

  // Copy phone number helper
  const handleCopyPhone = (id: string, phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Open the debt payment dialog
  const handleOpenPaymentModal = (c: PaymentTarget, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPaymentTarget(c);
  };

  // Record a debt payment; true when it went through
  const handleRecordPayment = async (amount: number, storeId: string, note: string): Promise<boolean> => {
    if (!paymentTarget) return false;
    try {
      await apiClient(`/customers/${paymentTarget.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amountTjs: amount, storeId: storeId || undefined, note: note || undefined }),
      });
      setStatus({
        tone: 'success',
        text: `Оплата ${formatMoney(amount)} TJS от клиента ${paymentTarget.name} успешно принята в кассу`,
      });
      loadCustomers();

      // If the customer card is open, refresh it
      if (detailCustomer?.id === paymentTarget.id) {
        apiClient<CustomerDetailResponse>(`/customers/${paymentTarget.id}`).then((res) => {
          setDetailCustomerFull(res);
          setDetailCustomer((prev) => (prev ? { ...prev, totalDebtTjs: res.totalDebtTjs, totalPaidTjs: res.totalPaidTjs } : null));
        });
      }

      window.dispatchEvent(new CustomEvent('business-data-changed'));
      return true;
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка проведения оплаты' });
      return false;
    }
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (c: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCustomer(c);
    setIsAddEditOpen(true);
  };

  // Save a customer; true when saved
  const handleSaveCustomer = async (values: CustomerFormValues): Promise<boolean> => {
    const body = JSON.stringify({
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      note: values.note.trim() || null,
      pushEnabled: values.pushEnabled,
    });
    try {
      if (editingCustomer) {
        await apiClient(`/customers/${editingCustomer.id}`, { method: 'PATCH', body });
        setStatus({ tone: 'success', text: `Контакт клиента ${values.name} успешно обновлен` });
      } else {
        await apiClient('/customers', { method: 'POST', body });
        setStatus({ tone: 'success', text: `Клиент ${values.name} сохранен в базу` });
      }
      loadCustomers();
      return true;
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка сохранения клиента' });
      return false;
    }
  };

  // Delete Customer
  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    try {
      await apiClient(`/customers/${deletingCustomer.id}`, { method: 'DELETE' });
      setStatus({ tone: 'success', text: `Клиент ${deletingCustomer.name} удален из базы` });
      setDeletingCustomer(null);
      if (detailCustomer?.id === deletingCustomer.id) {
        setDetailCustomer(null);
      }
      loadCustomers();
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Не удалось удалить клиента' });
    }
  };

  // Filters & Counts
  const debtorsCount = useMemo(
    () => summary.debtorsCount || customers.filter((c) => (c.totalDebtTjs || 0) > 0).length,
    [customers, summary.debtorsCount]
  );
  const withPhoneCount = useMemo(() => customers.filter((c) => Boolean(c.phone?.trim())).length, [customers]);

  // Filter and sort customers
  const displayedCustomers = useMemo(() => {
    const list = customers.filter((c) => {
      if (activeTab === 'DEBTORS' && (c.totalDebtTjs || 0) <= 0) return false;
      if (activeTab === 'WITH_PHONE' && !c.phone?.trim()) return false;
      if (activeTab === 'PUSH' && !c.hasPushSubscription) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.note && c.note.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      return (b.totalDebtTjs || 0) - (a.totalDebtTjs || 0) || a.name.localeCompare(b.name, 'ru');
    });
  }, [customers, activeTab, search]);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Unified Compact Toolbar */}
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 shadow-2xs">
        {/* Left: Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'ALL'
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
            }`}
          >
            <span>Все</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'ALL' ? 'bg-black/20 text-white' : 'bg-surface border border-border text-fg-muted'
              }`}
            >
              {summary.totalCustomers || customers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('DEBTORS');
              setSortBy('DEBT_DESC');
            }}
            className={`h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'DEBTORS'
                ? 'bg-amber-500 text-black shadow-2xs font-bold'
                : 'bg-surface-raised border border-border text-amber-600 dark:text-amber-400 hover:border-amber-500/40'
            }`}
          >
            <span>С долгом</span>
            {debtorsCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeTab === 'DEBTORS' ? 'bg-black/20 text-black' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {debtorsCount}
              </span>
            )}
            {summary.totalDebtTjs > 0 && (
              <span
                className={`text-[11px] font-mono font-bold hidden xs:inline ${
                  activeTab === 'DEBTORS' ? 'text-black' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                • {formatMoney(summary.totalDebtTjs)} TJS
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('WITH_PHONE')}
            className={`h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'WITH_PHONE'
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
            }`}
          >
            <span>С телефоном</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                activeTab === 'WITH_PHONE' ? 'bg-black/20 text-white' : 'bg-surface border border-border text-fg-muted'
              }`}
            >
              {withPhoneCount}
            </span>
          </button>
        </div>

        {/* Right: Search + Sort + New Client button */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial sm:justify-end">
          <div className="relative flex-1 sm:w-44 md:w-56 min-w-0">
            <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск клиента..."
              className="w-full h-7.5 pl-8 pr-7 rounded-lg bg-surface-raised border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                title="Очистить"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <Button
            variant="primary"
            size="sm"
            leftIcon={PlusCircle}
            onClick={handleOpenAdd}
            className="h-7.5 px-2.5 text-xs font-bold cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
          >
            <span>+ Клиент</span>
          </Button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-2.5">
        <div className="max-w-6xl mx-auto space-y-2">
          {error && (
            <div className="p-2 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
              {error}
            </div>
          )}

          {/* CUSTOMERS LIST / TABLE */}
          <div className="bg-surface rounded-xl border border-border shadow-2xs overflow-hidden">
            {loading ? (
              <div className="p-6 text-center">
                <LoadingState label="Загрузка списка клиентов…" />
              </div>
            ) : displayedCustomers.length === 0 ? (
              <div className="py-10 text-center text-xs text-fg-subtle space-y-2">
                <Users className="w-8 h-8 text-fg-subtle/40 mx-auto" />
                <p className="text-sm font-semibold text-fg-muted">Клиенты не найдены</p>
                <p className="text-xs text-fg-subtle max-w-xs mx-auto">
                  {search
                    ? 'По вашему запросу ничего не найдено.'
                    : activeTab === 'DEBTORS'
                    ? 'Клиентов с активными задолженностями нет.'
                    : 'Сохраняйте контакты покупателей для отправки акций и спецпредложений.'}
                </p>
                {activeTab !== 'DEBTORS' && (
                  <Button size="sm" onClick={handleOpenAdd} className="mt-2 h-7.5 px-3 text-xs">
                    Добавить клиента
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayedCustomers.map((c) => {
                  const waLink = getWhatsAppLink(c.phone);
                  const isCopied = copiedId === c.id;
                  const hasDebt = (c.totalDebtTjs || 0) > 0;

                  return (
                    <div
                      key={c.id}
                      onClick={() => setDetailCustomer(c)}
                      className="px-2.5 sm:px-3 py-1.5 sm:py-2 hover:bg-surface-raised/50 transition-colors flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      {/* Left: Avatar + Name + Badges + Note */}
                      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center font-bold text-[11px] shrink-0 select-none ${
                            hasDebt
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                              : 'bg-accent/10 border-accent/20 text-accent'
                          }`}
                        >
                          {getInitials(c.name)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-fg group-hover:text-accent transition-colors text-xs sm:text-sm truncate">
                              {c.name}
                            </span>
                            {hasDebt && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded-md border border-amber-500/25 font-mono shrink-0">
                                Долг: {formatMoney(c.totalDebtTjs)} TJS
                              </span>
                            )}
                            {(c.totalPaidTjs || 0) > 0 && (
                              <span className="text-[10px] text-fg-subtle font-mono hidden lg:inline">
                                Оплачено: {formatMoney(c.totalPaidTjs)} TJS
                              </span>
                            )}
                          </div>

                          {c.note ? (
                            <p className="text-[11px] text-fg-subtle truncate max-w-xs sm:max-w-md">
                              {c.note}
                            </p>
                          ) : (
                            <p className="text-[10px] text-fg-subtle/80 truncate">
                              {new Date(c.createdAt).toLocaleDateString('ru-RU')}
                              {c.salesCount ? ` • Покупок: ${c.salesCount}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Middle: Phone + Quick actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.phone ? (
                          <div className="flex items-center gap-1 bg-surface-raised px-2 py-0.5 rounded-lg border border-border">
                            <a
                              href={`tel:${c.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-[11px] font-semibold text-fg hover:text-accent transition-colors"
                              title="Позвонить"
                            >
                              {c.phone}
                            </a>
                            <button
                              type="button"
                              onClick={(e) => handleCopyPhone(c.id, c.phone!, e)}
                              className="p-0.5 text-fg-subtle hover:text-fg transition-colors rounded cursor-pointer"
                              title="Скопировать номер"
                            >
                              {isCopied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                            </button>
                            {waLink && (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-0.5 text-fg-subtle hover:text-emerald-500 transition-colors rounded"
                                title="Написать в WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-fg-subtle italic hidden sm:inline">Без номера</span>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center justify-end gap-1 shrink-0">
                        {/* КНОПКА ПРИЕМА ОПЛАТЫ ДОЛГА */}
                        {hasDebt && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenPaymentModal(c, e)}
                            className="h-6.5 px-2 text-[11px] font-bold flex items-center gap-1 cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-2xs transition-colors"
                            title="Принять оплату долга в кассу"
                          >
                            <HandCoins className="w-3 h-3" />
                            <span className="hidden xs:inline sm:inline">Оплата</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleOpenEdit(c, e)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg transition-colors cursor-pointer"
                          title="Редактировать контакт"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingCustomer(c);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-danger/10 text-fg-subtle hover:text-danger transition-colors cursor-pointer"
                            title="Удалить"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <CustomerDetailDialog
        customer={detailCustomer}
        detail={detailCustomerFull}
        loading={loadingCustomerFull}
        onClose={() => setDetailCustomer(null)}
        onAcceptPayment={(target) => handleOpenPaymentModal(target)}
        onEdit={(c) => {
          setDetailCustomer(null);
          handleOpenEdit(c);
        }}
      />

      <CustomerPaymentDialog
        target={paymentTarget}
        stores={stores}
        onClose={() => setPaymentTarget(null)}
        onSubmit={handleRecordPayment}
        onInvalidAmount={() => setStatus({ tone: 'error', text: 'Укажите корректную сумму оплаты' })}
      />

      <CustomerFormDialog
        open={isAddEditOpen}
        customer={editingCustomer}
        onClose={() => setIsAddEditOpen(false)}
        onSave={handleSaveCustomer}
      />

      {/* DELETE CONFIRM */}
      <ConfirmDialog
        open={Boolean(deletingCustomer)}
        title="Удалить клиента?"
        message={`Вы действительно хотите удалить клиента «${deletingCustomer?.name}» из базы? Это действие нельзя отменить.`}
        confirmLabel="Удалить"
        tone="danger"
        onConfirm={handleDeleteCustomer}
        onCancel={() => setDeletingCustomer(null)}
      />
    </div>
  );
};
