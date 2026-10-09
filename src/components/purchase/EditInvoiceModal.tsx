import React, { useState, useEffect, useMemo } from 'react';
import { SupplierInvoice, Device, Supplier, Store } from '../../types';
import { formatMoney } from '../../utils/money';
import { getPhoneColorHex, formatRam, formatStorage, formatPhoneColor } from '../../utils/phoneSpecs';
import { formatStoreName } from '../../utils/storeContext';
import {
  Receipt,
  X,
  Hash,
  Calendar,
  DollarSign,
  Check,
  Loader2,
  Package,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Sparkles,
  Smartphone,
} from 'lucide-react';

interface EditInvoiceModalProps {
  invoice: SupplierInvoice | null;
  devices?: Device[];
  suppliers?: Supplier[];
  stores?: Store[];
  onClose: () => void;
  onSave: (id: string, data: { invoiceNumber: string; date: string; totalAmountUsd: number }) => Promise<{ success: boolean; message?: string }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

interface GoodsGroup {
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  unitPriceUsd: number;
  isBonus?: boolean;
  bonusCampaign?: string;
  quantity: number;
  totalPriceUsd: number;
  devices: Device[];
}

export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({
  invoice,
  devices = [],
  suppliers = [],
  stores = [],
  onClose,
  onSave,
  onSuccess,
  onError,
}) => {
  const [editInvoiceNum, setEditInvoiceNum] = useState('');
  const [editInvoiceDateStr, setEditInvoiceDateStr] = useState('');
  const [editInvoiceAmountUsd, setEditInvoiceAmountUsd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedImei, setCopiedImei] = useState<string | null>(null);

  useEffect(() => {
    if (invoice) {
      setEditInvoiceNum(invoice.invoiceNumber);
      setEditInvoiceDateStr(invoice.date ? invoice.date.split('T')[0] : '');
      setEditInvoiceAmountUsd((invoice.totalAmountUsd || 0).toString());
    }
  }, [invoice]);

  const containedDevices = useMemo(() => {
    if (!invoice || !devices) return [];
    return devices.filter(
      (d) =>
        (invoice.id && d.purchaseInvoiceId === invoice.id) ||
        (d.invoiceNumber && d.invoiceNumber === invoice.invoiceNumber)
    );
  }, [invoice, devices]);

  const goodsGroups = useMemo<GoodsGroup[]>(() => {
    if (!invoice) return [];

    if (containedDevices.length > 0) {
      const map = new Map<string, GoodsGroup>();
      for (const dev of containedDevices) {
        const isBonus = Boolean(dev.isBonus || dev.purchaseCostUsd === 0);
        const cost = isBonus ? 0 : dev.purchaseCostUsd || 0;
        const normColor = formatPhoneColor(dev.color);
        const key = `${dev.brand}|${dev.model}|${dev.ram || ''}|${dev.storage}|${normColor}|${cost}`;
        let g = map.get(key);
        if (!g) {
          g = {
            brand: dev.brand,
            model: dev.model,
            ram: dev.ram,
            storage: dev.storage,
            color: normColor,
            unitPriceUsd: cost,
            isBonus,
            bonusCampaign: dev.bonusCampaign,
            quantity: 0,
            totalPriceUsd: 0,
            devices: [],
          };
          map.set(key, g);
        }
        g.devices.push(dev);
        g.quantity += 1;
        g.totalPriceUsd += cost;
      }
      return Array.from(map.values());
    }

    if (Array.isArray(invoice.groups) && invoice.groups.length > 0) {
      return invoice.groups.map((g) => ({
        brand: g.brand,
        model: g.model,
        ram: g.ram,
        storage: g.storage,
        color: g.color,
        unitPriceUsd: g.purchasePriceUsd,
        isBonus: g.purchasePriceUsd === 0,
        quantity: g.quantity,
        totalPriceUsd: g.purchasePriceUsd * g.quantity,
        devices: [],
      }));
    }

    return [];
  }, [invoice, containedDevices]);

  const totalGoodsCostUsd = useMemo(() => {
    return goodsGroups.reduce((sum, g) => sum + g.totalPriceUsd, 0);
  }, [goodsGroups]);

  const totalDevicesCount = useMemo(() => {
    if (containedDevices.length > 0) return containedDevices.length;
    if (goodsGroups.length > 0) return goodsGroups.reduce((sum, g) => sum + g.quantity, 0);
    return invoice?.devicesCount || 0;
  }, [containedDevices, goodsGroups, invoice]);

  if (!invoice) return null;

  const supplierName =
    invoice.supplierName ||
    suppliers.find((s) => s.id === invoice.supplierId)?.name ||
    'Поставщик';
  const store = stores.find((s) => s.id === invoice.storeId);
  const storeName = store
    ? store.name
    : invoice.isStorePurchase
    ? 'Розничный магазин'
    : 'Главный склад';

  const handleCopyImei = (imei: string) => {
    if (!imei) return;
    navigator.clipboard?.writeText(imei);
    setCopiedImei(imei);
    setTimeout(() => {
      setCopiedImei((prev) => (prev === imei ? null : prev));
    }, 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await onSave(invoice.id, {
        invoiceNumber: editInvoiceNum.trim(),
        date: editInvoiceDateStr,
        totalAmountUsd: parseFloat(editInvoiceAmountUsd) || 0,
      });
      if (res.success) {
        onSuccess('Накладная успешно обновлена!');
        onClose();
      } else {
        onError(res.message || 'Ошибка обновления накладной');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-invoice-title"
        className="modal-card w-full max-w-2xl lg:max-w-4xl rounded-2xl bg-surface border border-border shadow-2xl flex flex-col max-h-[min(92vh,var(--visual-viewport-height,92vh))] text-fg font-sans text-xs"
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-border/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center shrink-0 shadow-2xs">
              <Receipt className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  id="edit-invoice-title"
                  className="text-xs sm:text-sm font-bold text-fg uppercase tracking-wide truncate"
                >
                  Редактировать накладную #{invoice.invoiceNumber}
                </h3>
                {invoice.status === 'PAID' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Оплачена
                  </span>
                ) : invoice.status === 'PARTIALLY_PAID' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30 font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Частично (${formatMoney(invoice.paidAmountUsd || 0)})
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-danger/15 text-danger border border-danger/30 font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Не оплачена (долг)
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-fg-subtle truncate">
                Просмотр состава партии, устройств в чеке и изменение параметров
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
        <div className="p-3.5 sm:p-5 space-y-4 overflow-y-auto">
          {/* Two-column layout on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* LEFT COLUMN: Parameters Form */}
            <div className="md:col-span-5 space-y-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg uppercase tracking-wider">
                <Receipt className="w-3.5 h-3.5 text-accent" />
                <span>Параметры накладной</span>
              </div>

              {/* Context Summary Box */}
              <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-fg-subtle">Поставщик:</span>
                  <strong className="text-fg truncate max-w-44 text-right">{supplierName}</strong>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-fg-subtle">Склад приёма:</span>
                  <span className="text-accent font-semibold flex items-center gap-1">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span>{formatStoreName(storeName)}</span>
                  </span>
                </div>
                <div className="pt-2 border-t border-border/70 flex items-center justify-between text-[11px]">
                  <span className="text-fg-subtle">Оплачено:</span>
                  <span className="font-mono font-bold text-accent">
                    ${formatMoney(invoice.paidAmountUsd || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-fg-subtle">Остаток долга:</span>
                  <span
                    className={`font-mono font-bold ${
                      (invoice.remainingAmountUsd || 0) > 0 ? 'text-danger' : 'text-fg-subtle'
                    }`}
                  >
                    ${formatMoney(invoice.remainingAmountUsd || 0)}
                  </span>
                </div>
              </div>

              <form id="edit-invoice-form" onSubmit={handleSubmit} className="space-y-3">
                {/* Invoice Number */}
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1 flex items-center justify-between">
                    <span>Номер накладной</span>
                    <span className="text-[10px] text-accent font-semibold font-mono">Обязательно</span>
                  </label>
                  <div className="relative">
                    <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                      <Hash className="w-4 h-4 text-accent" />
                    </div>
                    <input
                      type="text"
                      required
                      value={editInvoiceNum}
                      onChange={(e) => setEditInvoiceNum(e.target.value)}
                      placeholder="Например, INV-0022"
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-raised border border-border text-base sm:text-sm font-bold font-mono text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>

                {/* Invoice Date */}
                <div>
                  <label className="block text-xs font-semibold text-fg-muted mb-1 flex items-center justify-between">
                    <span>Дата накладной</span>
                    <span className="text-[10px] text-fg-subtle font-mono">ГГГГ-ММ-ДД</span>
                  </label>
                  <div className="relative">
                    <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                      <Calendar className="w-4 h-4 text-accent" />
                    </div>
                    <input
                      type="date"
                      required
                      value={editInvoiceDateStr}
                      onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-raised border border-border text-base sm:text-sm font-semibold text-fg focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>

                {/* Invoice Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-fg-muted">Сумма накладной ($ USD)</label>
                    {totalGoodsCostUsd > 0 &&
                      Math.abs((parseFloat(editInvoiceAmountUsd) || 0) - totalGoodsCostUsd) > 0.01 && (
                        <button
                          type="button"
                          onClick={() => setEditInvoiceAmountUsd(String(totalGoodsCostUsd))}
                          className="text-[10px] font-bold text-accent hover:underline cursor-pointer"
                          title="Подставить точную сумму по всем товарам в чеке"
                        >
                          По товарам: ${formatMoney(totalGoodsCostUsd)}
                        </button>
                      )}
                  </div>
                  <div className="relative">
                    <div className="w-9 h-full absolute left-0 top-0 flex items-center justify-center text-fg-subtle pointer-events-none">
                      <DollarSign className="w-4 h-4 text-accent" />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      required
                      min="0"
                      value={editInvoiceAmountUsd}
                      onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-9 pr-14 py-2 rounded-xl bg-surface-raised border border-border text-base sm:text-sm font-bold font-mono text-accent focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-bold font-mono text-fg-subtle pointer-events-none">
                      USD
                    </div>
                  </div>
                </div>
              </form>
            </div>

            {/* RIGHT COLUMN: Goods in receipt */}
            <div className="md:col-span-7 space-y-3">
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-border/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-fg uppercase tracking-wider">
                  <Package className="w-3.5 h-3.5 text-accent" />
                  <span>Товары в чеке</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-md bg-surface-raised border border-border font-mono font-bold text-accent">
                    {totalDevicesCount} шт.
                  </span>
                  <span className="font-mono font-bold text-fg">
                    ${formatMoney(totalGoodsCostUsd || parseFloat(editInvoiceAmountUsd) || 0)}
                  </span>
                </div>
              </div>

              {/* Items List */}
              {goodsGroups.length === 0 ? (
                <div className="p-6 text-center text-fg-subtle rounded-xl bg-surface-raised/40 border border-border/60 space-y-1.5">
                  <Smartphone className="w-7 h-7 mx-auto opacity-30 text-fg-subtle" />
                  <p className="font-semibold text-fg text-xs">Список устройств в памяти не найден</p>
                  <p className="text-[11px]">
                    Накладная содержит {invoice.devicesCount || 0} шт. на общую сумму $
                    {formatMoney(invoice.totalAmountUsd)}.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] md:max-h-[420px] overflow-y-auto pr-0.5 scrollbar-thin">
                  {goodsGroups.map((group, gIdx) => {
                    const colorHex = getPhoneColorHex(group.color);
                    const formattedR = formatRam(group.ram);
                    const formattedS = formatStorage(group.storage);

                    return (
                      <div
                        key={gIdx}
                        className="p-3 rounded-xl bg-surface-raised border border-border hover:border-accent/40 transition-colors shadow-2xs space-y-2 text-xs"
                      >
                        {/* Group Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono text-fg-subtle font-bold">
                                #{gIdx + 1}
                              </span>
                              <strong className="text-fg font-bold text-xs sm:text-sm">
                                {group.brand} {group.model}
                              </strong>
                              {group.isBonus && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-highlight/20 text-highlight border border-highlight/40 font-bold flex items-center gap-0.5">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Подарок
                                </span>
                              )}
                            </div>

                            {/* Specs Chips */}
                            <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px]">
                              {formattedS && (
                                <span className="px-1.5 py-0.2 rounded bg-surface border border-border font-bold font-mono text-fg">
                                  {formattedS}
                                </span>
                              )}
                              {formattedR && (
                                <span className="px-1.5 py-0.2 rounded bg-accent/10 border border-accent/25 font-bold font-mono text-accent">
                                  ОЗУ {formattedR}
                                </span>
                              )}
                              {group.color && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-surface border border-border/70 text-fg-muted">
                                  {colorHex && (
                                    <span
                                      className="w-2 h-2 rounded-full border border-black/20 shrink-0"
                                      style={{ backgroundColor: colorHex }}
                                    />
                                  )}
                                  <span>{formatPhoneColor(group.color)}</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-xs sm:text-sm font-bold font-mono text-accent">
                              {group.isBonus ? '$0' : `$${formatMoney(group.totalPriceUsd)}`}
                            </div>
                            <span className="text-[10px] text-fg-subtle block font-mono">
                              {group.quantity} шт.{' '}
                              {group.isBonus ? '' : `× $${formatMoney(group.unitPriceUsd)}`}
                            </span>
                          </div>
                        </div>

                        {/* List of Device IMEIs in this group */}
                        {group.devices.length > 0 && (
                          <div className="pt-2 border-t border-border/70 space-y-1.5">
                            <span className="text-[10px] uppercase font-semibold text-fg-subtle block">
                              IMEI устройств ({group.devices.length}):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {group.devices.map((d, dIdx) => (
                                <div
                                  key={d.id || dIdx}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface border border-border/80 text-[10px] font-mono text-fg-muted"
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleCopyImei(d.imei)}
                                    className="hover:text-accent flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Нажмите чтобы скопировать IMEI"
                                  >
                                    <span className="text-fg-subtle text-[9px] font-sans">IMEI:</span>
                                    <strong className="text-fg">{d.imei}</strong>
                                    {copiedImei === d.imei ? (
                                      <span className="text-accent flex items-center gap-0.5 text-[9px] font-sans font-bold">
                                        <Check className="w-2.5 h-2.5" />
                                      </span>
                                    ) : (
                                      <Copy className="w-2.5 h-2.5 text-fg-subtle opacity-60 hover:opacity-100" />
                                    )}
                                  </button>

                                  {d.imei2 && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyImei(d.imei2!)}
                                      className="hover:text-accent flex items-center gap-1 cursor-pointer transition-colors border-l border-border/60 pl-1.5"
                                      title="Нажмите чтобы скопировать IMEI 2"
                                    >
                                      <span className="text-fg-subtle text-[9px] font-sans">2:</span>
                                      <strong className="text-fg">{d.imei2}</strong>
                                      {copiedImei === d.imei2 ? (
                                        <Check className="w-2.5 h-2.5 text-accent" />
                                      ) : (
                                        <Copy className="w-2.5 h-2.5 text-fg-subtle opacity-60 hover:opacity-100" />
                                      )}
                                    </button>
                                  )}

                                  <span
                                    className={`text-[9px] font-bold px-1 rounded ${
                                      d.status === 'SOLD'
                                        ? 'bg-warning/15 text-warning'
                                        : 'bg-accent/15 text-accent'
                                    }`}
                                  >
                                    {d.status === 'SOLD' ? 'Продан' : 'В наличии'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-3.5 sm:p-4 border-t border-border/80 bg-surface flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-fg-subtle hidden sm:block">
            {totalDevicesCount > 0 ? (
              <span>
                В чеке:{' '}
                <strong className="text-fg font-mono font-bold">
                  {totalDevicesCount} устройств
                </strong>{' '}
                на сумму{' '}
                <strong className="text-accent font-mono font-bold">
                  $
                  {formatMoney(
                    totalGoodsCostUsd || parseFloat(editInvoiceAmountUsd) || 0
                  )}
                </strong>
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer min-h-[38px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center uppercase"
            >
              Отмена
            </button>
            <button
              type="submit"
              form="edit-invoice-form"
              disabled={isSubmitting}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg shadow-xs hover:shadow-md transition-all cursor-pointer min-h-[38px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 uppercase"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Сохранение…</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Сохранить</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
