import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DollarSign } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';

interface DailyRateModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

const PRESET_RATES = [9.40, 9.50, 9.55, 9.60, 9.70];

export const DailyRateModal: React.FC<DailyRateModalProps> = ({ isOpen, onClose }) => {
  const { todayRate, setDailyRate } = useApp();
  const todayStr = new Date().toISOString().split('T')[0];
  const isRateSetForToday = todayRate && todayRate.date === todayStr && todayRate.rate > 0;
  const isMandatory = !isRateSetForToday;

  const [rateInput, setRateInput] = useState<string>('9.50');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRateInput(todayRate?.rate ? todayRate.rate.toString() : '9.50');
      setError(null);
    }
  }, [isOpen, todayRate]);

  const handleSubmit = () => {
    const val = parseFloat(rateInput.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setError('Введите корректный курс (например, 9.50)');
      return;
    }
    setDailyRate(val);
    onClose?.();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={() => onClose?.()}
      dismissable={!isMandatory}
      title="Курс доллара на сегодня"
      subtitle={isMandatory ? 'Новый день — установите курс, чтобы продолжить' : `Дата: ${todayStr}`}
      maxWidth="sm"
      footer={
        <>
          {!isMandatory && onClose && (
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
          )}
          <Button variant="primary" fullWidth leftIcon={DollarSign} onClick={handleSubmit}>
            Сохранить курс
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isMandatory && (
          <div className="rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs leading-relaxed p-3">
            Курс доллара на сегодня ещё не установлен. Введите курс 1 USD = ? TJS, чтобы начать работу.
          </div>
        )}

        <FormField label="1 USD =" required error={error ?? undefined}>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={rateInput}
              onChange={(e) => {
                setRateInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
              placeholder="9.50"
              className="w-full h-14 rounded-lg bg-bg border border-accent/50 px-4 text-xl font-bold text-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-fg-subtle uppercase">TJS</span>
          </div>
        </FormField>

        <div>
          <span className="text-xs font-medium text-fg-muted block mb-1.5">Быстрый выбор:</span>
          <div className="grid grid-cols-5 gap-1.5">
            {PRESET_RATES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setRateInput(preset.toString());
                  setError(null);
                }}
                className={`h-9 text-xs font-semibold rounded-lg border transition-colors ${
                  rateInput === preset.toString()
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'bg-surface text-fg-muted border-border hover:text-fg'
                }`}
              >
                {preset.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
