import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ExpenseCategory } from '../../types';
import {
  Wallet,
  Plus,
  DollarSign,
  TrendingDown,
  Building,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Tag
} from 'lucide-react';

const CATEGORY_NAMES: Record<string, string> = {
  RENT: 'Аренда помещения',
  SALARY: 'Зарплата сотрудников',
  UTILITIES: 'Коммуналка и интернет',
  MARKETING: 'Реклама и маркетинг',
  TAXES: 'Налоги и сборы',
  SUPPLIES: 'Расходные материалы',
  REPAIR_PARTS: 'Запчасти для ремонта',
  OTHER: 'Прочие расходы',
  'Аренда': 'Аренда помещения',
  'Зарплата': 'Зарплата сотрудников',
  'Коммунальные': 'Коммуналка и интернет',
  'Ремонт': 'Ремонт и запчасти',
  'Транспорт': 'Транспорт и доставка',
  'Доставка': 'Доставка товаров',
  'Реклама': 'Реклама и маркетинг',
  'Хозяйственные': 'Хозяйственные нужды',
  'Другие': 'Прочие расходы'
};

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

  // Filter expenses (sellers only see their own store)
  const visibleExpenses = expenses.filter(e => {
    if (isSeller) {
      return e.storeId === currentUser.storeId;
    }
    return true;
  });

  const totalExpensesTjs = visibleExpenses.reduce((acc, e) => acc + e.amountTjs, 0);
  const rate = todayRate?.rate || 9.50;
  const totalExpensesUsd = +(totalExpensesTjs / rate).toFixed(2);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
            <TrendingDown className="w-4 h-4 text-rose-400" />
            <span>Журнал расходов (Операционные затраты)</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Итого расходов: <strong className="text-rose-400 font-mono">{totalExpensesTjs.toLocaleString()} TJS</strong> (≈ ${totalExpensesUsd})
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Зафиксировать расход</span>
        </button>
      </div>

      {statusMessage && (
        <div className={`mx-4 mt-3 p-2.5 rounded text-xs flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-800' : 'bg-rose-950/50 text-rose-300 border border-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Expenses list */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80 bg-zinc-950">
        {visibleExpenses.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            Расходов не зафиксировано
          </div>
        ) : (
          visibleExpenses.map((exp) => (
            <div key={exp.id} className="p-4 hover:bg-zinc-900/60 transition-colors flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-zinc-200">
                    {CATEGORY_NAMES[exp.category] || exp.category}
                  </span>
                  {exp.sourceAccount?.toLowerCase().includes('касса') && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      Списано из кассы
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{exp.comment || (exp as any).description || 'Расход'}</p>
                <div className="flex items-center space-x-2 text-[11px] text-zinc-500 mt-1">
                  <span>{exp.storeName || 'Бизнес'}</span>
                  <span>•</span>
                  <span>{exp.date ? new Date(exp.date).toLocaleDateString('ru-RU') : ''}</span>
                  <span>•</span>
                  <span>Сотрудник: {exp.createdByName || (exp as any).registeredByName || 'Администратор'}</span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-sm font-mono font-bold text-rose-400">
                  -{(exp.amountTjs ?? 0).toLocaleString()} TJS
                </span>
                <span className="block text-[10px] font-mono text-zinc-500">
                  ≈ -${exp.amountUsd ?? 0}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* MODAL: Add Expense */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <form onSubmit={handleAddExpense} className="w-full max-w-sm rounded-lg bg-zinc-900 border border-zinc-800 p-5 text-zinc-100 shadow-2xl space-y-3">
            <h4 className="text-sm font-bold text-white mb-2 flex items-center space-x-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              <span>Фиксация расхода</span>
            </h4>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-zinc-400 mb-1">Категория расхода</label>
                <select
                  value={category ?? 'RENT'}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-100 focus:border-rose-500 focus:outline-none"
                >
                  {Object.entries(CATEGORY_NAMES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Сумма расхода (TJS)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={amountTjs ?? ''}
                    onChange={(e) => setAmountTjs(e.target.value)}
                    placeholder="500"
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 font-mono text-rose-400 text-sm focus:border-rose-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2 text-zinc-500">TJS</span>
                </div>
              </div>

              {!isSeller && (
                <div>
                  <label className="block text-zinc-400 mb-1">Точка / Филиал</label>
                  <select
                    value={storeId ?? ''}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-200"
                  >
                    {stores.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-zinc-400 mb-1">Описание / Обоснование</label>
                <input
                  type="text"
                  required
                  value={description ?? ''}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Оплата аренды за август"
                  className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-zinc-100 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <label className="flex items-center space-x-2 cursor-pointer text-zinc-300">
                  <input
                    type="checkbox"
                    checked={paidFromCashRegister}
                    onChange={(e) => setPaidFromCashRegister(e.target.checked)}
                    className="rounded bg-zinc-950 border-zinc-700 text-rose-600 focus:ring-0"
                  />
                  <span>Списать сумму из кассы магазина</span>
                </label>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
              >
                Отмена
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
