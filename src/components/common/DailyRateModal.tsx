import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DollarSign, Check, AlertCircle, X } from 'lucide-react';

interface DailyRateModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const DailyRateModal: React.FC<DailyRateModalProps> = ({ isOpen, onClose }) => {
  const { todayRate, setDailyRate } = useApp();
  const [rateInput, setRateInput] = useState<string>(todayRate?.rate ? todayRate.rate.toString() : '9.50');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRateInput(todayRate?.rate ? todayRate.rate.toString() : '9.50');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 font-mono">
      <div className="w-full max-w-sm rounded-lg bg-[#0F1219] border border-slate-800 p-4 sm:p-5 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <DollarSign className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-100 uppercase">КУРС ДОЛЛАРА</h3>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] uppercase text-slate-400 mb-1">
              Курс (1 USD = )
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={rateInput ?? ''}
                onChange={(e) => {
                  setRateInput(e.target.value);
                  setError(null);
                }}
                autoFocus
                placeholder="9.50"
                className="w-full rounded bg-[#0B0E14] border border-slate-700 px-3 py-2 text-base font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </div>
            {error && (
              <p className="mt-1.5 flex items-center text-[11px] text-rose-400">
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-1/3 py-2 text-xs rounded bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 transition-colors"
              >
                ОТМЕНА
              </button>
            )}
            <button
              type="submit"
              className="flex-1 flex items-center justify-center space-x-1.5 rounded bg-emerald-500 hover:bg-emerald-400 py-2 text-xs font-bold text-white uppercase transition-colors shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            >
              <Check className="w-4 h-4" />
              <span>СОХРАНИТЬ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
