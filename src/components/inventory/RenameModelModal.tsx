import React, { useState, useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Smartphone, Layers, AlertCircle, Check } from 'lucide-react';

export interface RenameModelModalProps {
  isOpen: boolean;
  initialBrand: string;
  initialModel: string;
  deviceIds: string[];
  existingBrands?: string[];
  onClose: () => void;
  onRename: (params: { deviceIds: string[]; newModel: string; newBrand?: string }) => Promise<{ success: boolean; count?: number; message?: string }>;
  onNotify?: (msg: { tone: 'info' | 'warning' | 'error' | 'success'; text: string }) => void;
}

export const RenameModelModal: React.FC<RenameModelModalProps> = ({
  isOpen,
  initialBrand,
  initialModel,
  deviceIds,
  existingBrands = [],
  onClose,
  onRename,
  onNotify,
}) => {
  const [brand, setBrand] = useState(initialBrand);
  const [model, setModel] = useState(initialModel);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBrand(initialBrand || '');
      setModel(initialModel || '');
      setError(null);
    }
  }, [isOpen, initialBrand, initialModel]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanBrand = brand.trim();
    const cleanModel = model.trim();

    if (!cleanModel) {
      setError('Название модели не может быть пустым');
      return;
    }

    if (cleanBrand === initialBrand.trim() && cleanModel === initialModel.trim()) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await onRename({
        deviceIds,
        newModel: cleanModel,
        newBrand: cleanBrand || initialBrand,
      });

      if (res.success) {
        onNotify?.({
          tone: 'success',
          text: `Модель переименована в "${cleanModel}" (${res.count ?? deviceIds.length} шт.)`,
        });
        onClose();
      } else {
        setError(res.message || 'Ошибка при сохранении названия модели');
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось сохранить изменения');
    } finally {
      setIsSubmitting(false);
    }
  };

  const popularBrands = Array.from(
    new Set([
      'Apple',
      'Samsung',
      'Xiaomi',
      'Honor',
      'Tecno',
      'Infinix',
      'Realme',
      ...existingBrands,
    ])
  ).filter(Boolean).slice(0, 8);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Редактировать название модели"
      icon={Smartphone}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Отмена
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !model.trim()}
          >
            {isSubmitting ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info summary */}
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-raised border border-border">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="w-4 h-4 text-accent shrink-0" />
            <div className="min-w-0">
              <span className="text-xs text-fg-subtle block">Текущее название:</span>
              <span className="text-sm font-extrabold text-fg truncate block">
                {initialBrand} {initialModel}
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-accent/15 text-accent border border-accent/25 shrink-0">
            {deviceIds.length} шт.
          </span>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Brand Field */}
        <div>
          <label className="block text-xs font-bold text-fg-subtle uppercase tracking-wider mb-1">
            Бренд
          </label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Например: Samsung, Apple, Xiaomi"
            className="w-full px-3 py-2 text-sm rounded-xl bg-surface border border-border text-fg focus:outline-none focus:border-accent transition-colors"
          />
          {/* Quick brand suggestions */}
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {popularBrands.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBrand(b)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all cursor-pointer ${
                  brand.toLowerCase() === b.toLowerCase()
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'bg-surface-raised/80 hover:bg-surface-raised border-border text-fg-subtle hover:text-fg'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Model Field */}
        <div>
          <label className="block text-xs font-bold text-fg-subtle uppercase tracking-wider mb-1">
            Название модели / продукта <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Например: Galaxy A15, iPhone 15 Pro, Hot 40 Pro"
            autoFocus
            className="w-full px-3 py-2 text-sm font-semibold rounded-xl bg-surface border border-border text-fg focus:outline-none focus:border-accent transition-colors"
          />
          <p className="text-[11px] text-fg-subtle mt-1">
            Изменение применится ко всем <strong>{deviceIds.length} шт.</strong> этого товара на складе.
          </p>
        </div>
      </form>
    </Dialog>
  );
};
