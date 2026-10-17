import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppFields } from '../../context/AppContext';
import { formatStoreDisplayTitle } from '../../utils/storeContext';
import { apiClient } from '../../api/client';
import { StoreReceipt, StoreReceiptAccessoryLine, StoreReceiptItem } from '../../types';
import { formatPhoneColor, normalizePhoneColor } from '../../utils/phoneSpecs';
import { soundEffects } from '../../utils/sound';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { LoadingState } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import {
  PackagePlus,
  Barcode,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  ChevronRight,
  Store as StoreIcon,
  Smartphone,
  Calendar,
  User,
  History,
  Check,
  X,
  Headphones,
  Minus,
} from 'lucide-react';

/** An accessory card being received: units to take from the main warehouse (at most `available`). */
interface IntakeAccessory extends StoreReceiptAccessoryLine {
  available: number;
}

export const StoreReceiptPage: React.FC = () => {
  const { currentUser, stores, openScanner, selectedStoreId } = useAppFields(
    'currentUser',
    'stores',
    'openScanner',
    'selectedStoreId'
  );

  const isAdmin = currentUser?.role === 'ADMIN';
  const isPartner = currentUser?.role === 'PARTNER';

  // Store resolution: staff are locked to their assigned store; an admin works in the store they switched into
  const retailStores = useMemo(() => stores.filter((s) => !s.isMainWarehouse && s.active), [stores]);
  const defaultStoreId = retailStores[0]?.id || '';
  const effectiveStoreId =
    (currentUser?.role === 'SELLER' || isPartner) && currentUser?.storeId
      ? currentUser.storeId
      : (selectedStoreId && selectedStoreId !== 'all' && retailStores.some((s) => s.id === selectedStoreId)
          ? selectedStoreId
          : defaultStoreId);

  const currentStore = retailStores.find((s) => s.id === effectiveStoreId);

  // Tab: 'NEW' (Scanning new intake) or 'HISTORY' (Past store receipts)
  const [activeTab, setActiveTab] = useState<'NEW' | 'HISTORY'>('NEW');

  // Intake State
  const [imeiInput, setImeiInput] = useState('');
  const [scannedItems, setScannedItems] = useState<StoreReceiptItem[]>([]);
  const [scannedAccessories, setScannedAccessories] = useState<IntakeAccessory[]>([]);
  const accessoryUnits = scannedAccessories.reduce((sum, line) => sum + line.quantity, 0);
  const intakeCount = scannedItems.length + accessoryUnits;
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  // History State
  const [historyList, setHistoryList] = useState<StoreReceipt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<StoreReceipt | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const imeiInputRef = useRef<HTMLInputElement>(null);

  // «Ознакомлен»: the admin's review mark on a receipt (no stock or cash changes).
  const acknowledgeReceipt = async () => {
    if (!selectedReceipt || !isAdmin || selectedReceipt.acknowledgedAt) return;
    setAcknowledging(true);
    try {
      const updated = await apiClient<StoreReceipt>(`/store-receipts/${selectedReceipt.id}/acknowledge`, { method: 'POST' });
      const patch = { acknowledgedAt: updated.acknowledgedAt ?? new Date().toISOString(), acknowledgedByName: updated.acknowledgedByName ?? currentUser?.name ?? null };
      setSelectedReceipt((prev) => (prev && prev.id === selectedReceipt.id ? { ...prev, ...patch } : prev));
      setHistoryList((prev) => prev.map((r) => (r.id === selectedReceipt.id ? { ...r, ...patch } : r)));
      setStatus({ tone: 'success', text: `Приход ${selectedReceipt.receiptNumber} отмечен как просмотренный` });
    } catch (e: any) {
      setStatus({ tone: 'error', text: e?.message || 'Не удалось отметить приход' });
    } finally {
      setAcknowledging(false);
    }
  };

  // Load Store Receipts History
  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const url = `/store-receipts${effectiveStoreId ? `?storeId=${encodeURIComponent(effectiveStoreId)}` : ''}`;
      const res = await apiClient<StoreReceipt[]>(url);
      setHistoryList(Array.isArray(res) ? res : []);
    } catch (e: any) {
      console.error('Failed to load store receipts history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [effectiveStoreId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const handleUpdate = () => loadHistory();
    window.addEventListener('business-data-changed', handleUpdate);
    return () => window.removeEventListener('business-data-changed', handleUpdate);
  }, [loadHistory]);

  // Handle IMEI lookup and addition
  const handleLookupImei = useCallback(async (rawImei: string) => {
    const cleanImei = rawImei.trim().replace(/\s+/g, '');
    if (!cleanImei) return;

    // Check if already added in current batch
    if (scannedItems.some((item) => item.imei === cleanImei)) {
      soundEffects.playError();
      setStatus({ tone: 'error', text: `IMEI ${cleanImei} уже добавлен в текущий список прихода` });
      return;
    }

    try {
      setIsLookingUp(true);
      setStatus(null);
      const res = await apiClient<any>('/store-receipts/lookup', {
        method: 'POST',
        body: JSON.stringify({
          imei: cleanImei,
          storeId: effectiveStoreId || undefined,
        }),
      });

      // An accessory's barcode: one more unit of it (up to what the main warehouse has free).
      if (res.kind === 'ACCESSORY') {
        const existing = scannedAccessories.find((line) => line.productId === res.id);
        if (existing && existing.quantity >= res.available) {
          soundEffects.playError();
          setStatus({ tone: 'warning', text: `${res.brand} ${res.name}: на главном складе свободно только ${res.available} шт.` });
          return;
        }
        setScannedAccessories((prev) => existing
          ? prev.map((line) => (line.productId === res.id ? { ...line, quantity: line.quantity + 1, available: res.available } : line))
          : [{ productId: res.id, barcode: res.barcode, brand: res.brand, name: res.name, quantity: 1, available: res.available }, ...prev]);
        setImeiInput('');
        soundEffects.playAddToCartSuccess();
        setStatus({ tone: 'success', text: `Добавлен аксессуар: ${res.brand} ${res.name} (${(existing?.quantity ?? 0) + 1} шт.)` });
        setTimeout(() => imeiInputRef.current?.focus(), 50);
        return;
      }

      const newItem: StoreReceiptItem = {
        id: res.id,
        deviceId: res.id,
        imei: res.imei,
        brand: res.brand,
        model: res.model,
        ram: res.ram,
        storage: res.storage,
        color: normalizePhoneColor(res.color),
      };

      setScannedItems((prev) => [newItem, ...prev]);
      setImeiInput('');
      soundEffects.playAddToCartSuccess();
      setStatus({
        tone: 'success',
        text: `Добавлен: ${res.brand} ${res.model} (${res.storage || ''} ${formatPhoneColor(res.color) || ''}) [IMEI: ${res.imei}]`,
      });

      // Refocus input for continuous rapid scanning
      setTimeout(() => {
        imeiInputRef.current?.focus();
      }, 50);
    } catch (err: any) {
      soundEffects.playError();
      setStatus({
        tone: 'error',
        text: err?.message || `Товар с кодом ${cleanImei} не найден на главном складе`,
      });
    } finally {
      setIsLookingUp(false);
    }
  }, [scannedItems, scannedAccessories, effectiveStoreId]);

  const setAccessoryQuantity = (productId: string, quantity: number) =>
    setScannedAccessories((prev) => prev.map((line) => (
      line.productId === productId ? { ...line, quantity: Math.max(1, Math.min(line.available, Math.floor(quantity) || 1)) } : line
    )));

  // Form submit for IMEI field
  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imeiInput.trim()) return;
    handleLookupImei(imeiInput);
  };

  // Remove item from current intake batch
  const handleRemoveItem = (index: number) => {
    setScannedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Complete Receipt Intake
  const handleCreateReceipt = async () => {
    if (intakeCount === 0) return;

    try {
      setIsSubmitting(true);
      setStatus(null);

      const res = await apiClient<StoreReceipt>('/store-receipts', {
        method: 'POST',
        body: JSON.stringify({
          imeis: scannedItems.map((item) => item.imei),
          accessories: scannedAccessories.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          storeId: effectiveStoreId || undefined,
        }),
      });

      soundEffects.playAddToCartSuccess();
      setScannedItems([]);
      setScannedAccessories([]);
      setSelectedReceipt(res);
      setStatus({
        tone: 'success',
        text: `Приход успешно оформлен! Накладная ${res.receiptNumber} (${res.itemCount} шт.) сохранена в истории.`,
      });

      loadHistory();
      window.dispatchEvent(new CustomEvent('business-data-changed'));
    } catch (err: any) {
      soundEffects.playError();
      setStatus({
        tone: 'error',
        text: err?.message || 'Ошибка оформления прихода',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter history
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return historyList;
    const q = historySearch.toLowerCase().trim();
    return historyList.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        r.createdByName.toLowerCase().includes(q) ||
        (r.storeName && r.storeName.toLowerCase().includes(q)) ||
        r.items.some((item) =>
          item.imei.toLowerCase().includes(q) ||
          item.brand.toLowerCase().includes(q) ||
          item.model.toLowerCase().includes(q)
        ) ||
        (r.accessoryLines || []).some((line) =>
          line.barcode.toLowerCase().includes(q) || `${line.brand} ${line.name}`.toLowerCase().includes(q)
        )
    );
  }, [historyList, historySearch]);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Top Header Controls Bar */}
      <div className="px-3 py-2 border-b border-border bg-surface shrink-0 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* The store being worked in: no picker, the receipt always goes to it */}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-fg-muted">
            <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
            <span>{formatStoreDisplayTitle(currentStore)}</span>
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-surface-raised border border-border rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('NEW')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'NEW'
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <PackagePlus className="w-3.5 h-3.5" />
            Новый приход {intakeCount > 0 && `(${intakeCount})`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'HISTORY'
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'text-fg-subtle hover:text-fg'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            История накладных
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">
        {activeTab === 'NEW' ? (
          <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
            {/* IMEI Input & Scanner Form */}
            <form onSubmit={handleInputSubmit} className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={imeiInputRef}
                  type="text"
                  value={imeiInput}
                  onChange={(e) => setImeiInput(e.target.value)}
                  placeholder="IMEI / SN устройства или штрихкод аксессуара..."
                  disabled={isLookingUp || isSubmitting}
                  className="w-full h-10 pl-3.5 pr-20 rounded-xl border border-border bg-surface text-fg font-mono text-xs sm:text-sm focus:outline-none focus:border-accent shadow-xs"
                  autoFocus
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {imeiInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setImeiInput('');
                        imeiInputRef.current?.focus();
                      }}
                      className="p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-raised cursor-pointer transition-colors"
                      title="Очистить"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openScanner((code) => handleLookupImei(code), { allowModeSwitch: true })}
                    className="p-1.5 rounded-lg text-accent hover:bg-accent/15 border border-transparent hover:border-accent/25 cursor-pointer transition-colors"
                    title="Сканировать камерой"
                    aria-label="Сканировать камерой"
                  >
                    <Barcode className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                loading={isLookingUp}
                disabled={!imeiInput.trim() || isLookingUp || isSubmitting}
                leftIcon={Plus}
                className="h-10 px-4 cursor-pointer font-bold shrink-0 rounded-xl"
              >
                Добавить
              </Button>
            </form>

            {/* Scanned Batch Items */}
            <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-accent" />
                  <h3 className="text-sm font-bold text-fg">
                    Товары к приёму ({intakeCount} шт.)
                  </h3>
                </div>

                {intakeCount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setScannedItems([]); setScannedAccessories([]); }}
                    disabled={isSubmitting}
                    className="text-xs text-danger hover:underline cursor-pointer font-medium"
                  >
                    Очистить список
                  </button>
                )}
              </div>

              {intakeCount === 0 ? (
                <div className="py-8 text-center text-fg-subtle space-y-1.5">
                  <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center mx-auto text-fg-subtle">
                    <Barcode className="w-5 h-5 opacity-50" />
                  </div>
                  <p className="text-xs font-semibold text-fg">Список прихода пуст</p>
                  <p className="text-[11px] text-fg-subtle">
                    Отсканируйте IMEI / SN устройства или штрихкод аксессуара
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                    {scannedAccessories.map((line) => (
                      <div
                        key={line.productId}
                        className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-3 hover:border-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-center text-accent shrink-0">
                            <Headphones className="w-3.5 h-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-fg truncate">{line.brand} {line.name}</p>
                            <p className="text-[11px] text-fg-subtle mt-0.5 font-mono">Штрихкод: {line.barcode} • свободно на складе {line.available} шт.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="flex items-center rounded-lg border border-border bg-bg">
                            <button type="button" onClick={() => setAccessoryQuantity(line.productId, line.quantity - 1)} disabled={isSubmitting || line.quantity <= 1} className="h-8 w-7 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer" aria-label="Меньше">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={line.available}
                              value={line.quantity}
                              disabled={isSubmitting}
                              onChange={(e) => setAccessoryQuantity(line.productId, Number(e.target.value))}
                              className="h-8 w-11 text-center text-xs font-bold font-mono bg-transparent focus:outline-none"
                              aria-label={`Количество: ${line.name}`}
                            />
                            <button type="button" onClick={() => setAccessoryQuantity(line.productId, line.quantity + 1)} disabled={isSubmitting || line.quantity >= line.available} className="h-8 w-7 flex items-center justify-center text-fg-subtle hover:text-fg disabled:opacity-40 cursor-pointer" aria-label="Больше">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setScannedAccessories((prev) => prev.filter((x) => x.productId !== line.productId))}
                            disabled={isSubmitting}
                            className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                            title="Удалить из списка"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {scannedItems.map((item, idx) => (
                      <div
                        key={item.imei}
                        className="p-3 rounded-xl bg-surface-raised border border-border flex items-center justify-between gap-3 hover:border-accent/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-surface border border-border flex items-center justify-center text-xs font-bold text-fg-subtle shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-fg truncate">
                              {item.brand} {item.model}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-fg-subtle flex-wrap mt-0.5">
                              {item.storage && <span>{item.storage}</span>}
                              {item.color && <span>• {formatPhoneColor(item.color)}</span>}
                              <span className="font-mono text-accent font-semibold">• IMEI/SN: {item.imei}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={isSubmitting}
                          className="p-1.5 rounded-lg text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer shrink-0"
                          title="Удалить из списка"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Submit Action Bar */}
                  <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-fg-subtle">
                      Магазин назначения: <strong className="text-fg">{currentStore?.name}</strong>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      loading={isSubmitting}
                      disabled={intakeCount === 0 || isSubmitting}
                      onClick={handleCreateReceipt}
                      leftIcon={CheckCircle2}
                      className="w-full sm:w-auto h-11 px-6 font-bold cursor-pointer"
                    >
                      Оприходовать ({intakeCount} шт.)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* HISTORY TAB */
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="p-4 sm:p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <h2 className="text-sm font-bold text-fg flex items-center gap-2">
                    <History className="w-4 h-4 text-accent" />
                    История накладных прихода
                  </h2>
                  <p className="text-xs text-fg-subtle mt-0.5">
                    Все оформленные приходы товара в магазин
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-3" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Поиск по накладной, IMEI, штрихкоду..."
                    className="w-full h-9 pl-8 pr-3 rounded-xl border border-border bg-bg text-fg text-xs focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {historyLoading ? (
                <div className="py-12">
                  <LoadingState label="Загрузка накладных..." />
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-fg-subtle space-y-2">
                  <FileText className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">Накладные не найдены</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredHistory.map((receipt) => (
                    <div
                      key={receipt.id}
                      onClick={() => setSelectedReceipt(receipt)}
                      className="p-3.5 rounded-xl bg-surface-raised border border-border hover:border-accent/40 transition-all cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs sm:text-sm font-black text-accent">
                            {receipt.receiptNumber}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold">
                            {receipt.itemCount} шт.
                          </span>
                          {receipt.acknowledgedAt && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Ознакомлен
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-fg-subtle mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(receipt.createdAt).toLocaleString('ru-RU', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Принял: <strong className="text-fg">{receipt.createdByName}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-accent font-semibold shrink-0">
                        <span className="hidden sm:inline">Открыть</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* INVOICE DETAILS MODAL */}
      <Dialog
        open={Boolean(selectedReceipt)}
        onClose={() => setSelectedReceipt(null)}
        title={`Накладная прихода: ${selectedReceipt?.receiptNumber || ''}`}
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedReceipt(null)}
              className="w-full sm:w-auto"
            >
              Закрыть
            </Button>
            {isAdmin && selectedReceipt && !selectedReceipt.acknowledgedAt && (
              <Button
                type="button"
                leftIcon={Check}
                loading={acknowledging}
                onClick={acknowledgeReceipt}
                className="w-full sm:w-auto"
              >
                Ознакомлен
              </Button>
            )}
          </div>
        }
      >
        {selectedReceipt && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-surface-raised border border-border text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-fg-subtle">Номер документа:</span>
                <span className="font-mono font-bold text-accent">{selectedReceipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">Дата оформления:</span>
                <span className="font-medium text-fg">
                  {new Date(selectedReceipt.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">Магазин приёма:</span>
                <span className="font-semibold text-fg">{selectedReceipt.storeName || currentStore?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">Принял сотрудник:</span>
                <span className="font-semibold text-fg">{selectedReceipt.createdByName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">Количество товаров:</span>
                <span className="font-bold text-fg">{selectedReceipt.itemCount} шт.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">Просмотр администратором:</span>
                {selectedReceipt.acknowledgedAt ? (
                  <span className="font-medium text-success">
                    {selectedReceipt.acknowledgedByName}, {new Date(selectedReceipt.acknowledgedAt).toLocaleString('ru-RU')}
                  </span>
                ) : (
                  <span className="font-medium text-warning">Не просмотрен</span>
                )}
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h4 className="text-xs font-bold text-fg mb-2">Список принятых товаров:</h4>
              <div className="max-h-[260px] overflow-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs border-collapse min-w-[340px]">
                  <thead className="bg-surface-raised border-b border-border sticky top-0">
                    <tr>
                      <th className="p-2 text-fg-subtle font-semibold">№</th>
                      <th className="p-2 text-fg-subtle font-semibold">Модель</th>
                      <th className="p-2 text-fg-subtle font-semibold">Память/Цвет</th>
                      <th className="p-2 text-fg-subtle font-semibold">IMEI / SN / штрихкод</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedReceipt.items.map((item, idx) => (
                      <tr key={item.id || item.imei} className="hover:bg-surface-raised/50">
                        <td className="p-2 font-mono text-fg-subtle">{idx + 1}</td>
                        <td className="p-2 font-bold text-fg">{item.brand} {item.model}</td>
                        <td className="p-2 text-fg-subtle">{item.storage || '—'} {item.color ? `• ${formatPhoneColor(item.color)}` : ''}</td>
                        <td className="p-2 font-mono font-bold text-accent">{item.imei}</td>
                      </tr>
                    ))}
                    {(selectedReceipt.accessoryLines || []).map((line, idx) => (
                      <tr key={line.id || line.productId} className="hover:bg-surface-raised/50">
                        <td className="p-2 font-mono text-fg-subtle">{selectedReceipt.items.length + idx + 1}</td>
                        <td className="p-2 font-bold text-fg">{line.brand} {line.name}</td>
                        <td className="p-2 text-fg-subtle">аксессуар • {line.quantity} шт.</td>
                        <td className="p-2 font-mono font-bold text-accent">{line.barcode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
