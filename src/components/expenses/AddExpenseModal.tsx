import React from 'react';
import { Plus, Landmark, AlertCircle } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Select } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { formatMoney } from '../../utils/money';
import { formatStoreName } from '../../utils/storeContext';
import { ExpenseCategory } from '../../types';
import { AddExpenseModalProps } from './types';
import { cn } from '../../utils/cn';

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  open,
  onClose,
  isSubmitting,
  category,
  setCategory,
  allCategoryOptions,
  canAddCategory,
  onOpenAddCategoryModal,
  selectedEmployeeId,
  setSelectedEmployeeId,
  users,
  amountTjs,
  setAmountTjs,
  storeId,
  setStoreId,
  retailStores,
  description,
  setDescription,
  paidFromCashRegister,
  setPaidFromCashRegister,
  isAdmin,
  rate,
  centralCashStore,
  onSubmit,
}) => {
  const isInsufficientFunds = isAdmin && paidFromCashRegister && (parseFloat(amountTjs) || 0) / rate > (centralCashStore?.cashBalanceUsd ?? 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Регистрация расхода"
      footer={
        <>
          <Button variant="secondary" fullWidth size="md" className="!h-9.5 text-xs font-semibold" disabled={isSubmitting} onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="primary"
            fullWidth
            size="md"
            className="!h-9.5 text-xs font-bold"
            type="submit"
            form="add-expense-form"
            loading={isSubmitting}
            disabled={isInsufficientFunds}
          >
            {isAdmin && paidFromCashRegister ? 'Сохранить расход' : 'Зафиксировать расход (долг)'}
          </Button>
        </>
      }
    >
      <form id="add-expense-form" onSubmit={onSubmit} className="space-y-3">
        {/* Category Field */}
        <FormField label="Категория расхода" required>
          <div className="flex items-center gap-1.5">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="w-full !h-9.5 text-xs font-semibold"
            >
              {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
            {canAddCategory && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Plus}
                onClick={onOpenAddCategoryModal}
                className="shrink-0 !h-9.5 px-3 text-xs"
                title="Добавить новую категорию"
              >
                Новая
              </Button>
            )}
          </div>
        </FormField>

        {/* Employee Field if advance or salary */}
        {(category === 'EMPLOYEE_ADVANCE' || category === 'SALARY') && (
          <FormField label="Сотрудник (для удержания из ЗП)" required>
            <Select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full !h-9.5 text-xs font-semibold"
            >
              <option value="">— Выберите сотрудника —</option>
              {users.filter(u => u.isActive ?? u.active).map(u => (
                <option key={u.id} value={u.id}>{u.name}{u.role === 'ADMIN' ? ' (Администратор)' : ''}</option>
              ))}
            </Select>
          </FormField>
        )}

        {/* Amount & Store in 2 compact columns on larger screens / stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FormField label="Сумма расхода (TJS)" required>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amountTjs}
                onChange={(e) => setAmountTjs(e.target.value)}
                placeholder="500"
                className="w-full h-9.5 rounded-xl bg-surface-raised border border-border px-3 pr-11 text-xs font-bold text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-fg-subtle">
                TJS
              </span>
            </div>
          </FormField>

          {isAdmin ? (
            <FormField label="Магазин" required>
              <Select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full !h-9.5 text-xs font-semibold"
              >
                {retailStores.map(s => <option key={s.id} value={s.id}>{formatStoreName(s.name)}</option>)}
              </Select>
            </FormField>
          ) : null}
        </div>

        {/* Description Field */}
        <FormField label="Описание / обоснование">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Оплата аренды за текущий месяц"
            className="w-full h-9.5 rounded-xl bg-surface-raised border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>

        {/* Unified Central Cash Card & Payment Status */}
        {isAdmin ? (
          <div className={cn(
            "rounded-xl border p-2.5 transition-all select-none",
            paidFromCashRegister
              ? "bg-accent/5 border-accent/30 shadow-2xs"
              : "bg-surface-raised/50 border-border"
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  paidFromCashRegister
                    ? "bg-accent/15 text-accent border border-accent/25"
                    : "bg-surface text-fg-subtle border border-border"
                )}>
                  <Landmark className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-fg">Списать из Центральной кассы</span>
                    <Badge tone={paidFromCashRegister ? "success" : "warning"} className="!text-[10px] !px-1.5 !py-0">
                      {paidFromCashRegister ? "Оплачено" : "Долг"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-fg-subtle truncate">
                    {paidFromCashRegister
                      ? `Остаток в кассе: $${formatMoney(centralCashStore?.cashBalanceUsd)}`
                      : "Расход зафиксируется как долг компании"}
                  </p>
                </div>
              </div>

              {/* iOS-Style Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={paidFromCashRegister}
                onClick={() => setPaidFromCashRegister(!paidFromCashRegister)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  paidFromCashRegister ? "bg-accent" : "bg-border"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                    paidFromCashRegister ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {isInsufficientFunds && (
              <div className="mt-2 p-2 rounded-lg bg-danger/10 border border-danger/30 text-[11px] text-danger font-medium flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Недостаточно средств (остаток ${formatMoney(centralCashStore?.cashBalanceUsd)}, требуется ≈$${formatMoney((parseFloat(amountTjs) || 0) / rate)} = {formatMoney(parseFloat(amountTjs) || 0)} TJS)</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-raised border border-border">
            <span className="text-xs text-fg-subtle">Статус оплаты:</span>
            <Badge tone="warning">Долг (ожидает оплаты)</Badge>
          </div>
        )}
      </form>
    </Dialog>
  );
};
