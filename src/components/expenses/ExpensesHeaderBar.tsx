import React from 'react';
import {
  TrendingDown,
  RotateCcw,
  Plus,
  AlertCircle,
  Search,
  X,
} from 'lucide-react';
import { formatMoney } from '../../utils/money';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { DateRangePicker } from '../ui/DateRangePicker';
import { ExpensesHeaderBarProps } from './types';

export const ExpensesHeaderBar: React.FC<ExpensesHeaderBarProps> = ({
  totalExpensesTjs,
  totalExpensesUsd,
  filteredExpensesCount,
  totalExpensesCount,
  hasActiveFilters,
  onResetFilters,
  onOpenAddModal,
  unpaidTotalTjs,
  unpaidCount,
  totalUnpaidInScope,
  statusFilter,
  setStatusFilter,
  searchQuery,
  setSearchQuery,
  todayStr,
  thisMonthStr,
  periodFilter,
  setPeriodFilter,
  selectedMonth,
  setSelectedMonth,
  selectedStartDate,
  setSelectedStartDate,
  selectedEndDate,
  setSelectedEndDate,
  resetToCurrentMonth,
}) => {
  return (
    <div className="border-b border-border bg-surface shrink-0 p-2 sm:p-2.5">
      <div className="max-w-6xl xl:max-w-7xl mx-auto w-full space-y-1.5 sm:space-y-2">
        {/* Row 1: KPI Summary (Left) + Status Tabs & Action Button (Right) */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 flex-wrap">
          {/* Summary KPI Badge */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-danger/10 text-danger flex items-center justify-center shrink-0">
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
              <span className="text-xs sm:text-sm font-bold text-danger font-mono tracking-tight whitespace-nowrap">
                -{formatMoney(totalExpensesTjs)} TJS
              </span>
              <span className="text-[10px] sm:text-[11px] text-fg-subtle font-mono hidden xs:inline whitespace-nowrap">
                ≈ -${formatMoney(totalExpensesUsd)}
              </span>
              <span className="text-[9px] sm:text-[10px] text-fg-subtle px-1.5 py-0.2 rounded-md bg-surface-raised border border-border/80 shrink-0">
                {filteredExpensesCount} из {totalExpensesCount}
              </span>
            </div>
          </div>

          {/* Right: Status Segmented Control & Add Button */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
            {/* Status pills */}
            <div className="inline-flex items-center bg-surface-raised p-0.5 rounded-lg border border-border/80 text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={cn(
                  'px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer',
                  statusFilter === 'ALL'
                    ? 'bg-surface text-fg shadow-2xs border border-border/80'
                    : 'text-fg-subtle hover:text-fg'
                )}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('UNPAID')}
                className={cn(
                  'px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-all cursor-pointer',
                  statusFilter === 'UNPAID'
                    ? 'bg-warning/20 text-warning border border-warning/40 shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-warning'
                )}
              >
                <span>Не оплачено</span>
                {totalUnpaidInScope > 0 && (
                  <span
                    className={cn(
                      'px-1 py-0.1 rounded-full text-[9px] font-bold leading-none',
                      statusFilter === 'UNPAID' ? 'bg-warning text-black' : 'bg-warning/25 text-warning'
                    )}
                  >
                    {totalUnpaidInScope}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PAID')}
                className={cn(
                  'px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer',
                  statusFilter === 'PAID'
                    ? 'bg-accent/20 text-accent border border-accent/40 shadow-2xs font-bold'
                    : 'text-fg-subtle hover:text-fg'
                )}
              >
                Оплачено
              </button>
            </div>

            {/* Add Expense Button */}
            <Button
              variant="danger"
              leftIcon={Plus}
              onClick={onOpenAddModal}
              className="!h-7 !px-2 sm:!h-7.5 sm:!px-2.5 text-xs font-bold shrink-0 shadow-2xs"
            >
              <span className="sm:hidden">Расход</span>
              <span className="hidden sm:inline">Добавить расход</span>
            </Button>
          </div>
        </div>

        {/* Unpaid Warning Notice (compact banner, only when unpaid exists) */}
        {unpaidTotalTjs > 0 && (
          <div className="flex items-center justify-between px-2 py-0.5 rounded-lg bg-warning/10 border border-warning/25 text-warning text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'UNPAID' ? 'ALL' : 'UNPAID')}
              className="font-semibold hover:underline flex items-center gap-1.5 cursor-pointer text-left min-w-0 text-[11px]"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Не оплачено: <strong>{formatMoney(unpaidTotalTjs)} TJS</strong> ({unpaidCount} шт.)
              </span>
            </button>
            <span className="text-[10px] opacity-80 shrink-0 font-medium ml-2">
              {statusFilter === 'UNPAID' ? '✕ сбросить' : '→ показать'}
            </span>
          </div>
        )}

        {/* Row 2: Search + Quick Dates + Quick Reset in a single unified line */}
        <div className="flex items-center gap-1.5">
          {/* SearchBar Input */}
          <div className="relative flex-1 min-w-[100px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-subtle pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по расходам, категориям, сотрудникам..."
              className="w-full h-7.5 rounded-lg bg-surface-raised border border-border pl-8 pr-7 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
                title="Очистить поиск"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Date: Сегодня */}
          <button
            type="button"
            onClick={() => {
              setSelectedStartDate(todayStr);
              setSelectedEndDate(todayStr);
              setSelectedMonth('');
              setPeriodFilter('TODAY');
            }}
            className={cn(
              'h-7.5 px-2 rounded-lg border text-xs font-semibold shrink-0 transition-all select-none cursor-pointer',
              periodFilter === 'TODAY'
                ? 'border-accent/50 bg-accent/10 text-accent font-bold'
                : 'border-border/80 bg-surface-raised text-fg-muted hover:text-fg'
            )}
          >
            Сегодня
          </button>

          {/* Calendar Month Picker */}
          <DateRangePicker
            startDate={periodFilter === 'CUSTOM' ? selectedStartDate : ''}
            endDate={periodFilter === 'CUSTOM' ? selectedEndDate : ''}
            selectedMonth={periodFilter === 'MONTH' ? selectedMonth : undefined}
            currentMonthStr={thisMonthStr}
            isToday={periodFilter === 'TODAY'}
            isAllTime={periodFilter === 'ALL'}
            onSelectAllTime={() => {
              setSelectedMonth('');
              setPeriodFilter('ALL');
            }}
            isActive={periodFilter === 'MONTH' || periodFilter === 'CUSTOM' || periodFilter === 'ALL'}
            onChange={(start, end, monthStr) => {
              if (monthStr) {
                setSelectedMonth(monthStr);
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('MONTH');
              } else if (start === todayStr && end === todayStr) {
                setSelectedMonth('');
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('TODAY');
              } else {
                setSelectedMonth('');
                setSelectedStartDate(start);
                setSelectedEndDate(end);
                setPeriodFilter('CUSTOM');
              }
            }}
            onResetMonth={resetToCurrentMonth}
            className="shrink-0 [&_button]:!h-7.5 [&_button]:!px-2.5 [&_button]:!rounded-lg [&_button]:!text-xs"
          />

          {/* Quick Reset Filters Button (if active filters) */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="h-7.5 px-2 rounded-lg border border-border/80 bg-surface-raised hover:bg-surface text-danger hover:text-danger/80 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors shadow-2xs"
              title="Сбросить фильтры и поиск"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Сбросить</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
