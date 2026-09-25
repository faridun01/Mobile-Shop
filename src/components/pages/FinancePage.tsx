import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { apiClient } from '../../api/client';
import { mapFinancialTransaction } from '../../api/mappers';
import type { FinancialTransaction, FinancialCategory } from '../../types';
import { formatMoney } from '../../utils/formatMoney';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, BarChart3,
  Plus, SlidersHorizontal, RefreshCw, XCircle, Store as StoreIcon,
} from 'lucide-react';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { MonthPicker } from '../ui/MonthPicker';
import { Select } from '../ui/Input';
import { SearchBar } from '../ui/SearchBar';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { StatCard } from '../ui/StatCard';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { FormField } from '../ui/FormField';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ProfitReport } from '../finance/ProfitReport';

type Tab = 'REPORT' | 'STORES' | 'OVERVIEW' | 'JOURNAL' | 'ACCOUNTS' | 'CATEGORIES';
const TABS: { value: Tab; label: string }[] = [
  { value: 'REPORT', label: 'Отчёт' },
  { value: 'STORES', label: 'По складам' },
  { value: 'OVERVIEW', label: 'Деньги' },
  { value: 'JOURNAL', label: 'Операции' },
  { value: 'ACCOUNTS', label: 'Счета' },
  { value: 'CATEGORIES', label: 'Категории' },
];
type ReportPeriod = 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL';

const TYPE_LABELS: Record<string, string> = {
  INCOME: 'Приход',
  EXPENSE: 'Расход',
  TRANSFER: 'Перевод',
  SUPPLIER_PAYMENT: 'Оплата поставщику',
  OWNER_DEPOSIT: 'Взнос владельца',
  OWNER_WITHDRAWAL: 'Изъятие владельца',
  REFUND: 'Возврат',
  ADJUSTMENT: 'Корректировка',
};

const PERIOD_OPTIONS = [
  { value: 'TODAY' as ReportPeriod, label: 'Сегодня' },
  { value: 'SPECIFIC_MONTH' as ReportPeriod, label: 'Месяц' },
  { value: 'ALL' as ReportPeriod, label: 'Всё время' },
];

interface JournalFilters {
  period: ReportPeriod;
  month: string;
  type: string;
  accountId: string;
  status: string;
  search: string;
}

export const FinancePage: React.FC = () => {
  const {
    currentUser, financialAccounts, financialCategories, todayRate,
    createFinancialCategory, cancelFinancialTransaction,
  } = useAppFields(
    'currentUser', 'financialAccounts', 'financialCategories', 'todayRate',
    'createFinancialCategory', 'cancelFinancialTransaction'
  );

  const isSeller = currentUser?.role === 'SELLER';
  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;

  // The tab lives in the URL (?tab=STORES) so a reload keeps the tab the user was on;
  // no tab param means the report, which is what the page opens on.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab') as Tab | null;
  const tab: Tab = urlTab && TABS.some((t) => t.value === urlTab) ? urlTab : 'REPORT';
  const setTab = (next: Tab) => setSearchParams(next === 'REPORT' ? {} : { tab: next }, { replace: true });
  const [status, setStatus] = useState<StatusMessage | null>(null);
  // Shared by the "Отчёт" and "По складам" tabs so switching between them keeps the month.
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7));

  // --- Overview: latest 5 operations, fetched independently of the journal tab's own
  // paginated/filtered state below ---
  const [recentRows, setRecentRows] = useState<FinancialTransaction[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const loadRecent = useCallback(async () => {
    if (isSeller) return;
    setRecentLoading(true);
    try {
      const result = await apiClient<{ rows: any[] }>('/finance/transactions?limit=5');
      setRecentRows(result.rows.map(mapFinancialTransaction));
    } catch (e) {
      console.error('Failed to load recent financial transactions', e);
    } finally {
      setRecentLoading(false);
    }
  }, [isSeller]);
  useEffect(() => { loadRecent(); }, [loadRecent]);

  // --- Журнал (Операции): the highest-volume, heaviest-filtered resource in the app —
  // deliberately NOT a global AppContext array (see Phase 2 plan); this component owns
  // its own cursor-paginated fetch, mirroring how audit logs would be paged. ---
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<JournalFilters>({
    period: 'SPECIFIC_MONTH', month: new Date().toISOString().substring(0, 7),
    type: '', accountId: '', status: '', search: '',
  });
  const [journalRows, setJournalRows] = useState<FinancialTransaction[]>([]);
  const [journalCursor, setJournalCursor] = useState<string | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalLoaded, setJournalLoaded] = useState(false);

  const buildJournalQuery = useCallback((cursor: string | null) => {
    const qs = new URLSearchParams();
    qs.set('limit', '50');
    if (cursor) qs.set('cursor', cursor);
    if (filters.period !== 'ALL') {
      qs.set('period', filters.period);
      if (filters.period === 'SPECIFIC_MONTH') qs.set('month', filters.month);
    }
    if (filters.type) qs.set('type', filters.type);
    if (filters.accountId) qs.set('accountId', filters.accountId);
    if (filters.status) qs.set('status', filters.status);
    if (filters.search.trim()) qs.set('search', filters.search.trim());
    return qs.toString();
  }, [filters]);

  const loadJournal = useCallback(async (reset: boolean, cursor: string | null) => {
    if (isSeller) return;
    setJournalLoading(true);
    try {
      const qs = buildJournalQuery(reset ? null : cursor);
      const result = await apiClient<{ rows: any[]; nextCursor: string | null }>(`/finance/transactions?${qs}`);
      const mapped = result.rows.map(mapFinancialTransaction);
      setJournalRows((prev) => (reset ? mapped : [...prev, ...mapped]));
      setJournalCursor(result.nextCursor);
    } catch (e) {
      console.error('Failed to load financial journal', e);
    } finally {
      setJournalLoading(false);
      setJournalLoaded(true);
    }
  }, [buildJournalQuery, isSeller]);

  useEffect(() => {
    if (isSeller || tab !== 'JOURNAL') return;
    loadJournal(true, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, tab, isSeller]);

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  // Generated once per confirm-dialog open and reused if the confirm is retried — same
  // "stable per logical attempt" contract as the create modals' idempotency keys.
  const cancelIdempotencyKeyRef = useRef(crypto.randomUUID());
  const openCancelConfirm = (id: string) => {
    cancelIdempotencyKeyRef.current = crypto.randomUUID();
    setCancellingId(id);
  };
  const handleConfirmCancel = async () => {
    if (!cancellingId || isCancelling) return;
    setIsCancelling(true);
    try {
      const res = await cancelFinancialTransaction(cancellingId, cancelIdempotencyKeyRef.current);
      setCancellingId(null);
      if (res.success) {
        setStatus({ tone: 'success', text: 'Операция отменена, средства возвращены на баланс' });
        loadRecent();
        if (tab === 'JOURNAL') loadJournal(true, null);
      } else {
        setStatus({ tone: 'error', text: res.message || 'Не удалось отменить операцию' });
      }
    } finally {
      setIsCancelling(false);
    }
  };

  // --- Счета: account statement drill-down ---
  const [statementAccountId, setStatementAccountId] = useState<string | null>(null);
  const [statementPeriod, setStatementPeriod] = useState<ReportPeriod>('MONTH');
  const [statementMonth, setStatementMonth] = useState(new Date().toISOString().substring(0, 7));
  const [statement, setStatement] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  useEffect(() => {
    if (!statementAccountId) { setStatement(null); return; }
    let cancelled = false;
    setStatementLoading(true);
    const qs = new URLSearchParams({ accountId: statementAccountId, period: statementPeriod });
    if (statementPeriod === 'SPECIFIC_MONTH') qs.set('month', statementMonth);
    apiClient<any>(`/reports/account-statement?${qs.toString()}`)
      .then((data) => { if (!cancelled) setStatement(data); })
      .catch((e) => console.error('Failed to load account statement', e))
      .finally(() => { if (!cancelled) setStatementLoading(false); });
    return () => { cancelled = true; };
  }, [statementAccountId, statementPeriod, statementMonth]);

  // --- Категории ---
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDirection, setNewCategoryDirection] = useState<'IN' | 'OUT'>('IN');
  const [isSubmittingCategory, setIsSubmittingCategory] = useState(false);
  const canManage = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';
  const incomeCategories = useMemo(() => financialCategories.filter((c) => c.direction === 'IN'), [financialCategories]);
  const expenseCategories = useMemo(() => financialCategories.filter((c) => c.direction === 'OUT'), [financialCategories]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name || isSubmittingCategory) return;
    setIsSubmittingCategory(true);
    try {
      const res = await createFinancialCategory({ name, direction: newCategoryDirection });
      if (res.success) {
        setCategoryModalOpen(false);
        setNewCategoryName('');
        setStatus({ tone: 'success', text: `Категория "${name}" добавлена` });
      } else {
        setStatus({ tone: 'error', text: res.message || 'Не удалось добавить категорию' });
      }
    } finally {
      setIsSubmittingCategory(false);
    }
  };

  const totalUsdEquivalent = useMemo(
    () => +(financialAccounts.reduce((sum, a) => sum + a.balanceTjs / rate + a.balanceUsd, 0)).toFixed(2),
    [financialAccounts, rate]
  );

  const renderJournalRow = (t: FinancialTransaction) => {
    const isIncoming = t.direction === 'IN' || (t.direction === 'NEUTRAL' && t.type === 'TRANSFER');
    const cancellable = t.status === 'POSTED' && !t.sourceType && !t.reversedTransactionId;
    return (
      <div key={t.id} className={`p-3.5 flex items-start gap-3 ${t.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
        <div className={`p-2 rounded-lg shrink-0 ${isIncoming ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {t.type === 'TRANSFER' ? <ArrowLeftRight className="w-4 h-4" /> : isIncoming ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold text-fg-muted">{TYPE_LABELS[t.type] || t.type}</span>
            <Badge tone="neutral">{t.transactionNumber}</Badge>
            {t.status === 'CANCELLED' && <Badge tone="danger">Отменено</Badge>}
          </div>
          <p className="text-sm text-fg-muted mt-0.5 truncate">{t.description}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle mt-1">
            <span>{t.accountName}{t.destinationAccountName ? ` → ${t.destinationAccountName}` : ''}</span>
            <span>·</span>
            <span>{new Date(t.transactionDate).toLocaleDateString('ru-RU')}</span>
            {t.categoryName && <><span>·</span><span>{t.categoryName}</span></>}
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
          <p className={`text-sm font-semibold ${isIncoming ? 'text-success' : 'text-danger'}`}>
            {isIncoming ? '+' : '-'}{formatMoney(t.balanceCurrency === 'TJS' ? t.amountTjs : t.amountUsd, t.balanceCurrency)}
          </p>
          {cancellable && canManage && (
            <IconButton icon={XCircle} tone="danger" size="sm" aria-label="Отменить операцию" onClick={() => openCancelConfirm(t.id)} />
          )}
        </div>
      </div>
    );
  };

  // Hooks are unconditional above this point — RestrictedAccess for SELLER is decided
  // only in the render output, matching ExpensesPage/ReportsPage's own gating pattern.
  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел финансов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg-muted">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="border-b border-border bg-bg shrink-0 px-3 pt-3 pb-3">
        <FilterPillGroup
          options={TABS}
          value={tab}
          onChange={setTab}
          scrollable
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'OVERVIEW' && (
          <div className="p-3 space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-2 px-0.5">Сколько денег сейчас</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {financialAccounts.map((a) => (
                  <StatCard
                    key={a.id}
                    label={a.name}
                    value={formatMoney(a.balanceTjs, 'TJS')}
                    subvalue={a.storeName}
                    icon={Wallet}
                    tone={a.balanceTjs < 0 ? 'danger' : 'neutral'}
                  />
                ))}
                <StatCard label="Итого (эквивалент)" value={`$${totalUsdEquivalent.toLocaleString()}`} icon={BarChart3} tone="accent" />
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-fg-subtle uppercase tracking-wide mb-2 px-0.5">Последние операции</h3>
              {recentLoading ? (
                <LoadingState label="Загрузка…" />
              ) : recentRows.length === 0 ? (
                <EmptyState icon={Wallet} title="Пока нет операций" />
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {recentRows.map(renderJournalRow)}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'JOURNAL' && (
          <div className="flex flex-col h-full">
            <div className="p-3 space-y-2.5 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <SearchBar value={filters.search} onChange={(v) => setFilters((f) => ({ ...f, search: v }))} placeholder="Поиск по номеру, описанию..." className="flex-1" />
                <IconButton icon={SlidersHorizontal} aria-label="Фильтры" tone={filtersOpen ? 'accent' : 'default'} onClick={() => setFiltersOpen((v) => !v)} />
                <IconButton icon={RefreshCw} aria-label="Обновить" onClick={() => loadJournal(true, null)} />
              </div>
              {filtersOpen && (
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                  <FilterPillGroup options={PERIOD_OPTIONS} value={filters.period} onChange={(v) => setFilters((f) => ({ ...f, period: v }))} />
                  {filters.period === 'SPECIFIC_MONTH' && (
                    <MonthPicker value={filters.month} onChange={(v) => setFilters((f) => ({ ...f, month: v }))} className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none" />
                  )}
                  <Select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="h-9 px-3 pr-8 text-xs font-semibold w-auto shrink-0">
                    <option value="">Все типы</option>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                  <Select value={filters.accountId} onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value }))} className="h-9 px-3 pr-8 text-xs font-semibold w-auto shrink-0">
                    <option value="">Все счета</option>
                    {financialAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                  <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="h-9 px-3 pr-8 text-xs font-semibold w-auto shrink-0">
                    <option value="">Все статусы</option>
                    <option value="POSTED">Проведено</option>
                    <option value="CANCELLED">Отменено</option>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {journalLoading && journalRows.length === 0 ? (
                <LoadingState label="Загрузка операций…" />
              ) : journalLoaded && journalRows.length === 0 ? (
                <EmptyState icon={Wallet} title="Операции не найдены" />
              ) : (
                <>
                  <div className="lg:hidden divide-y divide-border">
                    {journalRows.map(renderJournalRow)}
                  </div>
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-fg-subtle border-b border-border">
                        <tr>
                          <th className="p-2 font-medium">Дата</th>
                          <th className="p-2 font-medium">№</th>
                          <th className="p-2 font-medium">Тип</th>
                          <th className="p-2 font-medium">Счёт</th>
                          <th className="p-2 font-medium">Статья</th>
                          <th className="p-2 font-medium">Контрагент</th>
                          <th className="p-2 font-medium text-right">Приход</th>
                          <th className="p-2 font-medium text-right">Расход</th>
                          <th className="p-2 font-medium">Статус</th>
                          <th className="p-2 font-medium">Основание</th>
                          <th className="p-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {journalRows.map((t) => {
                          const isIncoming = t.direction === 'IN';
                          const cancellable = t.status === 'POSTED' && !t.sourceType && !t.reversedTransactionId;
                          const amount = formatMoney(t.balanceCurrency === 'TJS' ? t.amountTjs : t.amountUsd, t.balanceCurrency);
                          return (
                            <tr key={t.id} className={t.status === 'CANCELLED' ? 'opacity-50' : ''}>
                              <td className="p-2 whitespace-nowrap">{new Date(t.transactionDate).toLocaleDateString('ru-RU')}</td>
                              <td className="p-2 whitespace-nowrap font-mono">{t.transactionNumber}</td>
                              <td className="p-2 whitespace-nowrap">{TYPE_LABELS[t.type] || t.type}</td>
                              <td className="p-2 whitespace-nowrap">{t.accountName}{t.destinationAccountName ? ` → ${t.destinationAccountName}` : ''}</td>
                              <td className="p-2 whitespace-nowrap">{t.categoryName || '—'}</td>
                              <td className="p-2 whitespace-nowrap">{t.counterpartyName || '—'}</td>
                              <td className="p-2 whitespace-nowrap text-right text-success font-semibold">{isIncoming ? amount : '—'}</td>
                              <td className="p-2 whitespace-nowrap text-right text-danger font-semibold">{!isIncoming ? amount : '—'}</td>
                              <td className="p-2 whitespace-nowrap">{t.status === 'POSTED' ? 'Проведено' : 'Отменено'}</td>
                              <td className="p-2 max-w-50 truncate">{t.description}</td>
                              <td className="p-2 whitespace-nowrap">
                                {cancellable && canManage && (
                                  <IconButton icon={XCircle} tone="danger" size="sm" aria-label="Отменить операцию" onClick={() => openCancelConfirm(t.id)} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {journalCursor && (
                    <div className="p-3 flex justify-center">
                      <Button variant="secondary" loading={journalLoading} onClick={() => loadJournal(false, journalCursor)}>Показать ещё</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'ACCOUNTS' && (
          <div className="p-3 space-y-2.5">
            {financialAccounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setStatementAccountId(a.id); }}
                className="w-full text-left p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between gap-3 hover:border-accent transition-colors"
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-surface-raised text-fg-muted shrink-0">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg-muted truncate">{a.name}</span>
                      <Badge tone="neutral">Касса</Badge>
                    </div>
                    {a.storeName && (
                      <p className="text-xs text-fg-subtle mt-0.5 flex items-center gap-1"><StoreIcon className="w-3 h-3" />{a.storeName}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-fg-muted">{formatMoney(a.balanceTjs, 'TJS')}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {tab === 'CATEGORIES' && (
          <div className="p-3 space-y-4">
            {canManage && (
              <div className="flex justify-end">
                <Button variant="secondary" leftIcon={Plus} onClick={() => setCategoryModalOpen(true)}>Добавить категорию</Button>
              </div>
            )}
            {([
              { title: 'Доходы', headingClass: 'text-success', items: incomeCategories },
              { title: 'Расходы', headingClass: 'text-danger', items: expenseCategories },
            ]).map(({ title, headingClass, items }) => (
              <div key={title}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 px-0.5 ${headingClass}`}>{title}</h3>
                {items.length === 0 ? (
                  <EmptyState icon={Wallet} title="Нет категорий" className="py-6" />
                ) : (
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden bg-surface">
                    {items.map((c: FinancialCategory) => (
                      <div key={c.id} className="p-3 flex items-center justify-between gap-2">
                        <span className="text-sm text-fg-muted">{c.name}</span>
                        {c.isSystem && <Badge tone="neutral">Системная</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {(tab === 'REPORT' || tab === 'STORES') && (
          <ProfitReport key={tab} view={tab === 'REPORT' ? 'summary' : 'stores'} month={reportMonth} onMonthChange={setReportMonth} />
        )}
      </div>

      <ConfirmDialog
        open={!!cancellingId}
        title="Отменить операцию?"
        message="Будет создана обратная проводка, средства вернутся на баланс счёта. Операция останется в истории со статусом «Отменено»."
        confirmLabel="Отменить операцию"
        loading={isCancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancellingId(null)}
      />

      <Dialog
        open={!!statementAccountId}
        onClose={() => setStatementAccountId(null)}
        title={financialAccounts.find((a) => a.id === statementAccountId)?.name || 'Выписка по счёту'}
        maxWidth="lg"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <FilterPillGroup options={[{ value: 'MONTH' as ReportPeriod, label: 'Месяц' }, { value: 'SPECIFIC_MONTH' as ReportPeriod, label: 'Другой месяц' }, { value: 'ALL' as ReportPeriod, label: 'Всё время' }]} value={statementPeriod} onChange={setStatementPeriod} />
            {statementPeriod === 'SPECIFIC_MONTH' && (
              <MonthPicker value={statementMonth} onChange={setStatementMonth} className="h-9 px-3 rounded-lg border border-accent bg-surface text-xs font-semibold text-accent focus:outline-none" />
            )}
          </div>

          {statementLoading || !statement ? <LoadingState label="Загрузка выписки…" /> : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-fg-subtle px-1">
                <span>Начальный остаток: {formatMoney(statement.openingBalanceTjs, 'TJS')}</span>
                <span>Конечный остаток: {formatMoney(statement.closingBalanceTjs, 'TJS')}</span>
              </div>
              {statement.rows.length === 0 ? (
                <EmptyState icon={Wallet} title="Операций за период не найдено" className="py-6" />
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {statement.rows.map((r: any) => (
                    <div key={r.id} className="p-2.5 flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <p className="text-fg-muted truncate">{r.description}</p>
                        <p className="text-xs text-fg-subtle">{new Date(r.transactionDate).toLocaleDateString('ru-RU')} · {r.transactionNumber}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold ${r.signedAmount >= 0 ? 'text-success' : 'text-danger'}`}>
                          {r.signedAmount >= 0 ? '+' : ''}{formatMoney(r.signedAmount, r.balanceCurrency)}
                        </p>
                        <p className="text-xs text-fg-subtle">Остаток: {formatMoney(r.balanceCurrency === 'TJS' ? r.runningBalanceTjs : r.runningBalanceUsd, r.balanceCurrency)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Новая категория"
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setCategoryModalOpen(false)}>Отмена</Button>
            <Button variant="primary" fullWidth type="submit" form="add-financial-category-form" loading={isSubmittingCategory}>Добавить</Button>
          </>
        }
      >
        <form id="add-financial-category-form" onSubmit={handleAddCategory} className="space-y-3.5">
          <FormField label="Название категории" required>
            <input
              type="text" required value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Например: Логистика"
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
          <FormField label="Направление" required>
            <Select value={newCategoryDirection} onChange={(e) => setNewCategoryDirection(e.target.value as 'IN' | 'OUT')} className="w-full">
              <option value="IN">Доход</option>
              <option value="OUT">Расход</option>
            </Select>
          </FormField>
        </form>
      </Dialog>
    </div>
  );
};
