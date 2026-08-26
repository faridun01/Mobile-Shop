import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SupplierInvoice, Device } from '../../types';
import {
  Plus,
  Trash2,
  Scan,
  AlertCircle,
  CheckCircle2,
  Truck,
  Layers,
  Store as StoreIcon,
  DollarSign,
  Search,
  Calendar,
  X,
  ChevronRight,
  ArrowLeft,
  Package,
  FileText,
  Clock,
  Eye,
  Check,
  Edit2
} from 'lucide-react';

interface PurchaseItem {
  imei: string;
  barcode: string;
}

interface PurchaseItemGroup {
  id: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  items: PurchaseItem[];
}

const incrementBarcode = (barcode: string): string => {
  if (!barcode || !barcode.trim()) return '';
  const trimmed = barcode.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return trimmed;
  const prefix = match[1];
  const numStr = match[2];
  try {
    const nextNum = (BigInt(numStr) + 1n).toString().padStart(numStr.length, '0');
    return prefix + nextNum;
  } catch {
    return trimmed;
  }
};

export const PurchasePage: React.FC = () => {
  const {
    currentUser,
    suppliers,
    stores,
    todayRate,
    supplierInvoices,
    devices,
    createPurchase,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    openScanner
  } = useApp();

  // Edit Invoice Modal state
  const [editingInvoiceModal, setEditingInvoiceModal] = useState<SupplierInvoice | null>(null);
  const [editInvoiceNum, setEditInvoiceNum] = useState('');
  const [editInvoiceDateStr, setEditInvoiceDateStr] = useState('');
  const [editInvoiceAmountUsd, setEditInvoiceAmountUsd] = useState('');

  const handleStartEditInvoiceModal = (inv: SupplierInvoice) => {
    setEditingInvoiceModal(inv);
    setEditInvoiceNum(inv.invoiceNumber);
    setEditInvoiceDateStr(inv.date ? inv.date.split('T')[0] : '');
    setEditInvoiceAmountUsd((inv.totalAmountUsd || 0).toString());
  };

  const handleSaveEditInvoiceModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoiceModal) return;
    const res = await updateSupplierInvoice(editingInvoiceModal.id, {
      invoiceNumber: editInvoiceNum.trim(),
      date: editInvoiceDateStr,
      totalAmountUsd: parseFloat(editInvoiceAmountUsd) || 0,
    });
    if (res.success) {
      setEditingInvoiceModal(null);
      setSelectedInvoiceId(null);
      setStatusMessage({ type: 'success', text: 'Накладная успешно обновлена!' });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления накладной' });
    }
  };

  const handleDeleteInvoiceModal = async (id: string) => {
    if (!window.confirm('Вы действительно хотите удалить эту накладную и все её незапроданные устройства?')) return;
    const res = await deleteSupplierInvoice(id);
    if (res.success) {
      setSelectedInvoiceId(null);
      setStatusMessage({ type: 'success', text: 'Накладная успешно удалена!' });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
    }
  };

  // Mode: 'list' (History of purchases) or 'form' (Register new purchase intake)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');

  // List search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'SPECIFIC_MONTH' | 'ALL'>('SPECIFIC_MONTH');
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().substring(0, 7));
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const selectedInvoice = supplierInvoices.find((inv) => inv.id === selectedInvoiceId) || null;

  // Form states
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(suppliers[0]?.id || '');

  // Auto-generate sequential invoice number
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    return `INV-${((supplierInvoices?.length || 0) + 1).toString().padStart(4, '0')}`;
  });

  useEffect(() => {
    if (suppliers.length > 0 && (!selectedSupplierId || !suppliers.some(s => s.id === selectedSupplierId))) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  useEffect(() => {
    if (supplierInvoices) {
      setInvoiceNumber(`INV-${(supplierInvoices.length + 1).toString().padStart(4, '0')}`);
    }
  }, [supplierInvoices]);

  // Suppliers now load asynchronously from the API, so they're typically still empty
  // at mount time — resync once they arrive (but never clobber a manual selection).
  useEffect(() => {
    if (!selectedSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Destination mode (Main Warehouse intake is ADMIN ONLY)
  const [isStorePurchase, setIsStorePurchase] = useState<boolean>(currentUser?.role !== 'ADMIN');
  const [storeId, setStoreId] = useState<string>(stores.find(s => !s.isMainWarehouse)?.id || 'store-1');

  // Groups of devices
  const [groups, setGroups] = useState<PurchaseItemGroup[]>([
    {
      id: 'g-1',
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      storage: '256 GB',
      color: 'Black Titanium',
      purchasePriceUsd: 900,
      items: [{ imei: '', barcode: '' }]
    }
  ]);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [justSavedInvoice, setJustSavedInvoice] = useState<string | null>(null);

  // Current rate
  const rate = todayRate?.rate || 9.5;

  // Filtered list of purchase invoices
  const filteredInvoices = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return (supplierInvoices || []).filter((inv) => {
      // 1. Period filter
      const invDateStr = inv.date.split('T')[0];
      if (periodFilter === 'TODAY' && invDateStr !== todayStr) {
        return false;
      }
      if (periodFilter === 'SPECIFIC_MONTH' && !invDateStr.startsWith(selectedMonth)) {
        return false;
      }

      // 2. Supplier filter
      if (selectedSupplierFilter !== 'all' && inv.supplierId !== selectedSupplierFilter) {
        return false;
      }

      // 3. Search query (by invoice number, supplier name, or contained device IMEI/model)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesInvoiceNum = inv.invoiceNumber.toLowerCase().includes(q);
        const matchesSupplier = inv.supplierName.toLowerCase().includes(q);
        
        // Match devices belonging to this invoice
        const invoiceDevices = devices.filter(
          d => d.invoiceNumber === inv.invoiceNumber || (inv.id && d.purchaseInvoiceId === inv.id)
        );
        const matchesDevice = invoiceDevices.some(
          d => d.imei.toLowerCase().includes(q) ||
               (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
               (d.barcode && d.barcode.toLowerCase().includes(q)) ||
               d.model.toLowerCase().includes(q) ||
               d.brand.toLowerCase().includes(q)
        );

        if (!matchesInvoiceNum && !matchesSupplier && !matchesDevice) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [supplierInvoices, devices, periodFilter, selectedMonth, selectedSupplierFilter, searchQuery]);

  // Aggregate stats for invoices
  const totalInvoicesCount = filteredInvoices.length;
  const totalUnitsReceived = filteredInvoices.reduce((acc, inv) => acc + (inv.devicesCount || 0), 0);
  const totalSumUsd = filteredInvoices.reduce((acc, inv) => acc + (inv.totalAmountUsd || 0), 0);
  const totalDebtUsd = filteredInvoices.reduce((acc, inv) => acc + (inv.remainingAmountUsd || 0), 0);

  // Scan finder to locate purchase
  const handleScanFinder = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const matchedDevice = devices.find(d => d.imei === code || d.imei2 === code || d.barcode === code);
      if (matchedDevice && matchedDevice.invoiceNumber) {
        const matchedInv = supplierInvoices.find(inv => inv.invoiceNumber === matchedDevice.invoiceNumber);
        if (matchedInv) {
          setSelectedInvoiceId(matchedInv.id);
          return;
        }
      }

      const directInv = supplierInvoices.find(inv => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
      if (directInv) {
        setSelectedInvoiceId(directInv.id);
      } else {
        setSearchQuery(code);
      }
    });
  };

  // Form helpers
  const handleAddGroup = () => {
    setGroups(prev => [
      ...prev,
      {
        id: `g-${Date.now()}`,
        brand: 'Apple',
        model: 'iPhone 16',
        storage: '128 GB',
        color: 'Black',
        purchasePriceUsd: 700,
        items: [{ imei: '', barcode: '' }]
      }
    ]);
  };

  const handleRemoveGroup = (idx: number) => {
    setGroups(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateGroup = (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => {
    setGroups(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleAddImeiToGroup = (groupIdx: number) => {
    setGroups(prev => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      const lastItem = items[items.length - 1];
      const nextBarcode = incrementBarcode(lastItem?.barcode || '');
      items.push({ imei: '', barcode: nextBarcode });
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const handleRemoveImeiFromGroup = (groupIdx: number, itemIdx: number) => {
    setGroups(prev => {
      const next = [...prev];
      const items = next[groupIdx].items.filter((_, i) => i !== itemIdx);
      next[groupIdx] = {
        ...next[groupIdx],
        items: items.length > 0 ? items : [{ imei: '', barcode: '' }]
      };
      return next;
    });
  };

  const handleUpdateImei = (groupIdx: number, itemIdx: number, val: string) => {
    setGroups(prev => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items[itemIdx] = { ...items[itemIdx], imei: val };
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const handleUpdateBarcode = (groupIdx: number, itemIdx: number, val: string) => {
    setGroups(prev => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items[itemIdx] = { ...items[itemIdx], barcode: val };

      // Auto-propagate and auto-increment barcode to subsequent empty items
      let currentBarcode = val.trim();
      for (let i = itemIdx + 1; i < items.length; i++) {
        if (!items[i].barcode || items[i].barcode.trim() === '') {
          if (currentBarcode) {
            currentBarcode = incrementBarcode(currentBarcode);
            items[i] = { ...items[i], barcode: currentBarcode };
          }
        } else {
          break;
        }
      }

      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const getImeiPair = (value: string): [string, string] => {
    const [imei1 = '', imei2 = ''] = (value || '').split(/[\/,]/).map(part => part.trim());
    return [imei1, imei2];
  };

  const handleUpdateImei2 = (groupIdx: number, itemIdx: number, value: string) => {
    const [imei1] = getImeiPair(groups[groupIdx].items[itemIdx]?.imei || '');
    const imei2 = value.trim();
    handleUpdateImei(groupIdx, itemIdx, imei2 ? `${imei1} / ${imei2}` : imei1);
  };

  const handleScanImei = (groupIdx: number, itemIdx: number) => {
    openScanner((scannedCode) => {
      handleUpdateImei(groupIdx, itemIdx, scannedCode.trim());
    });
  };

  const handleScanBarcode = (groupIdx: number, itemIdx: number) => {
    openScanner((scannedCode) => {
      handleUpdateBarcode(groupIdx, itemIdx, scannedCode.trim());
    });
  };

  // Quick batch paste IMEI helper
  const handleBatchImeiPaste = (groupIdx: number, text: string) => {
    const rawLines = text.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
    if (rawLines.length > 0) {
      setGroups(prev => {
        const next = [...prev];
        const currentItems = next[groupIdx].items;
        let currentBarcode = currentItems[0]?.barcode?.trim() || '';

        const newItems: PurchaseItem[] = rawLines.map((imei, idx) => {
          if (idx === 0) {
            return { imei, barcode: currentBarcode };
          }
          currentBarcode = currentBarcode ? incrementBarcode(currentBarcode) : '';
          return { imei, barcode: currentBarcode };
        });

        next[groupIdx] = {
          ...next[groupIdx],
          items: newItems
        };
        return next;
      });
    }
  };

  // Calculate totals for new intake form
  const totalFormUnits = groups.reduce((acc, g) => acc + g.items.filter(i => i.imei.trim().length > 0).length, 0);
  const totalFormUsd = groups.reduce((acc, g) => {
    const count = g.items.filter(i => i.imei.trim().length > 0).length;
    return acc + (count * g.purchasePriceUsd);
  }, 0);

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!selectedSupplierId) {
      setStatusMessage({ type: 'error', text: 'Выберите поставщика' });
      return;
    }
    if (!invoiceNumber.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите номер накладной' });
      return;
    }
    if (!isStorePurchase && currentUser?.role !== 'ADMIN') {
      setStatusMessage({ type: 'error', text: 'Приход на Главный Склад разрешен только Администратору' });
      return;
    }

    const cleanGroups = groups.map(g => {
      let currentBCode = g.items[0]?.barcode?.trim() || ('200' + Math.floor(100000000 + Math.random() * 900000000).toString());
      const validItems = g.items
        .filter(i => i.imei.trim().length > 0)
        .map((i, idx) => {
          let itemBarcode = i.barcode.trim();
          if (!itemBarcode) {
            itemBarcode = idx === 0 ? currentBCode : (currentBCode = incrementBarcode(currentBCode));
          } else {
            currentBCode = itemBarcode;
          }
          return { imei: i.imei.trim(), barcode: itemBarcode };
        });

      return {
        brand: g.brand.trim(),
        model: g.model.trim(),
        storage: g.storage.trim(),
        color: g.color.trim(),
        purchasePriceUsd: g.purchasePriceUsd,
        items: validItems,
        imeis: validItems.map(i => i.imei),
        barcodes: validItems.map(i => i.barcode)
      };
    }).filter(g => g.items.length > 0);

    if (cleanGroups.length === 0) {
      setStatusMessage({ type: 'error', text: 'Добавьте хотя бы одно устройство с заполненным IMEI' });
      return;
    }

    const res = await createPurchase({
      supplierId: selectedSupplierId,
      invoiceNumber: invoiceNumber.trim(),
      date: purchaseDate,
      isStorePurchase,
      storeId: isStorePurchase ? storeId : undefined,
      groups: cleanGroups
    });

    if (res.success) {
      const savedNum = invoiceNumber.trim();
      setJustSavedInvoice(savedNum);

      // Reset form with a fresh invoice number
      setInvoiceNumber(`INV-${Math.floor(100 + Math.random() * 900)}`);
      setGroups([
        {
          id: `g-${Date.now()}`,
          brand: 'Apple',
          model: 'iPhone 16 Pro',
          storage: '256 GB',
          color: 'Black Titanium',
          purchasePriceUsd: 900,
          items: [{ imei: '', barcode: '' }]
        }
      ]);

      // Automatically switch back to the list of purchases as requested!
      setViewMode('list');
      setStatusMessage({
        type: 'success',
        text: `Приход по накладной ${savedNum} успешно сохранен (${cleanGroups.reduce((a, b) => a + b.items.length, 0)} шт.)!`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка сохранения прихода' });
    }
  };

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p className="text-sm font-medium">Доступ ограничен</p>
        <p className="text-xs text-zinc-600 mt-1">Оформление и просмотр приходов разрешены только Администраторам и Партнерам</p>
      </div>
    );
  }

  // =========================================================================
  // VIEW: HISTORY OF PURCHASES (ВСЕ ПРИХОДЫ)
  // =========================================================================
  if (viewMode === 'list') {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
        {/* Search & Filters Bar */}
        <div className="p-3 border-b border-border bg-surface space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Compact Search Bar with Scanner inside right corner */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск: № накладной / IMEI..."
                className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-9 py-2 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-fg-subtle hover:text-fg"
                  title="Очистить"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={handleScanFinder}
                  className="absolute right-2.5 top-2.5 text-accent hover:text-accent-strong transition-colors"
                  title="Сканировать IMEI или номер накладной"
                >
                  <Scan className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* New Purchase button right next to search */}
            <button
              onClick={() => {
                setStatusMessage(null);
                setViewMode('form');
              }}
              className="shrink-0 px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-accent-fg font-bold text-xs flex items-center space-x-1.5 transition-colors shadow-xs whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>НОВЫЙ ПРИХОД</span>
            </button>
          </div>

          {/* Period selector & Supplier Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedMonth(e.target.value);
                    setPeriodFilter('SPECIFIC_MONTH');
                  }
                }}
                onClick={() => setPeriodFilter('SPECIFIC_MONTH')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors bg-surface focus:outline-none cursor-pointer ${
                  periodFilter === 'SPECIFIC_MONTH'
                    ? 'border-accent text-accent font-bold'
                    : 'border-border text-fg-muted hover:border-fg-subtle'
                }`}
                title="Выберите месяц"
              />

              <button
                type="button"
                onClick={() => setPeriodFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase transition-colors ${
                  periodFilter === 'ALL'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface text-fg-muted hover:text-fg'
                }`}
              >
                Все приходы
              </button>
            </div>

            {/* Supplier selector filter */}
            <div className="flex items-center space-x-2">
              <span className="text-fg-subtle text-xs font-medium">Поставщик:</span>
              <select
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                className="bg-surface border border-border text-fg text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent"
              >
                <option value="all">Все поставщики</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Invoices List / Table */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800 bg-[#0B0E14]">
          {filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-mono">
              <Package className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-50" />
              <p className="text-xs">Приходы не найдены</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Нажмите «Новый приход», чтобы зарегистрировать партию товара
              </p>
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const isPaid = inv.status === 'PAID';
              const isPartial = inv.status === 'PARTIALLY_PAID';
              const isJustSaved = justSavedInvoice === inv.invoiceNumber;
              const locationLabel = inv.isStorePurchase && inv.storeId
                ? (stores.find(s => s.id === inv.storeId)?.name || 'Магазин')
                : 'Главный склад';

              return (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoiceId(inv.id)}
                  className={`p-3 sm:p-3.5 hover:bg-slate-900/60 cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isJustSaved ? 'bg-emerald-500/15 border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded bg-slate-900 border border-slate-800 text-emerald-400 shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-slate-100">
                          {inv.invoiceNumber}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${
                          isPaid ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                          isPartial ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                          'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}>
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                        {(inv.totalAmountUsd === 0 || inv.invoiceNumber.includes('BONUS')) && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            🎁 ПОДАРОК ($0)
                          </span>
                        )}
                        {isJustSaved && (
                          <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.2 rounded font-bold uppercase">
                            НОВОЕ
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 mt-1 font-mono">
                        <span className="text-slate-300 font-semibold flex items-center space-x-1">
                          <Truck className="w-3 h-3 text-slate-500" />
                          <span>{inv.supplierName}</span>
                        </span>
                        <span className="text-slate-500">•</span>
                        <span>{inv.date}</span>
                        <span className="text-slate-500">•</span>
                        <span className="flex items-center space-x-1 text-slate-300">
                          <StoreIcon className="w-3 h-3 text-slate-500" />
                          <span>{locationLabel}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right font-mono">
                      <div className="text-xs font-bold text-slate-100">
                        {inv.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(inv.totalAmountUsd || 0).toLocaleString()}`}
                        {inv.totalAmountUsd > 0 && (
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            (~{Math.round((inv.totalAmountUsd || 0) * rate).toLocaleString()} TJS)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center sm:justify-end space-x-2 mt-0.5">
                        <span className="text-emerald-400 font-bold">{inv.devicesCount || 0} шт.</span>
                        {inv.remainingAmountUsd > 0 && (
                          <span className="text-rose-400">Долг: ${inv.remainingAmountUsd.toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="p-1.5 rounded bg-slate-900 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700"
                      title="Подробнее"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INVOICE DETAILS MODAL */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs">
            <div className="w-full max-w-2xl rounded-xl bg-[#0F1219] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
              {/* Modal Header */}
              <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-[#0B0E14] flex items-center justify-between shrink-0 font-mono">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <div>
                    <h3 className="text-xs font-bold text-slate-100 flex items-center space-x-2">
                      <span>НАКЛАДНАЯ {selectedInvoice.invoiceNumber}</span>
                      {(selectedInvoice.totalAmountUsd === 0 || selectedInvoice.invoiceNumber.includes('BONUS')) && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-normal">
                          🎯 Target Bonus ($0)
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Поставщик: {selectedInvoice.supplierName} • {selectedInvoice.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                    <>
                      <button
                        onClick={() => handleStartEditInvoiceModal(selectedInvoice)}
                        className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                        title="Редактировать накладную"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteInvoiceModal(selectedInvoice.id)}
                        className="p-1.5 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Удалить накладную"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedInvoiceId(null)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-3 bg-[#0B0E14]/80 border-b border-slate-800 grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="bg-[#0F1219] p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">СУММА НАКЛАДНОЙ</span>
                  <strong className={selectedInvoice.totalAmountUsd === 0 ? "text-purple-300 font-bold" : "text-slate-100 font-bold"}>
                    {selectedInvoice.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(selectedInvoice.totalAmountUsd || 0).toLocaleString()}`}
                  </strong>
                </div>
                <div className="bg-[#0F1219] p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">ОПЛАЧЕНО</span>
                  <strong className="text-emerald-400 font-bold">${(selectedInvoice.paidAmountUsd || 0).toLocaleString()}</strong>
                </div>
                <div className="bg-[#0F1219] p-2 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">ОСТАТОК ДОЛГА</span>
                  <strong className="text-rose-400 font-bold">${(selectedInvoice.remainingAmountUsd || 0).toLocaleString()}</strong>
                </div>
              </div>

              {/* Contained Devices List */}
              {(() => {
                const containedDevices = devices.filter(d => 
                  d.invoiceNumber === selectedInvoice.invoiceNumber ||
                  (selectedInvoice.id && d.purchaseInvoiceId === selectedInvoice.id) ||
                  (selectedInvoice.invoiceNumber.includes('112') && d.invoiceNumber === 'INV-112-BONUS')
                );

                return (
                  <>
                    <div className="p-3 bg-[#0F1219] border-b border-slate-800 flex items-center justify-between text-xs font-mono font-bold text-slate-300 shrink-0">
                      <span>Устройства в накладной</span>
                      <span className="text-emerald-400">
                        {containedDevices.length} шт.
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0B0E14] font-mono">
                      {containedDevices.map((dev, idx) => (
                        <div
                          key={dev.id}
                          className="p-2.5 rounded bg-[#0F1219] border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className="text-slate-400 text-[10px] font-bold">#{idx + 1}</span>
                              <strong className="text-slate-100">{dev.brand} {dev.model}</strong>
                              <span className="text-slate-400 text-[11px]">{dev.storage} • {dev.color}</span>
                              {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-medium">
                                  🎁 ПОДАРОК ($0)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
                              <span>IMEI 1: <strong className="text-slate-300">{dev.imei}</strong></span>
                              <span>IMEI 2: <strong className={dev.imei2 ? "text-slate-300" : "text-slate-500 font-normal"}>{dev.imei2 || '—'}</strong></span>
                              <span>Штрихкод (EAN): <strong className={dev.barcode ? "text-amber-400 font-mono" : "text-slate-500 font-normal"}>{dev.barcode || '—'}</strong></span>
                              <span>Локация: <strong className="text-slate-300">{dev.locationName}</strong></span>
                            </div>
                            {dev.bonusCampaign && (
                              <p className="text-[10px] text-purple-400 mt-0.5">
                                {dev.bonusCampaign}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-xs font-bold font-mono ${dev.purchaseCostUsd === 0 ? 'text-purple-300' : 'text-emerald-400'}`}>
                              {dev.purchaseCostUsd === 0 ? '$0 (ПОДАРОК)' : `$${dev.purchaseCostUsd}`}
                            </span>
                            <span className={`block text-[10px] px-1.5 py-0.2 rounded font-bold mt-0.5 ${
                              dev.status === 'SOLD' ? 'text-amber-400' : 'text-slate-400'
                            }`}>
                              {dev.status === 'SOLD' ? 'ПРОДАН' : 'НА СКЛАДЕ'}
                            </span>
                          </div>
                        </div>
                      ))}

                      {containedDevices.length === 0 && (
                        <p className="text-xs text-slate-500 text-center py-6">
                          Устройства для этой архивной накладной были оприходованы ранее
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Modal Footer */}
              <div className="p-3 border-t border-slate-800 bg-[#0F1219] flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedInvoiceId(null)}
                  className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors font-mono"
                >
                  ЗАКРЫТЬ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW: NEW PURCHASE FORM (ФОРМА НОВОГО ПРИХОДА)
  // =========================================================================
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-bg text-fg min-h-0">
      <form onSubmit={handleSubmitPurchase} className="flex-1 flex flex-col min-h-full">
        {/* Top Header with Back Button */}
        <div className="p-3.5 sm:p-4 border-b border-zinc-800 bg-zinc-900/80 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  setViewMode('list');
                }}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-mono font-bold transition-colors border border-zinc-700"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>СПИСОК ПРИХОДОВ</span>
              </button>
              <span className="text-zinc-500">/</span>
              <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wider font-mono">
                НОВЫЙ ПРИХОД ТОВАРОВ
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Поставщик</label>
              <select
                value={selectedSupplierId ?? ''}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (Долг: ${s.totalDebtUsd})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Номер накладной</label>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none uppercase"
                placeholder="INV-999"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1 font-medium">Дата прихода</label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Destination location selector */}
          <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-4">
              {currentUser?.role === 'ADMIN' && (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dest"
                    checked={!isStorePurchase}
                    onChange={() => setIsStorePurchase(false)}
                    className="text-emerald-500 focus:ring-blue-500"
                  />
                  <span className="text-zinc-300 font-medium">Приход на Главный склад</span>
                </label>
              )}

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="dest"
                  checked={isStorePurchase}
                  onChange={() => setIsStorePurchase(true)}
                  className="text-emerald-500 focus:ring-blue-500"
                />
                <span className="text-zinc-300 font-medium">Прямой приход в магазин</span>
              </label>
            </div>

            {isStorePurchase && (
              <div className="flex items-center space-x-2">
                <span className="text-zinc-400">Магазин:</span>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="rounded bg-zinc-950 border border-zinc-700 px-3 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                >
                  {stores.filter(s => !s.isMainWarehouse).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Groups list */}
        <div className="flex-1 p-3.5 sm:p-4 space-y-4 bg-zinc-950 pb-8">
          {groups.map((group, groupIdx) => (
            <div
              key={group.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3.5 sm:p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider font-mono">
                  Позиция #{groupIdx + 1}
                </span>

                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveGroup(groupIdx)}
                    className="text-zinc-500 hover:text-rose-400 p-1 transition-colors"
                    title="Удалить позицию"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Group Specs Form */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs font-mono">
                <div>
                  <label className="block text-zinc-400 mb-1">Бренд</label>
                  <input
                    type="text"
                    required
                    value={group.brand}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'brand', e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Модель</label>
                  <input
                    type="text"
                    required
                    value={group.model}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'model', e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Память</label>
                  <input
                    type="text"
                    value={group.storage}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'storage', e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    placeholder="128 GB"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Цвет</label>
                  <input
                    type="text"
                    value={group.color}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'color', e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    placeholder="Black"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Цена закупки ($)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={group.purchasePriceUsd || ''}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2.5 py-1.5 text-xs text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* IMEI Input List with Batch Paste */}
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-300 font-mono">
                      Список IMEI ({group.items.filter(i => i.imei.trim().length > 0).length} шт.)
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Сумма: ${group.items.filter(i => i.imei.trim().length > 0).length * group.purchasePriceUsd}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleAddImeiToGroup(groupIdx)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Добавить устройство</span>
                    </button>
                  </div>
                </div>

                {/* Batch Paste text helper */}
                <div className="pt-1">
                  <input
                    type="text"
                    placeholder="Быстрая вставка списка IMEI (через пробел, запятую или Dual SIM: IMEI 1 / IMEI 2)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleBatchImeiPaste(groupIdx, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim().length > 15) {
                        handleBatchImeiPaste(groupIdx, e.target.value);
                        e.target.value = '';
                      }
                    }}
                    className="w-full rounded bg-zinc-950/70 border border-dashed border-zinc-800 px-3 py-1 text-[11px] font-mono text-zinc-300 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1 font-mono">
                  {group.items.map((item, itemIdx) => {
                    const [imei1, imei2] = getImeiPair(item.imei);
                    return (
                      <div key={itemIdx} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-zinc-400 mb-1">Штрихкод (EAN) <span className="text-rose-400">*</span></label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              required
                              value={item.barcode}
                              onChange={(e) => handleUpdateBarcode(groupIdx, itemIdx, e.target.value)}
                              className="min-w-0 flex-1 rounded bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-amber-400 font-mono focus:border-emerald-500 focus:outline-none"
                              placeholder="EAN-13 / UPC *"
                            />
                            <button
                              type="button"
                              onClick={() => handleScanBarcode(groupIdx, itemIdx)}
                              className="shrink-0 rounded bg-zinc-800 p-1.5 text-amber-400 hover:bg-zinc-700 hover:text-amber-300 transition-colors"
                              title="Сканировать EAN"
                              aria-label="Сканировать EAN"
                            >
                              <Scan className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-zinc-400 mb-1">IMEI 1</label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={imei1}
                              onChange={(e) => handleUpdateImei(groupIdx, itemIdx, `${e.target.value} / ${imei2}`.replace(/ \/ $/, ''))}
                              placeholder="IMEI 1"
                              className="w-full rounded bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => handleScanImei(groupIdx, itemIdx)}
                              className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-emerald-400 p-0.5"
                              title="Сканировать IMEI 1"
                              aria-label="Сканировать IMEI 1"
                            >
                              <Scan className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-end gap-1">
                          <div className="relative flex-1">
                            <label className="block text-zinc-400 mb-1">IMEI 2 <span className="text-zinc-600">(необязательно)</span></label>
                            <input
                              type="text"
                              value={imei2}
                              onChange={(e) => handleUpdateImei2(groupIdx, itemIdx, e.target.value)}
                              placeholder="IMEI 2 (необязательно)"
                              className="w-full rounded bg-zinc-950 border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-none pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => openScanner((scannedCode) => handleUpdateImei2(groupIdx, itemIdx, scannedCode))}
                              className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-emerald-400 p-0.5"
                              title="Сканировать IMEI 2"
                              aria-label="Сканировать IMEI 2"
                            >
                              <Scan className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {group.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveImeiFromGroup(groupIdx, itemIdx)}
                              className="text-zinc-600 hover:text-rose-400 p-1"
                              title="Удалить устройство"
                              aria-label="Удалить устройство"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Button to add another position */}
          <button
            type="button"
            onClick={handleAddGroup}
            className="w-full py-2.5 rounded-lg border border-dashed border-zinc-800 hover:border-emerald-500/50 bg-zinc-900/40 hover:bg-zinc-900/80 text-zinc-400 hover:text-emerald-400 text-xs font-mono font-bold flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>ДОБАВИТЬ ЕЩЕ МОДЕЛЬ / ПОЗИЦИЮ В НАКЛАДНУЮ</span>
          </button>
        </div>

        {/* Bottom Actions & Total Bar (Sticky at bottom) */}
        <div className="sticky bottom-0 z-20 p-3.5 sm:p-4 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-lg font-mono">
          {statusMessage ? (
            <div className={`flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          ) : (
            <div className="text-xs text-zinc-400">
              Позиций: <strong className="text-zinc-200">{groups.length}</strong> • 
              Устройств: <strong className="text-emerald-400 font-bold text-sm ml-1">{totalFormUnits} шт.</strong>
            </div>
          )}

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <div className="text-right mr-2">
              <span className="text-[10px] text-zinc-400 block">ИТОГОВАЯ СУММА НАКЛАДНОЙ:</span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                ${totalFormUsd.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setStatusMessage(null);
                setViewMode('list');
              }}
              className="px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={totalFormUnits === 0}
              className="px-5 py-2 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white shadow transition-colors flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>СОХРАНИТЬ ПРИХОД</span>
            </button>
          </div>
        </div>
      </form>

      {/* Edit Invoice Modal */}
      {editingInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-mono">
          <div className="w-full max-w-md rounded-2xl bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-100 uppercase">РЕДАКТИРОВАТЬ НАКЛАДНУЮ</h3>
              </div>
              <button onClick={() => setEditingInvoiceModal(null)} className="p-1 rounded text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInvoiceModal} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">НОМЕР НАКЛАДНОЙ</label>
                <input
                  type="text"
                  required
                  value={editInvoiceNum}
                  onChange={(e) => setEditInvoiceNum(e.target.value)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ДАТА НАКЛАДНОЙ</label>
                <input
                  type="date"
                  required
                  value={editInvoiceDateStr}
                  onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">СУММА НАКЛАДНОЙ ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={editInvoiceAmountUsd}
                  onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 px-3 py-2 text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none font-mono"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingInvoiceModal(null)}
                  className="flex-1 py-2 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 font-bold"
                >
                  ОТМЕНА
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-bold"
                >
                  СОХРАНИТЬ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
