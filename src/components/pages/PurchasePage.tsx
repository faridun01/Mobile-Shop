import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { apiClient } from '../../api/client';
import { decimal, moneyNumber, formatMoney } from '../../utils/money';
import { useAppFields } from '../../context/AppContext';
import { SupplierInvoice } from '../../types';
import { soundEffects } from '../../utils/sound';
import { getBusinessDateKey } from '../../utils/businessDate';
import { useUnfinishedWork } from '../../utils/pwaUpdateSafety';
import { DEFAULT_PHONE_COLORS_EN, normalizePhoneColor, formatRam, formatStorage } from '../../utils/phoneSpecs';
import { lookupPhoneByImei, clearPhoneCatalogCache, fetchCatalogSpecs, type CatalogSpecs } from '../../services/phoneCatalog';

import {
  PurchaseCategory,
  PurchaseItemGroup,
  PurchasePreviewGroup,
  PurchasePreviewData,
  getImeiPair,
  compareInvoicesDesc,
  emptyGroup,
  previewUnits,
} from '../purchase/types';
import { DEVICE_STATUS_LABELS, findDeviceByCode } from '../../utils/scanLookup';
import { isValidSerial, normalizeSerial } from '../../utils/deviceCode';
import { findAccessoryByBarcode } from '../../services/catalog';
import { AddSupplierModal } from '../purchase/AddSupplierModal';
import { EditInvoiceModal, type InvoiceSaveData } from '../purchase/EditInvoiceModal';
import { invoiceDeleteBlock } from '../../utils/invoiceEdit';
import { StatusBanner } from '../ui/StatusBanner';
import { ReceiptPreviewModal } from '../purchase/ReceiptPreviewModal';
import { InvoiceDetailsModal } from '../purchase/InvoiceDetailsModal';
import { PurchaseHistoryList } from '../purchase/PurchaseHistoryList';
import { NewPurchaseForm } from '../purchase/NewPurchaseForm';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useDeepLink } from '../../hooks/useDeepLink';

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

  // A notification about a purchase opens its invoice (?invoice=<id>), fetched when not in the month.
  useDeepLink('invoice', async (id) => {
    const known = supplierInvoices.some((inv) => inv.id === id)
      || (await fetchInvoicesRange({ period: 'ALL' }).catch(() => [])).some((inv) => inv.id === id);
    if (known) setSelectedInvoiceId(id);
    else setStatusMessage({ type: 'error', text: 'Накладная из уведомления не найдена: возможно, она удалена' });
  });

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

  // Phone suggestions come from phones only; tablets have their own saved variants.
  const phoneDevices = useMemo(() => (devices || []).filter((d) => d.category !== 'TABLET'), [devices]);

  // Autocomplete suggestion lists derived from database devices, phone catalog, and standard presets
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Honor', 'Huawei', 'Realme', 'Tecno', 'Infinix', 'OnePlus', 'Google', 'Novey', 'itel', 'Nothing']);
    (catalogSpecs?.brands || []).forEach((b) => {
      if (b.trim()) set.add(b.trim());
    });
    phoneDevices.forEach((d) => {
      if (d.brand) set.add(d.brand.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
  }, [catalogSpecs?.brands, phoneDevices]);

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
      phoneDevices.forEach((d) => {
        if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
          set.add(d.model.trim());
        }
      });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
    },
    [catalogSpecs?.models, phoneDevices]
  );

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (catalogSpecs?.rams || []).forEach((r) => {
      const formatted = formatRam(r);
      if (formatted) set.add(formatted);
    });
    phoneDevices.forEach((d) => {
      const formatted = formatRam(d.ram);
      if (formatted) set.add(formatted);
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      return numA - numB;
    });
  }, [catalogSpecs?.rams, phoneDevices]);

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (catalogSpecs?.storages || []).forEach((s) => {
      const formatted = formatStorage(s);
      if (formatted) set.add(formatted);
    });
    phoneDevices.forEach((d) => {
      const formatted = formatStorage(d.storage);
      if (formatted) set.add(formatted);
    });
    const order: Record<string, number> = { '32 GB': 32, '64 GB': 64, '128 GB': 128, '256 GB': 256, '512 GB': 512, '1 TB': 1024, '2 TB': 2048 };
    return Array.from(set).sort((a, b) => (order[a] ?? 9999) - (order[b] ?? 9999));
  }, [catalogSpecs?.storages, phoneDevices]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_PHONE_COLORS_EN);
    (catalogSpecs?.colors || []).forEach((c) => {
      const translated = normalizePhoneColor(c);
      if (translated) set.add(translated);
      else if (c.trim()) set.add(c.trim());
    });
    phoneDevices.forEach((d) => {
      if (d.color) {
        const translated = normalizePhoneColor(d.color);
        if (translated) set.add(translated);
        else if (d.color.trim()) set.add(d.color.trim());
      }
    });
    return Array.from(set);
  }, [catalogSpecs?.colors, phoneDevices]);

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
      let matchedDevice = findDeviceByCode(devices, code);
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
    }, { allowModeSwitch: true });
  };

  const handleSaveEditInvoice = async (id: string, data: InvoiceSaveData) => {
    const res = await updateSupplierInvoice(id, data);
    if (res.success) {
      setEditingInvoiceModal(null);
      setSelectedInvoiceId(null);
    }
    return res;
  };

  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  // Checked first, so an invoice with sold goods says why instead of asking to confirm.
  const handleDeleteInvoiceModal = async (id: string) => {
    const block = await invoiceDeleteBlock(id).catch(() => null);
    if (block) {
      setStatusMessage({ type: 'error', text: `${block}. Удалить накладную нельзя — измените цены непроданных позиций.` });
      return;
    }
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
        setStatusMessage({ type: 'success', text: res.refundUsd ? `Накладная удалена. $${formatMoney(res.refundUsd)} возвращено в Центральную кассу` : 'Накладная удалена' });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления накладной' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Form helpers
  const isPhoneGroup = (g: PurchaseItemGroup) => (g.category ?? 'PHONE') === 'PHONE';

  const handleAddGroup = (category: PurchaseCategory = 'PHONE') => {
    for (let gIdx = 0; gIdx < groups.length; gIdx++) {
      const g = groups[gIdx];
      if (!isPhoneGroup(g)) continue;
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
    setGroups((prev) => [...prev, emptyGroup(category)]);
  };

  // A position switched to another kind of goods starts its fields over.
  const handleChangeGroupCategory = (idx: number, category: PurchaseCategory) => {
    setGroups((prev) => {
      const next = [...prev];
      if (!next[idx]) return prev;
      next[idx] = { ...emptyGroup(category), id: next[idx].id };
      return next;
    });
  };

  const handleRemoveGroup = (idx: number) => {
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateGroup = (idx: number, field: keyof Omit<PurchaseItemGroup, 'items'>, value: any) => {
    setGroups((prev) => {
      const next = [...prev];
      const current = { ...next[idx], [field]: value };
      // A typed barcode is looked up again before it counts.
      if (field === 'barcode') {
        current.barcodeStatus = 'idle';
        current.productId = null;
      }

      // When user selects or types a model, autofill RAM, storage, and color from known specs (price is never auto-filled).
      // Phones only: a tablet's model never fills its other fields.
      if (field === 'model' && typeof value === 'string' && value.trim() && isPhoneGroup(current)) {
        const modelTrim = value.trim().toLowerCase();
        const matchedCatalog = (catalogSpecs?.models || []).find(
          (m) => m.model.toLowerCase() === modelTrim && (!current.brand.trim() || m.brand.toLowerCase() === current.brand.trim().toLowerCase())
        );
        const matchedDevice = phoneDevices.find(
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
      next[groupIdx] = emptyGroup(next[groupIdx].category ?? 'PHONE');
      return next;
    });
  };

  const handleAddImeiToGroup = (groupIdx: number) => {
    const group = groups[groupIdx];
    // A tablet: the last unit needs a valid main SN before the next one is added.
    if (group && group.category === 'TABLET') {
      const last = group.items[group.items.length - 1];
      const sn = normalizeSerial(last?.imei || '');
      if (last && !isValidSerial(sn)) {
        setStatusMessage({
          type: 'error',
          text: `Позиция #${groupIdx + 1}, планшет #${group.items.length}: введите основной SN (4–64 букв и цифр) перед добавлением следующего`,
        });
        soundEffects.playError();
        return;
      }
      soundEffects.playAddToCartSuccess();
      setGroups((prev) => {
        const next = [...prev];
        next[groupIdx] = { ...next[groupIdx], items: [...next[groupIdx].items, { imei: '', imei2: '' }] };
        return next;
      });
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-sn="${groupIdx}-${group.items.length}-1"]`)?.focus(), 0);
      return;
    }
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
        items: items.length > 0 ? items : [next[groupIdx].category === 'TABLET' ? { imei: '', imei2: '' } : { imei: '' }],
      };
      return next;
    });
  };

  // IMEI autofill: the phone catalog knows the model behind an IMEI's first 8 digits. An empty
  // position takes brand, model, RAM, storage, and color. Purchase price is NEVER auto-filled per user request.
  const fillGroupFromImei = useCallback(async (groupIdx: number, imei: string) => {
    const phone = await lookupPhoneByImei(imei);
    const group = groupsRef.current[groupIdx];
    if (!phone || !group || (group.category ?? 'PHONE') !== 'PHONE') return;
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

  // Tablets: a unit's main SN (slot 1) or additional SN (slot 2), stored as the server stores it.
  const handleUpdateSerial = (groupIdx: number, itemIdx: number, slot: 1 | 2, value: string) => {
    const sn = value.replace(/\s+/g, '').toUpperCase().slice(0, 64);
    setGroups((prev) => {
      const next = [...prev];
      const items = [...next[groupIdx].items];
      items[itemIdx] = { ...items[itemIdx], ...(slot === 1 ? { imei: sn } : { imei2: sn }) };
      next[groupIdx] = { ...next[groupIdx], items };
      return next;
    });
  };

  const handleScanSerial = (groupIdx: number, itemIdx: number, slot: 1 | 2) => {
    openScanner((scannedCode) => {
      const sn = normalizeSerial(scannedCode);
      if (!isValidSerial(sn)) {
        setStatusMessage({ type: 'error', text: `Отсканированный код «${scannedCode.trim()}» не похож на серийный номер (4–64 букв и цифр)` });
        soundEffects.playError();
        return;
      }
      handleUpdateSerial(groupIdx, itemIdx, slot, sn);
      // Main SN scanned: the additional one is next (it may be left empty).
      window.setTimeout(() => document.querySelector<HTMLInputElement>(`[data-sn="${groupIdx}-${itemIdx}-${slot === 1 ? 2 : 1}"]`)?.focus(), 0);
    }, { mode: 'serial' });
  };

  // Accessories: a barcode is looked up in the catalog; a known one fills the card in by itself.
  const handleBarcodeCommit = async (groupIdx: number, raw: string) => {
    const barcode = raw.replace(/\s+/g, '').toUpperCase();
    if (!barcode) return;
    setGroups((prev) => {
      const next = [...prev];
      if (!next[groupIdx]) return prev;
      next[groupIdx] = { ...next[groupIdx], barcode, barcodeStatus: 'loading' };
      return next;
    });
    let product = null;
    try {
      product = await findAccessoryByBarcode(barcode);
    } catch {
      setStatusMessage({ type: 'error', text: `Не удалось проверить штрихкод ${barcode}. Проверьте связь и попробуйте снова` });
      setGroups((prev) => {
        const next = [...prev];
        if (next[groupIdx]?.barcode === barcode) next[groupIdx] = { ...next[groupIdx], barcodeStatus: 'idle' };
        return next;
      });
      return;
    }
    setGroups((prev) => {
      const next = [...prev];
      const current = next[groupIdx];
      if (!current || current.barcode !== barcode) return prev;
      next[groupIdx] = product
        ? {
            ...current, barcodeStatus: 'found', productId: product.id,
            brand: product.brand, name: product.name, accessoryCategory: product.category,
            model: product.model || '', attributes: product.attributes || '',
            stockQuantity: product.stockQuantity, lastUnitCostUsd: product.lastUnitCostUsd,
            // The last batch's cost is offered; this receipt's own cost stays editable.
            purchasePriceUsd: current.purchasePriceUsd || product.lastUnitCostUsd || 0,
          }
        : { ...current, barcodeStatus: 'new', productId: null, stockQuantity: undefined, lastUnitCostUsd: undefined };
      return next;
    });
    if (product) soundEffects.playAddToCartSuccess();
  };

  const handleScanBarcode = (groupIdx: number) => {
    openScanner((scannedCode) => { void handleBarcodeCommit(groupIdx, scannedCode); }, { mode: 'code' });
  };

  const handleClearBarcode = (groupIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      if (!next[groupIdx]) return prev;
      next[groupIdx] = { ...emptyGroup('ACCESSORY'), id: next[groupIdx].id };
      return next;
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

  // Units a position adds to the receipt: phones with a full 15-digit IMEI, tablets with a valid
  // main SN, and an accessory line's quantity once its barcode has been checked.
  const phoneUnitCount = (g: PurchaseItemGroup) => g.items.filter((i) => {
    const [p1] = getImeiPair(i.imei);
    return p1.replace(/\D/g, '').length === 15;
  }).length;
  const groupUnits = (g: PurchaseItemGroup) => {
    if (g.category === 'ACCESSORY') return g.barcodeStatus === 'found' || g.barcodeStatus === 'new' ? g.quantity || 0 : 0;
    if (g.category === 'TABLET') return g.items.filter((i) => isValidSerial(normalizeSerial(i.imei))).length;
    return phoneUnitCount(g);
  };

  // Calculate totals for new intake form (only complete codes count)
  const totalFormUnits = groups.reduce((acc, g) => acc + groupUnits(g), 0);

  const totalFormUsd = moneyNumber(
    groups.reduce((acc, g) => acc.plus(decimal(g.purchasePriceUsd || 0).mul(groupUnits(g))), decimal(0))
  );

  // Phones only: a tablet's SN is letters and digits, never a partial IMEI.
  const hasIncompleteImeis = useMemo(() => {
    return groups.some((g) =>
      (g.category ?? 'PHONE') === 'PHONE' && g.items.some((item) => {
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

  // Collect all 15-digit IMEIs currently typed/pasted in phone positions
  const allFormImeis = useMemo(() => {
    const list: string[] = [];
    for (const g of groups) {
      if ((g.category ?? 'PHONE') !== 'PHONE') continue;
      for (const it of g.items) {
        const [p1, p2] = getImeiPair(it.imei);
        const c1 = p1.replace(/\D/g, '').slice(0, 15);
        const c2 = p2 ? p2.replace(/\D/g, '').slice(0, 15) : '';
        if (c1.length === 15) list.push(c1);
        if (c2.length === 15) list.push(c2);
      }
    }
    return list;
  }, [groups]);

  // Every valid tablet SN (main and additional) in the form, as stored.
  const allFormSerials = useMemo(() => {
    const list: string[] = [];
    for (const g of groups) {
      if (g.category !== 'TABLET') continue;
      for (const it of g.items) {
        for (const raw of [it.imei, it.imei2 || '']) {
          const sn = normalizeSerial(raw);
          if (isValidSerial(sn)) list.push(sn);
        }
      }
    }
    return list;
  }, [groups]);

  // IMEIs and SNs share one space: a code may be registered once, in either slot.
  const allFormCodes = useMemo(() => [...allFormImeis, ...allFormSerials], [allFormImeis, allFormSerials]);

  type ExistingInfo = { brand?: string; model?: string; status?: string; locationName?: string; storeName?: string };
  const existingText = (info: ExistingInfo) => {
    const where = info.storeName || info.locationName;
    const status = info.status ? DEVICE_STATUS_LABELS[info.status as keyof typeof DEVICE_STATUS_LABELS] || info.status : '';
    const details = [info.model ? `${info.brand || ''} ${info.model}`.trim() : '', where, status].filter(Boolean).join(', ');
    return `уже зарегистрирован${details ? ` (${details})` : ''}`;
  };

  // Fast in-memory lookup against all loaded devices
  const inMemoryExistingMap = useMemo(() => {
    const map = new Map<string, ExistingInfo>();
    for (const d of devices) {
      if (d.imei) {
        map.set(d.imei, { brand: d.brand, model: d.model, status: d.status, locationName: d.locationName });
      }
      if (d.imei2) {
        map.set(d.imei2, { brand: d.brand, model: d.model, status: d.status, locationName: d.locationName });
      }
    }
    return map;
  }, [devices]);

  // Server-verified existing codes (catches sold/historical devices too)
  const [serverExistingImeis, setServerExistingImeis] = useState<Map<string, ExistingInfo>>(new Map());

  // Debounced server batch check for entered IMEIs and tablet SNs
  useEffect(() => {
    if (viewMode !== 'form') return;
    const codesToCheck = allFormCodes.filter((code) => !serverExistingImeis.has(code));
    if (codesToCheck.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const res = await apiClient<{
          existing: Array<{ imei: string; brand: string; model: string; status: string; storeName?: string }>;
        }>('/devices/check-imeis', {
          method: 'POST',
          body: JSON.stringify({
            imeis: codesToCheck.filter((code) => /^\d{15}$/.test(code)),
            serials: codesToCheck.filter((code) => !/^\d{15}$/.test(code)),
          }),
        });
        if (res?.existing && res.existing.length > 0) {
          setServerExistingImeis((prev) => {
            const next = new Map(prev);
            for (const item of res.existing) {
              next.set(item.imei, item);
            }
            return next;
          });
        }
      } catch (err) {
        console.error('Failed to check IMEIs:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [allFormCodes, serverExistingImeis, viewMode]);

  // Count occurrences within the form to detect intra-form duplicates
  const formImeiCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const code of allFormCodes) {
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return counts;
  }, [allFormCodes]);

  // Map of IMEI/SN -> user-friendly error message
  const imeiErrorsMap = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const code of allFormCodes) {
      if ((formImeiCounts.get(code) || 0) > 1) {
        errors[code] = 'дублируется в текущей партии';
        continue;
      }
      const inMem = inMemoryExistingMap.get(code);
      if (inMem) {
        errors[code] = existingText(inMem);
        continue;
      }
      const onServer = serverExistingImeis.get(code);
      if (onServer) {
        errors[code] = existingText(onServer);
        continue;
      }
    }
    return errors;
  }, [allFormCodes, formImeiCounts, inMemoryExistingMap, serverExistingImeis]);

  const hasExistingImeis = Object.keys(imeiErrorsMap).length > 0;
  const firstExistingImei = Object.keys(imeiErrorsMap)[0] || '';

  // Accessory positions: the same barcode twice (its quantities belong in one position).
  const accessoryDuplicates = useMemo(() => {
    const firstIdx = new Map<string, number>();
    const dups: Record<number, number> = {};
    groups.forEach((g, idx) => {
      if (g.category !== 'ACCESSORY') return;
      const code = (g.barcode || '').replace(/\s+/g, '').toUpperCase();
      if (!code) return;
      if (firstIdx.has(code)) dups[idx] = firstIdx.get(code)!;
      else firstIdx.set(code, idx);
    });
    return dups;
  }, [groups]);

  // Why the receipt can't be previewed yet, for accessory and tablet positions.
  const submitBlockedReason = useMemo(() => {
    for (const [idx, g] of groups.entries()) {
      if (g.category === 'ACCESSORY') {
        if (!(g.barcode || '').trim()) return `Позиция #${idx + 1}: отсканируйте или введите штрихкод аксессуара`;
        if (g.barcodeStatus === 'loading') return `Позиция #${idx + 1}: проверяется штрихкод…`;
        if (g.barcodeStatus !== 'found' && g.barcodeStatus !== 'new') return `Позиция #${idx + 1}: подтвердите штрихкод (Enter или сканер)`;
        if (accessoryDuplicates[idx] !== undefined) return `Позиция #${idx + 1}: штрихкод уже в позиции #${accessoryDuplicates[idx] + 1}`;
      }
      if (g.category === 'TABLET') {
        const bad = g.items.find((i) => {
          const main = normalizeSerial(i.imei);
          const extra = normalizeSerial(i.imei2 || '');
          return (main && !isValidSerial(main)) || (extra && !isValidSerial(extra)) || (extra && extra === main);
        });
        if (bad) return `Позиция #${idx + 1}: проверьте серийные номера планшета`;
      }
    }
    return undefined;
  }, [groups, accessoryDuplicates]);

  const [previewInvoice, setPreviewInvoice] = useState<PurchasePreviewData | null>(null);

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setStatusMessage(null);

    // Check if any IMEI already exists in database or duplicates in form
    if (hasExistingImeis) {
      setStatusMessage({
        type: 'error',
        text: `IMEI/SN ${firstExistingImei} ${imeiErrorsMap[firstExistingImei] || 'уже зарегистрирован'}! Замените или удалите дублирующийся код перед просмотром чека.`,
      });
      soundEffects.playError();
      return;
    }

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

    if (submitBlockedReason) {
      setStatusMessage({ type: 'error', text: submitBlockedReason });
      return;
    }

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.category === 'ACCESSORY') {
        const fail = (text: string) => { setStatusMessage({ type: 'error', text: `Позиция #${i + 1} (аксессуар): ${text}` }); };
        if (g.barcodeStatus === 'new' && (!g.brand.trim() || !(g.name || '').trim() || !(g.accessoryCategory || '').trim())) {
          fail('для нового штрихкода укажите бренд, название и категорию');
          return;
        }
        if (!Number.isInteger(g.quantity) || (g.quantity || 0) < 1) {
          fail('укажите количество (целое число от 1)');
          return;
        }
        if (!(g.purchasePriceUsd > 0)) {
          fail('укажите цену закупки за штуку');
          return;
        }
        continue;
      }
      if (g.category === 'TABLET') {
        const label = `Позиция #${i + 1} (планшет${g.brand || g.model ? ` ${g.brand} ${g.model}`.trimEnd() : ''})`;
        if (!g.brand.trim() || !g.model.trim()) {
          setStatusMessage({ type: 'error', text: `${label}: укажите бренд и модель` });
          return;
        }
        if (!g.storage.trim() || !g.color.trim()) {
          setStatusMessage({ type: 'error', text: `${label}: укажите встроенную память и цвет` });
          return;
        }
        if (!(g.purchasePriceUsd > 0)) {
          setStatusMessage({ type: 'error', text: `${label}: укажите цену закупки` });
          return;
        }
        if (!g.items.some((it) => isValidSerial(normalizeSerial(it.imei)))) {
          setStatusMessage({ type: 'error', text: `${label}: отсканируйте или введите основной SN хотя бы одного планшета` });
          return;
        }
        const missingMain = g.items.findIndex((it) => !normalizeSerial(it.imei) && normalizeSerial(it.imei2 || ''));
        if (missingMain >= 0) {
          setStatusMessage({ type: 'error', text: `${label}, планшет #${missingMain + 1}: указан только дополнительный SN — введите основной` });
          return;
        }
        continue;
      }
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
      if ((g.category ?? 'PHONE') !== 'PHONE') continue;
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
      .map((g): PurchasePreviewGroup => {
        if (g.category === 'ACCESSORY') {
          return {
            category: 'ACCESSORY',
            barcode: (g.barcode || '').replace(/\s+/g, '').toUpperCase(),
            brand: g.brand.trim(),
            name: (g.name || '').trim(),
            accessoryCategory: (g.accessoryCategory || '').trim(),
            model: g.model.trim(),
            attributes: (g.attributes || '').trim(),
            quantity: g.quantity || 0,
            ram: '', storage: '', color: '',
            purchasePriceUsd: g.purchasePriceUsd,
            items: [],
            imeis: [],
          };
        }
        if (g.category === 'TABLET') {
          // Each field exactly as entered (no phone formatting or colour translation).
          const units = g.items
            .map((it) => ({ imei: normalizeSerial(it.imei), imei2: normalizeSerial(it.imei2 || '') }))
            .filter((it) => isValidSerial(it.imei))
            .map((it) => (it.imei2 ? it : { imei: it.imei }));
          return {
            category: 'TABLET',
            brand: g.brand.trim(),
            model: g.model.trim(),
            ram: g.ram.trim(),
            storage: g.storage.trim(),
            color: g.color.trim(),
            connectivity: (g.connectivity || '').trim(),
            screenSize: (g.screenSize || '').trim(),
            purchasePriceUsd: g.purchasePriceUsd,
            items: units,
            imeis: units.map((u) => u.imei),
          };
        }
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
      .filter((g) => (g.category === 'ACCESSORY' ? (g.quantity || 0) > 0 : g.items.length > 0));

    if (cleanGroups.length === 0) {
      setStatusMessage({ type: 'error', text: 'Добавьте хотя бы одно устройство с заполненным IMEI/SN или аксессуар' });
      return;
    }

    // Final pre-flight verification against server database
    if (allFormCodes.length > 0) {
      try {
        const checkRes = await apiClient<{
          existing: Array<{ imei: string; brand: string; model: string; status: string; storeName?: string }>;
        }>('/devices/check-imeis', {
          method: 'POST',
          body: JSON.stringify({ imeis: allFormImeis, serials: allFormSerials }),
        });
        if (checkRes?.existing && checkRes.existing.length > 0) {
          const found = checkRes.existing[0];
          setServerExistingImeis((prev) => {
            const next = new Map(prev);
            for (const item of checkRes.existing) {
              next.set(item.imei, item);
            }
            return next;
          });
          setStatusMessage({
            type: 'error',
            text: `IMEI/SN ${found.imei} ${existingText(found)}! Просмотр чека заблокирован.`,
          });
          soundEffects.playError();
          return;
        }
      } catch (err) {
        console.error('Pre-submit IMEI check error:', err);
      }
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

        setGroups([emptyGroup('PHONE')]);
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
          text: `Приход по накладной ${savedNum} сохранён на главном складе (${previewInvoice.groups.reduce((a, b) => a + previewUnits(b), 0)} шт.)${paymentNote}. Для другой точки оформите перемещение или приход со склада.`,
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
      {/* The invoice list's own results (edit, delete): the new-purchase form shows its messages inline. */}
      <StatusBanner
        message={viewMode === 'list' && statusMessage ? { tone: statusMessage.type, text: statusMessage.text } : null}
        onDismiss={() => setStatusMessage(null)}
      />
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
          onChangeGroupCategory={handleChangeGroupCategory}
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
          imeiErrorsMap={imeiErrorsMap}
          hasExistingImeis={hasExistingImeis}
          firstExistingImei={firstExistingImei}
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
          onUpdateSerial={handleUpdateSerial}
          onScanSerial={handleScanSerial}
          onBarcodeCommit={(groupIdx, barcode) => { void handleBarcodeCommit(groupIdx, barcode); }}
          onScanBarcode={handleScanBarcode}
          onClearBarcode={handleClearBarcode}
          accessoryDuplicates={accessoryDuplicates}
          submitBlockedReason={submitBlockedReason}
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
        message={(() => {
          const inv = supplierInvoices.find((i) => i.id === deletingInvoiceId);
          const paid = inv?.paidAmountUsd || 0;
          return `Накладная ${inv?.invoiceNumber ?? ''} будет удалена полностью: её товары уберутся со склада и из магазинов, долг поставщику уменьшится.`
            + (paid > 0 ? ` Оплаченные $${formatMoney(paid)} вернутся в Центральную кассу.` : '')
            + ' Если что-то из накладной уже продано, удалить её нельзя — можно изменить цены непроданных позиций.';
        })()}
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
