import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { decimal, moneyNumber } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { SupplierInvoice } from '../../types';
import { soundEffects } from '../../utils/sound';
import { getBusinessDateKey } from '../../utils/businessDate';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';
import { DEFAULT_PHONE_COLORS_EN, normalizePhoneColor, formatRam, formatStorage } from '../../utils/phoneSpecs';
import { lookupPhoneByImei, clearPhoneCatalogCache, fetchCatalogSpecs, type CatalogSpecs } from '../../services/phoneCatalog';

import {
  PurchaseItemGroup,
  PurchasePreviewGroup,
  PurchasePreviewData,
  getImeiPair,
  compareInvoicesDesc,
} from '../purchase/types';
import { AddSupplierModal } from '../purchase/AddSupplierModal';
import { EditInvoiceModal } from '../purchase/EditInvoiceModal';
import { ReceiptPreviewModal } from '../purchase/ReceiptPreviewModal';
import { InvoiceDetailsModal } from '../purchase/InvoiceDetailsModal';
import { PurchaseHistoryList } from '../purchase/PurchaseHistoryList';
import { NewPurchaseForm } from '../purchase/NewPurchaseForm';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export const PurchasePage: React.FC = () => {
  const dataRefreshRevision = useDataRefreshRevision();
  const {
    currentUser,
    suppliers,
    stores,
    supplierInvoices,
    devices,
    findDevicesByInvoice,
    findDeviceByImei,
    fetchInvoicesRange,
    createPurchase,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    createSupplier,
    openScanner,
  } = useAppFields(
    'currentUser',
    'suppliers',
    'stores',
    'supplierInvoices',
    'devices',
    'findDevicesByInvoice',
    'findDeviceByImei',
    'fetchInvoicesRange',
    'createPurchase',
    'updateSupplierInvoice',
    'deleteSupplierInvoice',
    'createSupplier',
    'openScanner'
  );

  // Edit Invoice Modal state
  const [editingInvoiceModal, setEditingInvoiceModal] = useState<SupplierInvoice | null>(null);

  // Mode: 'list' (History of purchases) or 'form' (Register new purchase intake)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  useUnfinishedWork(viewMode === 'form', 'Незавершённый приход');

  // List search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>(getBusinessDateKey().substring(0, 7));
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const selectedInvoice = supplierInvoices.find((inv) => inv.id === selectedInvoiceId) || null;

  // Invoice devices fetching
  useEffect(() => {
    if (!selectedInvoiceId) return;
    let cancelled = false;
    findDevicesByInvoice(selectedInvoiceId).catch((e) => {
      if (!cancelled) console.error('Failed to load invoice devices', e);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedInvoiceId, findDevicesByInvoice]);

  // Invoice range fetching for selected period
  useEffect(() => {
    let cancelled = false;
    fetchInvoicesRange({
      period: 'SPECIFIC_MONTH',
      month: selectedMonth,
    }).catch((e) => {
      if (!cancelled) console.error('Failed to load invoices for period', e);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, fetchInvoicesRange, dataRefreshRevision]);

  // Form states - no default supplier, must be selected explicitly
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');

  // Inline "add new supplier"
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  const getNextInvoiceNumber = (invoices: SupplierInvoice[]) => {
    let max = 0;
    for (const inv of invoices || []) {
      const match = inv.invoiceNumber?.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
    return `INV-${(max + 1).toString().padStart(4, '0')}`;
  };

  // Auto-generate sequential invoice number
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    return getNextInvoiceNumber(supplierInvoices || []);
  });

  // If the currently selected supplier is deleted, clear selection
  useEffect(() => {
    if (selectedSupplierId && !suppliers.some((s) => s.id === selectedSupplierId)) {
      setSelectedSupplierId('');
    }
  }, [suppliers, selectedSupplierId]);

  useEffect(() => {
    if (supplierInvoices && supplierInvoices.length > 0) {
      setInvoiceNumber(getNextInvoiceNumber(supplierInvoices));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierInvoices?.length]);

  // All purchases go exclusively to Main Warehouse
  const mainWarehouseId = stores.find((s) => s.isMainWarehouse)?.id || 'main-warehouse';

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
      items: [{ imei: '' }],
    },
  ]);
  // Latest groups for the IMEI autofill, which resolves after the scan's own render.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSavedInvoice, setJustSavedInvoice] = useState<string | null>(null);

  // Full catalog of brands, models, and specs stored in database (all historical & current stock)
  const [catalogSpecs, setCatalogSpecs] = useState<CatalogSpecs | null>(null);

  const loadSpecs = useCallback(async () => {
    const specs = await fetchCatalogSpecs();
    if (specs) setCatalogSpecs(specs);
  }, []);

  useEffect(() => {
    void loadSpecs();
  }, [loadSpecs, dataRefreshRevision]);

  // Autocomplete suggestion lists derived from database devices, phone catalog, and standard presets
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Honor', 'Huawei', 'Realme', 'Tecno', 'Infinix', 'OnePlus', 'Google', 'Novey', 'itel', 'Nothing']);
    (catalogSpecs?.brands || []).forEach((b) => {
      if (b.trim()) set.add(b.trim());
    });
    (devices || []).forEach((d) => {
      if (d.brand) set.add(d.brand.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
  }, [catalogSpecs?.brands, devices]);

  const getModelOptions = useCallback(
    (selectedBrand: string) => {
      const set = new Set<string>();
      const brandLower = (selectedBrand || '').trim().toLowerCase();
      // Models from database catalog
      (catalogSpecs?.models || []).forEach((m) => {
        if (m.model && (!brandLower || (m.brand && m.brand.toLowerCase() === brandLower))) {
          set.add(m.model.trim());
        }
      });
      // Models from active devices
      (devices || []).forEach((d) => {
        if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
          set.add(d.model.trim());
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
    },
    [catalogSpecs?.models, devices]
  );

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (catalogSpecs?.rams || []).forEach((r) => {
      const formatted = formatRam(r);
      if (formatted) set.add(formatted);
    });
    (devices || []).forEach((d) => {
      const formatted = formatRam(d.ram);
      if (formatted) set.add(formatted);
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numA - numB;
    });
  }, [catalogSpecs?.rams, devices]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (catalogSpecs?.storages || []).forEach((s) => {
      const formatted = formatStorage(s);
      if (formatted) set.add(formatted);
    });
    (devices || []).forEach((d) => {
      const formatted = formatStorage(d.storage);
      if (formatted) set.add(formatted);
    });
    const order: Record<string, number> = { '32 GB': 32, '64 GB': 64, '128 GB': 128, '256 GB': 256, '512 GB': 512, '1 TB': 1024, '2 TB': 2048 };
    return Array.from(set).sort((a, b) => (order[a] ?? 9999) - (order[b] ?? 9999));
  }, [catalogSpecs?.storages, devices]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_PHONE_COLORS_EN);
    (catalogSpecs?.colors || []).forEach((c) => {
      const translated = normalizePhoneColor(c);
      if (translated) set.add(translated);
      else if (c.trim()) set.add(c.trim());
    });
    (devices || []).forEach((d) => {
      if (d.color) {
        const translated = normalizePhoneColor(d.color);
        if (translated) set.add(translated);
        else if (d.color.trim()) set.add(d.color.trim());
      }
    });
    return Array.from(set);
  }, [catalogSpecs?.colors, devices]);

  // Filtered list of purchase invoices
  const filteredInvoices = useMemo(() => {
    return (supplierInvoices || [])
      .filter((inv) => {
        // 1. Period filter
        const invDateStr = getBusinessDateKey(new Date(inv.date));
        const rawDateStr = typeof inv.date === 'string' ? inv.date : '';
        if (!invDateStr.startsWith(selectedMonth) && !rawDateStr.startsWith(selectedMonth)) {
          return false;
        }

        // 2. Supplier filter
        if (selectedSupplierFilter !== 'all' && inv.supplierId !== selectedSupplierFilter) {
          return false;
        }

        // 3. Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesInvoiceNum = inv.invoiceNumber.toLowerCase().includes(q);
          const matchesSupplier = inv.supplierName.toLowerCase().includes(q);

          const invoiceDevices = devices.filter(
            (d) => d.invoiceNumber === inv.invoiceNumber || (inv.id && d.purchaseInvoiceId === inv.id)
          );
          const matchesDevice = invoiceDevices.some(
            (d) =>
              d.imei.toLowerCase().includes(q) ||
              (d.imei2 && d.imei2.toLowerCase().includes(q)) ||
              d.model.toLowerCase().includes(q) ||
              d.brand.toLowerCase().includes(q)
          );

          if (!matchesInvoiceNum && !matchesSupplier && !matchesDevice) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (justSavedInvoice) {
          if (a.invoiceNumber === justSavedInvoice) return -1;
          if (b.invoiceNumber === justSavedInvoice) return 1;
        }
        return compareInvoicesDesc(a, b);
      });
  }, [supplierInvoices, devices, selectedMonth, selectedSupplierFilter, searchQuery, justSavedInvoice]);

  // Scan finder to locate purchase
  const handleScanFinder = () => {
    openScanner(async (scannedCode) => {
      const code = scannedCode.trim();
      let matchedDevice = devices.find((d) => d.imei === code || d.imei2 === code);
      if (!matchedDevice) {
        try {
          [matchedDevice] = await findDeviceByImei(code);
        } catch {
          // fall through
        }
      }
      if (matchedDevice && matchedDevice.invoiceNumber) {
        let matchedInv = supplierInvoices.find((inv) => inv.invoiceNumber === matchedDevice!.invoiceNumber);
        if (!matchedInv) {
          try {
            const found = await fetchInvoicesRange({ search: matchedDevice.invoiceNumber });
            matchedInv = found.find((inv) => inv.invoiceNumber === matchedDevice!.invoiceNumber);
          } catch {
            // fall through
          }
        }
        if (matchedInv) {
          setSelectedInvoiceId(matchedInv.id);
          return;
        }
      }

      let directInv = supplierInvoices.find((inv) => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
      if (!directInv) {
        try {
          const found = await fetchInvoicesRange({ search: code });
          directInv = found.find((inv) => inv.invoiceNumber.toLowerCase() === code.toLowerCase());
        } catch {
          // fall through
        }
      }
      if (directInv) {
        setSelectedInvoiceId(directInv.id);
      } else {
        setSearchQuery(code);
      }
    });
  };

  const handleSaveEditInvoice = async (
    id: string,
    data: { invoiceNumber: string; date: string; totalAmountUsd: number }
  ) => {
    const res = await updateSupplierInvoice(id, data);
    if (res.success) {
      setEditingInvoiceModal(null);
      setSelectedInvoiceId(null);
    }
    return res;
  };

  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  const handleDeleteInvoiceModal = (id: string) => {
    setDeletingInvoiceId(id);
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deletingInvoiceId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await deleteSupplierInvoice(deletingInvoiceId);
      if (res.success) {
        setSelectedInvoiceId(null);
        setDeletingInvoiceId(null);
        setStatusMessage({ type: 'success', text: 'Накладная успешно удалена!' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form helpers
  const handleAddGroup = () => {
    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const g = groups[gIdx];
      for (let itIdx = 0; itIdx < g.items.length; itIdx++) {
        const [imei1, imei2] = getImeiPair(g.items[itIdx].imei);
        const clean1 = imei1.replace(/\D/g, '');
        const clean2 = imei2.replace(/\D/g, '');
        if (clean1.length > 0 && clean1.length < 15) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${gIdx + 1}, устройство #${itIdx + 1}: IMEI 1 содержит только ${clean1.length} из 15 цифр. Введите ровно 15 цифр!`,
          });
          soundEffects.playError();
          return;
        }
        if (clean2.length > 0 && clean2.length < 15) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${gIdx + 1}, устройство #${itIdx + 1}: IMEI 2 содержит только ${clean2.length} из 15 цифр. Введите ровно 15 цифр!`,
          });
          soundEffects.playError();
          return;
        }
      }
    }

    soundEffects.playAddToCartSuccess();
    setGroups((prev) => [
      ...prev,
      {
        id: `g-${Date.now()}`,
        brand: '',
        model: '',
        ram: '',
        storage: '',
        color: '',
        purchasePriceUsd: 0,
        items: [{ imei: '' }],
      },
    ]);
  };

  const handleRemoveGroup = (idx: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateGroup = (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => {
    setGroups((prev) => {
      const next = [...prev];
      const current = { ...next[idx], [field]: value };

      // When user selects or types a model, autofill RAM, storage, and color from known specs (price is never auto-filled)
      if (field === 'model' && typeof value === 'string' && value.trim()) {
        const modelTrim = value.trim().toLowerCase();
        const matchedCatalog = (catalogSpecs?.models || []).find(
          (m) => m.model.toLowerCase() === modelTrim && (!current.brand.trim() || m.brand.toLowerCase() === current.brand.trim().toLowerCase())
        );
        const matchedDevice = (devices || []).find(
          (d) => d.model.toLowerCase() === modelTrim && (!current.brand.trim() || d.brand.toLowerCase() === current.brand.trim().toLowerCase())
        );

        if (matchedCatalog) {
          if (!current.brand.trim()) current.brand = matchedCatalog.brand;
          if (!current.ram.trim() && matchedCatalog.rams.length > 0) current.ram = formatRam(matchedCatalog.rams[0]) || matchedCatalog.rams[0];
          if (!current.storage.trim() && matchedCatalog.storages.length > 0) current.storage = formatStorage(matchedCatalog.storages[0]) || matchedCatalog.storages[0];
          if (!current.color.trim() && matchedCatalog.colors.length > 0) current.color = matchedCatalog.colors[0];
        } else if (matchedDevice) {
          if (!current.brand.trim()) current.brand = matchedDevice.brand;
          if (!current.ram.trim() && matchedDevice.ram) current.ram = formatRam(matchedDevice.ram) || matchedDevice.ram;
          if (!current.storage.trim() && matchedDevice.storage) current.storage = formatStorage(matchedDevice.storage) || matchedDevice.storage;
          if (!current.color.trim() && matchedDevice.color) current.color = matchedDevice.color;
        }
      }

      next[idx] = current;
      return next;
    });
  };

  const handleClearGroupSpecs = (groupIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      if (!next[groupIdx]) return prev;
      next[groupIdx] = {
        ...next[groupIdx],
        brand: '',
        model: '',
        ram: '',
        storage: '',
        color: '',
        purchasePriceUsd: 0,
      };
      return next;
    });
  };

  const handleResetGroup = (groupIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      if (!next[groupIdx]) return prev;
      next[groupIdx] = {
        id: `group-${Date.now()}`,
        items: [{ imei: '' }],
        brand: '',
        model: '',
        ram: '',
        storage: '',
        color: '',
        purchasePriceUsd: 0,
      };
      return next;
    });
  };

  const handleAddImeiToGroup = (groupIdx: number) => {
    const group = groups[groupIdx];
    if (group) {
      const items = group.items;
      const last = items[items.length - 1];
      if (last) {
        const [p1, p2] = getImeiPair(last.imei);
        const c1 = p1.replace(/\D/g, '');
        const c2 = p2 ? p2.replace(/\D/g, '') : '';
        if (c1.length === 0) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${groupIdx + 1}, устройство #${items.length}: заполните 15 цифр IMEI перед добавлением следующего устройства!`,
          });
          soundEffects.playError();
          return;
        }
        if (c1.length < 15) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${groupIdx + 1}, устройство #${items.length}: IMEI 1 содержит только ${c1.length} цифр. Должно быть ровно 15 цифр!`,
          });
          soundEffects.playError();
          return;
        }
        if (c2.length > 0 && c2.length < 15) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${groupIdx + 1}, устройство #${items.length}: IMEI 2 содержит только ${c2.length} цифр. Должно быть ровно 15 цифр!`,
          });
          soundEffects.playError();
          return;
        }
      }
    }
    soundEffects.playAddToCartSuccess();
    setGroups((prev) => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items.push({ imei: '' });
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const handleRemoveImeiFromGroup = (groupIdx: number, itemIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      const items = next[groupIdx].items.filter((_, i) => i !== itemIdx);
      next[groupIdx] = {
        ...next[groupIdx],
        items: items.length > 0 ? items : [{ imei: '' }],
      };
      return next;
    });
  };

  // IMEI autofill: the phone catalog knows the model behind an IMEI's first 8 digits. An empty
  // position takes brand, model, RAM, storage, and color. Purchase price is NEVER auto-filled per user request.
  const fillGroupFromImei = useCallback(async (groupIdx: number, imei: string) => {
    const phone = await lookupPhoneByImei(imei);
    const group = groupsRef.current[groupIdx];
    if (!phone || !group) return;
    const sameBrand = !group.brand.trim() || group.brand.trim().toLowerCase() === phone.brand.toLowerCase();

    // Look up model in catalogSpecs to get any additional specs
    const foundInCatalog = (catalogSpecs?.models || []).find(
      (m) => m.model.toLowerCase() === phone.model.toLowerCase() && m.brand.toLowerCase() === phone.brand.toLowerCase()
    );

    const suggestedRam = phone.ram ? (formatRam(phone.ram) || phone.ram) : (foundInCatalog?.rams?.[0] ? (formatRam(foundInCatalog.rams[0]) || foundInCatalog.rams[0]) : '');
    const suggestedStorage = phone.storage ? (formatStorage(phone.storage) || phone.storage) : (foundInCatalog?.storages?.[0] ? (formatStorage(foundInCatalog.storages[0]) || foundInCatalog.storages[0]) : '');
    const suggestedColor = phone.color || foundInCatalog?.colors?.[0] || '';

    if (!group.model.trim() && sameBrand) {
      setGroups((prev) => {
        const next = [...prev];
        const current = next[groupIdx];
        if (!current || current.model.trim()) return prev;
        next[groupIdx] = {
          ...current,
          brand: current.brand.trim() || phone.brand,
          model: phone.model,
          ram: current.ram.trim() || suggestedRam,
          storage: current.storage.trim() || suggestedStorage,
          color: current.color.trim() || suggestedColor,
          // Purchase price is left untouched - never auto-filled!
        };
        return next;
      });
      setStatusMessage({
        type: 'success',
        text: `Модель определена по IMEI: ${phone.brand} ${phone.model}${suggestedStorage ? ` (${suggestedStorage})` : ''}`,
      });
      return;
    }

    // Model was already set and matches: autofill remaining blank fields (except price)
    if (sameBrand && group.model.trim().toLowerCase() === phone.model.toLowerCase()) {
      setGroups((prev) => {
        const next = [...prev];
        const current = next[groupIdx];
        if (!current) return prev;
        next[groupIdx] = {
          ...current,
          ram: current.ram.trim() || suggestedRam,
          storage: current.storage.trim() || suggestedStorage,
          color: current.color.trim() || suggestedColor,
          // Purchase price is left untouched - never auto-filled!
        };
        return next;
      });
      return;
    }
  }, [catalogSpecs?.models]);

  const handleUpdateImei = (groupIdx: number, itemIdx: number, val: string) => {
    setGroups((prev) => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items[itemIdx] = { ...items[itemIdx], imei: val };
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
    const [imei1] = getImeiPair(val);
    const clean1 = imei1.replace(/\D/g, '');
    if (clean1.length === 15) void fillGroupFromImei(groupIdx, clean1);
  };

  const handleUpdateImei2 = (groupIdx: number, itemIdx: number, value: string) => {
    const [imei1] = getImeiPair(groups[groupIdx].items[itemIdx]?.imei || '');
    const clean1 = imei1.replace(/\D/g, '').slice(0, 15);
    const clean2 = value.replace(/\D/g, '').slice(0, 15);
    handleUpdateImei(groupIdx, itemIdx, clean2 ? `${clean1} / ${clean2}` : clean1);
  };

  const handleScanImei = (groupIdx: number, itemIdx: number) => {
    openScanner((scannedCode) => {
      const clean = scannedCode.replace(/\D/g, '').slice(0, 15);
      if (clean.length !== 15) {
        setStatusMessage({
          type: 'error',
          text: `Отсканированный код содержит ${clean.length} знаков. IMEI должен содержать ровно 15 цифр!`,
        });
        soundEffects.playError();
        return;
      }
      const [_, imei2] = getImeiPair(groups[groupIdx].items[itemIdx]?.imei || '');
      handleUpdateImei(groupIdx, itemIdx, imei2 ? `${clean} / ${imei2}` : clean);
    });
  };

  const handleBatchImeiPaste = (groupIdx: number, text: string) => {
    if (!text.trim()) return;
    const tokens = text
      .split(/[\r\n,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const validNewItems: { imei: string }[] = [];
    const invalidTokens: string[] = [];

    tokens.forEach((token) => {
      const [p1, p2] = getImeiPair(token);
      const c1 = p1.replace(/\D/g, '').slice(0, 15);
      const c2 = p2 ? p2.replace(/\D/g, '').slice(0, 15) : '';

      if (c1.length === 15 && (!c2 || c2.length === 15)) {
        validNewItems.push({ imei: c2 ? `${c1} / ${c2}` : c1 });
      } else {
        invalidTokens.push(token);
      }
    });

    if (invalidTokens.length > 0) {
      setStatusMessage({
        type: 'error',
        text: `Пропущены некорректные IMEI (должно быть ровно 15 цифр): ${invalidTokens.slice(0, 3).join(', ')}${invalidTokens.length > 3 ? '...' : ''}`,
      });
      soundEffects.playError();
    }

    if (validNewItems.length > 0) {
      const [firstImei] = getImeiPair(validNewItems[0].imei);
      void fillGroupFromImei(groupIdx, firstImei.replace(/\D/g, ''));
      soundEffects.playAddToCartSuccess();
      setGroups((prev) => {
        const next = [...prev];
        const existing = next[groupIdx].items.filter((it) => {
          const [p1] = getImeiPair(it.imei);
          return p1.replace(/\D/g, '').length === 15;
        });
        next[groupIdx] = {
          ...next[groupIdx],
          items: existing.length > 0 ? [...existing, ...validNewItems] : validNewItems,
        };
        return next;
      });
    }
  };

  // Calculate totals for new intake form (only valid 15-digit IMEIs count)
  const totalFormUnits = groups.reduce((acc, g) => {
    return (
      acc +
      g.items.filter((i) => {
        const [p1] = getImeiPair(i.imei);
        return p1.replace(/\D/g, '').length === 15;
      }).length
    );
  }, 0);

  const totalFormUsd = moneyNumber(
    groups.reduce((acc, g) => {
      const count = g.items.filter((i) => {
        const [p1] = getImeiPair(i.imei);
        return p1.replace(/\D/g, '').length === 15;
      }).length;
      return acc.plus(decimal(g.purchasePriceUsd || 0).mul(count));
    }, decimal(0))
  );

  const hasIncompleteImeis = useMemo(() => {
    return groups.some((g) =>
      g.items.some((item) => {
        const raw = item.imei.trim();
        if (!raw) return false;
        const [imei1, imei2] = getImeiPair(raw);
        const c1 = imei1.replace(/\D/g, '');
        const c2 = imei2.replace(/\D/g, '');
        if (c1.length > 0 && c1.length < 15) return true;
        if (c2.length > 0 && c2.length < 15) return true;
        return false;
      })
    );
  }, [groups]);

  const [previewInvoice, setPreviewInvoice] = useState<PurchasePreviewData | null>(null);

  const handleSubmitPurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatusMessage(null);

    if (!selectedSupplierId) {
      setStatusMessage({ type: 'error', text: 'Пожалуйста, выберите поставщика из списка (выбор поставщика обязателен)' });
      return;
    }
    if (!invoiceNumber.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите номер накладной' });
      return;
    }
    if (currentUser?.role !== 'ADMIN') {
      setStatusMessage({ type: 'error', text: 'Оформление прихода разрешено только Администратору' });
      return;
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g.brand.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите бренд устройства` });
        return;
      }
      if (!g.model.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите модель устройства` });
        return;
      }
      if (!g.ram || !g.ram.trim()) {
        setStatusMessage({
          type: 'error',
          text: `Позиция #${i + 1} (${g.brand || ''} ${g.model || ''}): обязательно укажите RAM (ОЗУ)`,
        });
        return;
      }
      if (!g.storage.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите память (ROM)` });
        return;
      }
      if (!g.color.trim()) {
        setStatusMessage({ type: 'error', text: `Позиция #${i + 1}: укажите цвет` });
        return;
      }

      // Check each item's IMEI: must be strictly 15 digits
      const filledInGroup = g.items.filter((it) => it.imei.trim().length > 0);
      if (filledInGroup.length === 0) {
        setStatusMessage({
          type: 'error',
          text: `Позиция #${i + 1} (${g.brand} ${g.model}): заполните хотя бы один 15-значный IMEI`,
        });
        return;
      }

      for (let j = 0; j < g.items.length; j++) {
        const raw = g.items[j].imei.trim();
        if (!raw) {
          if (g.items.length === 1) {
            setStatusMessage({
              type: 'error',
              text: `Позиция #${i + 1} (${g.brand} ${g.model}): укажите 15-значный IMEI`,
            });
            return;
          }
          continue;
        }

        const [p1, p2] = getImeiPair(raw);
        const c1 = p1.replace(/\D/g, '');
        const c2 = p2 ? p2.replace(/\D/g, '') : '';

        if (c1.length !== 15) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${i + 1} (${g.brand} ${g.model}), устройство #${j + 1}: IMEI 1 содержит ${c1.length} цифр. IMEI должен содержать ровно 15 цифр!`,
          });
          return;
        }

        if (c2 && c2.length !== 15) {
          setStatusMessage({
            type: 'error',
            text: `Позиция #${i + 1} (${g.brand} ${g.model}), устройство #${j + 1}: IMEI 2 содержит ${c2.length} цифр. Должно быть ровно 15 цифр!`,
          });
          return;
        }
      }
    }

    // Check for duplicate IMEIs across all positions
    const allImeis = new Set<string>();
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      for (let j = 0; j < g.items.length; j++) {
        const raw = g.items[j].imei.trim();
        if (!raw) continue;
        const [p1, p2] = getImeiPair(raw);
        const c1 = p1.replace(/\D/g, '');
        const c2 = p2 ? p2.replace(/\D/g, '') : '';
        if (c1.length === 15) {
          if (allImeis.has(c1)) {
            setStatusMessage({
              type: 'error',
              text: `Дубликат IMEI в партии: ${c1} (позиция #${i + 1}, устройство #${j + 1})`,
            });
            return;
          }
          allImeis.add(c1);
        }
        if (c2.length === 15) {
          if (allImeis.has(c2)) {
            setStatusMessage({
              type: 'error',
              text: `Дубликат IMEI 2 в партии: ${c2} (позиция #${i + 1}, устройство #${j + 1})`,
            });
            return;
          }
          allImeis.add(c2);
        }
      }
    }

    const cleanGroups: PurchasePreviewGroup[] = groups
      .map((g) => {
        const validItems = g.items
          .filter((i) => {
            const [p1] = getImeiPair(i.imei);
            return p1.replace(/\D/g, '').length === 15;
          })
          .map((i) => {
            const [p1, p2] = getImeiPair(i.imei);
            const c1 = p1.replace(/\D/g, '');
            const c2 = p2 ? p2.replace(/\D/g, '') : '';
            return { imei: c2 ? `${c1} / ${c2}` : c1 };
          });

        const ramStr = formatRam(g.ram) || g.ram.trim();
        const storageStr = formatStorage(g.storage) || g.storage.trim();

        return {
          brand: g.brand.trim(),
          model: g.model.trim(),
          ram: ramStr,
          storage: storageStr,
          color: normalizePhoneColor(g.color.trim()) || g.color.trim(),
          purchasePriceUsd: g.purchasePriceUsd,
          items: validItems,
          imeis: validItems.map((i) => i.imei),
        };
      })
      .filter((g) => g.items.length > 0);

    if (cleanGroups.length === 0) {
      setStatusMessage({ type: 'error', text: 'Добавьте хотя бы одно устройство с заполненным 15-значным IMEI' });
      return;
    }

    setPreviewInvoice({
      supplierId: selectedSupplierId,
      invoiceNumber: invoiceNumber.trim(),
      date: new Date().toISOString(),
      isStorePurchase: false,
      storeId: mainWarehouseId,
      groups: cleanGroups,
    });
  };

  const handleConfirmSavePurchase = async (paidAmountUsd: number = 0) => {
    if (!previewInvoice || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await createPurchase({
        ...previewInvoice,
        paidAmountUsd,
      });

      if (res.success) {
        const savedNum = previewInvoice.invoiceNumber;
        setJustSavedInvoice(savedNum);
        // The receipt taught the catalog its models: no cached "not found" may hide them.
        clearPhoneCatalogCache();
        void loadSpecs();

        setGroups([
          {
            id: `g-${Date.now()}`,
            brand: '',
            model: '',
            ram: '',
            storage: '',
            color: '',
            purchasePriceUsd: 0,
            items: [{ imei: '' }],
          },
        ]);
        setPreviewInvoice(null);
        setSelectedSupplierId('');

        // Ensure newly saved invoice is visible immediately at the top
        setSearchQuery('');
        setSelectedSupplierFilter('all');
        const currentMonthKey = getBusinessDateKey().substring(0, 7);
        if (!selectedMonth.startsWith(currentMonthKey)) {
          setSelectedMonth(currentMonthKey);
        }

        setViewMode('list');
        const paymentNote = paidAmountUsd > 0
          ? ` и оплачен на $${paidAmountUsd.toLocaleString()} из Центральной кассы`
          : ' (в долг)';
        setStatusMessage({
          type: 'success',
          text: `Приход по накладной ${savedNum} успешно сохранен (${previewInvoice.groups.reduce((a, b) => a + b.items.length, 0)} шт.)${paymentNote}!`,
        });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка сохранения прихода' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center text-fg-subtle">
        <p className="text-sm font-medium text-fg-muted">Доступ ограничен</p>
        <p className="text-xs mt-1">Оформление и просмотр приходов и цен закупки разрешены только Администратору</p>
      </div>
    );
  }

  return (
    <>
      {viewMode === 'list' ? (
        <PurchaseHistoryList
          filteredInvoices={filteredInvoices}
          suppliers={suppliers}
          stores={stores}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          selectedSupplierFilter={selectedSupplierFilter}
          onSupplierFilterChange={setSelectedSupplierFilter}
          onResetFilters={() => {
            setSearchQuery('');
            setSelectedSupplierFilter('all');
          }}
          onScanFinder={handleScanFinder}
          onNewPurchaseClick={() => {
            setStatusMessage(null);
            setSelectedSupplierId('');
            setInvoiceNumber(getNextInvoiceNumber(supplierInvoices || []));
            setViewMode('form');
          }}
          onSelectInvoice={setSelectedInvoiceId}
          onEditInvoice={(inv) => setEditingInvoiceModal(inv)}
          onDeleteInvoice={handleDeleteInvoiceModal}
          currentUser={currentUser}
          justSavedInvoice={justSavedInvoice}
        />
      ) : (
        <NewPurchaseForm
          suppliers={suppliers}
          stores={stores}
          currentUser={currentUser}
          selectedSupplierId={selectedSupplierId}
          onSelectSupplierId={setSelectedSupplierId}
          groups={groups}
          onUpdateGroup={handleUpdateGroup}
          onClearGroupSpecs={handleClearGroupSpecs}
          onResetGroup={handleResetGroup}
          onAddGroup={handleAddGroup}
          onRemoveGroup={handleRemoveGroup}
          onAddImeiToGroup={handleAddImeiToGroup}
          onRemoveImeiFromGroup={handleRemoveImeiFromGroup}
          onUpdateImei={handleUpdateImei}
          onUpdateImei2={handleUpdateImei2}
          onScanImei={handleScanImei}
          onBatchImeiPaste={handleBatchImeiPaste}
          brandOptions={brandOptions}
          getModelOptions={getModelOptions}
          ramOptions={ramOptions}
          storageOptions={storageOptions}
          colorOptions={colorOptions}
          totalFormUnits={totalFormUnits}
          totalFormUsd={totalFormUsd}
          hasIncompleteImeis={hasIncompleteImeis}
          statusMessage={statusMessage}
          isSubmitting={isSubmitting}
          onBackToList={() => {
            setStatusMessage(null);
            setViewMode('list');
          }}
          onOpenAddSupplier={() => setIsAddSupplierOpen(true)}
          onSubmitForm={handleSubmitPurchase}
          onOpenScannerForImei2={(groupIdx, itemIdx) => {
            openScanner((scannedCode) => handleUpdateImei2(groupIdx, itemIdx, scannedCode));
          }}
        />
      )}

      {/* Invoice Details Modal */}
      <InvoiceDetailsModal
        invoice={selectedInvoice}
        devices={devices}
        currentUser={currentUser}
        onClose={() => setSelectedInvoiceId(null)}
        onEditInvoice={(inv) => setEditingInvoiceModal(inv)}
        onDeleteInvoice={handleDeleteInvoiceModal}
      />

      {/* Edit Invoice Modal */}
      <EditInvoiceModal
        invoice={editingInvoiceModal}
        devices={devices}
        suppliers={suppliers}
        stores={stores}
        onClose={() => setEditingInvoiceModal(null)}
        onSave={handleSaveEditInvoice}
        onSuccess={(msg) => {
          setStatusMessage({ type: 'success', text: msg });
        }}
        onError={(msg) => {
          setStatusMessage({ type: 'error', text: msg });
        }}
      />

      {/* Receipt Preview Modal */}
      <ReceiptPreviewModal
        previewInvoice={previewInvoice}
        suppliers={suppliers}
        stores={stores}
        onClose={() => setPreviewInvoice(null)}
        onConfirm={handleConfirmSavePurchase}
        isSubmitting={isSubmitting}
      />

      {/* Add Supplier Modal */}
      <AddSupplierModal
        open={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        createSupplier={createSupplier}
        onError={(msg) => {
          setStatusMessage({ type: 'error', text: msg });
        }}
      />

      {/* Красивый диалог подтверждения удаления накладной */}
      <ConfirmDialog
        open={Boolean(deletingInvoiceId)}
        title="Удалить накладную прихода?"
        message="Вы действительно хотите удалить эту накладную и все её незапроданные устройства? Это действие необратимо."
        confirmLabel="Удалить накладную"
        cancelLabel="Отмена"
        tone="danger"
        loading={isSubmitting}
        onConfirm={handleConfirmDeleteInvoice}
        onCancel={() => setDeletingInvoiceId(null)}
      />
    </>
  );
};
