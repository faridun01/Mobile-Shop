import React from 'react';
import { Plus, ArrowUpRight } from 'lucide-react';
import { decimal, moneyNumber, formatUsd, formatTjs } from '../../utils/money';
import { Owner, Store as StoreType } from '../../types';

interface OwnerCardProps {
  owner: Owner;
  info: { name: string; roleTag: string; roleSub: string };
  rate: number;
  onOpenTxModal: (type: 'INVESTMENT' | 'WITHDRAWAL') => void;
  share?: number | null;
  ownerStore?: StoreType | null;
  ownerShareLabel?: string;
  partnerStoreAssets?: { name: string; stockCostUsd: number; stockCount: number; cashUsd: number } | null;
  activeStores?: { id: string; name: string; isMainWarehouse?: boolean }[];
  storeInvestments?: Record<string, number>;
  onOpenSharesModal?: () => void;
}

export const OwnerCard: React.FC<OwnerCardProps> = ({
  owner,
  info,
  rate,
  onOpenTxModal,
}) => {
  const capUsd = owner.capitalBalanceUsd ?? 0;
  const capTjs = moneyNumber(decimal(capUsd).mul(rate));
  // A refund after the profit was already reinvested leaves it negative: future profit repays it.
  const profitOwedUsd = Math.max(0, -(owner.availableProfitUsd ?? 0));

  return (
    <div className="rounded-2xl bg-surface border border-border p-3.5 sm:p-4 space-y-3.5 hover:border-fg-subtle/50 transition-all shadow-xs flex flex-col justify-between">
      <div className="space-y-3">
        {/* Header: Partner Identity */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-black text-xs sm:text-sm shrink-0 shadow-2xs">
              {info.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-fg truncate">
                {info.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider border ${
                    info.roleTag === 'Администратор'
                      ? 'bg-accent/10 border-accent/30 text-accent'
                      : 'bg-info/10 border-info/30 text-info'
                  }`}
                >
                  {info.roleTag}
                </span>
                <span className="text-[10px] text-fg-subtle truncate">
                  {info.roleSub || 'Соучредитель'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Capital Balance Hero Card */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-surface-raised border border-border/80">
          <span className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider block">
            Капитал в обороте
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-fg mt-0.5 tracking-tight">
            {formatUsd(capUsd)}
          </div>
          <span className="text-xs text-fg-subtle font-mono block mt-0.5">
            ≈ {formatTjs(capTjs)}
          </span>
          {profitOwedUsd > 0 && (
            <span className="text-xs text-danger font-semibold block mt-1.5">
              К удержанию из будущей прибыли: {formatUsd(profitOwedUsd)}
            </span>
          )}
        </div>
      </div>

      {/* Clean Action Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => onOpenTxModal('INVESTMENT')}
          className="px-2.5 py-2 rounded-xl bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 text-xs font-bold transition-all text-center cursor-pointer shadow-2xs min-h-[36px] flex items-center justify-center gap-1.5"
          title="Внести средства в капитал"
        >
          <Plus className="w-4 h-4" />
          <span>Внести</span>
        </button>
        <button
          type="button"
          onClick={() => onOpenTxModal('WITHDRAWAL')}
          className="px-2.5 py-2 rounded-xl bg-surface-raised hover:bg-surface text-danger border border-danger/30 hover:border-danger text-xs font-bold transition-all text-center cursor-pointer shadow-2xs min-h-[36px] flex items-center justify-center gap-1.5"
          title="Вывести средства из капитала"
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Вывести</span>
        </button>
      </div>
    </div>
  );
};
