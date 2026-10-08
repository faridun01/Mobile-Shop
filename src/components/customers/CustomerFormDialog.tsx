import React, { useEffect, useState } from 'react';
import { Customer } from '../../types';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { CustomerFormValues } from './types';

interface CustomerFormDialogProps {
  open: boolean;
  /** The customer being edited, or null for a new one. */
  customer: Customer | null;
  onClose: () => void;
  /** Resolves true when saved (the dialog then closes). */
  onSave: (values: CustomerFormValues) => Promise<boolean>;
}

/** Add or edit a customer's contact details. */
export const CustomerFormDialog: React.FC<CustomerFormDialogProps> = ({ open, customer, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(customer?.name ?? '');
    setPhone(customer?.phone ?? '');
    setNote(customer?.note ?? '');
    setPushEnabled(customer ? customer.pushEnabled !== false : true);
  }, [open, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      if (await onSave({ name, phone, note, pushEnabled })) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={customer ? 'Редактировать клиента' : 'Новый клиент'}
      subtitle={customer ? 'Изменение контактных данных' : 'Сохранение контакта в базу'}
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <label className="block">
          <span className="text-xs font-semibold text-fg block mb-1">Имя и фамилия *</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Рустам Шарипов"
            required
            className="w-full h-10 rounded-xl bg-surface border border-border px-3 text-xs text-fg focus:outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-fg block mb-1">Номер телефона</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+992 900 00 00 00"
            className="w-full h-10 rounded-xl bg-surface border border-border px-3 text-xs font-mono text-fg focus:outline-none focus:border-accent"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-fg block mb-1">Заметка / Предпочтения</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Интересуется новинками Apple, чехлы, защитные стекла..."
            className="w-full p-2.5 rounded-xl bg-surface border border-border text-xs text-fg focus:outline-none focus:border-accent resize-none"
          />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            Сохранить
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
