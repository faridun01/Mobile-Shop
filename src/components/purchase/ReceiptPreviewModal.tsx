import React, { useState, useMemo, useEffect } from 'react';
import { Supplier, Store } from '../../types';
import { PurchasePreviewData, formatInvoiceDate } from './types';
import { formatMoney } from '../../utils/money';
import {
  FileText,
  X,
  CheckCircle2,
  Loader2,
  Building2,
  AlertTriangle,
  Wallet,
  Clock,
  ArrowDownLeft,
} from 'lucide-react';

interface ReceiptPreviewModalProps {
  previewInvoice: PurchasePreviewData | null;
  suppliers: Supplier[];
  stores: Store[];
  onClose: () => void;
  onConfirm: (paidAmountUsd: number) => void;
  isSubmitting: boolean;
}

type PaymentMode = 'DEBT' | 'FULL' | 'PARTIAL';

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
  previewInvoice,
  suppliers,
  stores,
  onClose,
  onConfirm,
  isSubmitting,
}) => {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('FULL');
  const [customAmountStr, setCustomAmountStr] = useState<string>('');

  const centralStore = useMemo(() => {
    return stores.find((s) => s.isMainWarehouse) || stores[0];
  }, [stores]);

  const centralCashBalance = Number(centralStore?.cashBalanceUsd || 0);

  const totalInvoiceUsd = useMemo(() => {
    if (!previewInvoice) return 0;
    return previewInvoice.groups.reduce(
      (sum, g) => sum + g.items.length * g.purchasePriceUsd,
      0
    );
  }, [previewInvoice]);

  // Set default payment mode based on central cash availability
  useEffect(() => {
    if (previewInvoice) {
      if (centralCashBalance >= totalInvoiceUsd && totalInvoiceUsd > 0) {
        setPaymentMode('FULL');
      } else {
        setPaymentMode('DEBT');
      }
      setCustomAmountStr('');
    }
  }, [previewInvoice, centralCashBalance, totalInvoiceUsd]);

  const effectivePaidUsd = useMemo(() => {
    if (!previewInvoice) return 0;
    if (paymentMode === 'DEBT') return 0;
    if (paymentMode === 'FULL') return totalInvoiceUsd;
    const parsed = parseFloat(customAmountStr);
    return isNaN(parsed) ? 0 : Math.max(0, parsed);
  }, [previewInvoice, paymentMode, customAmountStr, totalInvoiceUsd]);

  if (!previewInvoice) return null;

  const remainingDebtUsd = Math.max(0, Math.round((totalInvoiceUsd - effectivePaidUsd) * 100) / 100);
  const remainingCashUsd = Math.round((centralCashBalance - effectivePaidUsd) * 100) / 100;
  const isCashInsufficient = effectivePaidUsd > centralCashBalance;
  const isAmountOverTotal = effectivePaidUsd > totalInvoiceUsd;
  const isInvalid = isCashInsufficient || isAmountOverTotal || (paymentMode === 'PARTIAL' && effectivePaidUsd <= 0);

  const handleSelectMode = (mode: PaymentMode) => {
    setPaymentMode(mode);
    if (mode === 'PARTIAL' && !customAmountStr) {
      // Default partial amount to 50% or available cash
      const half = Math.min(totalInvoiceUsd, Math.round(totalInvoiceUsd / 2));
      setCustomAmountStr(String(Math.min(half, Math.max(0, centralCashBalance))));
    }
  };

  const handleApplyPreset = (amt: number) => {
    setPaymentMode('PARTIAL');
    setCustomAmountStr(String(Math.max(0, Math.min(totalInvoiceUsd, amt))));
  };

  const handleConfirmClick = () => {
    if (isInvalid || isSubmitting) return;
    onConfirm(effectivePaidUsd);
  };

  const totalUnits = previewInvoice.groups.reduce((a, b) => a + b.items.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-preview-title"
        className="modal-card w-full max-w-lg rounded-2xl bg-surface border border-border shadow-2xl flex flex-col max-h-[min(92vh,var(--visual-viewport-height,92vh))] text-fg font-sans text-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-border shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-2 rounded-xl bg-accent/15 text-accent border border-accent/30 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="receipt-preview-title" className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide truncate">
                Чек прихода и оплата
              </h3>
              <p className="text-[10px] text-fg-subtle truncate">
                Централизованный приём на Главный склад
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto">
          {/* Metadata Card */}
          <div className="grid grid-cols-2 gap-2 p-2.5 sm:p-3 rounded-xl bg-surface-raised border border-border text-xs">
            <div>
              <span className="block text-[10px] text-fg-subtle uppercase font-semibold">Поставщик</span>
              <span className="font-bold text-fg truncate block">
                {suppliers.find((s) => s.id === previewInvoice.supplierId)?.name || '—'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-fg-subtle uppercase font-semibold">Накладная</span>
              <span className="font-bold font-mono text-fg truncate block">{previewInvoice.invoiceNumber}</span>
            </div>
            <div>
              <span className="block text-[10px] text-fg-subtle uppercase font-semibold">Дата</span>
              <span className="font-medium font-mono text-fg-muted">{formatInvoiceDate(previewInvoice.date)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-fg-subtle uppercase font-semibold">Склад приёма</span>
              <span className="font-bold text-accent flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>Главный склад</span>
              </span>
            </div>
          </div>

          {/* Items Summary Accordion/List */}
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden bg-surface-raised/30 max-h-48 overflow-y-auto">
            {previewInvoice.groups.map((g, idx) => (
              <div key={idx} className="p-2.5 sm:p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-fg text-xs truncate">
                    {g.brand} {g.model}
                  </p>
                  <p className="text-[11px] text-fg-muted mt-0.5 truncate">
                    {[g.ram, g.storage, g.color].filter(Boolean).join(' • ')}
                  </p>
                  <p className="text-[10px] text-fg-subtle mt-0.5">
                    {g.items.length} шт. × ${formatMoney(g.purchasePriceUsd)}
                  </p>
                </div>
                <span className="font-bold font-mono text-fg shrink-0 text-xs sm:text-sm">
                  ${formatMoney(g.items.length * g.purchasePriceUsd)}
                </span>
              </div>
            ))}
          </div>

          {/* Subtotal */}
          <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-surface-raised border border-border">
            <span className="text-fg-muted text-xs">
              Всего устройств: <strong className="text-fg font-bold font-mono">{totalUnits} шт.</strong>
            </span>
            <div className="text-right">
              <span className="text-[10px] text-fg-subtle block uppercase font-semibold">Итого за партию</span>
              <span className="text-sm sm:text-base font-bold text-accent font-mono">
                ${formatMoney(totalInvoiceUsd)}
              </span>
            </div>
          </div>

          {/* CENTRALIZED PAYMENT SECTION */}
          <div className="p-3 sm:p-3.5 rounded-xl bg-surface border border-accent/30 shadow-xs space-y-2.5">
            {/* Central Cash Header */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/80">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-fg uppercase tracking-wide">
                      Оплата поставщику
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-accent/15 border border-accent/30 text-accent uppercase shrink-0">
                      Центральная касса
                    </span>
                  </div>
                  <span className="text-[11px] text-fg-subtle block">
                    Доступно в кассе склада: <strong className="text-accent font-mono font-bold">${formatMoney(centralCashBalance)}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-surface-raised border border-border text-xs">
              <button
                type="button"
                onClick={() => handleSelectMode('DEBT')}
                className={`py-2 px-1.5 rounded-lg font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  paymentMode === 'DEBT'
                    ? 'bg-surface text-danger shadow-xs border border-danger/30'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <div className="flex items-center gap-1 text-[11px]">
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>В долг</span>
                </div>
                <span className="text-[10px] font-mono opacity-80">$0.00</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('FULL')}
                className={`py-2 px-1.5 rounded-lg font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  paymentMode === 'FULL'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <div className="flex items-center gap-1 text-[11px]">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>Полностью</span>
                </div>
                <span className="text-[10px] font-mono opacity-90">${formatMoney(totalInvoiceUsd)}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectMode('PARTIAL')}
                className={`py-2 px-1.5 rounded-lg font-bold transition-all text-center cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  paymentMode === 'PARTIAL'
                    ? 'bg-surface text-warning shadow-xs border border-warning/40'
                    : 'text-fg-subtle hover:text-fg'
                }`}
              >
                <div className="flex items-center gap-1 text-[11px]">
                  <ArrowDownLeft className="w-3 h-3 shrink-0" />
                  <span>Частично</span>
                </div>
                <span className="text-[10px] font-mono opacity-80">Указать $</span>
              </button>
            </div>

            {/* Partial Input Box & Presets */}
            {paymentMode === 'PARTIAL' && (
              <div className="space-y-2 pt-1 animate-in fade-in-50 duration-150">
                <div className="relative">
                  <label className="block text-fg-subtle text-[10px] uppercase font-semibold mb-1">
                    Сумма списания из центральной кассы ($ USD) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={totalInvoiceUsd}
                      value={customAmountStr}
                      onChange={(e) => setCustomAmountStr(e.target.value)}
                      placeholder="Укажите сумму..."
                      className={`w-full rounded-xl bg-surface-raised border px-3 py-2 text-base sm:text-sm font-bold font-mono focus:outline-none pr-8 ${
                        isCashInsufficient || isAmountOverTotal
                          ? 'border-danger text-danger focus:border-danger'
                          : 'border-border text-accent focus:border-accent'
                      }`}
                    />
                    <span className="absolute right-3 top-2.5 text-fg-subtle font-bold font-mono">$</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono font-semibold">
                  <span className="text-fg-subtle text-[10px] font-sans mr-0.5">Быстро:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(Math.round(totalInvoiceUsd * 0.25))}
                    className="px-2 py-1 rounded-md bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg cursor-pointer"
                  >
                    25% (${formatMoney(Math.round(totalInvoiceUsd * 0.25))})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(Math.round(totalInvoiceUsd * 0.5))}
                    className="px-2 py-1 rounded-md bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg cursor-pointer"
                  >
                    50% (${formatMoney(Math.round(totalInvoiceUsd * 0.5))})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(Math.round(totalInvoiceUsd * 0.75))}
                    className="px-2 py-1 rounded-md bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg cursor-pointer"
                  >
                    75% (${formatMoney(Math.round(totalInvoiceUsd * 0.75))})
                  </button>
                  {centralCashBalance > 0 && centralCashBalance < totalInvoiceUsd && (
                    <button
                      type="button"
                      onClick={() => handleApplyPreset(centralCashBalance)}
                      className="px-2 py-1 rounded-md bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 cursor-pointer"
                    >
                      Вся касса (${formatMoney(centralCashBalance)})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Error Banner */}
            {isCashInsufficient && (
              <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  <strong>Недостаточно средств в Центральной кассе!</strong> Доступно только{' '}
                  <span className="font-mono font-bold">${formatMoney(centralCashBalance)}</span>. Уменьшите сумму
                  оплаты или оформите приход частично/в долг.
                </div>
              </div>
            )}

            {isAmountOverTotal && (
              <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/25 text-danger text-[11px] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  Сумма оплаты (${formatMoney(effectivePaidUsd)}) не может превышать стоимость партии ($
                  {formatMoney(totalInvoiceUsd)}).
                </div>
              </div>
            )}

            {/* Balance Delta Summary Breakdown */}
            <div className="p-2.5 rounded-xl bg-surface-raised/70 border border-border text-xs space-y-1">
              <div className="flex items-center justify-between text-fg-muted">
                <span className="text-[11px]">К списанию из Центральной кассы:</span>
                <span
                  className={`font-mono font-bold ${
                    effectivePaidUsd > 0 ? (isCashInsufficient ? 'text-danger' : 'text-accent') : 'text-fg-subtle'
                  }`}
                >
                  {effectivePaidUsd > 0 ? `-$${formatMoney(effectivePaidUsd)}` : '$0.00'}
                </span>
              </div>

              <div className="flex items-center justify-between text-fg-muted">
                <span className="text-[11px]">Останется долг поставщику:</span>
                <span
                  className={`font-mono font-bold ${
                    remainingDebtUsd > 0 ? 'text-warning' : 'text-accent'
                  }`}
                >
                  {remainingDebtUsd > 0 ? `$${formatMoney(remainingDebtUsd)}` : '$0.00 (Оплачено 100%)'}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[11px]">
                <span className="text-fg-subtle">Остаток в кассе после списания:</span>
                <span
                  className={`font-mono font-bold ${
                    remainingCashUsd < 0 ? 'text-danger' : 'text-fg'
                  }`}
                >
                  ${formatMoney(remainingCashUsd)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex space-x-2 p-3.5 sm:p-4 border-t border-border shrink-0">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg font-bold uppercase transition-colors disabled:opacity-50 cursor-pointer"
          >
            Изменить
          </button>
          <button
            type="button"
            disabled={isSubmitting || isInvalid}
            onClick={handleConfirmClick}
            className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-colors cursor-pointer uppercase"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Проведение…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {effectivePaidUsd > 0
                    ? `Оплатить $${formatMoney(effectivePaidUsd)} и принять`
                    : 'Принять в долг ($0)'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
