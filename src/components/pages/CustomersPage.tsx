import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Search,
  PlusCircle,
  Bell,
  CheckCircle2,
  Clock,
  Phone,
  Edit2,
  Trash2,
  Send,
  Eye,
  FileText,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { Customer } from '../../types';
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

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const { stores, currentUser } = useAppFields('stores', 'currentUser');

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
  const [activeTab, setActiveTab] = useState<'ALL' | 'DEBTORS' | 'PUSH'>('ALL');

  // Add / Edit Modal
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formPushEnabled, setFormPushEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Detail Modal
  const [detailCustomer, setDetailCustomer] = useState<any | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Payment Modal
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentStoreId, setPaymentStoreId] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  // Push Broadcast Modal
  const [isPushModalOpen, setIsPushModalOpen] = useState(false);
  const [pushTarget, setPushTarget] = useState<'ALL' | 'DEBTORS' | 'CUSTOMER'>('ALL');
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
      params.append('limit', '100');

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
  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone || '');
    setFormNote(c.note || '');
    setFormPushEnabled(c.pushEnabled !== false);
    setIsAddEditOpen(true);
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
        setStatus({ tone: 'success', text: `Данные клиента ${formName} успешно обновлены` });
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
        setStatus({ tone: 'success', text: `Клиент ${formName} успешно добавлен в базу` });
      }
      setIsAddEditOpen(false);
      loadCustomers();
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка сохранения клиента' });
    } finally {
      setIsSaving(false);
    }
  };

  // View Customer Detail
  const handleViewDetail = async (c: Customer) => {
    setIsDetailLoading(true);
    try {
      const full = await apiClient(`/customers/${c.id}`);
      setDetailCustomer(full);
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Не удалось загрузить профиль клиента' });
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Open Payment modal
  const handleOpenPayment = (c: Customer) => {
    setPaymentCustomer(c);
    setPaymentAmount(c.totalDebtTjs.toString());
    const defaultStore = stores.find((s) => !s.isMainWarehouse);
    setPaymentStoreId(currentUser?.storeId || defaultStore?.id || '');
    setPaymentNote('');
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer || isPaymentSubmitting) return;

    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      setStatus({ tone: 'error', text: 'Укажите сумму оплаты' });
      return;
    }

    setIsPaymentSubmitting(true);
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
        text: `Оплата ${formatMoney(amount)} TJS от ${paymentCustomer.name} успешно зачислена в кассу`,
      });
      setPaymentCustomer(null);
      window.dispatchEvent(new CustomEvent('business-data-changed'));
      loadCustomers();
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Ошибка проведения оплаты' });
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  // Send Push
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
        text: `Push-уведомление отправлено (доставлено: ${res.sent} из ${res.totalFound})`,
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
      setStatus({ tone: 'success', text: `Клиент ${deletingCustomer.name} удален` });
      setDeletingCustomer(null);
      loadCustomers();
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Не удалось удалить клиента' });
    }
  };

  const displayedCustomers = customers.filter((c) => {
    if (activeTab === 'PUSH') return c.hasPushSubscription;
    return true;
  });

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Header */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight flex items-center gap-2">
              База клиентов
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                {summary.totalCustomers} клиентов
              </span>
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Bell}
              onClick={() => {
                setPushTarget('ALL');
                setPushSelectedCustomerId('');
                setIsPushModalOpen(true);
              }}
              className="h-9 px-3 text-xs font-semibold"
            >
              Отправить Push
            </Button>
          )}

          <Button
            variant="secondary"
            size="sm"
            leftIcon={RefreshCw}
            onClick={loadCustomers}
            className="h-9 px-3"
            title="Обновить"
          >
            <span className="hidden sm:inline">Обновить</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            leftIcon={PlusCircle}
            onClick={handleOpenAdd}
            className="h-9 px-3"
          >
            Новый клиент
          </Button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-4">
        <div className="max-w-7xl mx-auto space-y-4">
          {error && (
            <div className="p-3 bg-danger/15 border border-danger/30 text-danger text-xs font-medium rounded-xl">
              {error}
            </div>
          )}

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">Всего клиентов</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-fg mt-1">
                {summary.totalCustomers}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-warning block">Должников</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-warning mt-1">
                {summary.debtorsCount}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-danger block">Общий долг</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-danger mt-1">
                {formatMoney(summary.totalDebtTjs)} <span className="text-xs">TJS</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface border border-border shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-success block">Всего оплачено</span>
              <div className="text-xl sm:text-2xl font-black font-mono text-success mt-1">
                {formatMoney(summary.totalPaidTjs)} <span className="text-xs">TJS</span>
              </div>
            </div>
          </div>

          {/* SEARCH & FILTER TABS */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'ALL'
                    ? 'bg-accent/15 text-accent font-bold border border-accent/20'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                Все ({summary.totalCustomers})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('DEBTORS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'DEBTORS'
                    ? 'bg-warning/15 text-warning font-bold border border-warning/20'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                С долгом ({summary.debtorsCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PUSH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  activeTab === 'PUSH'
                    ? 'bg-accent/15 text-accent font-bold border border-accent/20'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                С Push-подпиской ({summary.pushSubscribedCount})
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по имени, телефону, заметке..."
                className="w-full h-8 pl-8 pr-3 rounded-lg bg-surface-raised border border-border text-xs text-fg focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* CUSTOMERS TABLE */}
          <div className="bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <LoadingState label="Загрузка списка клиентов…" />
              </div>
            ) : displayedCustomers.length === 0 ? (
              <div className="py-16 text-center text-xs text-fg-subtle space-y-3">
                <Users className="w-8 h-8 text-fg-subtle/50 mx-auto" />
                <p>Клиенты не найдены</p>
                <Button size="sm" onClick={handleOpenAdd}>
                  Добавить первого клиента
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-raised/40 text-fg-subtle font-semibold">
                      <th className="py-3 px-4">Клиент</th>
                      <th className="py-3 px-3">Контакты</th>
                      <th className="py-3 px-3">Покупок</th>
                      <th className="py-3 px-3 text-right">Текущий долг</th>
                      <th className="py-3 px-3 text-right">Всего оплачено</th>
                      <th className="py-3 px-3 text-center">Push-уведомления</th>
                      <th className="py-3 px-4 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedCustomers.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-raised/40 transition-colors">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleViewDetail(c)}
                            className="font-bold text-fg hover:text-accent text-left cursor-pointer"
                          >
                            {c.name}
                          </button>
                          {c.note && (
                            <span className="text-[10px] text-fg-subtle block mt-0.5 line-clamp-1">{c.note}</span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          {c.phone ? (
                            <span className="font-mono text-fg-muted font-medium">{c.phone}</span>
                          ) : (
                            <span className="text-fg-subtle">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-fg-muted">
                          <span className="font-bold text-fg">{c.salesCount || 0}</span> шт.
                          {c.lastSale && (
                            <span className="text-[10px] text-fg-subtle block">
                              Чек #{c.lastSale.receiptNumber}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right">
                          {c.totalDebtTjs > 0 ? (
                            <span className="font-black font-mono text-warning text-sm bg-warning/10 px-2 py-0.5 rounded-md border border-warning/20">
                              {formatMoney(c.totalDebtTjs)} TJS
                            </span>
                          ) : (
                            <span className="text-fg-subtle font-mono">0 TJS</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-fg-muted font-semibold">
                          {formatMoney(c.totalPaidTjs)} TJS
                        </td>

                        <td className="py-3 px-3 text-center">
                          {c.hasPushSubscription ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                              <Bell className="w-2.5 h-2.5" /> Подписан
                            </span>
                          ) : c.pushEnabled ? (
                            <span className="text-[10px] text-fg-subtle">Включено</span>
                          ) : (
                            <span className="text-[10px] text-fg-subtle/60">Откл.</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {c.totalDebtTjs > 0 && (
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={CheckCircle2}
                                onClick={() => handleOpenPayment(c)}
                                className="h-7 text-[11px] px-2"
                                title="Принять оплату долга"
                              >
                                Оплата
                              </Button>
                            )}

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPushTarget('CUSTOMER');
                                  setPushSelectedCustomerId(c.id);
                                  setPushTitle(`Уведомление для ${c.name}`);
                                  setIsPushModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-accent cursor-pointer"
                                title="Отправить Push"
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleViewDetail(c)}
                              className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg cursor-pointer"
                              title="Профиль и история покупок"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEdit(c)}
                              className="p-1.5 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg cursor-pointer"
                              title="Редактировать"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {isAdmin && (c.salesCount || 0) === 0 && (
                              <button
                                type="button"
                                onClick={() => setDeletingCustomer(c)}
                                className="p-1.5 rounded-lg hover:bg-danger/10 text-fg-subtle hover:text-danger cursor-pointer"
                                title="Удалить"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ADD / EDIT CUSTOMER MODAL */}
      <Dialog
        open={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        title={editingCustomer ? 'Редактирование клиента' : 'Добавление нового клиента'}
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
              className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Номер телефона</label>
            <input
              type="text"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="+992 900 00 00 00"
              className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>


          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Заметка / Примечание</label>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={2}
              placeholder="Дополнительные сведения, паспортные данные или контакты поручителя"
              className="w-full p-2.5 rounded-lg bg-surface border border-border text-xs text-fg focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-raised border border-border">
            <div>
              <span className="text-xs font-semibold text-fg block">Получение Push-уведомлений</span>
              <span className="text-[10px] text-fg-subtle block">Клиент согласен получать уведомления о новинках и задолженности</span>
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

      {/* CUSTOMER DETAIL MODAL */}
      <Dialog
        open={Boolean(detailCustomer)}
        onClose={() => setDetailCustomer(null)}
        title={detailCustomer ? `Карточка клиента: ${detailCustomer.name}` : ''}
      >
        {detailCustomer && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-surface-raised border border-border text-xs">
              <div>
                <span className="text-[10px] text-fg-subtle block">Телефон:</span>
                <span className="font-semibold text-fg">{detailCustomer.phone || 'Не указан'}</span>
              </div>
              <div>
                <span className="text-[10px] text-fg-subtle block">Push-статус:</span>
                <span className="font-semibold text-fg">
                  {detailCustomer.hasPushSubscription ? 'Подписка активна' : 'Нет токена подписки'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-fg-subtle block">Текущий долг:</span>
                <span className={`font-bold font-mono ${detailCustomer.totalDebtTjs > 0 ? 'text-warning' : 'text-fg'}`}>
                  {formatMoney(detailCustomer.totalDebtTjs)} TJS
                </span>
              </div>
              <div>
                <span className="text-[10px] text-fg-subtle block">Всего оплачено:</span>
                <span className="font-bold font-mono text-success">
                  {formatMoney(detailCustomer.totalPaidTjs)} TJS
                </span>
              </div>
              {detailCustomer.note && (
                <div className="col-span-2 pt-1 border-t border-border text-[11px] text-fg-muted">
                  <strong>Заметка:</strong> {detailCustomer.note}
                </div>
              )}
            </div>

            {/* Sales History */}
            <div>
              <h3 className="text-xs font-bold text-fg mb-2 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-accent" /> История покупок ({detailCustomer.sales?.length || 0})
              </h3>
              {(detailCustomer.sales || []).length === 0 ? (
                <p className="text-xs text-fg-subtle py-2">Покупок пока не было</p>
              ) : (
                <div className="space-y-2">
                  {detailCustomer.sales.map((sale: any) => (
                    <div key={sale.id} className="p-2.5 rounded-xl bg-surface border border-border text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span>Чек #{sale.receiptNumber}</span>
                        <span className="font-mono">{formatMoney(Number(sale.totalTjs))} TJS</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-fg-subtle">
                        <span>{new Date(sale.createdAt).toLocaleDateString('ru-RU')}</span>
                        {Number(sale.debtAmountTjs) > 0 && (
                          <span className="text-warning font-semibold">Остаток долга: {formatMoney(Number(sale.debtAmountTjs))} TJS</span>
                        )}
                      </div>
                      <div className="pt-1 text-[11px] text-fg-muted">
                        {(sale.saleItems || []).map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between py-0.5">
                            <span>{item.brand} {item.model} ({item.storage})</span>
                            <span className="font-mono">{formatMoney(Number(item.salePriceTjs))} TJS</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payments History */}
            <div>
              <h3 className="text-xs font-bold text-fg mb-2 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-success" /> История платежей ({detailCustomer.payments?.length || 0})
              </h3>
              {(detailCustomer.payments || []).length === 0 ? (
                <p className="text-xs text-fg-subtle py-2">Платежей по долгам не зарегистрировано</p>
              ) : (
                <div className="space-y-2">
                  {detailCustomer.payments.map((p: any) => (
                    <div key={p.id} className="p-2.5 rounded-xl bg-surface border border-border text-xs flex items-center justify-between">
                      <div>
                        <span className="font-bold text-success block">+{formatMoney(Number(p.amountTjs))} TJS</span>
                        <span className="text-[10px] text-fg-subtle">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</span>
                      </div>
                      <span className="text-[11px] text-fg-muted">
                        {p.sourceAccount === 'STORE_CASH' ? 'Касса магазина' : p.sourceAccount}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setDetailCustomer(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* PAYMENT REPAYMENT MODAL */}
      <Dialog
        open={Boolean(paymentCustomer)}
        onClose={() => setPaymentCustomer(null)}
        title="Приём оплаты долга"
      >
        <form onSubmit={handleSubmitPayment} className="space-y-3.5">
          <div className="p-3 rounded-xl bg-surface-raised border border-border text-xs">
            <span className="text-fg-subtle block">Клиент:</span>
            <strong className="text-sm font-bold text-fg block mt-0.5">{paymentCustomer?.name}</strong>
            <span className="text-warning font-bold mt-1 block">
              Текущий долг: {formatMoney(paymentCustomer?.totalDebtTjs || 0)} TJS
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Сумма к оплате (TJS) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={paymentCustomer?.totalDebtTjs}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              required
              className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-sm font-mono font-bold text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">В какую кассу внести *</label>
            <select
              value={paymentStoreId}
              onChange={(e) => setPaymentStoreId(e.target.value)}
              required
              className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-xs font-semibold text-fg focus:outline-none focus:border-accent"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isMainWarehouse ? '(Центральный сейф)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Заметка</label>
            <input
              type="text"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="Частичная оплата, наличные и т.д."
              className="w-full h-8 rounded-lg bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setPaymentCustomer(null)}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={isPaymentSubmitting} leftIcon={CheckCircle2}>
              Провести оплату
            </Button>
          </div>
        </form>
      </Dialog>

      {/* PUSH NOTIFICATION MODAL */}
      <Dialog
        open={isPushModalOpen}
        onClose={() => setIsPushModalOpen(false)}
        title="Отправка Push-уведомления клиентам"
      >
        <form onSubmit={handleSendPush} className="space-y-3.5">
          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Аудитория рассылки *</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'ALL' as const, label: 'Все клиенты' },
                { id: 'DEBTORS' as const, label: 'Только должники' },
                { id: 'CUSTOMER' as const, label: 'Один клиент' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPushTarget(opt.id)}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                    pushTarget === opt.id
                      ? 'border-accent bg-accent/15 text-accent font-bold'
                      : 'border-border bg-surface text-fg-muted'
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
                className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-xs font-semibold text-fg focus:outline-none focus:border-accent"
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

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Заголовок уведомления *</label>
            <input
              type="text"
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              placeholder="Заголовок..."
              required
              className="w-full h-9 rounded-lg bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Текст сообщения *</label>
            <textarea
              value={pushMessage}
              onChange={(e) => setPushMessage(e.target.value)}
              rows={3}
              placeholder="Текст сообщения..."
              required
              className="w-full p-2.5 rounded-lg bg-surface border border-border text-xs text-fg focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-fg block mb-1">Ссылка</label>
            <input
              type="text"
              value={pushLink}
              onChange={(e) => setPushLink(e.target.value)}
              placeholder="/sale"
              className="w-full h-8 rounded-lg bg-surface border border-border px-3 text-xs font-mono text-fg focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setIsPushModalOpen(false)}>
              Отмена
            </Button>
            <Button type="submit" variant="primary" loading={isSendingPush} leftIcon={Send}>
              Отправить Push
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DELETE CONFIRM */}
      <ConfirmDialog
        open={Boolean(deletingCustomer)}
        title="Удалить клиента?"
        message={`Вы действительно хотите удалить клиента «${deletingCustomer?.name}»? Это действие нельзя отменить.`}
        confirmLabel="Удалить"
        tone="danger"
        onConfirm={handleDeleteCustomer}
        onCancel={() => setDeletingCustomer(null)}
      />
    </div>
  );
};
