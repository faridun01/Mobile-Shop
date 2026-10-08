import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users,
  Search,
  PlusCircle,
  Bell,
  Phone,
  Edit2,
  Trash2,
  Send,
  Check,
  Copy,
  MessageCircle,
  Sparkles,
  CheckCircle2,
  HandCoins,
  ArrowUpDown,
  Receipt,
  CreditCard,
  X,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { useAppFields } from '../../context/AppContext';
import { Customer } from '../../types';
import { formatMoney } from '../../utils/money';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { LoadingState } from '../ui/Skeleton';

/** GET /customers/:id — money columns arrive as numbers or decimal strings. */
interface CustomerDetailResponse {
  totalDebtTjs: number;
  totalPaidTjs: number;
  payments: Array<{
    id: string;
    amountTjs: number | string;
    createdAt: string;
    sourceAccount: string;
    allocations?: Array<{ sale?: { receiptNumber: number } | null }>;
  }>;
  sales: Array<{
    id: string;
    receiptNumber: number;
    totalTjs: number | string;
    debtAmountTjs: number | string;
    createdAt: string;
    store?: { name: string } | null;
  }>;
}

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

export type CustomerSortOption =
  | 'DEBT_DESC'
  | 'DEBT_ASC'
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'NEWEST'
  | 'OLDEST'
  | 'PAID_DESC'
  | 'SALES_DESC';

export type CustomerTab = 'ALL' | 'DEBTORS' | 'WITH_PHONE' | 'PUSH';

const PROMO_TEMPLATES = [
  {
    label: 'Скидка на аксессуары',
    title: '🔥 Скидка 15% на чехлы и стекла!',
    message: 'При покупке чехла или стекла защитное покрытие в подарок. Ждём вас в нашем магазине!',
  },
  {
    label: 'Новое поступление',
    title: '📱 Новое поступление смартфонов!',
    message: 'Большой выбор новых моделей с официальной гарантией и лучшими ценами в городе.',
  },
  {
    label: 'Trade-In бонус',
    title: '🔄 Выгодный обмен Trade-In!',
    message: 'Сдайте старый телефон и получите специальную дополнительную скидку на новый смартфон.',
  },
];

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
  const [sortBy, setSortBy] = useState<CustomerSortOption>('DEBT_DESC');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Customer debt payment modal state
  const [paymentCustomer, setPaymentCustomer] = useState<{ id: string; name: string; totalDebtTjs: number } | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentStoreId, setPaymentStoreId] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Add / Edit Modal
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formPushEnabled, setFormPushEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Detail Modal (Contact Card & DB History)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [detailCustomerFull, setDetailCustomerFull] = useState<CustomerDetailResponse | null>(null);
  const [loadingCustomerFull, setLoadingCustomerFull] = useState(false);

  // Push / Promo Modal
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [pushTarget, setPushTarget] = useState<'ALL' | 'CUSTOMER'>('ALL');
  const [pushSelectedCustomerId, setPushSelectedCustomerId] = useState<string>('');
  const [pushTitle, setPushTitle] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const [pushLink, setPushLink] = useState('/sale');
  const [isSendingPush, setIsSendingPush] = useState(false);

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

  // Open Payment Modal
  const handleOpenPaymentModal = (
    c: { id: string; name: string; totalDebtTjs: number },
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();
    setPaymentCustomer(c);
    setPaymentAmountInput(c.totalDebtTjs > 0 ? c.totalDebtTjs.toString() : '');
    const defaultStore = stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id || '';
    setPaymentStoreId(defaultStore);
    setPaymentNote(`Оплата долга: ${c.name}`);
    setIsPaymentModalOpen(true);
  };

  // Submit debt payment to database
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer) return;
    const amount = parseFloat(paymentAmountInput.replace(',', '.'));
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
        text: `Оплата ${formatMoney(amount)} TJS от клиента ${paymentCustomer.name} успешно принята в кассу`,
      });
      setIsPaymentModalOpen(false);
      loadCustomers();

      // If customer detail modal is currently open, refresh full customer state
      if (detailCustomer?.id === paymentCustomer.id) {
        apiClient<CustomerDetailResponse>(`/customers/${paymentCustomer.id}`).then((res) => {
          setDetailCustomerFull(res);
          setDetailCustomer((prev) => (prev ? { ...prev, totalDebtTjs: res.totalDebtTjs, totalPaidTjs: res.totalPaidTjs } : null));
        });
      }

      window.dispatchEvent(new CustomEvent('business-data-changed'));
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка проведения оплаты' });
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormNote('');
    setFormPushEnabled(true);
    setIsAddEditOpen(true);
  };

  // Open Edit modal
  const handleOpenEdit = (c: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone || '');
    setFormNote(c.note || '');
    setFormPushEnabled(c.pushEnabled !== false);
    setIsAddEditOpen(true);
  };

  // Open Promo Push Modal
  const handleOpenPromoModal = (customerId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (customerId) {
      setPushTarget('CUSTOMER');
      setPushSelectedCustomerId(customerId);
      const c = customers.find((item) => item.id === customerId);
      setPushTitle(c ? `Спецпредложение для ${c.name}` : 'Спецпредложение');
    } else {
      setPushTarget('ALL');
      setPushSelectedCustomerId('');
      setPushTitle('');
    }
    setPushMessage('');
    setPushLink('/sale');
    setIsPushModalOpen(true);
  };

  // Save Customer
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || isSaving) return;

    setIsSaving(true);
    try {
      if (editingCustomer) {
        await apiClient(`/customers/${editingCustomer.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: formName.trim(),
            phone: formPhone.trim() || null,
            note: formNote.trim() || null,
            pushEnabled: formPushEnabled,
          }),
        });
        setStatus({ tone: 'success', text: `Контакт клиента ${formName} успешно обновлен` });
      } else {
        await apiClient('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: formName.trim(),
            phone: formPhone.trim() || null,
            note: formNote.trim() || null,
            pushEnabled: formPushEnabled,
          }),
        });
        setStatus({ tone: 'success', text: `Клиент ${formName} сохранен в базу` });
      }
      setIsAddEditOpen(false);
      loadCustomers();
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка сохранения клиента' });
    } finally {
      setIsSaving(false);
    }
  };

  // Send Promo Push
  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushTitle.trim() || !pushMessage.trim() || isSendingPush) return;

    setIsSendingPush(true);
    try {
      const res = await apiClient<{ sent: number; totalFound: number; failed: number }>('/customers/send-push', {
        method: 'POST',
        body: JSON.stringify({
          target: pushTarget,
          customerId: pushTarget === 'CUSTOMER' ? pushSelectedCustomerId : undefined,
          title: pushTitle.trim(),
          message: pushMessage.trim(),
          targetRoute: pushLink.trim() || '/sale',
        }),
      });

      setStatus({
        tone: 'success',
        text: `Уведомление об акции отправлено (доставлено: ${res.sent} из ${res.totalFound})`,
      });
      setIsPushModalOpen(false);
      setPushTitle('');
      setPushMessage('');
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка отправки push-уведомления' });
    } finally {
      setIsSendingPush(false);
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

  // Clean phone string for wa.me link
  const getWhatsAppLink = (phone?: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d]/g, '');
    if (digits.length < 9) return null;
    const full = digits.startsWith('992') ? digits : `992${digits}`;
    return `https://wa.me/${full}`;
  };

  // Filters & Counts
  const debtorsCount = useMemo(
    () => summary.debtorsCount || customers.filter((c) => (c.totalDebtTjs || 0) > 0).length,
    [customers, summary.debtorsCount]
  );
  const withPhoneCount = useMemo(() => customers.filter((c) => Boolean(c.phone?.trim())).length, [customers]);
  const pushSubscribedCount = useMemo(
    () => summary.pushSubscribedCount || customers.filter((c) => c.hasPushSubscription).length,
    [customers, summary.pushSubscribedCount]
  );

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
      switch (sortBy) {
        case 'DEBT_DESC':
          return (b.totalDebtTjs || 0) - (a.totalDebtTjs || 0) || a.name.localeCompare(b.name, 'ru');
        case 'DEBT_ASC':
          return (a.totalDebtTjs || 0) - (b.totalDebtTjs || 0) || a.name.localeCompare(b.name, 'ru');
        case 'NAME_ASC':
          return a.name.localeCompare(b.name, 'ru');
        case 'NAME_DESC':
          return b.name.localeCompare(a.name, 'ru');
        case 'NEWEST':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'OLDEST':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'PAID_DESC':
          return (b.totalPaidTjs || 0) - (a.totalPaidTjs || 0);
        case 'SALES_DESC':
          return (b.salesCount || 0) - (a.salesCount || 0);
        default:
          return 0;
      }
    });
  }, [customers, activeTab, search, sortBy]);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (name.slice(0, 2) || 'КЛ').toUpperCase();
  };

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

          {/* Sorting selector */}
          <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-lg px-2 h-7.5 shrink-0">
            <ArrowUpDown className="w-3 h-3 text-accent shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as CustomerSortOption)}
              className="bg-transparent text-xs font-medium text-fg focus:outline-none cursor-pointer max-w-[100px] sm:max-w-none truncate"
              title="Сортировка клиентов"
            >
              <option value="DEBT_DESC">Долг ↓</option>
              <option value="DEBT_ASC">Долг ↑</option>
              <option value="NAME_ASC">Имя (А-Я)</option>
              <option value="NAME_DESC">Имя (Я-А)</option>
              <option value="NEWEST">Новые</option>
              <option value="OLDEST">Старые</option>
              <option value="PAID_DESC">Оплаты ↓</option>
              <option value="SALES_DESC">Покупки ↓</option>
            </select>
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

      {/* CUSTOMER CONTACT CARD & DB HISTORY MODAL */}
      <Dialog
        open={Boolean(detailCustomer)}
        onClose={() => setDetailCustomer(null)}
        title={detailCustomer?.name || 'Карточка клиента'}
        subtitle="Контактные данные, задолженность и история оплат из базы данных"
      >
        {detailCustomer && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {/* Contact Header */}
            <div className="p-4 rounded-2xl bg-surface-raised border border-border space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent font-bold text-base shrink-0">
                  {getInitials(detailCustomer.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-fg truncate">{detailCustomer.name}</h3>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    В базе с {new Date(detailCustomer.createdAt).toLocaleDateString('ru-RU')}
                  </p>
                </div>
              </div>

              {detailCustomer.phone && (
                <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-fg-subtle block">Телефон:</span>
                    <a
                      href={`tel:${detailCustomer.phone}`}
                      className="font-mono text-sm font-bold text-accent hover:underline"
                    >
                      {detailCustomer.phone}
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {getWhatsAppLink(detailCustomer.phone) && (
                      <a
                        href={getWhatsAppLink(detailCustomer.phone)!}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1 border border-emerald-500/20"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {detailCustomer.note && (
                <div className="pt-2 border-t border-border">
                  <span className="text-[10px] uppercase font-bold text-fg-subtle block">Заметка:</span>
                  <p className="text-xs text-fg-muted mt-0.5">{detailCustomer.note}</p>
                </div>
              )}
            </div>

            {/* FINANCIAL OVERVIEW CARD */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                Финансовый баланс клиента
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-xl bg-surface-raised border border-border">
                  <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Текущий долг</span>
                  <p className="text-base sm:text-lg font-black font-mono text-warning mt-0.5">
                    {formatMoney(detailCustomerFull?.totalDebtTjs ?? detailCustomer.totalDebtTjs)} TJS
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-raised border border-border">
                  <span className="text-[10px] text-fg-subtle uppercase font-semibold block">Всего оплачено</span>
                  <p className="text-base sm:text-lg font-black font-mono text-success mt-0.5">
                    {formatMoney(detailCustomerFull?.totalPaidTjs ?? detailCustomer.totalPaidTjs)} TJS
                  </p>
                </div>
              </div>

              {/* ACTION: ACCEPT PAYMENT IF DEBT > 0 */}
              {(detailCustomerFull?.totalDebtTjs ?? detailCustomer.totalDebtTjs) > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={HandCoins}
                  onClick={() =>
                    handleOpenPaymentModal({
                      id: detailCustomer.id,
                      name: detailCustomer.name,
                      totalDebtTjs: detailCustomerFull?.totalDebtTjs ?? detailCustomer.totalDebtTjs,
                    })
                  }
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                >
                  Принять оплату долга в кассу
                </Button>
              )}
            </div>

            {/* DB PAYMENT HISTORY */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-accent" />
                  История оплат из базы данных
                </span>
                {detailCustomerFull?.payments?.length ? (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-surface-raised border border-border">
                    {detailCustomerFull.payments.length} оплат
                  </span>
                ) : null}
              </div>

              {loadingCustomerFull ? (
                <div className="py-4 text-center">
                  <LoadingState label="Загрузка платежей…" />
                </div>
              ) : !detailCustomerFull?.payments || detailCustomerFull.payments.length === 0 ? (
                <p className="text-xs text-fg-subtle py-2 text-center">Платежей по долгам пока не зарегистрировано</p>
              ) : (
                <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                  {detailCustomerFull.payments.map((p) => (
                    <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-success font-mono">
                          +{formatMoney(Number(p.amountTjs))} TJS
                        </p>
                        <p className="text-[10px] text-fg-subtle">
                          {new Date(p.createdAt).toLocaleDateString('ru-RU')}{' '}
                          {new Date(p.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          {p.allocations?.length ? ` • Погашен чек №${p.allocations[0]?.sale?.receiptNumber}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] text-fg-subtle bg-surface-raised px-1.5 py-0.5 rounded border border-border">
                        {p.sourceAccount === 'STORE_CASH' ? 'Касса' : p.sourceAccount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* DB SALES HISTORY */}
            <div className="p-3.5 rounded-2xl bg-surface border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-accent" />
                  История покупок
                </span>
                {detailCustomerFull?.sales?.length ? (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-surface-raised border border-border">
                    {detailCustomerFull.sales.length} покупок
                  </span>
                ) : null}
              </div>

              {loadingCustomerFull ? (
                <div className="py-4 text-center">
                  <LoadingState label="Загрузка покупок…" />
                </div>
              ) : !detailCustomerFull?.sales || detailCustomerFull.sales.length === 0 ? (
                <p className="text-xs text-fg-subtle py-2 text-center">Покупок пока нет</p>
              ) : (
                <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                  {detailCustomerFull.sales.map((s) => (
                    <div key={s.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-fg">
                          Чек №{s.receiptNumber}{' '}
                          <span className="font-mono text-fg-subtle font-normal">
                            ({formatMoney(Number(s.totalTjs))} TJS)
                          </span>
                        </p>
                        <p className="text-[10px] text-fg-subtle">
                          {new Date(s.createdAt).toLocaleDateString('ru-RU')}{' '}
                          {s.store?.name ? `• ${s.store.name}` : ''}
                          {Number(s.debtAmountTjs) > 0 && (
                            <span className="text-amber-500 font-semibold ml-1">
                              • Долг: {formatMoney(Number(s.debtAmountTjs))} TJS
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Edit2}
                  onClick={() => {
                    const c = detailCustomer;
                    setDetailCustomer(null);
                    handleOpenEdit(c);
                  }}
                >
                  Редактировать
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDetailCustomer(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* CUSTOMER DEBT PAYMENT MODAL */}
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
              placeholder="Наличные, частичная оплата долга..."
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
            >
              Провести оплату
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ADD / EDIT CUSTOMER MODAL */}
      <Dialog
        open={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        title={editingCustomer ? 'Редактировать клиента' : 'Новый клиент'}
        subtitle={editingCustomer ? 'Изменение контактных данных' : 'Сохранение контакта в базу'}
      >
        <form onSubmit={handleSaveCustomer} className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Имя и фамилия *</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Например: Рустам Шарипов"
              required
              className="w-full h-10 rounded-xl bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Номер телефона</label>
            <input
              type="text"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="+992 900 00 00 00"
              className="w-full h-10 rounded-xl bg-surface border border-border px-3 text-xs font-mono text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Заметка / Предпочтения</label>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={2}
              placeholder="Интересуется новинками Apple, чехлы, защитные стекла..."
              className="w-full p-2.5 rounded-xl bg-surface border border-border text-xs text-fg focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setIsAddEditOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={isSaving}>
              Сохранить
            </Button>
          </div>
        </form>
      </Dialog>

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
