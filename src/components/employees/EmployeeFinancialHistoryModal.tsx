import React, { useState } from 'react';
import { User, Store, Expense, Sale } from '../../types';
import { MonthPicker } from '../ui/MonthPicker';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Receipt } from 'lucide-react';
import { cn } from '../../utils/cn';

interface EmployeeFinancialHistoryModalProps {
  user: User | null;
  stores: Store[];
  expenses: Expense[];
  sales: Sale[];
  onClose: () => void;
}

export const EmployeeFinancialHistoryModal: React.FC<EmployeeFinancialHistoryModalProps> = ({
  user,
  stores,
  expenses,
  sales,
  onClose,
}) => {
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('ALL');

  if (!user) return null;

  const resolvedStoreName =
    user.storeName ||
    (user.storeId ? stores.find((s) => s.id === user.storeId)?.name : undefined) ||
    (user.role === 'SELLER' ? 'Магазин не привязан' : 'Все филиалы');

  const allEmpExpenses = expenses.filter(
    (e) => e.employeeId === user.id || (e.isEmployeeAdvance && e.employeeName === user.name)
  );
  const allEmpSales = sales.filter((s) => s.sellerId === user.id && s.status !== 'REFUNDED');

  const datesSet = new Set<string>();
  allEmpExpenses.forEach((e) => datesSet.add(e.date.substring(0, 7)));
  allEmpSales.forEach((s) => datesSet.add(s.date.substring(0, 7)));
  const availableMonths = Array.from(datesSet).sort().reverse();

  const filteredExpenses =
    selectedHistoryMonth === 'ALL'
      ? allEmpExpenses
      : allEmpExpenses.filter((e) => e.date.startsWith(selectedHistoryMonth));

  const filteredSales =
    selectedHistoryMonth === 'ALL'
      ? allEmpSales
      : allEmpSales.filter((s) => s.date.startsWith(selectedHistoryMonth));

  const salaryExpenses = filteredExpenses.filter((e) => e.category === 'SALARY');
  const advanceExpenses = filteredExpenses.filter((e) => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance);

  const totalSalaryPaid = salaryExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
  const totalAdvancesTaken = advanceExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
  const totalSalesRev = filteredSales.reduce((sum, s) => sum + s.totalTjs, 0);

  const combinedOperations = [
    ...filteredExpenses.map((e) => ({ kind: 'expense' as const, date: e.date, data: e })),
    ...filteredSales.map((s) => ({ kind: 'sale' as const, date: s.date, data: s })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const baseSal = user.baseSalaryTjs || 0;
  const commPct = user.salesCommissionPercent || 0;
  const commAmount = Math.round(totalSalesRev * (commPct / 100));
  const grossAccrued = baseSal + commAmount;

  return (
    <Dialog
      open={Boolean(user)}
      onClose={onClose}
      title={`Финансы: ${user.name}`}
      subtitle={resolvedStoreName}
      icon={Receipt}
      compact
      maxWidth="lg"
      footer={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="h-8 px-4 text-xs font-semibold"
        >
          Закрыть
        </Button>
      }
    >
      <div className="space-y-2.5">
        {/* Компактный фильтр по месяцам в одну строку */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-border text-xs flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
            <button
              type="button"
              onClick={() => setSelectedHistoryMonth('ALL')}
              className={cn(
                'h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap',
                selectedHistoryMonth === 'ALL'
                  ? 'bg-accent text-accent-fg font-bold shadow-2xs'
                  : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
              )}
            >
              Все месяцы
            </button>
            {availableMonths.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedHistoryMonth(m)}
                className={cn(
                  'h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap font-mono',
                  selectedHistoryMonth === m
                    ? 'bg-accent text-accent-fg font-bold shadow-2xs'
                    : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <MonthPicker
            value={selectedHistoryMonth === 'ALL' ? '' : selectedHistoryMonth}
            onChange={(m) => setSelectedHistoryMonth(m || 'ALL')}
            className="h-7 px-2 bg-surface-raised border border-border rounded-lg text-xs font-semibold text-fg focus:outline-none cursor-pointer shrink-0"
            placeholder="Выбрать месяц..."
          />
        </div>

        {/* 4 ключевые сводки без лишнего текста */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-xl bg-surface-raised border border-border">
            <span className="text-[10px] font-semibold text-fg-subtle block uppercase">Выручка</span>
            <div className="text-xs sm:text-sm font-bold font-mono text-fg mt-0.5 truncate">
              {totalSalesRev.toLocaleString()} TJS
            </div>
            <span className="text-[10px] text-fg-subtle font-mono">{filteredSales.length} продаж</span>
          </div>

          <div className="p-2 rounded-xl bg-surface-raised border border-border">
            <span className="text-[10px] font-semibold text-fg-subtle block uppercase">Начислено</span>
            <div className="text-xs sm:text-sm font-bold font-mono text-accent mt-0.5 truncate">
              {grossAccrued.toLocaleString()} TJS
            </div>
            <span className="text-[10px] text-fg-subtle">оклад + %</span>
          </div>

          <div className="p-2 rounded-xl bg-surface-raised border border-border">
            <span className="text-[10px] font-semibold text-fg-subtle block uppercase">Авансы</span>
            <div className="text-xs sm:text-sm font-bold font-mono text-warning mt-0.5 truncate">
              {totalAdvancesTaken.toLocaleString()} TJS
            </div>
            <span className="text-[10px] text-fg-subtle font-mono">{advanceExpenses.length} выплат</span>
          </div>

          <div className="p-2 rounded-xl bg-surface-raised border border-border">
            <span className="text-[10px] font-semibold text-fg-subtle block uppercase">Выплачено ЗП</span>
            <div className="text-xs sm:text-sm font-bold font-mono text-info mt-0.5 truncate">
              {totalSalaryPaid.toLocaleString()} TJS
            </div>
            <span className="text-[10px] text-fg-subtle font-mono">{salaryExpenses.length} выплат</span>
          </div>
        </div>

        {/* Таблица операций */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Операции ({combinedOperations.length})
            </span>
            {selectedHistoryMonth !== 'ALL' && (
              <span className="text-[11px] text-fg-subtle font-mono">период: {selectedHistoryMonth}</span>
            )}
          </div>

          <div className="max-h-60 sm:max-h-72 overflow-y-auto rounded-xl border border-border bg-surface-raised/40">
            {combinedOperations.length === 0 ? (
              <div className="p-4 text-center text-fg-subtle text-xs">
                Операций за выбранный период не найдено
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-raised text-[10px] text-fg-subtle uppercase border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="py-1.5 px-2.5">Дата</th>
                    <th className="py-1.5 px-2.5">Тип</th>
                    <th className="py-1.5 px-2.5">Описание</th>
                    <th className="py-1.5 px-2.5 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-xs">
                  {combinedOperations.map((op) => {
                    const isExpense = op.kind === 'expense';
                    const isSalary = isExpense && op.data.category === 'SALARY';
                    const dateStr = new Date(op.data.date).toLocaleDateString('ru-RU');

                    if (isExpense) {
                      return (
                        <tr key={`e-${op.data.id}`} className="hover:bg-surface-raised transition-colors">
                          <td className="py-1.5 px-2.5 text-fg-subtle whitespace-nowrap font-mono text-[11px]">
                            {dateStr}
                          </td>
                          <td className="py-1.5 px-2.5 whitespace-nowrap">
                            <span
                              className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                                isSalary
                                  ? 'bg-accent/15 text-accent border border-accent/25'
                                  : 'bg-warning/15 text-warning border border-warning/30'
                              )}
                            >
                              {isSalary ? 'Зарплата' : 'Аванс'}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 text-fg truncate max-w-56 text-[11px]">
                            {op.data.description || op.data.comment || (isSalary ? 'Выплата зарплаты' : 'Выдан аванс')}
                          </td>
                          <td
                            className={cn(
                              'py-1.5 px-2.5 text-right font-bold font-mono text-xs whitespace-nowrap',
                              isSalary ? 'text-accent' : 'text-warning'
                            )}
                          >
                            -{op.data.amountTjs.toLocaleString()} TJS
                          </td>
                        </tr>
                      );
                    }

                    // Sale
                    const sale = op.data;
                    return (
                      <tr key={`s-${sale.id}`} className="hover:bg-surface-raised transition-colors">
                        <td className="py-1.5 px-2.5 text-fg-subtle whitespace-nowrap font-mono text-[11px]">
                          {dateStr}
                        </td>
                        <td className="py-1.5 px-2.5 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-info/15 text-info border border-info/30">
                            Продажа #{sale.receiptNumber}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-fg truncate max-w-56 text-[11px]">
                          {sale.items.map((i) => `${i.brand} ${i.model}`).join(', ')}
                          {sale.customerName ? ` (${sale.customerName})` : ''}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-bold font-mono text-xs text-success whitespace-nowrap">
                          +{sale.totalTjs.toLocaleString()} TJS
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
