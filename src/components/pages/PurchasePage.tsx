import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SupplierInvoice, Device } from '../../types';
import {
  Plus,
  Trash2,
  Scan,
  AlertCircle,
  CheckCircle2,
  Truck,
  Store as StoreIcon,
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  Package,
  FileText,
  Edit2,
  Loader2
} from 'lucide-react';
import { soundEffects } from '../../utils/sound';

interface PurchaseItem {
  imei: string;
}

interface PurchaseItemGroup {
  id: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  purchasePriceUsd: number;
  items: PurchaseItem[];
}

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
    if (!editingInvoiceModal || isSubmitting) return;
    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInvoiceModal = async (id: string) => {
    if (isSubmitting) return;
    if (!window.confirm('Вы действительно хотите удалить эту накладную и все её незапроданные устройства?')) return;
    setIsSubmitting(true);
    try {
      const res = await deleteSupplierInvoice(id);
      if (res.success) {
        setSelectedInvoiceId(null);
        setStatusMessage({ type: 'success', text: 'Накладная успешно удалена!' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Mode: 'list' (History of purchases) or 'form' (Register new purchase intake)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [expandedDeviceGroups, setExpandedDeviceGroups] = useState<Record<string, boolean>>({});

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

  // Suppliers now load asynchronously from the API, so they're typically still empty
  // at mount time — resync once they arrive (but never clobber a manual selection).
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
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Destination mode (Main Warehouse intake is ADMIN ONLY)
  const [isStorePurchase, setIsStorePurchase] = useState<boolean>(currentUser?.role !== 'ADMIN');
  const [storeId, setStoreId] = useState<string>(stores.find(s => !s.isMainWarehouse)?.id || 'store-1');

  // Groups of devices
  const [groups, setGroups] = useState<PurchaseItemGroup[]>([
    {
      id: 'g-1',
      brand: '',
      model: '',
      ram: '',
      storage: '',
      color: '',
      purchasePriceUsd: 0,
      items: [{ imei: '' }]
    }
  ]);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSavedInvoice, setJustSavedInvoice] = useState<string | null>(null);

  // Current rate
  const rate = todayRate?.rate || 9.5;

  // Autocomplete suggestion lists derived from database devices and standard presets
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Realme', 'Huawei', 'Nothing']);
    (devices || []).forEach(d => { if (d.brand) set.add(d.brand.trim()); });
    return Array.from(set).sort();
  }, [devices]);

  const getModelOptions = useCallback((selectedBrand: string) => {
    const set = new Set<string>();
    const brandLower = (selectedBrand || '').trim().toLowerCase();
    (devices || []).forEach(d => {
      if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
        set.add(d.model.trim());
      }
    });
    return Array.from(set).sort();
  }, [devices]);

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (devices || []).forEach(d => {
      if (d.ram) set.add(d.ram.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (devices || []).forEach(d => {
      if (d.storage) set.add(d.storage.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>([
      'Black', 'White', 'Titanium', 'Natural Titanium', 'Black Titanium',
      'Desert Titanium', 'Midnight', 'Starlight', 'Silver', 'Gold',
      'Blue', 'Graphite', 'Purple', 'Green'
    ]);
    (devices || []).forEach(d => { if (d.color) set.add(d.color.trim()); });
    return Array.from(set).sort();
  }, [devices]);

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
      const matchedDevice = devices.find(d => d.imei === code || d.imei2 === code);
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
        brand: '',
        model: '',
        ram: '',
        storage: '',
        color: '',
        purchasePriceUsd: 0,
        items: [{ imei: '' }]
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
    soundEffects.playAddToCartSuccess();
    setGroups(prev => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items.push({ imei: '' });
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
        items: items.length > 0 ? items : [{ imei: '' }]
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

  // Quick batch paste IMEI helper
  const handleBatchImeiPaste = (groupIdx: number, text: string) => {
    const rawLines = text.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
    if (rawLines.length > 0) {
      soundEffects.playAddToCartSuccess();
      setGroups(prev => {
        const next = [...prev];
        const newItems: PurchaseItem[] = rawLines.map((imei) => ({ imei }));

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
    if (isSubmitting) return;
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
      const validItems = g.items
        .filter(i => i.imei.trim().length > 0)
        .map(i => ({ imei: i.imei.trim() }));

      const ramStr = g.ram?.trim() || '';
      const storageStr = g.storage.trim();
      const combinedStorage = ramStr && !storageStr.toLowerCase().includes(ramStr.toLowerCase())
        ? `${ramStr} / ${storageStr}`
        : storageStr;

      return {
        brand: g.brand.trim(),
        model: g.model.trim(),
        ram: ramStr || undefined,
        storage: combinedStorage,
        color: g.color.trim(),
        purchasePriceUsd: g.purchasePriceUsd,
        items: validItems,
        imeis: validItems.map(i => i.imei)
      };
    }).filter(g => g.items.length > 0);

    if (cleanGroups.length === 0) {
      setStatusMessage({ type: 'error', text: 'Добавьте хотя бы одно устройство с заполненным IMEI' });
      return;
    }

    setIsSubmitting(true);
    try {
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

        // invoiceNumber resets automatically via the useEffect watching supplierInvoices
        // once the post-save refetch lands, picking the next sequential INV-XXXX number.
        setGroups([
          {
            id: `g-${Date.now()}`,
            brand: '',
            model: '',
            ram: '',
            storage: '',
            color: '',
            purchasePriceUsd: 0,
            items: [{ imei: '' }]
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
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-fg-subtle">
        <p className="text-sm font-medium text-fg">Доступ ограничен</p>
        <p className="text-xs mt-1">Оформление и просмотр приходов разрешены только Администраторам и Партнерам</p>
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
        <div className="flex-1 overflow-y-auto divide-y divide-border bg-bg">
          {filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-fg-subtle">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-xs">Приходы не найдены</p>
              <p className="text-[11px] mt-1">
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
                  className={`p-3 sm:p-3.5 hover:bg-surface-raised cursor-pointer transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isJustSaved ? 'bg-accent/15 border-l-4 border-l-accent' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 rounded-lg bg-surface border border-border text-accent shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-fg">
                          {inv.invoiceNumber}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          isPaid ? 'bg-accent/15 text-accent border border-accent/30' :
                          isPartial ? 'bg-warning/15 text-warning border border-warning/30' :
                          'bg-danger/15 text-danger border border-danger/30'
                        }`}>
                          {isPaid ? 'Оплачена' : isPartial ? 'Частично' : 'Не оплачена'}
                        </span>
                        {(inv.totalAmountUsd === 0 || inv.invoiceNumber.includes('BONUS')) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-purple-500/20 text-purple-400 border border-purple-500/40">
                            🎁 ПОДАРОК ($0)
                          </span>
                        )}
                        {isJustSaved && (
                          <span className="text-[9px] bg-accent text-accent-fg px-1.5 py-0.2 rounded font-bold uppercase">
                            НОВОЕ
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle mt-1">
                        <span className="text-fg-muted font-semibold flex items-center space-x-1">
                          <Truck className="w-3 h-3 text-fg-subtle" />
                          <span>{inv.supplierName}</span>
                        </span>
                        <span>•</span>
                        <span>{inv.date}</span>
                        <span>•</span>
                        <span className="flex items-center space-x-1 text-fg-muted">
                          <StoreIcon className="w-3 h-3 text-fg-subtle" />
                          <span>{locationLabel}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end space-x-4 pl-11 sm:pl-0">
                    <div className="text-left sm:text-right">
                      <div className="text-xs font-bold text-fg">
                        {inv.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(inv.totalAmountUsd || 0).toLocaleString()}`}
                        {inv.totalAmountUsd > 0 && (
                          <span className="text-[10px] text-fg-subtle font-normal ml-1">
                            (~{Math.round((inv.totalAmountUsd || 0) * rate).toLocaleString()} TJS)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-fg-subtle flex items-center sm:justify-end space-x-2 mt-0.5">
                        <span className="text-accent font-bold">{inv.devicesCount || 0} шт.</span>
                        {inv.remainingAmountUsd > 0 && (
                          <span className="text-danger">Долг: ${inv.remainingAmountUsd.toLocaleString()}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEditInvoiceModal(inv)}
                            className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border transition-colors"
                            title="Редактировать накладную"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInvoiceModal(inv.id)}
                            className="p-1.5 rounded-lg bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border transition-colors"
                            title="Удалить накладную"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className="p-1.5 rounded-lg bg-surface-raised text-fg-subtle hover:text-fg border border-border"
                        title="Подробнее"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INVOICE DETAILS MODAL */}
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
              {/* Modal Header */}
              <div className="p-3.5 sm:p-4 border-b border-border bg-surface flex items-center justify-between shrink-0 font-mono">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-accent" />
                  <div>
                    <h3 className="text-xs font-bold text-fg flex items-center space-x-2">
                      <span>НАКЛАДНАЯ {selectedInvoice.invoiceNumber}</span>
                      {(selectedInvoice.totalAmountUsd === 0 || selectedInvoice.invoiceNumber.includes('BONUS')) && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-normal">
                          🎯 Target Bonus ($0)
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-fg-subtle">
                      Поставщик: {selectedInvoice.supplierName} • {selectedInvoice.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {(currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER') && (
                    <>
                      <button
                        onClick={() => handleStartEditInvoiceModal(selectedInvoice)}
                        className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-accent border border-border transition-colors"
                        title="Редактировать накладную"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteInvoiceModal(selectedInvoice.id)}
                        className="p-1.5 rounded-lg bg-surface-raised hover:bg-danger/20 text-fg-subtle hover:text-danger border border-border transition-colors"
                        title="Удалить накладную"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedInvoiceId(null)}
                    className="p-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-subtle hover:text-fg border border-border transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-3 bg-surface-raised border-b border-border grid grid-cols-3 gap-2 text-center text-xs font-mono">
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <span className="text-[10px] text-fg-subtle block font-semibold uppercase">СУММА НАКЛАДНОЙ</span>
                  <strong className={selectedInvoice.totalAmountUsd === 0 ? "text-purple-400 font-bold" : "text-fg font-bold"}>
                    {selectedInvoice.totalAmountUsd === 0 ? '$0 (БОНУС)' : `$${(selectedInvoice.totalAmountUsd || 0).toLocaleString()}`}
                  </strong>
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <span className="text-[10px] text-fg-subtle block font-semibold uppercase">ОПЛАЧЕНО</span>
                  <strong className="text-accent font-bold">${(selectedInvoice.paidAmountUsd || 0).toLocaleString()}</strong>
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <span className="text-[10px] text-fg-subtle block font-semibold uppercase">ОСТАТОК ДОЛГА</span>
                  <strong className="text-danger font-bold">${(selectedInvoice.remainingAmountUsd || 0).toLocaleString()}</strong>
                </div>
              </div>

              {/* Contained Devices List */}
              {(() => {
                const containedDevices = devices.filter(d =>
                  (selectedInvoice.id && d.purchaseInvoiceId === selectedInvoice.id) ||
                  d.invoiceNumber === selectedInvoice.invoiceNumber
                );

                const renderDeviceRow = (dev: Device, idx: number) => (
                  <div
                    key={dev.id}
                    className="p-2.5 rounded-xl bg-surface-raised border border-border flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="text-fg-subtle text-[10px] font-bold">#{idx + 1}</span>
                        <strong className="text-fg">{dev.brand} {dev.model}</strong>
                        <span className="text-fg-subtle text-[11px]">{dev.ram ? `${dev.ram} • ` : ''}{dev.storage} • {dev.color}</span>
                        {(dev.purchaseCostUsd === 0 || dev.isBonus) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/40 font-medium">
                            🎁 ПОДАРОК ($0)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-fg-subtle mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
                        <span>IMEI 1: <strong className="text-fg">{dev.imei}</strong></span>
                        <span>IMEI 2: <strong className={dev.imei2 ? "text-fg" : "text-fg-subtle font-normal"}>{dev.imei2 || '—'}</strong></span>
                        <span>Локация: <strong className="text-fg">{dev.locationName}</strong></span>
                      </div>
                      {dev.bonusCampaign && (
                        <p className="text-[10px] text-purple-400 mt-0.5">
                          {dev.bonusCampaign}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`text-xs font-bold font-mono ${dev.purchaseCostUsd === 0 ? 'text-purple-400' : 'text-accent'}`}>
                        {dev.purchaseCostUsd === 0 ? '$0 (ПОДАРОК)' : `$${dev.purchaseCostUsd}`}
                      </span>
                      <span className={`block text-[10px] px-1.5 py-0.2 rounded-md font-bold mt-0.5 ${
                        dev.status === 'SOLD' ? 'text-warning' : 'text-fg-subtle'
                      }`}>
                        {dev.status === 'SOLD' ? 'ПРОДАН' : 'НА СКЛАДЕ'}
                      </span>
                    </div>
                  </div>
                );

                // Group devices by variant (brand/ram/storage/color) whenever the
                // invoice actually recorded groups at intake — otherwise a flat list
                // is just as informative and avoids grouping single-item invoices.
                const hasGroups = Array.isArray(selectedInvoice.groups) && selectedInvoice.groups.length > 0;
                const variantGroups = new Map<string, { brand: string; model: string; ram?: string; storage: string; color: string; devices: Device[] }>();
                if (hasGroups) {
                  for (const dev of containedDevices) {
                    const key = `${dev.brand}|${dev.model}|${dev.ram || ''}|${dev.storage}|${dev.color}`;
                    let g = variantGroups.get(key);
                    if (!g) {
                      g = { brand: dev.brand, model: dev.model, ram: dev.ram, storage: dev.storage, color: dev.color, devices: [] };
                      variantGroups.set(key, g);
                    }
                    g.devices.push(dev);
                  }
                }

                return (
                  <>
                    <div className="p-3 bg-surface-raised border-b border-border flex items-center justify-between text-xs font-mono font-bold text-fg shrink-0">
                      <span>Устройства в накладной</span>
                      <span className="text-accent">
                        {containedDevices.length} шт.
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-surface font-mono">
                      {hasGroups && variantGroups.size > 0 ? (
                        Array.from(variantGroups.entries()).map(([key, group]) => {
                          const isExpanded = expandedDeviceGroups[key] ?? false;
                          const soldCount = group.devices.filter(d => d.status === 'SOLD').length;
                          return (
                            <div key={key} className="rounded-xl border border-border bg-surface-raised overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setExpandedDeviceGroups(prev => ({ ...prev, [key]: !isExpanded }))}
                                className="w-full p-2.5 flex items-center justify-between text-xs hover:bg-surface transition-colors"
                              >
                                <div className="text-left">
                                  <strong className="text-fg">{group.brand} {group.model}</strong>
                                  <span className="text-fg-subtle text-[11px] ml-2">{group.ram ? `${group.ram} • ` : ''}{group.storage} • {group.color}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-accent font-bold">{group.devices.length} шт.</span>
                                  {soldCount > 0 && <span className="text-[10px] text-warning">({soldCount} продано)</span>}
                                  <ChevronRight className={`w-4 h-4 text-fg-subtle transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                              </button>
                              {isExpanded && (
                                <div className="p-2 pt-0 space-y-2 border-t border-border">
                                  {group.devices.map((dev, idx) => renderDeviceRow(dev, idx))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        containedDevices.map((dev, idx) => renderDeviceRow(dev, idx))
                      )}

                      {containedDevices.length === 0 && (
                        <p className="text-xs text-fg-subtle text-center py-6">
                          Устройства для этой архивной накладной были оприходованы ранее
                        </p>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Modal Footer */}
              <div className="p-3 border-t border-border bg-surface flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedInvoiceId(null)}
                  className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-bold text-fg transition-colors font-mono uppercase"
                >
                  ЗАКРЫТЬ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT INVOICE MODAL */}
        {editingInvoiceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl p-5 space-y-4 font-mono">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-xs font-bold text-fg uppercase">РЕДАКТИРОВАНИЕ НАКЛАДНОЙ</h3>
                <button
                  type="button"
                  onClick={() => setEditingInvoiceModal(null)}
                  className="text-fg-subtle hover:text-fg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditInvoiceModal} className="space-y-3 text-xs">
                <div>
                  <label className="block text-fg-subtle text-[10px] uppercase mb-1">НОМЕР НАКЛАДНОЙ</label>
                  <input
                    type="text"
                    required
                    value={editInvoiceNum}
                    onChange={(e) => setEditInvoiceNum(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg font-bold focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle text-[10px] uppercase mb-1">ДАТА НАКЛАДНОЙ</label>
                  <input
                    type="date"
                    required
                    value={editInvoiceDateStr}
                    onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-fg-subtle text-[10px] uppercase mb-1">СУММА НАКЛАДНОЙ ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    value={editInvoiceAmountUsd}
                    onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent font-bold focus:border-accent focus:outline-none font-mono"
                  />
                </div>

                <div className="flex space-x-2 pt-3 border-t border-border">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setEditingInvoiceModal(null)}
                    className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg font-bold disabled:opacity-50"
                  >
                    ОТМЕНА
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isSubmitting ? 'СОХРАНЕНИЕ…' : 'СОХРАНИТЬ'}
                  </button>
                </div>
              </form>
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
        <div className="p-3.5 sm:p-4 border-b border-border bg-surface space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  setStatusMessage(null);
                  setViewMode('list');
                }}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-surface-raised hover:bg-surface text-fg-muted hover:text-fg text-xs font-bold transition-colors border border-border"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>СПИСОК ПРИХОДОВ</span>
              </button>
              <span className="text-fg-subtle">/</span>
              <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                НОВЫЙ ПРИХОД ТОВАРОВ
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-fg-subtle mb-1 font-medium">Поставщик</label>
              <select
                value={selectedSupplierId ?? ''}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (Долг: ${s.totalDebtUsd})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-fg-subtle mb-1 font-medium">Номер накладной</label>
              <input
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none uppercase"
                placeholder="INV-999"
              />
            </div>

            <div>
              <label className="block text-fg-subtle mb-1 font-medium">Дата прихода</label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg bg-surface-raised border border-border px-3 py-2 text-xs text-fg focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Destination location selector */}
          <div className="pt-2 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-4">
              {currentUser?.role === 'ADMIN' && (
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dest"
                    checked={!isStorePurchase}
                    onChange={() => setIsStorePurchase(false)}
                    className="text-accent focus:ring-accent"
                  />
                  <span className="text-fg-muted font-medium">Приход на Главный склад</span>
                </label>
              )}

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="dest"
                  checked={isStorePurchase}
                  onChange={() => setIsStorePurchase(true)}
                  className="text-accent focus:ring-accent"
                />
                <span className="text-fg-muted font-medium">Прямой приход в магазин</span>
              </label>
            </div>

            {isStorePurchase && (
              <div className="flex items-center space-x-2">
                <span className="text-fg-subtle">Магазин:</span>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="rounded-lg bg-surface-raised border border-border px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
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
        <div className="flex-1 p-3.5 sm:p-4 space-y-4 bg-bg pb-8">
          {groups.map((group, groupIdx) => (
            <div
              key={group.id}
              className="rounded-xl border border-border bg-surface shadow-xs p-3.5 sm:p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-bold text-fg uppercase tracking-wider font-mono">
                  Позиция #{groupIdx + 1}
                </span>

                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveGroup(groupIdx)}
                    className="text-fg-subtle hover:text-danger p-1 transition-colors"
                    title="Удалить позицию"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Group Specs Form */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 text-xs font-mono">
                <div>
                  <label className="block text-fg-subtle mb-1">Бренд</label>
                  <input
                    type="text"
                    required
                    list={`brand-suggestions-${groupIdx}`}
                    value={group.brand}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'brand', e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    placeholder="Apple"
                  />
                  <datalist id={`brand-suggestions-${groupIdx}`}>
                    {brandOptions.map(b => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Модель</label>
                  <input
                    type="text"
                    required
                    list={`model-suggestions-${groupIdx}`}
                    value={group.model}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'model', e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    placeholder="iPhone 16 Pro"
                  />
                  <datalist id={`model-suggestions-${groupIdx}`}>
                    {getModelOptions(group.brand).map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">RAM</label>
                  <input
                    type="text"
                    list={`ram-suggestions-${groupIdx}`}
                    value={group.ram || ''}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'ram', e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    placeholder="8 GB"
                  />
                  <datalist id={`ram-suggestions-${groupIdx}`}>
                    {ramOptions.map(r => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Память</label>
                  <input
                    type="text"
                    list={`storage-suggestions-${groupIdx}`}
                    value={group.storage}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'storage', e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    placeholder="256 GB"
                  />
                  <datalist id={`storage-suggestions-${groupIdx}`}>
                    {storageOptions.map(s => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Цвет</label>
                  <input
                    type="text"
                    list={`color-suggestions-${groupIdx}`}
                    value={group.color}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'color', e.target.value)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    placeholder="Black Titanium"
                  />
                  <datalist id={`color-suggestions-${groupIdx}`}>
                    {colorOptions.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-fg-subtle mb-1">Цена закупки ($)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="1"
                    value={group.purchasePriceUsd || ''}
                    onChange={(e) => handleUpdateGroup(groupIdx, 'purchasePriceUsd', parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-accent font-bold focus:border-accent focus:outline-none font-mono"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* IMEI Input List with Batch Paste */}
              <div className="pt-2 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-fg font-mono">
                      Список IMEI ({group.items.filter(i => i.imei.trim().length > 0).length} шт.)
                    </span>
                    <span className="text-[10px] text-fg-subtle font-mono">
                      Сумма: ${group.items.filter(i => i.imei.trim().length > 0).length * group.purchasePriceUsd}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleAddImeiToGroup(groupIdx)}
                      className="px-2.5 py-1 rounded-lg bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-mono font-medium flex items-center space-x-1 transition-colors"
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
                    className="w-full rounded-lg bg-surface-raised border border-dashed border-border px-3 py-1 text-[11px] font-mono text-fg placeholder-fg-subtle focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="space-y-2 pt-1 font-mono">
                  {group.items.map((item, itemIdx) => {
                    const [imei1, imei2] = getImeiPair(item.imei);
                    return (
                      <div key={itemIdx} className="grid grid-cols-1 md:grid-cols-2 gap-2">

                        <div>
                          <label className="block text-fg-subtle mb-1">IMEI 1</label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={imei1}
                              onChange={(e) => handleUpdateImei(groupIdx, itemIdx, `${e.target.value} / ${imei2}`.replace(/ \/ $/, ''))}
                              placeholder="IMEI 1"
                              className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg font-mono focus:border-accent focus:outline-none pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => handleScanImei(groupIdx, itemIdx)}
                              className="absolute right-1.5 top-1.5 text-fg-subtle hover:text-accent p-0.5"
                              title="Сканировать IMEI 1"
                              aria-label="Сканировать IMEI 1"
                            >
                              <Scan className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-end gap-1">
                          <div className="relative flex-1">
                            <label className="block text-fg-subtle mb-1">IMEI 2 <span className="text-fg-subtle/70">(необязательно)</span></label>
                            <input
                              type="text"
                              value={imei2}
                              onChange={(e) => handleUpdateImei2(groupIdx, itemIdx, e.target.value)}
                              placeholder="IMEI 2 (необязательно)"
                              className="w-full rounded-lg bg-surface-raised border border-border px-2.5 py-1.5 text-xs text-fg font-mono focus:border-accent focus:outline-none pr-8"
                            />
                            <button
                              type="button"
                              onClick={() => openScanner((scannedCode) => handleUpdateImei2(groupIdx, itemIdx, scannedCode))}
                              className="absolute right-1.5 top-1.5 text-fg-subtle hover:text-accent p-0.5"
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
                              className="text-fg-subtle hover:text-danger p-1"
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
            className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-accent bg-surface-raised hover:bg-surface text-fg-muted hover:text-accent text-xs font-mono font-bold flex items-center justify-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>ДОБАВИТЬ ЕЩЕ МОДЕЛЬ / ПОЗИЦИЮ В НАКЛАДНУЮ</span>
          </button>
        </div>

        {/* Bottom Actions & Total Bar (Sticky at bottom) */}
        <div className="sticky bottom-0 z-20 p-3.5 sm:p-4 border-t border-border bg-surface/95 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-lg font-mono">
          {statusMessage ? (
            <div className={`flex items-center space-x-2 text-xs ${
              statusMessage.type === 'success' ? 'text-accent' : 'text-danger'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          ) : (
            <div className="text-xs text-fg-subtle">
              Позиций: <strong className="text-fg">{groups.length}</strong> • 
              Устройств: <strong className="text-accent font-bold text-sm ml-1">{totalFormUnits} шт.</strong>
            </div>
          )}

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <div className="text-right mr-2">
              <span className="text-[10px] text-fg-subtle block uppercase font-medium">ИТОГОВАЯ СУММА НАКЛАДНОЙ:</span>
              <span className="text-base font-bold text-accent font-mono">
                ${totalFormUsd.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setStatusMessage(null);
                setViewMode('list');
              }}
              className="px-3 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={totalFormUnits === 0 || isSubmitting}
              className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-accent-fg shadow-xs transition-colors flex items-center space-x-1.5"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{isSubmitting ? 'СОХРАНЕНИЕ…' : 'СОХРАНИТЬ ПРИХОД'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Edit Invoice Modal */}
      {editingInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-mono">
          <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-lg bg-accent/15 text-accent border border-accent/30">
                  <Edit2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-fg uppercase">РЕДАКТИРОВАТЬ НАКЛАДНУЮ</h3>
              </div>
              <button onClick={() => setEditingInvoiceModal(null)} className="p-1 rounded text-fg-subtle hover:text-fg">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditInvoiceModal} className="space-y-3 text-xs">
              <div>
                <label className="block text-fg-subtle text-[10px] uppercase mb-1">НОМЕР НАКЛАДНОЙ</label>
                <input
                  type="text"
                  required
                  value={editInvoiceNum}
                  onChange={(e) => setEditInvoiceNum(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg font-bold focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle text-[10px] uppercase mb-1">ДАТА НАКЛАДНОЙ</label>
                <input
                  type="date"
                  required
                  value={editInvoiceDateStr}
                  onChange={(e) => setEditInvoiceDateStr(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-fg-subtle text-[10px] uppercase mb-1">СУММА НАКЛАДНОЙ ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={editInvoiceAmountUsd}
                  onChange={(e) => setEditInvoiceAmountUsd(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent font-bold focus:border-accent focus:outline-none font-mono"
                />
              </div>

              <div className="flex space-x-2 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setEditingInvoiceModal(null)}
                  className="flex-1 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg-subtle hover:text-fg font-bold disabled:opacity-50"
                >
                  ОТМЕНА
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg font-bold shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSubmitting ? 'СОХРАНЕНИЕ…' : 'СОХРАНИТЬ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
