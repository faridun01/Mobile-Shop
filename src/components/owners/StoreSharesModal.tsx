import React, { useEffect, useState } from 'react';
import { Percent, Info } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';
import { formatUserName } from '../../utils/formatUser';
import { formatStoreName } from '../../utils/storeContext';
import { Store as StoreType, Owner } from '../../types';

interface StoreSharesModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (storeId: string, partnerOwnerId: string, partnerSharePercent: number) => Promise<void>;
  store?: StoreType;
  partner?: Owner;
  adminOwner?: Owner;
  /** The partner's share in force for this store, or undefined when none is set yet. */
  currentPercent?: number;
  isSubmitting: boolean;
}

const PRESETS = [10, 20, 30, 40, 50];

/** Parses '40', '40.5' or '40,5'; NaN for anything else. */
const parsePercent = (value: string) => {
  const trimmed = value.trim().replace(',', '.');
  return /^\d{1,3}(\.\d{1,2})?$/.test(trimmed) ? Number(trimmed) : NaN;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * One store's profit split: the admin sets only the partner's share, the admin keeps the rest.
 */
export const StoreSharesModal: React.FC<StoreSharesModalProps> = ({
  open,
  onClose,
  onSave,
  store,
  partner,
  adminOwner,
  currentPercent,
  isSubmitting,
}) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(currentPercent !== undefined ? String(currentPercent) : '');
  }, [open, currentPercent]);

  if (!open || !store || !partner) return null;

  const partnerPct = parsePercent(value);
  const error = value.trim() === ''
    ? 'Укажите долю партнёра'
    : Number.isNaN(partnerPct)
      ? 'Введите число, например 40 или 37,5'
      : partnerPct >= 100
        ? 'Доля партнёра должна быть меньше 100% — администратор всегда получает часть прибыли'
        : null;
  const valid = error === null;
  const partnerShown = valid ? partnerPct : 0;
  const adminShown = round2(100 - partnerShown);
  const unchanged = valid && currentPercent !== undefined && round2(partnerPct) === round2(currentPercent);
  const adminName = formatUserName(adminOwner?.name, 'Администратор');
  const partnerName = formatUserName(partner.name, 'Партнёр');

  const submit = async () => {
    if (!valid || isSubmitting || unchanged) return;
    await onSave(store.id, partner.id, round2(partnerPct));
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!isSubmitting) onClose(); }}
      dismissable={!isSubmitting}
      title={`Доля прибыли — ${formatStoreName(store.name)}`}
      subtitle={`Партнёр магазина: ${partnerName}`}
      icon={Percent}
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" className="flex-1" disabled={isSubmitting} onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" className="flex-1" loading={isSubmitting} disabled={!valid || unchanged} onClick={submit}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <div className="space-y-1.5">
          <label htmlFor="partner-share" className="block text-xs font-semibold text-fg">
            Доля партнёра «{partnerName}»
          </label>
          <div className="relative">
            <input
              id="partner-share"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="например, 40"
              className={cn(
                'w-full rounded-xl bg-bg/60 border px-3.5 py-2.5 pr-10 text-xl font-bold font-mono text-fg focus:outline-none focus:ring-2',
                value.trim() !== '' && !valid ? 'border-danger/60 focus:ring-danger/20' : 'border-border focus:border-accent focus:ring-accent/20'
              )}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-fg-subtle font-bold text-lg">%</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setValue(String(p))}
                className={cn(
                  'h-8 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer',
                  valid && partnerPct === p
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-fg-muted hover:text-fg hover:border-accent/40'
                )}
              >
                {p}%
              </button>
            ))}
          </div>
          {value.trim() !== '' && error && <p className="text-xs text-danger">{error}</p>}
        </div>

        {/* The split, as it will be applied */}
        <div className="rounded-xl border border-border bg-surface-raised p-3 space-y-2.5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-bg">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${adminShown}%` }} />
            <div className="h-full bg-info transition-all duration-300" style={{ width: `${partnerShown}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-fg-subtle">
                <span className="h-2 w-2 rounded-full bg-accent shrink-0" />
                <span className="truncate">{adminName} (админ)</span>
              </div>
              <div className="font-mono font-bold text-base text-accent">{adminShown}%</div>
            </div>
            <div className="min-w-0 text-right">
              <div className="flex items-center justify-end gap-1.5 text-fg-subtle">
                <span className="truncate">{partnerName}</span>
                <span className="h-2 w-2 rounded-full bg-info shrink-0" />
              </div>
              <div className="font-mono font-bold text-base text-info">{partnerShown}%</div>
            </div>
          </div>
          <p className="text-xs text-fg-muted border-t border-border pt-2">
            С каждых <strong className="text-fg">$100</strong> прибыли магазина: администратору{' '}
            <strong className="text-accent">${adminShown.toFixed(2)}</strong>, партнёру{' '}
            <strong className="text-info">${partnerShown.toFixed(2)}</strong>.
          </p>
        </div>

        <div className="flex gap-2 text-[11px] text-fg-subtle leading-snug">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Доля действует для продаж с момента сохранения. Прибыль прошлых продаж не пересчитывается.
            {currentPercent === undefined && ' Пока доля не задана, вся прибыль магазина идёт администратору.'}
          </span>
        </div>
      </form>
    </Dialog>
  );
};
