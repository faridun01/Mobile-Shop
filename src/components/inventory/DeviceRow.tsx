import React from 'react';
import { Device } from '../../types';
import { formatUsd } from '../../utils/money';
import {
  Smartphone,
  ChevronRight,
  Sparkles,
  Warehouse,
  Store,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import {
  getPhoneColorHex,
  formatPhoneColor,
  STATUS_LABELS,
  STATUS_TONE,
  formatRam,
  formatStorage,
  isRamInStorage,
} from './types';
import { ImeiBadge } from '../common/CopyImeiButton';

export interface DeviceRowProps {
  device: Device;
  isAdmin?: boolean;
  storeName?: string;
  isMainWarehouse?: boolean;
  rate?: number;
  hideModelName?: boolean;
  compact?: boolean;
  hideSpecs?: boolean;
  onClick: () => void;
}

export const DeviceRow = React.forwardRef<HTMLButtonElement, DeviceRowProps>(
  ({ device, isAdmin, storeName, isMainWarehouse, rate, hideModelName, compact, hideSpecs, onClick }, ref) => {
    const isSpecialStatus = device.status !== 'STORE_STOCK' && device.status !== 'MAIN_WAREHOUSE';
    const showStatusBadge = isSpecialStatus || !storeName;
    const colorHex = getPhoneColorHex(device.color);
    const formattedRam = formatRam(device.ram);
    const showRamBadge = Boolean(formattedRam);

    if (compact) {
      return (
        <button
          ref={ref}
          type="button"
          onClick={onClick}
          className="group w-full text-left px-2 py-1.5 rounded-lg bg-surface border border-border/70 hover:border-accent/40 active:bg-surface-raised flex items-center justify-between gap-1.5 sm:gap-2 transition-all cursor-pointer shadow-2xs"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 flex-nowrap overflow-hidden">
            {/* Color Indicator & Color Name */}
            <div className="flex items-center gap-1 shrink-0 max-w-20 sm:max-w-28 truncate">
              {colorHex ? (
                <span
                  className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                  style={{ backgroundColor: colorHex }}
                />
              ) : (
                <Smartphone className="w-3 h-3 text-fg-subtle shrink-0" />
              )}
              <span className="text-xs font-semibold text-fg truncate">
                {formatPhoneColor(device.color) || 'Стандарт'}
              </span>
            </div>

            {/* IMEI badge */}
            <div className="shrink-0 font-mono">
              <ImeiBadge imei={device.imei} imei2={device.imei2} />
            </div>

            {/* Specs fallback (if not hidden by parent variant header) */}
            {!hideSpecs && (device.storage || showRamBadge) && (
              <div className="hidden md:flex items-center gap-1 text-[10px] font-mono shrink-0">
                {device.storage && (
                  <span className="px-1.5 py-0.2 rounded bg-surface-raised border border-border text-fg font-semibold">
                    {formatStorage(device.storage)}
                  </span>
                )}
                {showRamBadge && (
                  <span className="px-1 py-0.2 rounded bg-accent/10 border border-accent/20 text-accent font-semibold">
                    {formattedRam}
                  </span>
                )}
              </div>
            )}

            {/* Store badge if location is mixed */}
            {storeName && (
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                  isMainWarehouse
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/25'
                    : 'bg-accent/10 text-accent border-accent/25'
                }`}
              >
                {isMainWarehouse ? <Warehouse className="w-2.5 h-2.5 shrink-0" /> : <Store className="w-2.5 h-2.5 shrink-0" />}
                <span className="truncate max-w-16 sm:max-w-28">{storeName}</span>
              </span>
            )}

            {/* Special status badge */}
            {showStatusBadge && (
              <span className="shrink-0 scale-90 origin-left">
                <Badge tone={STATUS_TONE[device.status] || 'neutral'}>
                  {STATUS_LABELS[device.status] || device.status}
                </Badge>
              </span>
            )}

            {/* Bonus indicator */}
            {device.isBonus && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-500/15 text-amber-500 border border-amber-500/25 shrink-0">
                <Sparkles className="w-2.5 h-2.5" />
                Бонус
              </span>
            )}
          </div>

          {/* Right: Price & Chevron */}
          <div className="text-right shrink-0 flex items-center gap-1.5 sm:gap-2">
            {device.isBonus || (isAdmin && device.purchaseCostUsd === 0) ? (
              <span className="text-[10px] font-bold text-accent font-mono px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20">
                Бонус
              </span>
            ) : isAdmin && device.purchaseCostUsd > 0 ? (
              <span className="text-xs sm:text-sm font-extrabold text-fg font-mono block leading-tight">
                {formatUsd(device.purchaseCostUsd)}
              </span>
            ) : null}

            <ChevronRight className="w-3.5 h-3.5 text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </button>
      );
    }


    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className="group w-full text-left p-2.5 sm:p-3 rounded-xl bg-surface border border-border/80 hover:border-accent/40 active:bg-surface-raised flex items-center justify-between gap-3 transition-all hover:shadow-2xs cursor-pointer"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          {/* Left: Device icon / visual anchor */}
          <div className="w-9 h-9 rounded-xl bg-surface-raised border border-border/80 flex items-center justify-center shrink-0 text-fg-subtle group-hover:text-accent group-hover:border-accent/30 group-hover:bg-accent/10 transition-colors shadow-2xs">
            <Smartphone className="w-4.5 h-4.5" />
          </div>

          <div className="min-w-0 flex-1">
            {/* Line 1: Model (if visible) + Specs (Storage, RAM, Color) */}
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {!hideModelName && (
                <span className="text-xs sm:text-sm font-extrabold text-fg truncate mr-1">
                  {device.brand} {device.model}
                </span>
              )}

              {device.storage && (
                <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border text-xs font-black font-mono text-fg shadow-2xs shrink-0">
                  {formatStorage(device.storage)}
                </span>
              )}

              {showRamBadge && (
                <span className="px-1.5 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-[10px] font-bold font-mono text-accent shrink-0">
                  ОЗУ {formattedRam}
                </span>
              )}

              {device.color && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-raised/60 border border-border/60 text-[11px] font-medium text-fg-muted shrink-0 max-w-36 truncate">
                  {colorHex && (
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: colorHex }}
                    />
                  )}
                  <span className="truncate">{formatPhoneColor(device.color)}</span>
                </span>
              )}

              {device.isBonus && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-accent/15 text-accent border border-accent/25 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  Бонус
                </span>
              )}
            </div>

            {/* Line 2: Monospace IMEI + Location + Special Status */}
            <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle mt-1.5 flex-wrap">
              <ImeiBadge imei={device.imei} imei2={device.imei2} />

              {storeName && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                  isMainWarehouse
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/25'
                    : 'bg-accent/10 text-accent border-accent/25'
                }`}>
                  {isMainWarehouse ? <Warehouse className="w-3 h-3 shrink-0" /> : <Store className="w-3 h-3 shrink-0" />}
                  <span className="truncate max-w-36">{storeName}</span>
                </span>
              )}

              {showStatusBadge && (
                <Badge tone={STATUS_TONE[device.status] || 'neutral'}>
                  {STATUS_LABELS[device.status] || device.status}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Right: Price & Chevron */}
        <div className="text-right shrink-0 flex items-center gap-2">
          {device.isBonus || (isAdmin && device.purchaseCostUsd === 0) ? (
            <span className="text-xs font-black text-accent font-mono px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/20">
              Бонус ($0)
            </span>
          ) : isAdmin && device.purchaseCostUsd > 0 ? (
            <div className="text-right">
              <span className="text-xs sm:text-sm font-extrabold text-fg font-mono block leading-tight">
                {formatUsd(device.purchaseCostUsd)}
              </span>
            </div>
          ) : null}

          <div className="w-6 h-6 rounded-lg bg-surface-raised flex items-center justify-center text-fg-subtle group-hover:text-accent group-hover:bg-accent/10 transition-colors">
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </button>
    );
  }
);
DeviceRow.displayName = 'DeviceRow';
