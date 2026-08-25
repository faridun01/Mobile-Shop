import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DollarSign, Check, AlertCircle, X, Sparkles } from 'lucide-react';

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
      if (todayRate?.rate) {
        setRateInput(todayRate.rate.toString());
      } else {
        setRateInput('9.50');
      }
    }
  }, [isOpen, todayRate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(rateInput.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setError('Введите корректный курс (например, 9.50)');
      return;
    }
    setDailyRate(val);
    if (onClose) onClose();
  };

  const handleSelectPreset = (preset: number) => {
    setRateInput(preset.toString());
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-mono animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-[#0F1219] border-2 border-emerald-500/50 p-5 sm:p-6 text-slate-200 shadow-[0_0_50px_rgba(16,185,129,0.25)] relative overflow-hidden">
        {/* Background glow decoration */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <span>КУРС ДОЛЛАРА НА СЕГОДНЯ</span>
                {isMandatory && <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
              </h3>
              <p className="text-[10px] text-slate-400">
                {isMandatory ? 'Новый день! Первый вошедший задает курс' : `Дата: ${todayStr}`}
              </p>
            </div>
          </div>
          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {isMandatory && (
          <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs leading-relaxed">
            ⚡ <strong>Новый рабочий день ({todayStr}):</strong> Курс доллара на сегодня еще не был установлен. Введите курс 1 USD = ? TJS для начала работы.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
              Установите курс (1 USD = TJS)
            </label>
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
                autoFocus
                placeholder="9.50"
                className="w-full rounded-xl bg-[#0B0E14] border-2 border-emerald-500/60 px-4 py-3 text-xl font-bold text-emerald-400 focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all font-mono"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">
                TJS
              </span>
            </div>
            {error && (
              <p className="mt-2 flex items-center text-xs text-rose-400 font-semibold">
                <AlertCircle className="w-4 h-4 mr-1.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          {/* Preset Buttons */}
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Быстрый выбор курса:</span>
            <div className="grid grid-cols-5 gap-1.5">
              {PRESET_RATES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    rateInput === preset.toString()
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                      : 'bg-[#0B0E14] hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  {preset.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-3 border-t border-slate-800">
            {!isMandatory && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2.5 text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 transition-colors"
              >
                ОТМЕНА
              </button>
            )}
            <button
              type="submit"
              className="flex-1 flex items-center justify-center space-x-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] py-3 text-xs font-extrabold text-white uppercase transition-all shadow-[0_0_20px_rgba(16,185,129,0.5)] cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>СОХРАНИТЬ КУРС И ПРОДОЛЖИТЬ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
