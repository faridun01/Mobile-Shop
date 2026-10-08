import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { Select } from '../ui/Input';
import { formatStoreName } from '../../utils/storeContext';
import { ExpenseCategory } from '../../types';
import { EditExpenseModalProps } from './types';

export const EditExpenseModal: React.FC<EditExpenseModalProps> = ({
  editingExpense,
  onClose,
  isSubmitting,
  editCategory,
  setEditCategory,
  allCategoryOptions,
  editAmountTjs,
  setEditAmountTjs,
  editStoreId,
  setEditStoreId,
  stores,
  isAdmin,
  editDescription,
  setEditDescription,
  onSubmit,
}) => {
  return (
    <Dialog
      open={!!editingExpense}
      onClose={onClose}
      title="Редактировать расход"
      footer={
        <>
          <Button variant="secondary" fullWidth size="md" className="!h-9.5 text-xs font-semibold" disabled={isSubmitting} onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" fullWidth size="md" className="!h-9.5 text-xs font-bold" type="submit" form="edit-expense-form" loading={isSubmitting}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id="edit-expense-form" onSubmit={onSubmit} className="space-y-3">
        <FormField label="Категория расхода">
          <Select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)}
            className="w-full !h-9.5 text-xs font-semibold"
          >
            {allCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </FormField>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <FormField label="Сумма расхода (TJS)" required>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                required
                min="0.01"
                value={editAmountTjs}
                onChange={(e) => setEditAmountTjs(e.target.value)}
                className="w-full h-9.5 rounded-xl bg-surface-raised border border-border px-3 pr-11 text-xs font-bold text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-fg-subtle">
                TJS
              </span>
            </div>
          </FormField>

          {isAdmin ? (
            <FormField label="Точка / филиал">
              <Select
                value={editStoreId}
                onChange={(e) => setEditStoreId(e.target.value)}
                className="w-full !h-9.5 text-xs font-semibold"
              >
                {stores.map(s => <option key={s.id} value={s.id}>{formatStoreName(s.name)}</option>)}
              </Select>
            </FormField>
          ) : null}
        </div>

        <FormField label="Описание / примечание">
          <input
            type="text"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Примечание к расходу..."
            className="w-full h-9.5 rounded-xl bg-surface-raised border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </FormField>
      </form>
    </Dialog>
  );
};
