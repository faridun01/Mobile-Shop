import React, { useState } from 'react';
import {
  X,
  Printer,
  Copy,
  Check,
  Building2,
  Warehouse,
  Store as StoreIcon,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { TransferRequest, Device, Store, User } from '../../types';
import { Dialog } from '../ui/Dialog';
import { formatMoney } from '../../utils/money';
import { getTransferInvoiceItems, formatTransferInvoiceText } from '../../utils/transferInvoice';
import { isLocationWarehouse } from './types';
import { cn } from '../../utils/cn';

export interface TransferInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  transfer: TransferRequest | null;
  stores?: Store[];
  mainWarehouse?: Store;
  devicesById: Map<string, Device>;
  devicesByImei: Map<string, Device>;
  currentUser?: User | null;
  processingTransferId?: string | null;
  onApprove?: (transferId: string) => void;
  onRequestReject?: (transfer: TransferRequest) => void;
}

export const TransferInvoiceModal: React.FC<TransferInvoiceModalProps> = ({
  open,
  onClose,
  transfer,
  stores = [],
  mainWarehouse,
  devicesById,
  devicesByImei,
  currentUser,
  processingTransferId,
  onApprove,
  onRequestReject,
}) => {
  const [copied, setCopied] = useState(false);

  if (!open || !transfer) return null;

  const items = getTransferInvoiceItems(transfer, devicesById, devicesByImei);
  const totalCostUsd = items.reduce((sum, item) => sum + item.costUsd, 0);

  const formattedDate = new Date(transfer.requestedAt).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = new Date(transfer.requestedAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = () => {
    const text = formatTransferInvoiceText(transfer, devicesById, devicesByImei);
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const isToWarehouse = transfer.toLocationId === mainWarehouse?.id || transfer.toLocationName?.toLowerCase().includes('склад');
  const isFromWarehouse = transfer.fromLocationId === mainWarehouse?.id || transfer.fromLocationName?.toLowerCase().includes('склад');
  const involvesWarehouse = isToWarehouse || isFromWarehouse;
  const canApprove =
    transfer.status === 'PENDING_APPROVAL' &&
    (currentUser?.role === 'ADMIN' ||
      (currentUser?.role === 'PARTNER' && !involvesWarehouse && currentUser.storeId === transfer.toLocationId));

  return (
    <>
      {/* Embedded print styles specifically scoped for this invoice */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #transfer-invoice-sheet,
          #transfer-invoice-sheet * {
            visibility: visible !important;
          }
          #transfer-invoice-sheet {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: auto !important;
            margin: 0 !important;
            padding: 12mm 16mm !important;
            background: #ffffff !important;
            color: #111827 !important;
            border: none !important;
            box-shadow: none !important;
            z-index: 999999 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-border-black {
            border-color: #374151 !important;
          }
          .print-bg-gray {
            background-color: #f3f4f6 !important;
          }
          .print-text-black {
            color: #111827 !important;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>

      <Dialog
        open={open}
        onClose={onClose}
        title={`Накладная на перемещение №${transfer.transferNumber || transfer.id.slice(-6)}`}
        subtitle={`${transfer.fromLocationName} ➔ ${transfer.toLocationName} · ${formattedDate} ${formattedTime}`}
        maxWidth="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-accent" />
                <span>Печать накладной</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="px-3.5 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-accent" />
                    <span className="text-accent font-bold">Скопировано</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Скопировать текст</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {canApprove && (
                <>
                  {onRequestReject && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onRequestReject(transfer);
                      }}
                      disabled={processingTransferId === transfer.id}
                      className="px-3 py-2 rounded-xl bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Отклонить</span>
                    </button>
                  )}
                  {onApprove && (
                    <button
                      type="button"
                      onClick={() => onApprove(transfer.id)}
                      disabled={processingTransferId === transfer.id}
                      className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60 flex items-center gap-2"
                    >
                      {processingTransferId === transfer.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Принять перемещение</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        }
      >
        {/* Printable Document Container */}
        <div
          id="transfer-invoice-sheet"
          className="space-y-5 bg-surface text-fg rounded-xl p-4 sm:p-6 border border-border/80 shadow-2xs font-sans print-border-black print-bg-gray print-text-black"
        >
          {/* Header Block */}
          <div className="border-b border-border/80 pb-4 space-y-3 print-border-black">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-fg-subtle">
                  MOBILE SHOP · СИСТЕМА СКЛАДСКОГО УЧЁТА
                </div>
                <h1 className="text-base sm:text-lg font-black text-fg tracking-tight flex items-center gap-2 mt-0.5">
                  <FileText className="w-5 h-5 text-accent no-print" />
                  <span>НАКЛАДНАЯ НА ПЕРЕМЕЩЕНИЕ</span>
                  <span className="font-mono text-accent">№{transfer.transferNumber || transfer.id.slice(-6)}</span>
                </h1>
                <p className="text-xs text-fg-subtle mt-0.5">
                  Дата формирования: <strong>{formattedDate} в {formattedTime}</strong>
                </p>
              </div>

              {/* Status Stamp / Badge */}
              <div className="self-start sm:self-auto">
                {transfer.status === 'APPROVED' ? (
                  <div className="px-3 py-1.5 rounded-xl bg-accent/15 border border-accent/40 text-accent font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>ВЫПОЛНЕНО (ПРИНЯТО)</span>
                  </div>
                ) : transfer.status === 'PENDING_APPROVAL' ? (
                  <div className="px-3 py-1.5 rounded-xl bg-warning/15 border border-warning/40 text-warning font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                    <Clock className="w-4 h-4 animate-pulse" />
                    <span>ОЖИДАЕТ ПРИЁМКИ (В ПУТИ)</span>
                  </div>
                ) : (
                  <div className="px-3 py-1.5 rounded-xl bg-danger/15 border border-danger/40 text-danger font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                    <XCircle className="w-4 h-4" />
                    <span>ОТКЛОНЕНО</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Requisites Block: Sender & Receiver */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Sender */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-surface-raised/70 border border-border/80 space-y-1.5 print-border-black">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-fg-subtle">
                {isLocationWarehouse(stores, mainWarehouse, transfer.fromLocationId, transfer.fromLocationName) ? (
                  <Warehouse className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <StoreIcon className="w-3.5 h-3.5 text-accent" />
                )}
                <span>Отправитель (Сдал)</span>
              </div>
              <div className="font-bold text-sm text-fg">
                {transfer.fromLocationName || '—'}
              </div>
              <div className="text-xs text-fg-muted space-y-0.5 pt-0.5 border-t border-border/50 print-border-black">
                <div>
                  Ответственное лицо: <strong className="text-fg">{transfer.requestedBy || '—'}</strong>
                </div>
                <div>
                  Дата отправки: <span className="font-mono text-fg-subtle">{formattedDate} {formattedTime}</span>
                </div>
              </div>
            </div>

            {/* Receiver */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-surface-raised/70 border border-border/80 space-y-1.5 print-border-black">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-fg-subtle">
                {isLocationWarehouse(stores, mainWarehouse, transfer.toLocationId, transfer.toLocationName) ? (
                  <Warehouse className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <StoreIcon className="w-3.5 h-3.5 text-accent" />
                )}
                <span>Получатель (Принял)</span>
              </div>
              <div className="font-bold text-sm text-fg">
                {transfer.toLocationName || '—'}
              </div>
              <div className="text-xs text-fg-muted space-y-0.5 pt-0.5 border-t border-border/50 print-border-black">
                <div>
                  Ответственное лицо:{' '}
                  <strong className="text-fg">
                    {transfer.approvedBy || (transfer.status === 'PENDING_APPROVAL' ? 'Ожидает приёмки' : '—')}
                  </strong>
                </div>
                <div>
                  Дата приёмки:{' '}
                  <span className="font-mono text-fg-subtle">
                    {transfer.approvedAt ? new Date(transfer.approvedAt).toLocaleString('ru-RU') : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Rejection Banner if rejected */}
          {transfer.status === 'REJECTED' && transfer.rejectedReason && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Причина отклонения перемещения:</strong>
                <span className="text-[11px] text-danger/90">{transfer.rejectedReason}</span>
              </div>
            </div>
          )}

          {/* Table of Transfer Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-fg">
              <span>Список передаваемых товаров</span>
              <span className="font-mono text-accent">Всего: {items.length} шт.</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/80 print-border-black">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-raised border-b border-border/80 text-[11px] font-bold text-fg-subtle uppercase tracking-wider print-border-black">
                    <th className="py-2.5 px-3 w-10 text-center">№</th>
                    <th className="py-2.5 px-3">Наименование и спецификация</th>
                    <th className="py-2.5 px-3">IMEI / Серийный номер</th>
                    <th className="py-2.5 px-3 w-16 text-center">Кол-во</th>
                    <th className="py-2.5 px-3 w-28 text-right">Оценка ($)</th>
                    <th className="py-2.5 px-3 w-28 text-right">Сумма ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 print-border-black">
                  {items.map((it) => (
                    <tr key={it.index} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-fg-subtle">
                        {it.index}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-fg">
                          {it.fullName}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[10px]">
                          {it.storage && (
                            <span className="px-1.5 py-0.2 rounded bg-surface border border-border font-mono font-bold text-fg">
                              {it.storage}
                            </span>
                          )}
                          {it.ram && (
                            <span className="px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20 font-mono font-bold text-accent">
                              ОЗУ {it.ram}
                            </span>
                          )}
                          {it.color && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface border border-border/60 text-fg-muted">
                              {it.colorHex && (
                                <span
                                  className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: it.colorHex }}
                                />
                              )}
                              <span>{it.color}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-fg bg-surface px-2 py-0.5 rounded border border-border/70 text-[11px]">
                          {it.imei}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-fg">
                        1 шт.
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-fg-muted">
                        {it.costUsd > 0 ? `$${formatMoney(it.costUsd)}` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-fg">
                        {it.costUsd > 0 ? `$${formatMoney(it.costUsd)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-raised/80 font-bold border-t-2 border-border print-border-black">
                    <td colSpan={3} className="py-2.5 px-3 text-fg uppercase text-[11px] tracking-wider">
                      Итого по накладной
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-accent">
                      {items.length} шт.
                    </td>
                    <td className="py-2.5 px-3 text-right text-fg-subtle text-[11px]">
                      Всего:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm text-accent font-black">
                      ${formatMoney(totalCostUsd)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Signatures & Disclaimers Block */}
          <div className="pt-4 border-t border-border/80 space-y-4 print-border-black">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 pt-2">
              {/* Sender Signature */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-fg uppercase tracking-wider">
                  Отпустил (Сдал):
                </div>
                <div className="pt-6 border-b border-fg-muted/60 flex items-center justify-between text-xs text-fg-subtle">
                  <span>Подпись</span>
                  <span className="font-bold text-fg">{transfer.requestedBy || '________________'}</span>
                </div>
                <div className="text-[10px] text-fg-subtle">
                  М.П. / Дата: {formattedDate}
                </div>
              </div>

              {/* Receiver Signature */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-fg uppercase tracking-wider">
                  Принял (Получил):
                </div>
                <div className="pt-6 border-b border-fg-muted/60 flex items-center justify-between text-xs text-fg-subtle">
                  <span>Подпись</span>
                  <span className="font-bold text-fg">
                    {transfer.approvedBy || (transfer.status === 'PENDING_APPROVAL' ? '________________' : '—')}
                  </span>
                </div>
                <div className="text-[10px] text-fg-subtle">
                  М.П. / Дата:{' '}
                  {transfer.approvedAt
                    ? new Date(transfer.approvedAt).toLocaleDateString('ru-RU')
                    : '____.____.________'}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-fg-subtle leading-relaxed italic pt-2">
              Товары переданы в полной комплектации, исправном техническом состоянии и без внешних механических повреждений.
              Принимающая сторона подтверждает совпадение всех указанных в накладной идентификаторов (IMEI).
            </p>
          </div>
        </div>
      </Dialog>
    </>
  );
};
