import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Expense, ExpenseCategory } from '../../types';
import { exportExpensesReport } from '../../utils/exportReports';
import {
  Receipt,
  Plus,
  TrendingDown,
  Calendar,
  Tag,
  Download,
  Home,
  UserCheck,
  Zap,
  Megaphone,
  Wrench,
  Package,
  Store as StoreIcon,
  Edit2,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { Select, ToggleRow } from '../ui/Input';
import { FormField } from '../ui/FormField';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

// Single source of truth for expense categories — the old filter dropdown and the
// create/edit modals each maintained their own separate option list, which had drifted
// out of sync (e.g. EMPLOYEE_ADVANCE was creatable but not filterable).
const STANDARD_CATEGORIES = [
  { id: 'RENT', label: 'Аренда помещения' },
  { id: 'SALARY', label: 'Зарплата сотрудников' },
  { id: 'EMPLOYEE_ADVANCE', label: 'Аванс / Подотчет сотрудника' },
  { id: 'UTILITIES', label: 'Коммуналка и интернет' },
  { id: 'MARKETING', label: 'Реклама и маркетинг' },
  { id: 'REPAIR_PARTS', label: 'Запчасти для ремонта' },
  { id: 'TAXES', label: 'Налоги и сборы' },
  { id: 'SUPPLIES', label: 'Расходные материалы' },
  { id: 'OTHER', label: 'Прочие расходы' },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  RENT: Home, 'Аренда': Home,
  SALARY: UserCheck, EMPLOYEE_ADVANCE: UserCheck, 'Зарплата': UserCheck, 'Аванс сотрудника': UserCheck,
  UTILITIES: Zap, 'Коммунальные': Zap,
  MARKETING: Megaphone, 'Реклама': Megaphone,
  TAXES: Receipt,
  SUPPLIES: Package, 'Хозяйственные': Package, 'Транспорт': Package, 'Доставка': Package,
  REPAIR_PARTS: Wrench, 'Ремонт': Wrench,
  OTHER: Tag, 'Другие': Tag,
};

const LEGACY_LABELS: Record<string, string> = {
  'Аренда': 'Аренда помещения',
  'Зарплата': 'Зарплата сотрудников',
  'Аванс сотрудника': 'Аванс / Подотчет сотрудника',
  'Коммунальные': 'Коммуналка и интернет',
  'Ремонт': 'Ремонт и запчасти',
  'Транспорт': 'Транспорт и доставка',
  'Реклама': 'Реклама и маркетинг',
  'Хозяйственные': 'Хозяйственные товары',
  'Другие': 'Прочие расходы',
};

type CustomCategory = { id: string; label: string };

function getCategoryLabel(key: string, customCategories: CustomCategory[]): string {
  const std = STANDARD_CATEGORIES.find(c => c.id === key);
  if (std) return std.label;
  const custom = customCategories.find(c => c.id === key || c.label === key);
  if (custom) return custom.label;
  return LEGACY_LABELS[key] || key || 'Прочие расходы';
}

function getCategoryIcon(key: string): React.ElementType {
  return CATEGORY_ICONS[key] || Tag;
}

export const ExpensesPage: React.FC = () => {
  const { currentUser, expenses, stores, users, todayRate, createExpense, updateExpense, deleteExpense, isInitialLoading } = useApp();

  const isSeller = currentUser?.role === 'SELLER';
  const canAddCategory = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  const retailStores = useMemo(() => stores.filter(s => !s.isMainWarehouse), [stores]);

  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('RENT');
  const [editAmountTjs, setEditAmountTjs] = useState('');
  const [editStoreId, setEditStoreId] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [amountTjs, setAmountTjs] = useState('');
  const [storeId, setStoreId] = useState(retailStores[0]?.id || stores[0]?.id || '');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [paidFromCashRegister, setPaidFromCashRegister] = useState(true);

  useEffect(() => {
    if (!storeId && retailStores.length > 0) setStoreId(retailStores[0].id);
  }, [retailStores, storeId]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'SPECIFIC_MONTH' | 'ALL'>('SPECIFIC_MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('ALL');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState('ALL');

  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() => {
    try {
      const saved = localStorage.getItem('custom_expense_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleStartEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setEditCategory(exp.category);
    setEditAmountTjs((exp.amountTjs || 0).toString());
    setEditStoreId(exp.storeId || stores[0]?.id || '');
    setEditDescription(exp.comment || exp.description || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    const val = parseFloat(editAmountTjs) || 0;
    if (val <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму расхода' });
      return;
    }
    const res = await updateExpense(editingExpense.id, {
      category: editCategory,
      amountTjs: val,
      storeId: editStoreId,
      comment: editDescription.trim(),
      description: editDescription.trim(),
    });
    if (res.success) {
      setEditingExpense(null);
      setStatus({ tone: 'success', text: 'Расход успешно обновлён' });
    } else {
      setStatus({ tone: 'error', text: res.message || 'Ошибка обновления расхода' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    const res = await deleteExpense(deletingId);
    setDeletingId(null);
    if (res.success) {
      setStatus({ tone: 'success', text: 'Расход удалён, средства возвращены в баланс кассы' });
    } else {
      setStatus({ tone: 'error', text: res.message || 'Ошибка удаления расхода' });
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    const val = parseFloat(amountTjs) || 0;
    if (val <= 0) {
      setStatus({ tone: 'error', text: 'Укажите положительную сумму расхода' });
      return;
    }

    const selectedEmp = selectedEmployeeId ? users.find(u => u.id === selectedEmployeeId) : undefined;

    const res = await createExpense({
      category,
      amountTjs: val,
      storeId: isSeller ? currentUser.storeId : storeId,
      description: description.trim(),
      paidFromCashRegister,
      employeeId: selectedEmployeeId || undefined,
      employeeName: selectedEmp?.name,
      isEmployeeAdvance: category === 'EMPLOYEE_ADVANCE' || !!selectedEmployeeId,
    });

    if (res.success) {
      setIsModalOpen(false);
      setAmountTjs('');
      setDescription('');
      setSelectedEmployeeId('');
      setStatus({ tone: 'success', text: `Расход на сумму ${val} TJS проведён${selectedEmp ? ` (зачислен сотруднику ${selectedEmp.name})` : ''}` });
    } else {
      setStatus({ tone: 'error', text: res.message || 'Ошибка проведения расхода' });
    }
  };

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    const allExist = [...STANDARD_CATEGORIES, ...customCategories];
    if (allExist.some(c => c.label.toLowerCase() === name.toLowerCase() || c.id.toLowerCase() === name.toLowerCase())) {
      setStatus({ tone: 'error', text: `Категория "${name}" уже существует` });
      return;
    }

    // Use the readable name itself as the id (not a synthetic CUSTOM_<timestamp> tag):
    // the backend stores `category` as a plain string on the expense record, so anyone
    // viewing it later — a different admin, a different browser/device — must be able to
    // read the category directly from that stored value, without depending on this
    // browser's localStorage still holding the id→label mapping.
    const newCat = { id: name, label: name };
    const updated = [...customCategories, newCat];
    setCustomCategories(updated);
    try { localStorage.setItem('custom_expense_categories', JSON.stringify(updated)); } catch {}

    setSelectedCategoryTab(newCat.id);
    setCategory(newCat.id as ExpenseCategory);
    setIsAddCategoryModalOpen(false);
    setNewCategoryName('');
    setStatus({ tone: 'success', text: `Новая категория "${name}" добавлена` });
  };

  const rate = todayRate?.rate || 9.50;

  const filteredExpenses = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return expenses.filter(e => {
      if (isSeller && e.storeId !== currentUser.storeId) return false;
      if (selectedStoreFilter !== 'ALL' && e.storeId !== selectedStoreFilter) return false;

      const expDateStr = (e.date || '').split('T')[0];
      if (periodFilter === 'TODAY' && expDateStr !== todayStr) return false;
      if (periodFilter === 'SPECIFIC_MONTH' && !expDateStr.startsWith(selectedMonth)) return false;

      if (selectedCategoryTab !== 'ALL') {
        const targetLabel = getCategoryLabel(selectedCategoryTab, customCategories).toLowerCase();
        const expCat = (e.category || '').toLowerCase();
        const expLabel = getCategoryLabel(e.category, customCategories).toLowerCase();

        const matchesId = expCat === selectedCategoryTab.toLowerCase();
        const matchesLabel = expLabel === targetLabel || expCat.includes(targetLabel) || targetLabel.includes(expCat);
        if (!matchesId && !matchesLabel) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const label = getCategoryLabel(e.category, customCategories).toLowerCase();
        const matches =
          label.includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.comment || e.description || '').toLowerCase().includes(q) ||
          (e.createdByName || '').toLowerCase().includes(q) ||
          (e.storeName || '').toLowerCase().includes(q) ||
          e.amountTjs.toString().includes(q);
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [expenses, isSeller, currentUser, periodFilter, selectedMonth, selectedStoreFilter, selectedCategoryTab, searchQuery, customCategories]);

  const totalExpensesTjs = useMemo(() => filteredExpenses.reduce((acc, e) => acc + (e.amountTjs || 0), 0), [filteredExpenses]);
  const totalExpensesUsd = +(totalExpensesTjs / rate).toFixed(2);

  const allCategoryOptions = [...STANDARD_CATEGORIES, ...customCategories];
  const hasActiveFilters = periodFilter !== 'SPECIFIC_MONTH' || selectedStoreFilter !== 'ALL' || selectedCategoryTab !== 'ALL';

  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел расходов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      <div className="border-b border-border bg-bg shrink-0">
        <div className="px-3 pb-3">
          <div className="p-3 rounded-lg bg-surface border border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-danger/10 text-danger shrink-0">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs text-fg-subtle block">Итого за период ({filteredExpenses.length} запис.)</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-danger">-{totalExpensesTjs.toLocaleString()} TJS</span>
                  <span className="text-xs text-fg-subtle">≈ -${totalExpensesUsd.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                leftIcon={Download}
                disabled={filteredExpenses.length === 0}
                onClick={() => exportExpensesReport(filteredExpenses, rate)}
              >
                CSV
              </Button>
              <Button variant="danger" leftIcon={Plus} onClick={() => setIsModalOpen(true)}>
                Добавить
              </Button>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3 flex items-center gap-2">
          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Поиск по расходу / автору..." className="flex-1" />
          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            className={`relative h-11 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors ${
              filtersOpen ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Фильтры</span>
            {hasActiveFilters && !filtersOpen && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent" />}
          </button>
        </div>

        {filtersOpen && (
          <div className="px-3 pb-3 border-t border-border pt-2.5">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 shrink-0">
              <FilterPillGroup
                options={[{ value: 'TODAY', label: 'Сегодня' }, { value: 'SPECIFIC_MONTH', label: 'Месяц' }]}
                value={periodFilter}
                onChange={(v) => setPeriodFilter(v as typeof periodFilter)}
              />

              {periodFilter === 'SPECIFIC_MONTH' && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                  className="h-8 px-2 rounded-lg border border-accent bg-surface text-[11px] font-semibold text-accent focus:outline-none shrink-0 cursor-pointer"
                />
              )}

              {!isSeller && (
                <Select value={selectedStoreFilter} onChange={(e) => setSelectedStoreFilter(e.target.value)} className="h-8 py-0 px-2 text-[11px] w-auto shrink-0">
                  <option value="ALL">Все филиалы</option>
                  {retailStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              )}

              <Select value={selectedCategoryTab} onChange={(e) => setSelectedCategoryTab(e.target.value)} className="h-8 py-0 px-2 text-[11px] w-auto shrink-0">
                <option value="ALL">Все категории</option>
                {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>

              {canAddCategory && (
                <Button variant="secondary" size="md" leftIcon={Plus} className="h-8 px-2.5 text-[11px] shrink-0 whitespace-nowrap" onClick={() => setIsAddCategoryModalOpen(true)}>
                  Категория
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isInitialLoading ? (
          <LoadingState label="Загрузка расходов…" />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState icon={Receipt} title="Операционные расходы не найдены" />
        ) : (
          <div className="divide-y divide-border">
            {filteredExpenses.map((exp) => {
              const Icon = getCategoryIcon(exp.category);
              const label = getCategoryLabel(exp.category, customCategories);
              const formattedDate = exp.date ? new Date(exp.date).toLocaleDateString('ru-RU') : '—';
              const costUsd = exp.amountUsd || +(exp.amountTjs / rate).toFixed(2);

              return (
                <div key={exp.id} className="p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-surface-raised text-fg-muted shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg">{label}</span>
                      {exp.sourceAccount?.toLowerCase().includes('касса') && <Badge tone="neutral">Из кассы</Badge>}
                      {exp.employeeName && <Badge tone="accent">{exp.employeeName}</Badge>}
                    </div>
                    <p className="text-sm text-fg-muted mt-0.5">{exp.comment || exp.description || 'Операционный расход'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle mt-1">
                      <StoreIcon className="w-3 h-3" />
                      <span>{exp.storeName || 'Магазин'}</span>
                      <span>·</span>
                      <Calendar className="w-3 h-3" />
                      <span>{formattedDate}</span>
                      <span>·</span>
                      <span>{exp.createdByName || 'Администратор'}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-danger">-{(exp.amountTjs ?? 0).toLocaleString()} TJS</p>
                    <p className="text-xs text-fg-subtle">≈ -${costUsd.toLocaleString()}</p>
                    {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                      <div className="flex items-center gap-1 mt-1.5 justify-end">
                        <IconButton icon={Edit2} size="sm" aria-label="Редактировать расход" onClick={() => handleStartEdit(exp)} />
                        <IconButton icon={Trash2} tone="danger" size="sm" aria-label="Удалить расход" onClick={() => setDeletingId(exp.id)} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deletingId}
        title="Удалить расход?"
        message="Средства вернутся в баланс кассы. Это действие нельзя отменить."
        confirmLabel="Удалить"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingId(null)}
      />

      <Dialog
        open={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        title="Редактировать расход"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setEditingExpense(null)}>Отмена</Button>
            <Button variant="primary" fullWidth type="submit" form="edit-expense-form">Сохранить</Button>
          </>
        }
      >
        <form id="edit-expense-form" onSubmit={handleSaveEdit} className="space-y-3.5">
          <FormField label="Категория расхода">
            <Select value={editCategory} onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)} className="w-full">
              {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Сумма расхода (TJS)" required>
            <input
              type="number" step="0.01" required min="0.01"
              value={editAmountTjs} onChange={(e) => setEditAmountTjs(e.target.value)}
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm font-semibold text-danger focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
          <FormField label="Точка / филиал">
            <Select value={editStoreId} onChange={(e) => setEditStoreId(e.target.value)} className="w-full">
              {/* All stores, not just retail ones: a payroll expense (salary/advance for
                  an ADMIN/PARTNER) can legitimately be attributed to the main warehouse,
                  and the dropdown must include the record's actual current store. */}
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Описание / примечание">
            <input
              type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Примечание к расходу..."
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
        </form>
      </Dialog>

      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Регистрация расхода"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>Отмена</Button>
            <Button variant="danger" fullWidth type="submit" form="add-expense-form">Сохранить расход</Button>
          </>
        }
      >
        <form id="add-expense-form" onSubmit={handleAddExpense} className="space-y-3.5">
          <FormField label="Категория расхода" required>
            <div className="flex items-center gap-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className="w-full">
                {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
              {canAddCategory && (
                <Button type="button" variant="secondary" size="md" leftIcon={Plus} onClick={() => setIsAddCategoryModalOpen(true)} className="shrink-0 px-3">
                  Новая
                </Button>
              )}
            </div>
          </FormField>

          {(category === 'EMPLOYEE_ADVANCE' || category === 'SALARY') && (
            <FormField label="Сотрудник (для удержания из ЗП)">
              <Select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-full">
                <option value="">— Выберите сотрудника —</option>
                {users.filter(u => u.isActive ?? u.active).map(u => (
                  <option key={u.id} value={u.id}>{u.name}{u.role === 'ADMIN' ? ' (Администратор)' : ''}</option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField label="Сумма расхода (TJS)" required>
            <div className="relative">
              <input
                type="number" min="1" required value={amountTjs} onChange={(e) => setAmountTjs(e.target.value)}
                placeholder="500"
                className="w-full h-11 rounded-lg bg-bg border border-border px-3 pr-12 text-sm font-semibold text-danger focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">TJS</span>
            </div>
          </FormField>

          {!isSeller && (
            <FormField label="Филиал / склад" required>
              <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full">
                {retailStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </FormField>
          )}

          <FormField label="Описание / обоснование" required>
            <input
              type="text" required value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Оплата аренды за текущий месяц"
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>

          <ToggleRow
            checked={paidFromCashRegister}
            onChange={setPaidFromCashRegister}
            label="Списать сумму из наличной кассы"
          />
        </form>
      </Dialog>

      <Dialog
        open={isAddCategoryModalOpen}
        onClose={() => setIsAddCategoryModalOpen(false)}
        title="Новая категория расхода"
        maxWidth="sm"
        footer={
          <>
            <Button variant="secondary" fullWidth onClick={() => setIsAddCategoryModalOpen(false)}>Отмена</Button>
            <Button variant="danger" fullWidth type="submit" form="add-category-form">Добавить</Button>
          </>
        }
      >
        <form id="add-category-form" onSubmit={handleAddCategorySubmit}>
          <FormField label="Название категории" required>
            <input
              type="text" required value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Например: Логистика, Оборудование..."
              className="w-full h-11 rounded-lg bg-bg border border-border px-3 text-sm text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </FormField>
        </form>
      </Dialog>
    </div>
  );
};
