import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { apiClient } from '../../api/client';

interface AddThresholdDialogProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  onSaved: () => void;
}

interface StockModel {
  brand: string;
  model: string;
  storage: string;
}

/** The server's "every capacity of the model together". */
const ALL_STORAGE = 'ALL';
const selectClass = 'w-full h-10 rounded-xl bg-surface-raised border border-border px-3 text-sm text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50';
const sortRu = (a: string, b: string) => a.localeCompare(b, 'ru', { numeric: true });

/**
 * A minimum for one of the shop's own models: brand, model and capacity are picked from the
 * phones that have been in stock (sold-out ones included), never typed freely.
 */
export const AddThresholdDialog: React.FC<AddThresholdDialogProps> = ({ open, onClose, storeId, storeName, onSaved }) => {
  const [models, setModels] = useState<StockModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState(ALL_STORAGE);
  const [minQuantity, setMinQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBrand(''); setModel(''); setStorage(ALL_STORAGE); setMinQuantity(''); setError(null);
    setLoading(true);
    apiClient<StockModel[]>('/stock-thresholds/models')
      .then(setModels)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить модели склада'))
      .finally(() => setLoading(false));
  }, [open]);

  const brands = useMemo(() => [...new Set(models.map((m) => m.brand))].sort(sortRu), [models]);
  const brandModels = useMemo(() => [...new Set(models.filter((m) => m.brand === brand).map((m) => m.model))].sort(sortRu), [models, brand]);
  const capacities = useMemo(
    () => [...new Set(models.filter((m) => m.brand === brand && m.model === model).map((m) => m.storage))].sort(sortRu),
    [models, brand, model],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const min = Number(minQuantity);
    if (!brand || !model) { setError('Выберите бренд и модель'); return; }
    if (!Number.isInteger(min) || min < 1) { setError('Минимум — целое число от 1'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient('/stock-thresholds', {
        method: 'POST',
        body: JSON.stringify({ storeId, brand, model, storage, minQuantity: min }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить минимум');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Минимум для модели"
      footer={
        <>
          <Button variant="secondary" fullWidth disabled={saving} onClick={onClose}>Отмена</Button>
          <Button variant="primary" fullWidth type="submit" form="add-threshold-form" loading={saving} disabled={loading}>Сохранить</Button>
        </>
      }
    >
      <form id="add-threshold-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-fg-subtle">
          {storeName}: модели вашего склада. Когда остаток опустится до минимума, придёт уведомление.
        </p>
        <FormField label="Бренд" required>
          <select value={brand} onChange={(e) => { setBrand(e.target.value); setModel(''); setStorage(ALL_STORAGE); }} className={selectClass} disabled={loading}>
            <option value="">{loading ? 'Загрузка…' : 'Выберите бренд'}</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </FormField>
        <FormField label="Модель" required>
          <select value={model} onChange={(e) => { setModel(e.target.value); setStorage(ALL_STORAGE); }} className={selectClass} disabled={!brand}>
            <option value="">Выберите модель</option>
            {brandModels.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FormField>
        <FormField label="Память" hint="«Все объёмы» — минимум на все объёмы модели вместе.">
          <select value={storage} onChange={(e) => setStorage(e.target.value)} className={selectClass} disabled={!model}>
            <option value={ALL_STORAGE}>Все объёмы</option>
            {capacities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Минимум, шт." required>
          <input type="number" inputMode="numeric" min={1} step={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="3" className={selectClass} />
        </FormField>
        {!loading && models.length === 0 && !error && (
          <p className="text-xs text-fg-subtle">На складе ещё нет телефонов — модели появятся после первого прихода.</p>
        )}
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
};
