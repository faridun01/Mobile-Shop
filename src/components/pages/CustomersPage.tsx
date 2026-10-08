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
  Eye,
  Check,
  Copy,
  ExternalLink,
  MessageCircle,
  Sparkles,
  User,
  Clock,
  CheckCircle2,
  HandCoins,
  ArrowUpDown,
  Receipt,
  Calendar,
  CreditCard,
  ArrowUpRight,
  Store as StoreIcon,
  AlertCircle,
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
  const [detailCustomerFull, setDetailCustomerFull] = useState<any | null>(null);
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
    apiClient<any>(`/customers/${detailCustomer.id}`)
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
        apiClient<any>(`/customers/${paymentCustomer.id}`).then((res) => {
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

      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0 shadow-2xs">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight flex items-center gap-2">
              База клиентов
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                {summary.totalCustomers} клиентов
              </span>
            </h1>
            <p className="text-xs text-fg-subtle mt-0.5">
              Управление покупателями, учёт долгов и приём оплаты в кассу
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Bell}
              onClick={() => handleOpenPromoModal()}
              className="h-9 px-3 text-xs font-semibold cursor-pointer"
            >
              Отправить акцию
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            leftIcon={PlusCircle}
            onClick={handleOpenAdd}
            className="h-9 px-3 font-semibold cursor-pointer"
          >
            Новый клиент
          </Button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4">
        <div className="max-w-6xl mx-auto space-y-4">
          {error && (
            <div className="p-3 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
              {error}
            </div>
          )}

          {/* STATS: 4 CLEAN, RELEVANT CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Карточка 1: Всего клиентов */}
            <div
              onClick={() => setActiveTab('ALL')}
              className={`p-3 sm:p-4 rounded-2xl bg-surface border transition-colors cursor-pointer shadow-2xs flex items-center gap-3 ${
                activeTab === 'ALL' ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-border/80'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Всего клиентов
                </span>
                <p className="text-lg sm:text-2xl font-black font-mono text-fg mt-0.5">
                  {summary.totalCustomers || customers.length}
                </p>
              </div>
            </div>

            {/* Карточка 2: Долги клиентов */}
            <div
              onClick={() => {
                setActiveTab('DEBTORS');
                setSortBy('DEBT_DESC');
              }}
              className={`p-3 sm:p-4 rounded-2xl bg-surface border transition-colors cursor-pointer shadow-2xs flex items-center gap-3 ${
                activeTab === 'DEBTORS' ? 'border-amber-500/50 bg-amber-500/10' : 'border-border hover:border-amber-500/30'
              }`}
              title="Нажмите, чтобы показать всех должников"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <HandCoins className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                    Долги клиентов
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
                    {debtorsCount}
                  </span>
                </div>
                <p className="text-base sm:text-xl font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                  {formatMoney(summary.totalDebtTjs)} TJS
                </p>
              </div>
            </div>

            {/* Карточка 3: С телефоном */}
            <div
              onClick={() => setActiveTab('WITH_PHONE')}
              className={`p-3 sm:p-4 rounded-2xl bg-surface border transition-colors cursor-pointer shadow-2xs flex items-center gap-3 ${
                activeTab === 'WITH_PHONE' ? 'border-info/40 bg-info/5' : 'border-border hover:border-border/80'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-info/10 border border-info/20 flex items-center justify-center text-info shrink-0">
                <Phone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  С телефоном
                </span>
                <p className="text-lg sm:text-2xl font-black font-mono text-fg mt-0.5">
                  {withPhoneCount}
                </p>
              </div>
            </div>

            {/* Карточка 4: Push-акции */}
            <div
              onClick={() => setActiveTab('PUSH')}
              className={`p-3 sm:p-4 rounded-2xl bg-surface border transition-colors cursor-pointer shadow-2xs flex items-center gap-3 ${
                activeTab === 'PUSH' ? 'border-highlight/40 bg-highlight/5' : 'border-border hover:border-border/80'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-highlight/10 border border-highlight/20 flex items-center justify-center text-highlight shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Push-акции
                </span>
                <p className="text-lg sm:text-2xl font-black font-mono text-fg mt-0.5">
                  {pushSubscribedCount}
                </p>
              </div>
            </div>
          </div>

          {/* SEARCH, FILTER TABS & SORTING */}
          <div className="bg-surface rounded-2xl border border-border shadow-2xs p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  activeTab === 'ALL'
                    ? 'bg-accent/15 text-accent font-bold border border-accent/25'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все ({customers.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('DEBTORS');
                  setSortBy('DEBT_DESC');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === 'DEBTORS'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30'
                    : 'text-fg-subtle hover:text-amber-500'
                }`}
              >
                <span>С долгом</span>
                {debtorsCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 font-bold font-mono">
                    {debtorsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('WITH_PHONE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  activeTab === 'WITH_PHONE'
                    ? 'bg-accent/15 text-accent font-bold border border-accent/25'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                С телефоном ({withPhoneCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PUSH')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  activeTab === 'PUSH'
                    ? 'bg-accent/15 text-accent font-bold border border-accent/25'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                С Push-подпиской ({pushSubscribedCount})
              </button>
            </div>

            {/* Search and Sorting Selector */}
            <div className="flex items-center gap-2 flex-1 md:max-w-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-fg-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени, номеру, заметке..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-surface-raised border border-border text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              {/* Sorting selector */}
              <div className="flex items-center gap-1.5 bg-surface-raised border border-border rounded-xl px-2.5 h-9 shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-accent shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as CustomerSortOption)}
                  className="bg-transparent text-xs font-semibold text-fg focus:outline-none cursor-pointer"
                  title="Сортировка клиентов"
                >
                  <option value="DEBT_DESC">Долг (убывание) ↓</option>
                  <option value="DEBT_ASC">Долг (возрастание) ↑</option>
                  <option value="NAME_ASC">Имя (А → Я)</option>
                  <option value="NAME_DESC">Имя (Я → А)</option>
                  <option value="NEWEST">Сначала новые</option>
                  <option value="OLDEST">Сначала старые</option>
                  <option value="PAID_DESC">Сумма оплат ↓</option>
                  <option value="SALES_DESC">Число покупок ↓</option>
                </select>
              </div>
            </div>
          </div>

          {/* CUSTOMERS LIST / TABLE */}
          <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <LoadingState label="Загрузка списка клиентов…" />
              </div>
            ) : displayedCustomers.length === 0 ? (
              <div className="py-16 text-center text-xs text-fg-subtle space-y-3">
                <Users className="w-9 h-9 text-fg-subtle/40 mx-auto" />
                <p className="text-sm font-semibold text-fg-muted">Клиенты не найдены</p>
                <p className="text-xs text-fg-subtle max-w-xs mx-auto">
                  {search
                    ? 'По вашему запросу ничего не найдено.'
                    : activeTab === 'DEBTORS'
                    ? 'Клиентов с активными задолженностями нет.'
                    : 'Сохраняйте контакты покупателей для отправки акций и спецпредложений.'}
                </p>
                {activeTab !== 'DEBTORS' && (
                  <Button size="sm" onClick={handleOpenAdd} className="mt-2">
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
                      className="p-3 sm:px-4 sm:py-3.5 hover:bg-surface-raised/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group"
                    >
                      {/* Left: Avatar + Name + Badges + Note */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                            hasDebt
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                              : 'bg-accent/10 border-accent/20 text-accent'
                          }`}
                        >
                          {getInitials(c.name)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-fg group-hover:text-accent transition-colors text-sm">
                              {c.name}
                            </span>
                            {hasDebt && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/25 font-mono">
                                Долг: {formatMoney(c.totalDebtTjs)} TJS
                              </span>
                            )}
                            {(c.totalPaidTjs || 0) > 0 && (
                              <span className="text-[10px] text-fg-subtle font-mono hidden md:inline">
                                Оплачено: {formatMoney(c.totalPaidTjs)} TJS
                              </span>
                            )}
                            {c.hasPushSubscription ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                                <Bell className="w-2.5 h-2.5" /> Push
                              </span>
                            ) : c.pushEnabled ? (
                              <span className="text-[10px] text-fg-subtle bg-surface-raised px-1.5 py-0.5 rounded border border-border hidden sm:inline">
                                Рассылки
                              </span>
                            ) : null}
                          </div>

                          {c.note ? (
                            <p className="text-xs text-fg-subtle mt-0.5 line-clamp-1">
                              {c.note}
                            </p>
                          ) : (
                            <p className="text-[10px] text-fg-subtle mt-0.5">
                              Добавлен {new Date(c.createdAt).toLocaleDateString('ru-RU')}
                              {c.salesCount ? ` • Покупок: ${c.salesCount}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Middle: Phone + Quick actions */}
                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        {c.phone ? (
                          <div className="flex items-center gap-1 bg-surface-raised px-2.5 py-1 rounded-xl border border-border">
                            <a
                              href={`tel:${c.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-xs font-semibold text-fg hover:text-accent transition-colors"
                              title="Позвонить"
                            >
                              {c.phone}
                            </a>
                            <button
                              type="button"
                              onClick={(e) => handleCopyPhone(c.id, c.phone!, e)}
                              className="p-1 text-fg-subtle hover:text-fg transition-colors rounded cursor-pointer"
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
                                className="p-1 text-fg-subtle hover:text-emerald-500 transition-colors rounded"
                                title="Написать в WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-fg-subtle italic">Номер не указан</span>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-border/40">
                        {/* КНОПКА ПРИЕМА ОПЛАТЫ ДОЛГА */}
                        {hasDebt && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => handleOpenPaymentModal(c, e)}
                            className="h-8 px-2.5 text-xs font-semibold flex items-center gap-1 cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white border-0 shadow-2xs"
                            title="Принять оплату долга в кассу"
                          >
                            <HandCoins className="w-3.5 h-3.5" />
                            <span className="font-bold">Оплата долга</span>
                          </Button>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => handleOpenPromoModal(c.id, e)}
                            className="h-8 px-2.5 rounded-lg bg-surface-raised hover:bg-accent/15 hover:text-accent text-fg-muted border border-border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                            title="Отправить акцию этому клиенту"
                          >
                            <Send className="w-3.5 h-3.5 text-accent" />
                            <span className="hidden md:inline">Акция</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleOpenEdit(c, e)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg transition-colors cursor-pointer"
                          title="Редактировать контакт"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingCustomer(c);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-danger/10 text-fg-subtle hover:text-danger transition-colors cursor-pointer"
                            title="Удалить"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-fg-subtle">Push-уведомления:</span>
                {detailCustomer.hasPushSubscription ? (
                  <span className="font-bold text-success flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Подписка активна
                  </span>
                ) : detailCustomer.pushEnabled ? (
                  <span className="text-fg-muted">Согласие дано</span>
                ) : (
                  <span className="text-fg-subtle">Отключено</span>
                )}
              </div>
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
                  {detailCustomerFull.payments.map((p: any) => (
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
                  {detailCustomerFull.sales.map((s: any) => (
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
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
              {isAdmin && (
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={Send}
                  onClick={() => {
                    const c = detailCustomer;
                    setDetailCustomer(null);
                    handleOpenPromoModal(c.id);
                  }}
                  className="cursor-pointer"
                >
                  Отправить акцию
                </Button>
              )}

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
        subtitle={editingCustomer ? 'Изменение контактных данных' : 'Сохранение контакта в базу для акций и уведомлений'}
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

          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border">
            <div>
              <span className="text-xs font-semibold text-fg block">Согласие на получение акций</span>
              <span className="text-[10px] text-fg-subtle block">Клиент согласен получать уведомления об акциях и скидках</span>
            </div>
            <input
              type="checkbox"
              checked={formPushEnabled}
              onChange={(e) => setFormPushEnabled(e.target.checked)}
              className="w-4 h-4 accent-accent cursor-pointer"
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

      {/* PUSH / PROMO NOTIFICATION MODAL */}
      <Dialog
        open={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        title="Отправка акции клиентам"
        subtitle="Push-уведомление со специальным предложением"
      >
        <form onSubmit={handleSendPush} className="space-y-3.5">
          {/* Audience selection */}
          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Кому отправить *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'ALL' as const, label: 'Всем клиентам в базе' },
                { id: 'CUSTOMER' as const, label: 'Конкретному клиенту' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPushTarget(opt.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
                    pushTarget === opt.id
                      ? 'border-accent bg-accent/15 text-accent font-bold'
                      : 'border-border bg-surface text-fg-muted hover:text-fg'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {pushTarget === 'CUSTOMER' && (
            <div>
              <label className="text-xs font-semibold text-fg block mb-1">Выберите клиента *</label>
              <select
                value={pushSelectedCustomerId}
                onChange={(e) => setPushSelectedCustomerId(e.target.value)}
                required
                className="w-full h-10 rounded-xl bg-surface border border-border px-3 text-xs font-semibold text-fg focus:outline-none focus:border-accent"
              >
                <option value="">Выберите клиента...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quick Promo Templates */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-accent" />
              Быстрые шаблоны акций:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {PROMO_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPushTitle(tmpl.title);
                    setPushMessage(tmpl.message);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-[11px] text-fg-muted hover:text-accent font-medium transition-colors cursor-pointer"
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Заголовок акции *</label>
            <input
              type="text"
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              placeholder="Например: Скидка 15% на чехлы и стекла!"
              required
              className="w-full h-10 rounded-xl bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent font-semibold"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Текст сообщения *</label>
            <textarea
              value={pushMessage}
              onChange={(e) => setPushMessage(e.target.value)}
              rows={3}
              placeholder="Опишите суть акции, условия или специальное предложение..."
              required
              className="w-full p-2.5 rounded-xl bg-surface border border-border text-xs text-fg focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setIsPushModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={isSendingPush} leftIcon={Send}>
              Отправить акцию
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
