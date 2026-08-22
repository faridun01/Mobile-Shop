import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { ExpenseCategory } from '../../types';
import { exportExpensesReport } from '../../utils/exportReports';
import {
  Receipt,
  Plus,
  DollarSign,
  TrendingDown,
  Building,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Tag,
  Search,
  Download,
  Wallet,
  Home,
  UserCheck,
  Zap,
  Megaphone,
  Wrench,
  Package,
  Store as StoreIcon,
  X,
  Lock
} from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; colorClass: string; bgClass: string; borderClass: string }> = {
  RENT: { label: 'Аренда помещения', icon: Home, colorClass: 'text-rose-400', bgClass: 'bg-rose-500/10', borderClass: 'border-rose-500/30' },
  SALARY: { label: 'Зарплата сотрудников', icon: UserCheck, colorClass: 'text-sky-400', bgClass: 'bg-sky-500/10', borderClass: 'border-sky-500/30' },
  UTILITIES: { label: 'Коммуналка и интернет', icon: Zap, colorClass: 'text-amber-400', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/30' },
  MARKETING: { label: 'Реклама и маркетинг', icon: Megaphone, colorClass: 'text-purple-400', bgClass: 'bg-purple-500/10', borderClass: 'border-purple-500/30' },
  TAXES: { label: 'Налоги и сборы', icon: Receipt, colorClass: 'text-teal-400', bgClass: 'bg-teal-500/10', borderClass: 'border-teal-500/30' },
  SUPPLIES: { label: 'Расходные материалы', icon: Package, colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/10', borderClass: 'border-indigo-500/30' },
  REPAIR_PARTS: { label: 'Запчасти для ремонта', icon: Wrench, colorClass: 'text-amber-400', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/30' },
  OTHER: { label: 'Прочие расходы', icon: Tag, colorClass: 'text-slate-400', bgClass: 'bg-slate-800/60', borderClass: 'border-slate-700' },

  // Cyrillic fallbacks
  'Аренда': { label: 'Аренда помещения', icon: Home, colorClass: 'text-rose-400', bgClass: 'bg-rose-500/10', borderClass: 'border-rose-500/30' },
  'Зарплата': { label: 'Зарплата сотрудников', icon: UserCheck, colorClass: 'text-sky-400', bgClass: 'bg-sky-500/10', borderClass: 'border-sky-500/30' },
  'Коммунальные': { label: 'Коммуналка и интернет', icon: Zap, colorClass: 'text-amber-400', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/30' },
  'Ремонт': { label: 'Ремонт и запчасти', icon: Wrench, colorClass: 'text-amber-400', bgClass: 'bg-amber-500/10', borderClass: 'border-amber-500/30' },
  'Транспорт': { label: 'Транспорт и доставка', icon: Package, colorClass: 'text-sky-400', bgClass: 'bg-sky-500/10', borderClass: 'border-sky-500/30' },
  'Реклама': { label: 'Реклама и маркетинг', icon: Megaphone, colorClass: 'text-purple-400', bgClass: 'bg-purple-500/10', borderClass: 'border-purple-500/30' },
  'Другие': { label: 'Прочие расходы', icon: Tag, colorClass: 'text-slate-400', bgClass: 'bg-slate-800/60', borderClass: 'border-slate-700' }
};

const CATEGORY_FILTER_TABS = [
  { id: 'ALL', label: 'ВСЕ РАСХОДЫ' },
  { id: 'RENT', label: 'АРЕНДА' },
  { id: 'SALARY', label: 'ЗАРПЛАТА' },
  { id: 'UTILITIES', label: 'КОММУНАЛКА' },
  { id: 'MARKETING', label: 'РЕКЛАМА' },
  { id: 'REPAIR_PARTS', label: 'ЗАПЧАСТИ' },
  { id: 'OTHER', label: 'ПРОЧИЕ' }
];

export const ExpensesPage: React.FC = () => {
  const {
    currentUser,
    expenses,
    stores,
    todayRate,
    createExpense
  } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [amountTjs, setAmountTjs] = useState('');
  const [storeId, setStoreId] = useState(stores[0]?.id || 'store-1');
  const [description, setDescription] = useState('');
  const [paidFromCashRegister, setPaidFromCashRegister] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState('ALL');
  const [selectedStoreFilter, setSelectedStoreFilter] = useState('ALL');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSeller = currentUser?.role === 'SELLER';

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const val = parseFloat(amountTjs) || 0;
    if (val <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите положительную сумму расхода' });
      return;
    }

    const res = createExpense({
      category,
      amountTjs: val,
      storeId: isSeller ? currentUser.storeId : storeId,
      description: description.trim(),
      paidFromCashRegister
    });

    if (res.success) {
      setIsModalOpen(false);
      setAmountTjs('');
      setDescription('');
      setStatusMessage({ type: 'success', text: `Расход на сумму ${val} TJS успешно проведен` });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка проведения расхода' });
    }
  };

  const rate = todayRate?.rate || 9.50;

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (isSeller && e.storeId !== currentUser.storeId) {
        return false;
      }
      if (selectedStoreFilter !== 'ALL' && e.storeId !== selectedStoreFilter) {
        return false;
      }

      if (selectedCategoryTab !== 'ALL') {
        if (e.category !== selectedCategoryTab && !e.category?.toLowerCase().includes(selectedCategoryTab.toLowerCase())) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCategory = (CATEGORY_CONFIG[e.category]?.label || e.category).toLowerCase().includes(q);
        const matchesComment = (e.comment || (e as any).description || '').toLowerCase().includes(q);
        const matchesUser = (e.createdByName || '').toLowerCase().includes(q);
        const matchesStore = (e.storeName || '').toLowerCase().includes(q);
        const matchesAmount = e.amountTjs.toString().includes(q);

        if (!matchesCategory && !matchesComment && !matchesUser && !matchesStore && !matchesAmount) {
          return false;
        }
      }

      return true;
    });
  }, [expenses, isSeller, currentUser, selectedStoreFilter, selectedCategoryTab, searchQuery]);

  const totalExpensesTjs = useMemo(() => {
    return filteredExpenses.reduce((acc, e) => acc + (e.amountTjs || 0), 0);
  }, [filteredExpenses]);

  const totalExpensesUsd = +(totalExpensesTjs / rate).toFixed(2);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300 font-mono">
      <div className="p-3.5 border-b border-slate-800 bg-[#0F1219] space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center space-x-2 uppercase">
              <Receipt className="w-4 h-4 text-rose-400" />
              <span>ЖУРНАЛ ОПЕРАЦИОННЫХ РАСХОДОВ</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Учет арендных платежей, зарплат персоналу, коммунальных услуг и закупки материалов
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => exportExpensesReport(filteredExpenses, rate)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition-colors"
              title="Скачать отфильтрованный отчет по расходам в CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ЭКСПОРТ (CSV)</span>
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-1.5 transition-colors shadow-[0_0_12px_rgba(244,63,94,0.3)] shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>ЗАРЕГИСТРИРОВАТЬ РАСХОД</span>
            </button>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">ИТОГО РАСХОДОВ ЗА ПЕРИОД</span>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-xl font-bold text-rose-400">
                  -{totalExpensesTjs.toLocaleString()} TJS
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  (≈ -${totalExpensesUsd.toLocaleString()})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <div className="text-right">
              <span className="text-[10px] text-slate-500 uppercase block">ЗАПИСЕЙ В ЖУРНАЛЕ</span>
              <strong className="text-slate-200 font-bold">{filteredExpenses.length} шт.</strong>
            </div>

            {!isSeller && (
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase block">КУРС УЧЕТА</span>
                <strong className="text-emerald-400 font-bold">{rate} TJS / $</strong>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-800/80">
          <div className="flex items-center space-x-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по расходу / назначению / автору..."
                className="w-full rounded-md bg-[#0B0E14] border border-slate-800 pl-8 pr-8 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-rose-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!isSeller && (
              <select
                value={selectedStoreFilter}
                onChange={(e) => setSelectedStoreFilter(e.target.value)}
                className="bg-[#0B0E14] border border-slate-800 text-slate-200 text-xs font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-rose-500 shrink-0"
              >
                <option value="ALL">Все филиалы</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none">
            {CATEGORY_FILTER_TABS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryTab(cat.id)}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${
                  selectedCategoryTab === cat.id
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-3 p-2.5 rounded-lg text-xs font-mono flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#0B0E14] space-y-2.5">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-mono space-y-2">
            <Receipt className="w-8 h-8 mx-auto opacity-20 text-slate-400" />
            <p className="uppercase font-bold tracking-wider">Операционные расходы не найдены</p>
          </div>
        ) : (
          filteredExpenses.map((exp) => {
            const config = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.OTHER;
            const CategoryIcon = config.icon;
            const formattedDate = exp.date ? new Date(exp.date).toLocaleDateString('ru-RU') : '-';
            const costUsd = exp.amountUsd || +(exp.amountTjs / rate).toFixed(2);

            return (
              <div
                key={exp.id}
                className="p-3.5 rounded-xl bg-[#0F1219] border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  <div className={`p-2.5 rounded-lg shrink-0 border ${config.bgClass} ${config.borderClass} ${config.colorClass}`}>
                    <CategoryIcon className="w-4 h-4" />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${config.bgClass} ${config.colorClass} ${config.borderClass}`}>
                        {config.label}
                      </span>

                      {exp.sourceAccount?.toLowerCase().includes('касса') && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 uppercase font-mono">
                          Списано из кассы
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-mono font-semibold text-slate-200 leading-snug">
                      {exp.comment || (exp as any).description || 'Операционный расход'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-mono pt-0.5">
                      <span className="flex items-center space-x-1">
                        <StoreIcon className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-300">{exp.storeName || 'Магазин'}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{formattedDate}</span>
                      </span>
                      <span>•</span>
                      <span>Списал: <strong className="text-slate-300">{exp.createdByName || 'Администратор'}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 font-mono border-t sm:border-t-0 border-slate-800/60 pt-2 sm:pt-0">
                  <span className="text-sm font-bold text-rose-400 block">
                    -{(exp.amountTjs ?? 0).toLocaleString()} TJS
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    ≈ -${costUsd.toLocaleString()} USD
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <form onSubmit={handleAddExpense} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-rose-400" />
                <span>РЕГИСТРАЦИЯ РАСХОДА</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">КАТЕГОРИЯ РАСХОДА *</label>
                <select
                  value={category ?? 'RENT'}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-rose-500 focus:outline-none"
                >
                  <option value="RENT">Аренда помещения</option>
                  <option value="SALARY">Зарплата сотрудников</option>
                  <option value="UTILITIES">Коммуналка и интернет</option>
                  <option value="MARKETING">Реклама и маркетинг</option>
                  <option value="REPAIR_PARTS">Запчасти для ремонта</option>
                  <option value="TAXES">Налоги и сборы</option>
                  <option value="SUPPLIES">Расходные материалы</option>
                  <option value="OTHER">Прочие расходы</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">СУММА РАСХОДА (TJS) *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={amountTjs ?? ''}
                    onChange={(e) => setAmountTjs(e.target.value)}
                    placeholder="500"
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 font-mono text-rose-400 text-sm font-bold focus:border-rose-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-xs">TJS</span>
                </div>
              </div>

              {!isSeller && (
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase mb-1">ФИЛИАЛ / СКАД *</label>
                  <select
                    value={storeId ?? ''}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-rose-500 focus:outline-none"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ОПИСАНИЕ / ОБОСНОВАНИЕ *</label>
                <input
                  type="text"
                  required
                  value={description ?? ''}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Оплата аренды за текущий месяц"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={paidFromCashRegister}
                    onChange={(e) => setPaidFromCashRegister(e.target.checked)}
                    className="rounded bg-[#0B0E14] border-slate-700 text-rose-500 focus:ring-0"
                  />
                  <span>Списать сумму из наличной кассы</span>
                </label>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white"
              >
                Сохранить расход
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
