import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Supplier, SupplierInvoice } from '../../types';
import { formatMoney } from '../../utils/money';
import { formatDateStr } from './types';
import {
  DollarSign,
  Edit,
  Trash2,
  X,
  FileText,
  ChevronRight,
  Truck,
} from 'lucide-react';

interface SupplierDetailsPanelProps {
  supplier: Supplier | null;
  invoices: SupplierInvoice[];
  onClose: () => void;
  onOpenPay: (supplier: Supplier) => void;
  onEditSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (supplier: Supplier) => void;
  onSelectInvoice: (invoiceId: string) => void;
  onEditInvoice: (invoice: SupplierInvoice, e?: React.MouseEvent) => void;
  onDeleteInvoice: (invoice: SupplierInvoice, e?: React.MouseEvent) => void;
}

export const SupplierDetailsPanel: React.FC<SupplierDetailsPanelProps> = ({
  supplier,
  invoices,
  onClose,
  onOpenPay,
  onEditSupplier,
  onDeleteSupplier,
  onSelectInvoice,
  onEditInvoice,
  onDeleteInvoice,
}) => {
  useEffect(() => {
    if (!supplier) return;
    document.documentElement.setAttribute('data-modal-open', '');
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.documentElement.removeAttribute('data-modal-open');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [supplier, onClose]);

  return (
    <>
      {/* Desktop Column */}
      <div className="hidden lg:flex lg:col-span-2 flex-col overflow-hidden bg-bg">
        {supplier ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Selected supplier summary header */}
            <div className="p-4 border-b border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div>
                <h4 className="text-base font-bold text-fg-muted">{supplier.name}</h4>
                <div className="flex items-center space-x-3 text-xs mt-1">
                  <span className="text-fg-muted">
                    Закуплено: <strong className="text-fg-muted">${formatMoney(supplier.totalPurchasedUsd)}</strong>
                  </span>
                  <span>•</span>
                  <span className="text-fg-muted">
                    Выплачено: <strong className="text-accent">${formatMoney(supplier.totalPaidUsd)}</strong>
                  </span>
                  <span>•</span>
                  <span className="text-fg-muted">
                    Остаток долга: <strong className="text-danger">${formatMoney(supplier.totalDebtUsd)}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onOpenPay(supplier)}
                  disabled={supplier.totalDebtUsd <= 0}
                  className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Погасить долг</span>
                </button>
                <button
                  type="button"
                  onClick={() => onEditSupplier(supplier)}
                  className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-muted hover:text-fg-muted transition-colors cursor-pointer"
                  title="Редактировать поставщика"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSupplier(supplier)}
                  className="p-2 rounded-lg bg-surface-raised hover:bg-danger/15 text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
                  title="Удалить поставщика"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg-muted cursor-pointer"
                  title="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Invoices List */}
            <div className="p-3 border-b border-border bg-surface-raised text-xs font-semibold text-fg-muted">
              Накладные и статус оплат
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
              {invoices.map((inv) => {
                const isPaid = inv.status === 'PAID';
                const isPartial = inv.status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={inv.id}
                    onClick={() => onSelectInvoice(inv.id)}
                    className="p-4 hover:bg-surface-raised cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-fg-muted group-hover:text-accent transition-colors">
                          {inv.invoiceNumber}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                            isPaid
                              ? 'bg-accent/15 text-accent border border-accent/30'
                              : isPartial
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-danger/15 text-danger border border-danger/30'
                          }`}
                        >
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                      </div>
                      <p className="text-[11px] text-fg-subtle mt-1">
                        Дата: {formatDateStr(inv.date)} • Устройств: {inv.devicesCount ?? 0} шт.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <p className="text-xs font-bold text-fg-muted">
                          Всего: ${formatMoney(inv.totalAmountUsd)}
                        </p>
                        <p className="text-[11px] text-danger">
                          Долг: ${formatMoney(inv.remainingAmountUsd)}
                        </p>
                        <p className="text-[10px] text-accent">
                          Оплачено: ${formatMoney(inv.paidAmountUsd)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => onEditInvoice(inv, e)}
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-accent border border-border transition-colors cursor-pointer"
                        title="Редактировать накладную"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => onDeleteInvoice(inv, e)}
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
                        title="Удалить накладную"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle group-hover:text-fg-muted border border-border"
                        title="Детали накладной"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-fg-subtle text-xs">
            <FileText className="w-8 h-8 opacity-30 mb-2" />
            <p>Выберите поставщика слева для просмотра накладных и выплат</p>
          </div>
        )}
      </div>

      {/* MOBILE FULL-SCREEN MODAL */}
      {supplier && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Карточка поставщика: ${supplier.name}`}
          className="app-safe-area lg:hidden fixed inset-0 z-50 bg-bg flex flex-col overflow-hidden animate-in fade-in duration-150"
        >
          {/* Header */}
          <div className="border-b border-border bg-surface shrink-0">
            <div className="w-full shrink-0" style={{ height: 'var(--sa-top)' }} />
            <div className="px-3.5 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-fg truncate">
                    {supplier.name}
                  </h3>
                  {supplier.phone && (
                    <p className="text-[11px] font-mono text-fg-subtle truncate">
                      {supplier.phone}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onEditSupplier(supplier)}
                  className="p-2 rounded-xl bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg border border-border transition-colors cursor-pointer"
                  title="Редактировать"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSupplier(supplier)}
                  className="p-2 rounded-xl bg-surface-raised hover:bg-danger/15 text-fg-subtle hover:text-danger border border-border transition-colors cursor-pointer"
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg border border-border transition-colors cursor-pointer"
                  title="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div className="p-3 bg-surface-raised/50 border-b border-border grid grid-cols-3 gap-2 text-center">
            <div className="bg-surface p-2.5 rounded-xl border border-border">
              <span className="block text-[10px] uppercase font-bold text-fg-subtle tracking-wider">Закуплено</span>
              <strong className="text-fg font-mono font-black text-xs sm:text-sm mt-0.5 block">
                ${formatMoney(supplier.totalPurchasedUsd)}
              </strong>
            </div>
            <div className="bg-surface p-2.5 rounded-xl border border-border">
              <span className="block text-[10px] uppercase font-bold text-fg-subtle tracking-wider">Выплачено</span>
              <strong className="text-accent font-mono font-black text-xs sm:text-sm mt-0.5 block">
                ${formatMoney(supplier.totalPaidUsd)}
              </strong>
            </div>
            <div className="bg-surface p-2.5 rounded-xl border border-border">
              <span className="block text-[10px] uppercase font-bold text-fg-subtle tracking-wider">Долг</span>
              <strong className="text-danger font-mono font-black text-xs sm:text-sm mt-0.5 block">
                ${formatMoney(supplier.totalDebtUsd)}
              </strong>
            </div>
          </div>

          {/* Action button */}
          <div className="p-3 bg-bg border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => onOpenPay(supplier)}
              disabled={supplier.totalDebtUsd <= 0}
              className="w-full h-11 rounded-xl bg-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-fg shadow-xs flex items-center justify-center space-x-2 transition-all active:scale-98 cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              <span>Погасить долг</span>
            </button>
          </div>

          {/* Invoices List */}
          <div className="p-2.5 px-3 bg-surface-raised border-b border-border text-xs font-semibold text-fg flex items-center justify-between">
            <span>Накладные поставщика</span>
            <span className="text-[11px] font-mono text-fg-subtle">{invoices.length} шт.</span>
          </div>

          <div className="flex-1 overflow-y-auto bg-bg p-2 space-y-1.5">
            {invoices.length === 0 ? (
              <div className="p-8 text-center text-fg-subtle text-xs">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>Накладных для этого поставщика пока нет</p>
              </div>
            ) : (
              invoices.map((inv) => {
                const isPaid = inv.status === 'PAID';
                const isPartial = inv.status === 'PARTIALLY_PAID';

                return (
                  <div
                    key={inv.id}
                    onClick={() => onSelectInvoice(inv.id)}
                    className="p-3 rounded-xl bg-surface hover:bg-surface-raised active:scale-[0.99] cursor-pointer transition-all flex items-center justify-between group border border-border shadow-2xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-fg group-hover:text-accent transition-colors font-mono">
                          {inv.invoiceNumber}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                            isPaid
                              ? 'bg-accent/15 text-accent border border-accent/30'
                              : isPartial
                              ? 'bg-warning/15 text-warning border border-warning/30'
                              : 'bg-danger/15 text-danger border border-danger/30'
                          }`}
                        >
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                      </div>
                      <p className="text-[11px] text-fg-subtle mt-0.5">
                        {formatDateStr(inv.date)} • {inv.devicesCount ?? 0} устройств
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-xs font-black font-mono text-fg">
                          ${formatMoney(inv.totalAmountUsd)}
                        </p>
                        <p className="text-[11px] font-mono text-danger font-bold">
                          Долг: ${formatMoney(inv.remainingAmountUsd)}
                        </p>
                      </div>
                      <div className="p-1 rounded-lg bg-surface-raised text-fg-subtle group-hover:text-fg border border-border">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Mobile Footer */}
          <div
            className="p-3 border-t border-border bg-surface shrink-0"
            style={{ paddingBottom: 'max(0.75rem, var(--sa-bottom))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-surface-raised hover:bg-surface active:scale-98 text-xs font-bold text-fg flex items-center justify-center space-x-2 transition-all border border-border cursor-pointer shadow-2xs"
            >
              <X className="w-4 h-4 text-fg-subtle" />
              <span>Закрыть карточку поставщика</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
