import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Lock, Package, Receipt, Smartphone } from 'lucide-react';
import type { SupplierInvoice } from '../../types';
import { apiClient } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';
import { formatMoney } from '../../utils/money';
import { formatPhoneColor, formatRam, formatStorage } from '../../utils/phoneSpecs';
import { formatStoreName } from '../../utils/storeContext';
import { groupInvoiceDevices, invoiceEditResult, type InvoiceContents } from '../../utils/invoiceEdit';

export interface InvoiceSaveData {
  invoiceNumber: string;
  date: string;
  prices: { deviceId: string; purchasePriceUsd: number }[];
  accessoryCosts: { batchId: string; unitCostUsd: number }[];
}

interface EditInvoiceModalProps {
  invoice: SupplierInvoice | null;
  onClose: () => void;
  onSave: (id: string, data: InvoiceSaveData) => Promise<{ success: boolean; message?: string; refundUsd?: number }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const priceInput = 'w-24 h-9 px-2 rounded-lg bg-surface border border-border text-right font-mono font-bold text-sm text-fg focus:border-accent focus:outline-none';

/**
 * Edits a purchase invoice: its number, date and the purchase price of each model or accessory
 * batch still in stock (moved to a store or not). A sold phone keeps its price. The summary shows
 * what saving does: the change is owed to the supplier, or the part paid above the new total comes
 * back to the Central Cash.
 */
export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({ invoice, onClose, onSave, onSuccess, onError }) => {
  const [contents, setContents] = useState<InvoiceContents | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [groupPrices, setGroupPrices] = useState<Record<string, string>>({});
  const [batchCosts, setBatchCosts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setContents(null);
    setLoadError(null);
    if (!invoice) return;
    setNumber(invoice.invoiceNumber);
    setDate(invoice.date ? invoice.date.split('T')[0] : '');
    let cancelled = false;
    apiClient<InvoiceContents>(`/supplier-invoices/${invoice.id}/contents`)
      .then((data) => {
        if (cancelled) return;
        const normalized: InvoiceContents = {
          ...data,
          invoice: { ...data.invoice, totalAmountUsd: Number(data.invoice.totalAmountUsd), paidAmountUsd: Number(data.invoice.paidAmountUsd) },
          devices: data.devices.map((d) => ({ ...d, purchasePriceUsd: Number(d.purchasePriceUsd) })),
          accessories: data.accessories.map((b) => ({ ...b, unitCostUsd: Number(b.unitCostUsd) })),
        };
        setContents(normalized);
        setGroupPrices(Object.fromEntries(groupInvoiceDevices(normalized.devices).map((g) => [g.key, String(g.price)])));
        setBatchCosts(Object.fromEntries(normalized.accessories.map((b) => [b.id, String(b.unitCostUsd)])));
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить накладную'); });
    return () => { cancelled = true; };
  }, [invoice]);

  const groups = useMemo(() => (contents ? groupInvoiceDevices(contents.devices) : []), [contents]);
  const result = useMemo(() => (contents ? invoiceEditResult(contents, groupPrices, batchCosts) : null), [contents, groupPrices, batchCosts]);

  if (!invoice) return null;

  const handleSave = async () => {
    if (!result || saving) return;
    if (result.invalid.length) { onError('Укажите корректные цены (больше нуля, до двух знаков после точки)'); return; }
    if (!number.trim()) { onError('Укажите номер накладной'); return; }
    setSaving(true);
    try {
      const res = await onSave(invoice.id, { invoiceNumber: number.trim(), date, prices: result.prices, accessoryCosts: result.accessoryCosts });
      if (res.success) {
        onSuccess(res.refundUsd ? `Накладная обновлена. $${formatMoney(res.refundUsd)} возвращено в Центральную кассу` : 'Накладная обновлена');
        onClose();
      } else {
        onError(res.message || 'Не удалось обновить накладную');
      }
    } finally {
      setSaving(false);
    }
  };

  const changed = Boolean(result && result.diff !== 0);

  return (
    <Dialog
      open
      onClose={saving ? () => {} : onClose}
      title={`Накладная ${invoice.invoiceNumber}`}
      subtitle={contents ? contents.invoice.supplierName : invoice.supplierName}
      icon={Receipt}
      maxWidth="xl"
      footer={
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>Отмена</Button>
          <Button fullWidth leftIcon={Check} loading={saving} disabled={!contents || Boolean(result?.invalid.length)} onClick={handleSave}>
            Сохранить
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-fg-muted">Номер накладной</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-raised border border-border font-mono font-bold text-fg focus:border-accent focus:outline-none" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-fg-muted">Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-10 px-3 rounded-xl bg-surface-raised border border-border font-semibold text-fg focus:border-accent focus:outline-none" />
          </label>
        </div>

        {loadError && <p className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs">{loadError}</p>}
        {!contents && !loadError && <p className="text-xs text-fg-subtle">Загрузка состава накладной…</p>}

        {contents && (
          <>
            <section className="space-y-2">
              <h4 className="text-xs font-bold text-fg-muted flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5 text-accent" />Цена за штуку, $</h4>
              {groups.length === 0 && <p className="text-xs text-fg-subtle">Телефонов в накладной нет</p>}
              {groups.map((g) => {
                const specs = [formatRam(g.ram ?? undefined), formatStorage(g.storage), formatPhoneColor(g.color)].filter(Boolean).join(' · ');
                const bad = result?.invalid.includes(g.key);
                return (
                  <div key={g.key} className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-bold text-fg truncate">{g.brand} {g.model} <span className="font-normal text-fg-subtle">× {g.devices.length}</span></p>
                      <p className="text-xs text-fg-subtle truncate">{specs}</p>
                      {g.locations.length > 0 && (
                        <p className="text-[11px] text-fg-subtle">{g.locations.map((l) => `${formatStoreName(l.name)} ${l.count} шт.`).join(' · ')}</p>
                      )}
                      {g.soldCount > 0 && (
                        <p className="text-[11px] text-warning flex items-center gap-1"><Lock className="w-3 h-3" />Уже продавались {g.soldCount} шт. — их цена ${formatMoney(g.price)} не меняется</p>
                      )}
                    </div>
                    {g.isBonus ? (
                      <span className="text-xs font-bold text-highlight shrink-0">Подарок · $0</span>
                    ) : g.editable.length ? (
                      <input
                        inputMode="decimal"
                        aria-label={`Цена ${g.brand} ${g.model}`}
                        value={groupPrices[g.key] ?? ''}
                        onChange={(e) => setGroupPrices((p) => ({ ...p, [g.key]: e.target.value }))}
                        className={cn(priceInput, bad && 'border-danger text-danger')}
                      />
                    ) : (
                      <span className="text-sm font-mono font-bold text-fg-subtle shrink-0 flex items-center gap-1"><Lock className="w-3 h-3" />${formatMoney(g.price)}</span>
                    )}
                  </div>
                );
              })}
            </section>

            {contents.accessories.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-xs font-bold text-fg-muted flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-accent" />Аксессуары, $ за штуку</h4>
                {contents.accessories.map((b) => (
                  <div key={b.id} className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-fg truncate">{[b.brand, b.name].filter(Boolean).join(' ')} <span className="font-normal text-fg-subtle">× {b.quantityReceived}</span></p>
                      <p className="text-[11px] text-fg-subtle">{b.storeName ? `${formatStoreName(b.storeName)} · ` : ''}осталось {b.quantityRemaining} из {b.quantityReceived} шт.</p>
                      {b.locked && <p className="text-[11px] text-warning flex items-center gap-1"><Lock className="w-3 h-3" />Часть продана или перемещена — цена не меняется</p>}
                    </div>
                    {b.locked ? (
                      <span className="text-sm font-mono font-bold text-fg-subtle shrink-0">${formatMoney(b.unitCostUsd)}</span>
                    ) : (
                      <input
                        inputMode="decimal"
                        aria-label={`Цена ${b.name}`}
                        value={batchCosts[b.id] ?? ''}
                        onChange={(e) => setBatchCosts((p) => ({ ...p, [b.id]: e.target.value }))}
                        className={cn(priceInput, result?.invalid.includes(b.id) && 'border-danger text-danger')}
                      />
                    )}
                  </div>
                ))}
              </section>
            )}

            {result && (
              <section className="p-3 rounded-xl border border-border bg-surface space-y-1.5 text-xs" aria-live="polite">
                <div className="flex justify-between"><span className="text-fg-subtle">Сумма накладной</span>
                  <span className="font-mono font-bold text-fg">{changed ? <>${formatMoney(result.oldTotal)} → ${formatMoney(result.newTotal)}</> : <>${formatMoney(result.oldTotal)}</>}</span></div>
                <div className="flex justify-between"><span className="text-fg-subtle">Оплачено поставщику</span><span className="font-mono font-semibold text-fg">${formatMoney(result.paid)}</span></div>
                <div className="flex justify-between pt-1.5 border-t border-border">
                  <span className="font-semibold text-fg">Долг поставщику</span>
                  <span className={cn('font-mono font-bold', result.debtAfter > 0 ? 'text-danger' : 'text-fg-subtle')}>
                    {changed && result.debtAfter !== result.debtBefore ? <>${formatMoney(result.debtBefore)} → ${formatMoney(result.debtAfter)}</> : <>${formatMoney(result.debtAfter)}</>}
                  </span>
                </div>
                {result.refund > 0 && (
                  <p className="p-2 rounded-lg bg-warning/10 border border-warning/25 text-warning font-semibold flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Оплачено больше новой суммы: ${formatMoney(result.refund)} вернётся в Центральную кассу.
                  </p>
                )}
                {changed && result.refund === 0 && result.diff > 0 && (
                  <p className="text-fg-subtle">Разница ${formatMoney(result.diff)} добавится к долгу поставщику.</p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
};
