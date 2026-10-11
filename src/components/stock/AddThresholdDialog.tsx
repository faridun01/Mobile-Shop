import React, { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { apiClient } from '../../api/client';
import type { Device } from '../../types';

interface AddThresholdDialogProps {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeName: string;
  /** Phones the app knows, for brand / model / capacity suggestions. */
  devices: Device[];
  onSaved: () => void;
}

const inputClass = 'w-full h-10 rounded-xl bg-surface-raised border border-border px-3 text-sm text-fg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent';
const PRESET_BRANDS = ['Apple', 'Samsung', 'Xiaomi', 'Google', 'Honor', 'Huawei', 'OnePlus', 'Realme', 'Tecno', 'Infinix', 'Nothing'];

/**
 * A minimum for any model, including one not in stock yet: brand and model are typed or picked
 * from the phone catalog; without a capacity the minimum covers every capacity of the model.
 */
export const AddThresholdDialog: React.FC<AddThresholdDialogProps> = ({ open, onClose, storeId, storeName, devices, onSaved }) => {
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [storage, setStorage] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBrand(''); setModel(''); setStorage(''); setMinQuantity(''); setError(null);
  }, [open]);

  const brands = useMemo(() => {
    const set = new Set(PRESET_BRANDS);
    devices.forEach((d) => d.brand?.trim() && set.add(d.brand.trim()));
    return [...set].sort();
  }, [devices]);

  const ownModels = useMemo(() => {
    const b = brand.trim().toLowerCase();
    return [...new Set(devices.filter((d) => !b || d.brand?.trim().toLowerCase() === b).map((d) => d.model?.trim()).filter(Boolean) as string[])];
  }, [devices, brand]);

  const storages = useMemo(() => [...new Set(devices.map((d) => d.storage?.trim()).filter(Boolean) as string[])].sort(), [devices]);

  // Catalog suggestions while typing the model (debounced).
  useEffect(() => {
    const q = model.trim();
    if (!open || q.length < 2) { setCatalogModels([]); return; }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (brand.trim()) params.set('brand', brand.trim());
      apiClient<Array<{ brand: string; model: string }>>(`/phone-catalog/models?${params}`)
        .then((rows) => setCatalogModels(rows.map((r) => r.model)))
        .catch(() => setCatalogModels([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, model, brand]);

  const modelOptions = useMemo(() => [...new Set([...ownModels, ...catalogModels])].slice(0, 30), [ownModels, catalogModels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const min = Number(minQuantity);
    if (!brand.trim() || !model.trim()) { setError('Укажите бренд и модель'); return; }
    if (!Number.isInteger(min) || min < 1) { setError('Минимум — целое число от 1'); return; }
    setSaving(true);
    setError(null);
    try {
      await apiClient('/stock-thresholds', {
        method: 'POST',
        body: JSON.stringify({ storeId, brand: brand.trim(), model: model.trim(), storage: storage.trim() || 'ALL', minQuantity: min }),
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
          <Button variant="primary" fullWidth type="submit" form="add-threshold-form" loading={saving}>Сохранить</Button>
        </>
      }
    >
      <form id="add-threshold-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-xs text-fg-subtle">
          {storeName}: когда остаток модели опустится до минимума, придёт уведомление.
        </p>
        <FormField label="Бренд" required>
          <input list="threshold-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Apple" className={inputClass} />
          <datalist id="threshold-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
        </FormField>
        <FormField label="Модель" required>
          <input list="threshold-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="iPhone 17 Pro" className={inputClass} />
          <datalist id="threshold-models">{modelOptions.map((m) => <option key={m} value={m} />)}</datalist>
        </FormField>
        <FormField label="Память" hint="Пусто — минимум на все объёмы модели вместе.">
          <input list="threshold-storages" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Все объёмы" className={inputClass} />
          <datalist id="threshold-storages">{storages.map((s) => <option key={s} value={s} />)}</datalist>
        </FormField>
        <FormField label="Минимум, шт." required>
          <input type="number" inputMode="numeric" min={1} step={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} placeholder="3" className={inputClass} />
        </FormField>
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
};
