import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Barcode, Check, Lock, Package, Pencil, Receipt, Scan, Smartphone, X } from 'lucide-react';
import type { SupplierInvoice } from '../../types';
import { apiClient } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';
import { formatMoney } from '../../utils/money';
import { formatPhoneColor, formatRam, formatStorage } from '../../utils/phoneSpecs';
import { formatStoreName } from '../../utils/storeContext';
import {
  codeChanges, groupInvoiceDevices, invoiceEditResult, renameChanges, specDraftOf,
  type AccessoryNameDraft, type DeviceCodeDraft, type DeviceSpecDraft, type InvoiceContents,
} from '../../utils/invoiceEdit';
import { deviceCodeLabel, imeiDigits, imeiProblem } from '../../utils/deviceCode';
import { useAppFields } from '../../context/AppContext';

export interface InvoiceSaveData {
  invoiceNumber: string;
  date: string;
  prices: { deviceId: string; purchasePriceUsd: number }[];
  accessoryCosts: { batchId: string; unitCostUsd: number }[];
  /** Names typed wrong at receipt, fixed on the units not sold yet. */
  specs: { deviceId: string; brand: string; model: string; ram: string | null; storage: string; color: string }[];
  accessoryNames: { productId: string; brand: string; name: string; category: string; barcode: string }[];
  /** IMEIs / SNs typed wrong at receipt, on units not sold, repaired or being moved. */
  codes: { deviceId: string; imei: string; imei2: string | null }[];
}

interface EditInvoiceModalProps {
  invoice: SupplierInvoice | null;
  onClose: () => void;
  onSave: (id: string, data: InvoiceSaveData) => Promise<{ success: boolean; message?: string; refundUsd?: number }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

const priceInput = 'w-24 h-9 px-2 rounded-lg bg-surface border border-border text-right font-mono font-bold text-sm text-fg focus:border-accent focus:outline-none';
const nameInput = 'w-full h-9 px-2.5 rounded-lg bg-surface border border-border text-sm font-semibold text-fg focus:border-accent focus:outline-none';
const renameButton = 'inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline cursor-pointer hit-area-y';

/** One labelled field of a name form. */
/** One labelled field of a name or code form; with `onScan`, a camera button beside it fills it. */
const NameField: React.FC<{ label: string; value: string; onChange: (value: string) => void; placeholder?: string; invalid?: boolean; wide?: boolean; mono?: boolean; error?: boolean; inputMode?: 'numeric' | 'text'; maxLength?: number; problem?: string | null; onScan?: () => void }> = ({ label, value, onChange, placeholder, invalid, wide, mono, error, inputMode, maxLength, problem, onScan }) => {
  const id = React.useId();
  return (
    <div className={cn('space-y-1 min-w-0', wide && 'col-span-2')}>
      <label htmlFor={id} className="block text-[11px] font-semibold text-fg-muted">{label}</label>
      <div className="flex gap-1.5">
        <input id={id} value={value} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength} aria-invalid={Boolean(problem || error)} onChange={(e) => onChange(e.target.value)} className={cn(nameInput, 'min-w-0', mono && 'font-mono', (error || problem || (invalid && !value.trim())) && 'border-danger text-danger')} />
        {onScan && (
          <button
            type="button"
            onClick={onScan}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/25 text-accent cursor-pointer shrink-0"
            title={`Сканировать: ${label}`}
            aria-label={`Сканировать: ${label}`}
          >
            <Scan className="w-4 h-4" />
          </button>
        )}
      </div>
      {problem && <p className="text-[11px] text-danger">{problem}</p>}
    </div>
  );
};

/**
 * Edits a purchase invoice: its number, date and the purchase price of each model or accessory
 * batch still in stock (moved to a store or not). A sold phone keeps its price. A name typed wrong
 * at receipt is fixed on the units not sold yet, and on an accessory card only this invoice brought
 * in (a sold unit keeps its name on the receipt); so is an IMEI / SN or an accessory barcode. The summary shows
 * what saving does: the change is owed to the supplier, or the part paid above the new total comes
 * back to the Central Cash.
 */
export const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({ invoice, onClose, onSave, onSuccess, onError }) => {
  const { openScanner } = useAppFields('openScanner');
  const [contents, setContents] = useState<InvoiceContents | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [groupPrices, setGroupPrices] = useState<Record<string, string>>({});
  const [batchCosts, setBatchCosts] = useState<Record<string, string>>({});
  // A name form is open for a model (group key) or an accessory card (product id) while it has a draft.
  const [specDrafts, setSpecDrafts] = useState<Record<string, DeviceSpecDraft>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, AccessoryNameDraft>>({});
  // A model's codes form is open (group key) with a draft per unit (device id).
  const [codeGroups, setCodeGroups] = useState<Set<string>>(new Set());
  const [codeDrafts, setCodeDrafts] = useState<Record<string, DeviceCodeDraft>>({});
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
        setSpecDrafts({});
        setNameDrafts({});
        setCodeGroups(new Set());
        setCodeDrafts({});
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить накладную'); });
    return () => { cancelled = true; };
  }, [invoice]);

  const groups = useMemo(() => (contents ? groupInvoiceDevices(contents.devices) : []), [contents]);
  const result = useMemo(() => (contents ? invoiceEditResult(contents, groupPrices, batchCosts) : null), [contents, groupPrices, batchCosts]);
  const renames = useMemo(
    () => renameChanges(groups, specDrafts, contents?.accessories ?? [], nameDrafts),
    [groups, specDrafts, contents, nameDrafts],
  );
  const codes = useMemo(() => codeChanges(contents?.devices ?? [], codeDrafts), [contents, codeDrafts]);
  const setCode = (deviceId: string, field: keyof DeviceCodeDraft, value: string) =>
    setCodeDrafts((all) => ({ ...all, [deviceId]: { ...all[deviceId], [field]: value } }));
  const openCodes = (key: string, units: { id: string; imei: string; imei2?: string | null }[]) => {
    setCodeGroups((open) => new Set(open).add(key));
    setCodeDrafts((all) => ({ ...all, ...Object.fromEntries(units.map((d) => [d.id, all[d.id] ?? { imei: d.imei, imei2: d.imei2 ?? '' }])) }));
  };
  const closeCodes = (key: string, units: { id: string }[]) => {
    setCodeGroups((open) => { const next = new Set(open); next.delete(key); return next; });
    setCodeDrafts((all) => { const next = { ...all }; for (const d of units) delete next[d.id]; return next; });
  };
  const setSpec = (key: string, field: keyof DeviceSpecDraft, value: string) =>
    setSpecDrafts((all) => ({ ...all, [key]: { ...all[key], [field]: value } }));
  const setAccessoryName = (productId: string, field: keyof AccessoryNameDraft, value: string) =>
    setNameDrafts((all) => ({ ...all, [productId]: { ...all[productId], [field]: value } }));
  const closeDraft = <T,>(set: React.Dispatch<React.SetStateAction<Record<string, T>>>, key: string) =>
    set((all) => { const next = { ...all }; delete next[key]; return next; });

  if (!invoice) return null;

  const handleSave = async () => {
    if (!result || saving) return;
    if (result.invalid.length) { onError('Укажите корректные цены (больше нуля, до двух знаков после точки)'); return; }
    if (renames.invalid.length) { onError('Заполните название: бренд, модель и характеристики (у аксессуара — название, категорию и штрихкод)'); return; }
    if (codes.invalid.length) { onError('Проверьте коды: IMEI — ровно 15 цифр, SN — 4–64 буквы и цифры, без повторов'); return; }
    if (!number.trim()) { onError('Укажите номер накладной'); return; }
    setSaving(true);
    try {
      const res = await onSave(invoice.id, {
        invoiceNumber: number.trim(), date, prices: result.prices, accessoryCosts: result.accessoryCosts,
        specs: renames.specs, accessoryNames: renames.accessoryNames, codes: codes.codes,
      });
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
          <Button fullWidth leftIcon={Check} loading={saving} disabled={!contents || Boolean(result?.invalid.length) || renames.invalid.length > 0 || codes.invalid.length > 0} onClick={handleSave}>
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
                const draft = specDrafts[g.key];
                const isTablet = g.devices[0]?.category === 'TABLET';
                const category = g.devices[0]?.category === 'TABLET' ? 'TABLET' as const : 'PHONE' as const;
                const codesOpen = codeGroups.has(g.key);
                return (
                  <div key={g.key} className="p-3 rounded-xl bg-surface-raised border border-border space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-bold text-fg truncate">{g.brand} {g.model} <span className="font-normal text-fg-subtle">× {g.devices.length}</span></p>
                      <p className="text-xs text-fg-subtle truncate">{specs}</p>
                      {g.locations.length > 0 && (
                        <p className="text-[11px] text-fg-subtle">{g.locations.map((l) => `${formatStoreName(l.name)} ${l.count} шт.`).join(' · ')}</p>
                      )}
                      {g.soldCount > 0 && (
                        <p className="text-[11px] text-warning flex items-center gap-1"><Lock className="w-3 h-3" />Уже продавались {g.soldCount} шт. — их цена ${formatMoney(g.price)} не меняется</p>
                      )}
                      {g.editable.length > 0 && (!draft || !codesOpen) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {!draft && (
                            <button type="button" data-compact className={renameButton} onClick={() => setSpecDrafts((all) => ({ ...all, [g.key]: specDraftOf(g) }))}>
                              <Pencil className="w-3 h-3" />Изменить название
                            </button>
                          )}
                          {!codesOpen && (
                            <button type="button" data-compact className={renameButton} onClick={() => openCodes(g.key, g.editable)}>
                              <Barcode className="w-3 h-3" />Изменить {deviceCodeLabel(category)}
                            </button>
                          )}
                        </div>
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
                  {draft && (
                    <div className="pt-2.5 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <NameField label="Бренд" value={draft.brand} onChange={(v) => setSpec(g.key, 'brand', v)} invalid />
                        <NameField label="Модель" value={draft.model} onChange={(v) => setSpec(g.key, 'model', v)} invalid />
                        <NameField label={isTablet ? 'RAM (если есть)' : 'RAM'} value={draft.ram} placeholder="8GB" onChange={(v) => setSpec(g.key, 'ram', v)} invalid={!isTablet} />
                        <NameField label="Память" value={draft.storage} placeholder="256GB" onChange={(v) => setSpec(g.key, 'storage', v)} invalid />
                        <NameField label="Цвет" value={draft.color} onChange={(v) => setSpec(g.key, 'color', v)} invalid={isTablet} wide />
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-fg-subtle">
                          Новое название получат {g.editable.length} шт.{g.soldCount > 0 ? ` Проданные ${g.soldCount} шт. сохранят прежнее название в чеках.` : ''}
                        </p>
                        <button type="button" data-compact className={cn(renameButton, 'text-fg-muted shrink-0')} onClick={() => closeDraft(setSpecDrafts, g.key)}>
                          <X className="w-3 h-3" />Отменить
                        </button>
                      </div>
                    </div>
                  )}
                  {codesOpen && (
                    <div className="pt-2.5 border-t border-border space-y-2">
                      {g.editable.map((d) => (
                        <div key={d.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2 border-b border-border/60 last:border-b-0 last:pb-0">
                          <NameField label={deviceCodeLabel(category)} value={codeDrafts[d.id]?.imei ?? ''}
                            onChange={(v) => setCode(d.id, 'imei', isTablet ? v : imeiDigits(v))}
                            mono inputMode={isTablet ? 'text' : 'numeric'} maxLength={isTablet ? 64 : undefined} error={codes.invalid.includes(d.id)} invalid
                            problem={isTablet ? null : imeiProblem(codeDrafts[d.id]?.imei ?? '', true)}
                            onScan={() => openScanner((code) => setCode(d.id, 'imei', isTablet ? code : imeiDigits(code)), { mode: isTablet ? 'serial' : 'imei' })} />
                          <NameField label={`${deviceCodeLabel(category, 2)} (если есть)`} value={codeDrafts[d.id]?.imei2 ?? ''}
                            onChange={(v) => setCode(d.id, 'imei2', isTablet ? v : imeiDigits(v))}
                            mono inputMode={isTablet ? 'text' : 'numeric'} maxLength={isTablet ? 64 : undefined} error={codes.invalid.includes(d.id)}
                            problem={isTablet ? null : imeiProblem(codeDrafts[d.id]?.imei2 ?? '')}
                            onScan={() => openScanner((code) => setCode(d.id, 'imei2', isTablet ? code : imeiDigits(code)), { mode: isTablet ? 'serial' : 'imei' })} />
                        </div>
                      ))}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-fg-subtle">
                          {isTablet ? 'SN — 4–64 буквы и цифры.' : 'IMEI — ровно 15 цифр.'} Меняются только непроданные {g.editable.length} шт.{g.soldCount > 0 ? ' У проданных код остаётся в чеках.' : ''}
                        </p>
                        <button type="button" data-compact className={cn(renameButton, 'text-fg-muted shrink-0')} onClick={() => closeCodes(g.key, g.editable)}>
                          <X className="w-3 h-3" />Отменить
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })}
            </section>

            {contents.accessories.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-xs font-bold text-fg-muted flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-accent" />Аксессуары, $ за штуку</h4>
                {contents.accessories.map((b, index) => {
                  // A card moved to a store has another batch: its name form is shown once.
                  const firstOfCard = contents.accessories.findIndex((x) => x.productId === b.productId) === index;
                  const draft = firstOfCard ? nameDrafts[b.productId] : undefined;
                  return (
                  <div key={b.id} className="p-3 rounded-xl bg-surface-raised border border-border space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-fg truncate">{[b.brand, b.name].filter(Boolean).join(' ')} <span className="font-normal text-fg-subtle">× {b.quantityReceived}</span></p>
                      <p className="text-[11px] text-fg-subtle">{b.storeName ? `${formatStoreName(b.storeName)} · ` : ''}осталось {b.quantityRemaining} из {b.quantityReceived} шт. · <span className="font-mono">{b.barcode}</span></p>
                      {b.locked && <p className="text-[11px] text-warning flex items-center gap-1"><Lock className="w-3 h-3" />Часть продана или перемещена — цена не меняется</p>}
                      {firstOfCard && b.nameEditable && !draft && (
                        <button type="button" data-compact className={renameButton} onClick={() => setNameDrafts((all) => ({ ...all, [b.productId]: { brand: b.brand, name: b.name, category: b.category ?? '', barcode: b.barcode } }))}>
                          <Pencil className="w-3 h-3" />Изменить название и штрихкод
                        </button>
                      )}
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
                  {draft && (
                    <div className="pt-2.5 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <NameField label="Бренд" value={draft.brand} onChange={(v) => setAccessoryName(b.productId, 'brand', v)} />
                        <NameField label="Категория" value={draft.category} onChange={(v) => setAccessoryName(b.productId, 'category', v)} invalid />
                        <NameField label="Название" value={draft.name} onChange={(v) => setAccessoryName(b.productId, 'name', v)} invalid wide />
                        <NameField label="Штрихкод" value={draft.barcode} onChange={(v) => setAccessoryName(b.productId, 'barcode', v)} invalid wide mono
                          onScan={() => openScanner((code) => setAccessoryName(b.productId, 'barcode', code), { mode: 'code' })} />
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-fg-subtle">Карточка товара со штрихкодом {b.barcode}: новое название и штрихкод будут на складе и в новых продажах; в прошлых чеках остаются прежние.</p>
                        <button type="button" data-compact className={cn(renameButton, 'text-fg-muted shrink-0')} onClick={() => closeDraft(setNameDrafts, b.productId)}>
                          <X className="w-3 h-3" />Отменить
                        </button>
                      </div>
                    </div>
                  )}
                  </div>
                  );
                })}
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
