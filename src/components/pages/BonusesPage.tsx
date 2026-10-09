import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { SupplierBonus } from '../../types';
import { apiClient } from '../../api/client';
import { formatMoney } from '../../utils/money';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../utils/cn';
import {
  Gift,
  Plus,
  Smartphone,
  CheckCircle2,
  Building2,
  Users,
  Wallet,
  Banknote,
  X,
  Scan,
  Edit,
  Trash2,
  Landmark,
  HandCoins,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { MonthPicker } from '../ui/MonthPicker';
import { currentBusinessMonth } from '../../utils/businessDate';

interface BonusAccountBalance {
  balanceUsd: string;
  balanceTjs: string;
}

interface BonusOperation {
  id: string;
  kind: 'TRANSFER' | 'PAYOUT';
  transactionNumber: string;
  amountUsd: number;
  amountTjs: number;
  comment: string | null;
  status: 'POSTED' | 'CANCELLED';
  createdAt: string;
}

interface BonusDeviceItem {
  id: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  imei: string;
  status: string;
  storeId: string;
  storeName: string;
  isMainWarehouse: boolean;
  supplierName: string;
  costBasisUsd: number;
  createdAt: string;
  isSold: boolean;
  soldPriceUsd?: number | null;
  soldPriceTjs?: number | null;
  saleReceiptNumber?: number | null;
  saleDate?: string | null;
  customerName?: string | null;
}

interface MonthBonusStats {
  cashBonusesCount: number;
  cashBonusesUsd: number;
  cashBonusesTjs: number;
  bonusDevicesReceived: number;
  bonusDevicesSold: number;
  bonusDeviceProfitUsd: number;
  bonusDeviceProfitTjs: number;
}

type MainTab = 'HISTORY' | 'DEVICES';
type CashDecisionAction = 'CENTRAL_CASH' | 'PAYOUT' | 'RESERVE';

const formatBonusDate = (d?: string | null) => {
  if (!d) return '';
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('ru-RU');
};

export const BonusesPage: React.FC = () => {
  const {
    supplierBonuses,
    suppliers,
    stores,
    devices,
    createSupplierBonus,
    updateSupplierBonus,
    deleteSupplierBonus,
    todayRate,
    openScanner,
  } = useAppFields(
    'currentUser',
    'supplierBonuses',
    'suppliers',
    'stores',
    'devices',
    'createSupplierBonus',
    'updateSupplierBonus',
    'deleteSupplierBonus',
    'todayRate',
    'openScanner'
  );

  const rate = Number(todayRate?.rate) || 0;

  // Active view tab & filters
  const [activeTab, setActiveTab] = useState<MainTab>('HISTORY');
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'IN_STOCK' | 'SOLD'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => currentBusinessMonth());
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  // Async server data: bonus account, operations, devices, summary
  const [balance, setBalance] = useState<BonusAccountBalance | null>(null);
  const [, setOperations] = useState<BonusOperation[]>([]);
  const [bonusDevices, setBonusDevices] = useState<BonusDeviceItem[]>([]);
  const [monthStats, setMonthStats] = useState<MonthBonusStats | null>(null);
  const [, setLoadingData] = useState(false);
  const [revision, setRevision] = useState(0);

  // Status banners
  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Registration modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [bonusType, setBonusType] = useState<'CASH_DISCOUNT' | 'FREE_DEVICES'>('CASH_DISCOUNT');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [cashAction, setCashAction] = useState<CashDecisionAction>('CENTRAL_CASH');
  const [decisionNote, setDecisionNote] = useState('');

  // Free device bonus fields
  const [bonusBrand, setBonusBrand] = useState('');
  const [bonusModel, setBonusModel] = useState('');
  const [bonusRam, setBonusRam] = useState('');
  const [bonusStorage, setBonusStorage] = useState('');
  const [bonusColor, setBonusColor] = useState('');
  const [bonusImei, setBonusImei] = useState('');
  const [bonusImei2, setBonusImei2] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('main-warehouse');

  // Quick Action Modal (Transfer to Central Cash / Payout)
  const [reserveModalKind, setReserveModalKind] = useState<'transfer' | 'payout' | null>(null);
  const [reserveAmountInput, setReserveAmountInput] = useState('');
  const [reserveCommentInput, setReserveCommentInput] = useState('');
  const [isSubmittingReserveAction, setIsSubmittingReserveAction] = useState(false);

  // Inspection, Editing, and Deleting
  const [, setSelectedBonus] = useState<SupplierBonus | null>(null);
  const [editingBonus, setEditingBonus] = useState<SupplierBonus | null>(null);
  const [editCampaignTitle, setEditCampaignTitle] = useState('');
  const [editAmountUsd, setEditAmountUsd] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editStorage, setEditStorage] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editImei, setEditImei] = useState('');
  const [editImei2, setEditImei2] = useState('');
  const [deletingBonus, setDeletingBonus] = useState<SupplierBonus | null>(null);

  // Suppliers sync
  useEffect(() => {
    if (!supplierId && suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
    }
  }, [suppliers, supplierId]);

  // Load server-side balances, operations and devices
  const loadDashboardData = useCallback(async () => {
    try {
      setLoadingData(true);
      const statsUrl = selectedMonth ? `/bonuses/quarter?month=${selectedMonth}` : '/bonuses/quarter';
      const [balancesRes, opsRes, devicesRes, statsRes] = await Promise.allSettled([
        apiClient<{ bonusAccount: BonusAccountBalance }>('/cash-collections/balances'),
        apiClient<BonusOperation[]>('/bonus-account/operations'),
        apiClient<BonusDeviceItem[]>('/bonuses/devices'),
        apiClient<MonthBonusStats>(statsUrl),
      ]);

      if (balancesRes.status === 'fulfilled' && balancesRes.value?.bonusAccount) {
        setBalance(balancesRes.value.bonusAccount);
      }
      if (opsRes.status === 'fulfilled' && Array.isArray(opsRes.value)) {
        setOperations(opsRes.value);
      }
      if (devicesRes.status === 'fulfilled' && Array.isArray(devicesRes.value)) {
        setBonusDevices(devicesRes.value);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value) {
        setMonthStats(statsRes.value);
      }
    } finally {
      setLoadingData(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, revision]);

  useEffect(() => {
    const handleUpdate = () => setRevision((r) => r + 1);
    window.addEventListener('business-data-changed', handleUpdate);
    return () => window.removeEventListener('business-data-changed', handleUpdate);
  }, []);

  // Autocomplete suggestions
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Apple', 'Samsung', 'Xiaomi', 'Google', 'OnePlus', 'Honor', 'Realme', 'Huawei', 'Nothing']);
    (devices || []).forEach((d) => {
      if (d.brand) set.add(d.brand.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const ramOptions = useMemo(() => {
    const set = new Set<string>(['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '24 GB']);
    (devices || []).forEach((d) => {
      if (d.ram) set.add(d.ram.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  const getModelOptions = useCallback(
    (selectedBrand: string) => {
      const set = new Set<string>();
      const brandLower = (selectedBrand || '').trim().toLowerCase();
      (devices || []).forEach((d) => {
        if (d.model && (!brandLower || (d.brand && d.brand.toLowerCase() === brandLower))) {
          set.add(d.model.trim());
        }
      });
      return Array.from(set).sort();
    },
    [devices]
  );

  const storageOptions = useMemo(() => {
    const set = new Set<string>(['64 GB', '128 GB', '256 GB', '512 GB', '1 TB']);
    (devices || []).forEach((d) => {
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
    (devices || []).forEach((d) => {
      if (d.color) set.add(d.color.trim());
    });
    return Array.from(set).sort();
  }, [devices]);

  // Derived metrics
  const availableReserveUsd = Number(balance?.balanceUsd || 0);
  const availableReserveTjs = Number(balance?.balanceTjs || 0);

  const totalBonusDevicesInStock = useMemo(() => {
    return bonusDevices.filter((d) => !d.isSold).length;
  }, [bonusDevices]);

  const totalBonusDevicesSold = useMemo(() => {
    return bonusDevices.filter((d) => d.isSold).length;
  }, [bonusDevices]);

  // Filtered bonuses for the selected month
  const filteredBonuses = useMemo(() => {
    const list = [...supplierBonuses].sort(
      (a, b) => new Date(b.dateReceived || b.date || 0).getTime() - new Date(a.dateReceived || a.date || 0).getTime()
    );
    if (!selectedMonth) return list;
    return list.filter((b) => {
      const d = b.dateReceived || b.date || (b as any).createdAt || '';
      return d.startsWith(selectedMonth);
    });
  }, [supplierBonuses, selectedMonth]);

  const monthLabel = useMemo(() => {
    if (!selectedMonth) return 'все периоды';
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      if (!y || !m) return selectedMonth;
      const d = new Date(Date.UTC(y, m - 1, 1));
      return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    } catch {
      return selectedMonth;
    }
  }, [selectedMonth]);

  // Handle registration of new bonus with immediate admin decision
  const handleCreateBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const supplier = suppliers.find((s) => s.id === supplierId);
    const supplierName = supplier?.name || 'Поставщик';

    if (bonusType === 'CASH_DISCOUNT') {
      const numAmount = parseFloat(amountUsd.replace(',', '.'));
      if (!numAmount || numAmount <= 0) {
        setStatus({ tone: 'error', text: 'Укажите корректную сумму денежного бонуса' });
        return;
      }
    } else {
      if (!bonusBrand.trim() || !bonusModel.trim()) {
        setStatus({ tone: 'error', text: 'Укажите бренд и модель подарочного устройства' });
        return;
      }
      if (!bonusRam.trim()) {
        setStatus({ tone: 'error', text: 'Укажите RAM (ОЗУ) подарочного устройства' });
        return;
      }
      if (!bonusStorage.trim()) {
        setStatus({ tone: 'error', text: 'Укажите память (ROM) подарочного устройства' });
        return;
      }
      if (!bonusImei.trim()) {
        setStatus({ tone: 'error', text: 'Укажите IMEI подарочного устройства' });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const freeDevices =
        bonusType === 'FREE_DEVICES'
          ? [
              {
                brand: bonusBrand.trim(),
                model: bonusModel.trim(),
                ram: bonusRam.trim(),
                storage: bonusStorage.trim(),
                color: bonusColor.trim() || 'Стандарт',
                imei: bonusImei.trim(),
                imei2: bonusImei2.trim() || undefined,
                costBasisUsd: 0,
              },
            ]
          : undefined;

      const numAmountUsd = bonusType === 'CASH_DISCOUNT' ? parseFloat(amountUsd.replace(',', '.')) : undefined;

      // 1. Create the bonus
      const res = await createSupplierBonus({
        supplierId,
        campaignTitle: campaignTitle.trim() || undefined,
        bonusType,
        amountUsd: numAmountUsd,
        freeDevices,
        destinationLocationId,
      });

      if (!res.success) {
        setStatus({ tone: 'error', text: res.message || 'Ошибка регистрации бонуса' });
        return;
      }

      // 2. If Cash bonus: execute chosen admin decision immediately
      if (bonusType === 'CASH_DISCOUNT' && numAmountUsd && numAmountUsd > 0) {
        if (cashAction === 'CENTRAL_CASH') {
          try {
            await apiClient('/bonus-account/transfer', {
              method: 'POST',
              body: JSON.stringify({
                amountUsd: numAmountUsd,
                comment: decisionNote.trim() || `Бонус от ${supplierName} (внесён в бизнес при фиксации)`,
              }),
            });
            setStatus({
              tone: 'success',
              text: `Бонус $${formatMoney(numAmountUsd)} успешно зафиксирован и зачислен в Центральную кассу!`,
            });
          } catch (tErr: any) {
            setStatus({
              tone: 'warning',
              text: `Бонус сохранён на счёте, но перевод в кассу завершился с ошибкой: ${tErr?.message}`,
            });
          }
        } else if (cashAction === 'PAYOUT') {
          try {
            await apiClient('/bonus-account/payout', {
              method: 'POST',
              body: JSON.stringify({
                amountUsd: numAmountUsd,
                comment: decisionNote.trim() || `Выплата прибыли от бонуса ${supplierName}`,
              }),
            });
            setStatus({
              tone: 'success',
              text: `Бонус $${formatMoney(numAmountUsd)} зафиксирован и оформлен как выплата прибыли!`,
            });
          } catch (pErr: any) {
            setStatus({
              tone: 'warning',
              text: `Бонус сохранён на счёте, но выплата завершилась с ошибкой: ${pErr?.message}`,
            });
          }
        } else {
          setStatus({
            tone: 'success',
            text: `Денежный бонус $${formatMoney(numAmountUsd)} зафиксирован в резерве на Бонусном счёте`,
          });
        }
      } else {
        setStatus({
          tone: 'success',
          text: `Подарочный телефон ${bonusBrand} ${bonusModel} (${bonusImei}) оприходован на склад с себестоимостью $0`,
        });
      }

      // Reset form
      setIsCreateModalOpen(false);
      setCampaignTitle('');
      setAmountUsd('');
      setCashAction('CENTRAL_CASH');
      setDecisionNote('');
      setBonusBrand('');
      setBonusModel('');
      setBonusRam('');
      setBonusStorage('');
      setBonusColor('');
      setBonusImei('');
      setBonusImei2('');

      setRevision((r) => r + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Action on Reserve (Transfer to Central Cash / Payout)
  const openReserveAction = (kind: 'transfer' | 'payout', defaultAmount?: number) => {
    setReserveModalKind(kind);
    setReserveAmountInput(defaultAmount ? String(defaultAmount) : (availableReserveUsd > 0 ? String(availableReserveUsd) : ''));
    setReserveCommentInput('');
  };

  const handleExecuteReserveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reserveModalKind || isSubmittingReserveAction) return;

    const val = parseFloat(reserveAmountInput.replace(',', '.'));
    if (!val || val <= 0) {
      setStatus({ tone: 'error', text: 'Укажите корректную сумму' });
      return;
    }
    if (val > availableReserveUsd) {
      setStatus({ tone: 'error', text: `Сумма превышает доступный резерв ($${formatMoney(availableReserveUsd)})` });
      return;
    }

    setIsSubmittingReserveAction(true);
    try {
      await apiClient(`/bonus-account/${reserveModalKind}`, {
        method: 'POST',
        body: JSON.stringify({
          amountUsd: val,
          comment: reserveCommentInput.trim() || undefined,
        }),
      });

      setStatus({
        tone: 'success',
        text: reserveModalKind === 'transfer'
          ? `Переведено $${formatMoney(val)} в Центральную кассу`
          : `Выдано $${formatMoney(val)} с Бонусного счёта`,
      });

      setReserveModalKind(null);
      setRevision((r) => r + 1);
    } catch (err: any) {
      setStatus({ tone: 'error', text: err?.message || 'Операция не выполнена' });
    } finally {
      setIsSubmittingReserveAction(false);
    }
  };

  // Edit bonus
  const handleStartEditBonus = (bonus: SupplierBonus) => {
    setEditCampaignTitle(bonus.campaignTitle || bonus.campaignName || '');
    setEditAmountUsd(bonus.amountUsd != null ? String(bonus.amountUsd) : '');
    const fd = bonus.freeDevices?.[0];
    setEditBrand(fd?.brand || bonus.brand || '');
    setEditModel(fd?.model || bonus.model || '');
    setEditStorage(fd?.storage || bonus.storage || '');
    setEditColor(fd?.color || bonus.color || '');
    setEditImei(fd?.imei || bonus.imei || '');
    setEditImei2('');
    setEditingBonus(bonus);
  };

  const handleSaveEditBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBonus || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await updateSupplierBonus(editingBonus.id, {
        campaignTitle: editCampaignTitle.trim() || undefined,
        amountUsd: editingBonus.bonusType === 'CASH_DISCOUNT' ? parseFloat(editAmountUsd) || 0 : undefined,
        freeDevice:
          editingBonus.bonusType === 'FREE_DEVICES'
            ? {
                brand: editBrand.trim(),
                model: editModel.trim(),
                storage: editStorage.trim(),
                color: editColor.trim(),
                imei: editImei.trim(),
                imei2: editImei2.trim() || undefined,
              }
            : undefined,
      });

      if (res.success) {
        setEditingBonus(null);
        setSelectedBonus(null);
        setStatus({ tone: 'success', text: 'Бонус обновлён' });
        setRevision((r) => r + 1);
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка обновления бонуса' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete bonus
  const handleConfirmDeleteBonus = async () => {
    if (!deletingBonus || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await deleteSupplierBonus(deletingBonus.id);
      setDeletingBonus(null);
      if (res.success) {
        setSelectedBonus(null);
        setStatus({ tone: 'success', text: 'Бонус удалён' });
        setRevision((r) => r + 1);
      } else {
        setStatus({ tone: 'error', text: res.message || 'Ошибка удаления бонуса' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered devices list
  const filteredBonusDevices = useMemo(() => {
    if (deviceFilter === 'IN_STOCK') return bonusDevices.filter((d) => !d.isSold);
    if (deviceFilter === 'SOLD') return bonusDevices.filter((d) => d.isSold);
    return bonusDevices;
  }, [bonusDevices, deviceFilter]);

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Compact Top Navigation & Action Bar */}
      <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 border-b border-border bg-surface shrink-0 flex items-center justify-between gap-2 shadow-2xs flex-wrap">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={cn(
              'h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5',
              activeTab === 'HISTORY'
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
            )}
          >
            <span>Журнал бонусов</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold',
                activeTab === 'HISTORY' ? 'bg-black/20 text-white' : 'bg-surface border border-border text-fg-muted'
              )}
            >
              {filteredBonuses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DEVICES')}
            className={cn(
              'h-7 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1.5',
              activeTab === 'DEVICES'
                ? 'bg-accent text-accent-fg shadow-2xs font-bold'
                : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
            )}
          >
            <span>Подарочные телефоны</span>
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold',
                activeTab === 'DEVICES' ? 'bg-black/20 text-white' : 'bg-surface border border-border text-fg-muted'
              )}
            >
              {bonusDevices.length}
            </span>
          </button>
        </div>

        {/* Action Buttons: MonthPicker & + Бонус */}
        <div className="flex items-center gap-1.5 shrink-0">
          <MonthPicker
            value={selectedMonth}
            onChange={setSelectedMonth}
            onReset={() => setSelectedMonth('')}
            placeholder="Все месяцы"
            className="h-7.5 px-2.5 rounded-lg border border-border hover:border-accent/40 bg-surface-raised text-xs font-semibold text-fg focus:outline-none cursor-pointer"
          />

          <Button
            variant="primary"
            size="sm"
            leftIcon={Plus}
            onClick={() => setIsCreateModalOpen(true)}
            className="h-7.5 px-2.5 text-xs font-bold cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
          >
            <span>+ Бонус</span>
          </Button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2.5">
        {/* 1. КОМПАКТНАЯ СТАТИСТИКА В 1 РЯД (3 КАРТОЧКИ) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0">
          {/* CARD 1: БОНУСНЫЙ РЕЗЕРВ */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-br from-success/15 via-surface to-surface border border-success/30 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle truncate">
                    Бонусный резерв
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded font-semibold bg-success/20 text-success border border-success/30">
                    Резерв
                  </span>
                </div>
                <div className="text-base sm:text-lg font-black font-mono text-success leading-tight mt-0.5">
                  ${formatMoney(availableReserveUsd)}
                </div>
                <span className="text-[10px] text-fg-subtle font-mono block">
                  ≈ {formatMoney(availableReserveTjs)} TJS
                </span>
              </div>
              <div className="w-6 h-6 rounded-lg bg-success/20 border border-success/30 flex items-center justify-center text-success shrink-0">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="flex items-center gap-1 pt-1.5 mt-1 border-t border-border/60">
              <button
                type="button"
                disabled={availableReserveUsd <= 0}
                onClick={() => openReserveAction('transfer')}
                className="flex-1 h-6 px-1.5 rounded-md bg-surface-raised hover:bg-accent/15 border border-accent/40 text-accent font-bold text-[10px] transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1"
                title="Перевести в Центральную кассу"
              >
                <Landmark className="w-3 h-3" />
                <span>В кассу</span>
              </button>
              <button
                type="button"
                disabled={availableReserveUsd <= 0}
                onClick={() => openReserveAction('payout')}
                className="flex-1 h-6 px-1.5 rounded-md bg-surface-raised hover:bg-warning/15 border border-warning/40 text-warning font-bold text-[10px] transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-1"
                title="Выдать как прибыль"
              >
                <HandCoins className="w-3 h-3" />
                <span>Выдать</span>
              </button>
            </div>
          </div>

          {/* CARD 2: ДЕНЕЖНЫЕ БОНУСЫ ЗА МЕСЯЦ */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Денежные бонусы {selectedMonth ? `(${monthLabel})` : ''}
                </span>
                <div className="text-base sm:text-lg font-black font-mono text-accent leading-tight mt-0.5">
                  ${formatMoney(monthStats?.cashBonusesUsd || 0)}
                </div>
                <span className="text-[10px] text-fg-subtle font-mono block">
                  ≈ {formatMoney(monthStats?.cashBonusesTjs || 0)} TJS
                </span>
              </div>
              <div className="w-6 h-6 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
                <Banknote className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="pt-1.5 mt-1 border-t border-border/60 flex items-center justify-between text-[10px] text-fg-subtle">
              <span>Кампаний: <strong className="text-fg font-semibold font-mono">{monthStats?.cashBonusesCount || 0}</strong></span>
              <span className="text-accent font-medium">От поставщиков</span>
            </div>
          </div>

          {/* CARD 3: ПОДАРОЧНЫЕ ТЕЛЕФОНЫ */}
          <div className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block truncate">
                  Телефоны ($0)
                </span>
                <div className="text-base sm:text-lg font-black font-mono text-warning leading-tight mt-0.5">
                  {totalBonusDevicesInStock}{' '}
                  <span className="text-[10px] font-semibold text-fg-subtle">на складе</span>
                </div>
                <span className="text-[10px] text-success font-mono font-semibold block">
                  Продано: {totalBonusDevicesSold} шт.
                </span>
              </div>
              <div className="w-6 h-6 rounded-lg bg-warning/15 border border-warning/25 flex items-center justify-center text-warning shrink-0">
                <Smartphone className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="pt-1.5 mt-1 border-t border-border/60 flex items-center justify-between text-[10px]">
              <span className="text-fg-subtle">Себест: $0</span>
              <button
                type="button"
                onClick={() => { setActiveTab('DEVICES'); setDeviceFilter('IN_STOCK'); }}
                className="text-[10px] font-bold text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                К устройствам →
              </button>
            </div>
          </div>
        </div>

        {/* DEVICES sub-filter bar (only shown when activeTab === 'DEVICES') */}
        {activeTab === 'DEVICES' && (
          <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5 pt-0.5 flex-wrap">
            <span className="text-xs font-bold text-fg-subtle">Фильтр телефонов:</span>
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setDeviceFilter('ALL')}
                className={cn(
                  'h-6.5 px-2 rounded-md font-semibold text-[11px] transition-colors cursor-pointer',
                  deviceFilter === 'ALL'
                    ? 'bg-accent text-accent-fg font-bold'
                    : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
                )}
              >
                Все ({bonusDevices.length})
              </button>
              <button
                type="button"
                onClick={() => setDeviceFilter('IN_STOCK')}
                className={cn(
                  'h-6.5 px-2 rounded-md font-semibold text-[11px] transition-colors cursor-pointer',
                  deviceFilter === 'IN_STOCK'
                    ? 'bg-warning/20 text-warning border border-warning/40 font-bold'
                    : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
                )}
              >
                На складе ({totalBonusDevicesInStock})
              </button>
              <button
                type="button"
                onClick={() => setDeviceFilter('SOLD')}
                className={cn(
                  'h-6.5 px-2 rounded-md font-semibold text-[11px] transition-colors cursor-pointer',
                  deviceFilter === 'SOLD'
                    ? 'bg-success/20 text-success border border-success/40 font-bold'
                    : 'bg-surface-raised border border-border text-fg-subtle hover:text-fg'
                )}
              >
                Проданы ({totalBonusDevicesSold})
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: ЖУРНАЛ БОНУСОВ И РЕШЕНИЙ */}
        {activeTab === 'HISTORY' ? (
          <div className="space-y-2">
            {/* Collapsible header */}
            <div className="flex items-center justify-between gap-2 px-1 py-0.5">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                  Журнал бонусов
                </h3>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold bg-surface-raised border border-border text-fg-muted">
                  {filteredBonuses.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryCollapsed((c) => !c)}
                className="h-6.5 px-2.5 rounded-lg text-xs font-semibold text-fg-subtle hover:text-fg bg-surface-raised border border-border hover:border-accent/40 flex items-center gap-1.5 cursor-pointer transition-colors"
                title={isHistoryCollapsed ? 'Развернуть историю' : 'Свернуть историю'}
              >
                <span>{isHistoryCollapsed ? 'Развернуть' : 'Свернуть'}</span>
                {isHistoryCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5 text-accent" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 text-fg-subtle" />
                )}
              </button>
            </div>

            {/* Collapsed state placeholder or full list */}
            {isHistoryCollapsed ? (
              <div
                onClick={() => setIsHistoryCollapsed(false)}
                className="p-3.5 rounded-xl bg-surface border border-border border-dashed text-center text-xs text-fg-subtle hover:text-fg hover:border-accent/40 cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <span>История бонусов свернута ({filteredBonuses.length} записей)</span>
                <span className="text-accent font-semibold flex items-center gap-0.5">
                  Развернуть <ChevronDown className="w-3.5 h-3.5" />
                </span>
              </div>
            ) : filteredBonuses.length === 0 ? (
              <EmptyState
                icon={Gift}
                title={selectedMonth ? `За ${monthLabel} бонусов нет` : 'Бонусов пока нет'}
                description={
                  selectedMonth
                    ? 'За выбранный месяц бонусы ещё не регистрировались. Выберите другой месяц или добавьте новый бонус.'
                    : 'Зафиксируйте первый денежный бонус или подарочное устройство от поставщика'
                }
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={Plus}
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    Зафиксировать бонус
                  </Button>
                }
              />
            ) : (
              <div className="space-y-1.5">
                {filteredBonuses.map((bonus) => {
                    const isCash = bonus.bonusType === 'CASH_DISCOUNT';
                    const hasFreeDevices = Boolean(bonus.freeDevices && bonus.freeDevices.length > 0);
                    const bonusDate = formatBonusDate(bonus.date || bonus.dateReceived);

                    return (
                      <div
                        key={bonus.id}
                        className="px-2.5 py-1.5 sm:py-2 rounded-xl bg-surface border border-border hover:border-accent/40 transition-colors shadow-2xs space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-fg text-xs truncate">
                              {bonus.campaignTitle || bonus.campaignName || `Бонус от ${bonus.supplierName}`}
                            </span>
                            <span
                              className={cn(
                                'text-[9px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider',
                                isCash
                                  ? 'bg-accent/15 text-accent border border-accent/25'
                                  : 'bg-warning/15 text-warning border border-warning/30'
                              )}
                            >
                              {isCash ? 'Денежный' : 'Телефон ($0)'}
                            </span>
                            <span className="text-[10px] text-fg-subtle truncate">
                              • {bonus.supplierName}
                              {bonusDate && <span> • {bonusDate}</span>}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            {isCash ? (
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-xs sm:text-sm font-black font-mono text-accent leading-none">
                                  +${formatMoney(bonus.amountUsd || 0)}
                                </span>
                                <span className="text-[10px] text-fg-subtle font-mono hidden xs:inline">
                                  (≈ {formatMoney((bonus.amountUsd || 0) * (bonus.exchangeRate || rate))} TJS)
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-baseline justify-end gap-1.5">
                                <span className="text-xs font-bold font-mono text-warning leading-none">
                                  +{bonus.freeDevices?.length || 1} шт.
                                </span>
                                <span className="text-[9px] text-success font-semibold">
                                  ($0)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Details for Free Devices */}
                        {hasFreeDevices && (
                          <div className="px-2 py-0.5 rounded-lg bg-surface-raised border border-border text-[10px] flex items-center gap-1.5 flex-wrap">
                            <span className="text-warning font-semibold flex items-center gap-1 shrink-0">
                              <Smartphone className="w-3 h-3" /> Подарочные:
                            </span>
                            {bonus.freeDevices!.map((fd) => (
                              <span
                                key={fd.imei}
                                className="px-1 py-0.2 rounded bg-surface border border-border font-mono text-[9px] text-fg"
                              >
                                {fd.brand} {fd.model} {fd.storage} • {fd.imei}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="pt-0.5 border-t border-border/50 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            {isCash && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-fg-subtle">Действие:</span>
                                <button
                                  type="button"
                                  onClick={() => openReserveAction('transfer', bonus.amountUsd)}
                                  className="text-[10px] font-semibold text-accent hover:underline flex items-center gap-0.5 cursor-pointer"
                                  title="Перевести сумму в Центральную кассу"
                                >
                                  <Landmark className="w-2.5 h-2.5 text-accent" /> В кассу
                                </button>
                                <span className="text-border">•</span>
                                <button
                                  type="button"
                                  onClick={() => openReserveAction('payout', bonus.amountUsd)}
                                  className="text-[10px] font-semibold text-warning hover:underline flex items-center gap-0.5 cursor-pointer"
                                  title="Выдать прибыль"
                                >
                                  <HandCoins className="w-2.5 h-2.5 text-warning" /> Выдать
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleStartEditBonus(bonus)}
                              className="text-fg-subtle hover:text-accent p-1 rounded hover:bg-surface-raised cursor-pointer transition-colors"
                              title="Редактировать бонус"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingBonus(bonus)}
                              className="text-fg-subtle hover:text-danger p-1 rounded hover:bg-surface-raised cursor-pointer transition-colors"
                              title="Удалить бонус"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: ПОДАРОЧНЫЕ ТЕЛЕФОНЫ */
          <div className="space-y-2">
            {filteredBonusDevices.length === 0 ? (
              <EmptyState
                icon={Smartphone}
                title="Подарочные телефоны не найдены"
                description={
                  deviceFilter === 'IN_STOCK'
                    ? 'На складе сейчас нет свободных бонусных телефонов'
                    : deviceFilter === 'SOLD'
                    ? 'Пока ни один бонусный телефон не был продан'
                    : 'Бонусные устройства ещё не регистрировались'
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {filteredBonusDevices.map((d) => (
                  <div
                    key={d.id}
                    className="p-2 sm:p-2.5 rounded-xl bg-surface border border-border shadow-2xs space-y-1.5 hover:border-accent/40 transition-colors text-xs"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <h3 className="text-xs sm:text-sm font-bold text-fg truncate">
                          {d.brand} {d.model}
                        </h3>
                        <p className="text-[11px] text-fg-subtle truncate">
                          {d.storage} • {d.color} {d.ram && `• RAM ${d.ram}`}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0',
                          d.isSold
                            ? 'bg-success/15 text-success border border-success/30'
                            : 'bg-warning/15 text-warning border border-warning/30'
                        )}
                      >
                        {d.isSold ? 'Продан' : 'На складе'}
                      </span>
                    </div>

                    <div className="px-2 py-1.5 rounded-lg bg-surface-raised border border-border text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>IMEI:</span>
                        <strong className="text-fg font-mono font-bold">{d.imei}</strong>
                      </div>
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>Поставщик / Точка:</span>
                        <span className="text-fg font-medium truncate max-w-[170px] text-right">
                          {d.supplierName} • {d.storeName}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>Себестоимость:</span>
                        <strong className="text-success font-mono font-bold">$0 (подарок)</strong>
                      </div>
                    </div>

                    {d.isSold ? (
                      <div className="pt-1 border-t border-border flex items-center justify-between text-[11px]">
                        <span className="text-fg-subtle truncate">
                          Чек <strong className="text-fg font-mono font-bold">#{d.saleReceiptNumber}</strong>
                          {d.saleDate && ` (${new Date(d.saleDate).toLocaleDateString('ru-RU')})`}
                        </span>
                        <span className="text-success font-bold font-mono shrink-0 ml-1">
                          +${formatMoney(d.soldPriceUsd || 0)}
                        </span>
                      </div>
                    ) : (
                      <div className="pt-1 border-t border-border flex items-center justify-between text-[11px] text-warning">
                        <span className="font-semibold">Готов к продаже</span>
                        <span className="text-fg-subtle font-mono text-[10px]">
                          {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: ЗАФИКСИРОВАТЬ БОНУС С РЕШЕНИЕМ (КОМПАКТНЫЙ И УДОБНЫЙ) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <form
            onSubmit={handleCreateBonus}
            className="w-full max-w-md rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-2.5 my-auto max-h-[92vh] flex flex-col"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 text-accent flex items-center justify-center">
                  <Gift className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-fg leading-tight">Зафиксировать бонус</h3>
                  <p className="text-[10px] text-fg-subtle">Бонусная выплата или подарок от поставщика</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto pr-0.5 space-y-2.5 text-xs flex-1 scrollbar-thin">
              {/* Row 1: Поставщик и Повод */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Поставщик *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Повод (необязательно)</label>
                  <input
                    type="text"
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                    placeholder="Объём продаж, акция..."
                    className="w-full h-8 px-2.5 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Row 2: Вид бонуса (Segmented Switch) */}
              <div>
                <label className="block text-[11px] font-semibold text-fg-subtle mb-1">Вид бонуса *</label>
                <div className="grid grid-cols-2 p-0.5 rounded-xl bg-surface-raised border border-border">
                  <button
                    type="button"
                    onClick={() => setBonusType('CASH_DISCOUNT')}
                    className={cn(
                      'h-8 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                      bonusType === 'CASH_DISCOUNT'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-fg-subtle hover:text-fg'
                    )}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Деньгами (скидка)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBonusType('FREE_DEVICES')}
                    className={cn(
                      'h-8 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer',
                      bonusType === 'FREE_DEVICES'
                        ? 'bg-warning text-black shadow-xs font-extrabold'
                        : 'text-fg-subtle hover:text-fg'
                    )}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Телефон ($0)</span>
                  </button>
                </div>
              </div>

              {/* ЕСЛИ ДЕНЕЖНЫЙ БОНУС */}
              {bonusType === 'CASH_DISCOUNT' ? (
                <div className="space-y-2.5 pt-0.5">
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[11px] font-semibold text-fg-subtle">Сумма бонуса ($ USD) *</label>
                      {amountUsd && Number(amountUsd) > 0 && (
                        <span className="text-[10px] font-mono font-semibold text-accent">
                          ≈ {formatMoney(Number(amountUsd) * rate)} TJS
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent font-bold text-xs">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        required
                        value={amountUsd}
                        onChange={(e) => {
                          const val = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                          setAmountUsd(val);
                        }}
                        placeholder="500.00"
                        className="w-full h-8.5 pl-6 pr-3 bg-surface-raised border border-border rounded-lg text-sm font-bold font-mono text-accent focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  {/* РЕШЕНИЕ: КУДА НАПРАВИТЬ БОНУС */}
                  <div className="p-2.5 rounded-xl bg-surface-raised/70 border border-border space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle block">
                      Куда направить бонус?
                    </span>
                    <div className="space-y-1">
                      <label
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors text-xs',
                          cashAction === 'CENTRAL_CASH'
                            ? 'border-accent bg-accent/15 text-accent font-semibold shadow-2xs'
                            : 'border-border/60 bg-surface hover:bg-surface-raised text-fg-muted'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="radio"
                            name="cashAction"
                            checked={cashAction === 'CENTRAL_CASH'}
                            onChange={() => setCashAction('CENTRAL_CASH')}
                            className="text-accent shrink-0"
                          />
                          <span className="flex items-center gap-1.5 truncate">
                            <Building2 className="w-3.5 h-3.5 shrink-0" />
                            <span>В центральную кассу</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-fg-subtle shrink-0">в оборот</span>
                      </label>

                      <label
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors text-xs',
                          cashAction === 'PAYOUT'
                            ? 'border-warning bg-warning/15 text-warning font-semibold shadow-2xs'
                            : 'border-border/60 bg-surface hover:bg-surface-raised text-fg-muted'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="radio"
                            name="cashAction"
                            checked={cashAction === 'PAYOUT'}
                            onChange={() => setCashAction('PAYOUT')}
                            className="text-warning shrink-0"
                          />
                          <span className="flex items-center gap-1.5 truncate">
                            <Users className="w-3.5 h-3.5 shrink-0" />
                            <span>Выдать как прибыль</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-fg-subtle shrink-0">партнерам</span>
                      </label>

                      <label
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-colors text-xs',
                          cashAction === 'RESERVE'
                            ? 'border-border bg-surface-raised text-fg font-semibold shadow-2xs'
                            : 'border-border/60 bg-surface hover:bg-surface-raised text-fg-muted'
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="radio"
                            name="cashAction"
                            checked={cashAction === 'RESERVE'}
                            onChange={() => setCashAction('RESERVE')}
                            className="shrink-0"
                          />
                          <span className="flex items-center gap-1.5 truncate">
                            <Wallet className="w-3.5 h-3.5 shrink-0" />
                            <span>В резерв счёта</span>
                          </span>
                        </div>
                        <span className="text-[10px] text-fg-subtle shrink-0">решить позже</span>
                      </label>
                    </div>

                    {cashAction === 'CENTRAL_CASH' && (
                      <input
                        type="text"
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                        placeholder="Примечание к кассовой операции (необязательно)..."
                        className="w-full h-7 px-2 bg-surface border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent mt-1"
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* ЕСЛИ ПОДАРОЧНЫЙ ТЕЛЕФОН */
                <div className="space-y-2 pt-0.5">
                  <div className="px-2 py-1 rounded-lg bg-warning/10 border border-warning/20 text-[11px] text-warning flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span>Себестоимость $0 · Выручка от продажи станет 100% прибылью</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Бренд *</label>
                      <input
                        type="text"
                        required
                        list="bonus-brand-list"
                        value={bonusBrand}
                        onChange={(e) => setBonusBrand(e.target.value)}
                        placeholder="Apple"
                        className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-brand-list">
                        {brandOptions.map((b) => (
                          <option key={b} value={b} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Модель *</label>
                      <input
                        type="text"
                        required
                        list="bonus-model-list"
                        value={bonusModel}
                        onChange={(e) => setBonusModel(e.target.value)}
                        placeholder="iPhone 15"
                        className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-model-list">
                        {getModelOptions(bonusBrand).map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">RAM *</label>
                      <input
                        type="text"
                        required
                        list="bonus-ram-list"
                        value={bonusRam}
                        onChange={(e) => setBonusRam(e.target.value)}
                        placeholder="8 GB"
                        className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-ram-list">
                        {ramOptions.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Память *</label>
                      <input
                        type="text"
                        required
                        list="bonus-storage-list"
                        value={bonusStorage}
                        onChange={(e) => setBonusStorage(e.target.value)}
                        placeholder="128 GB"
                        className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-storage-list">
                        {storageOptions.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Цвет</label>
                      <input
                        type="text"
                        list="bonus-color-list"
                        value={bonusColor}
                        onChange={(e) => setBonusColor(e.target.value)}
                        placeholder="Black"
                        className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-color-list">
                        {colorOptions.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">IMEI устройства *</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        required
                        value={bonusImei}
                        onChange={(e) => setBonusImei(e.target.value)}
                        placeholder="15-значный IMEI..."
                        className="flex-1 h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs font-mono text-fg focus:outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => openScanner((code) => setBonusImei(code.trim()))}
                        className="h-8 px-2.5 bg-surface-raised hover:bg-surface border border-border rounded-lg text-xs font-semibold text-fg flex items-center gap-1 cursor-pointer"
                        title="Сканировать IMEI"
                      >
                        <Scan className="w-3.5 h-3.5 text-accent" />
                        <span className="hidden xs:inline">Сканер</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Склад поступления *</label>
                    <select
                      value={destinationLocationId}
                      onChange={(e) => setDestinationLocationId(e.target.value)}
                      className="w-full h-8 px-2 bg-surface-raised border border-border rounded-lg text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
                    >
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.isMainWarehouse ? `Главный склад (${s.name})` : s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-border shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setIsCreateModalOpen(false)}
                className="h-8 px-3 text-xs"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                leftIcon={CheckCircle2}
                className="h-8 px-3 text-xs font-bold"
              >
                {bonusType === 'CASH_DISCOUNT' && cashAction === 'CENTRAL_CASH'
                  ? 'Внести в кассу'
                  : bonusType === 'CASH_DISCOUNT' && cashAction === 'PAYOUT'
                  ? 'Выдать прибыль'
                  : 'Зафиксировать'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ПЕРЕВОД В ЦЕНТРАЛЬНУЮ КАССУ ИЛИ ВЫДАЧА ИЗ РЕЗЕРВА */}
      {reserveModalKind && (
        <Dialog
          open={Boolean(reserveModalKind)}
          onClose={() => setReserveModalKind(null)}
          title={
            reserveModalKind === 'transfer'
              ? 'Перевод с Бонусного счёта в Центральную кассу'
              : 'Выдача с Бонусного счёта'
          }
        >
          <form onSubmit={handleExecuteReserveAction} className="space-y-2.5 pt-0.5">
            <div className="p-2.5 bg-surface-raised rounded-xl border border-border text-xs space-y-1">
              <div className="flex items-center justify-between text-fg-subtle">
                <span>Доступно в резерве:</span>
                <strong className="text-success font-mono font-bold">${formatMoney(availableReserveUsd)} USD</strong>
              </div>
              <p className="text-[11px] text-fg-subtle mt-0.5">
                {reserveModalKind === 'transfer'
                  ? 'Деньги перейдут в Центральную кассу компании и будут доступны для закупок.'
                  : 'Сумма будет списана с Бонусного счёта.'}
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-fg mb-0.5">Сумма ($ USD) *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={reserveAmountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
                  setReserveAmountInput(val);
                }}
                placeholder="0.00"
                className="w-full h-8.5 px-3 bg-surface-raised border border-border rounded-lg text-sm font-bold font-mono text-fg focus:outline-none focus:border-accent"
              />
            </div>

            {reserveModalKind === 'transfer' && (
              <div>
                <label className="block text-[11px] font-semibold text-fg mb-0.5">
                  Примечание (необязательно)
                </label>
                <input
                  type="text"
                  value={reserveCommentInput}
                  onChange={(e) => setReserveCommentInput(e.target.value)}
                  placeholder="Пополнение центральной кассы..."
                  className="w-full h-8 px-2.5 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmittingReserveAction}
                onClick={() => setReserveModalKind(null)}
                className="h-8 px-3 text-xs"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmittingReserveAction}
                leftIcon={CheckCircle2}
                className="h-8 px-3 text-xs font-bold"
              >
                {reserveModalKind === 'transfer' ? 'Перевести в кассу' : 'Выдать'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* MODAL: Редактирование бонуса */}
      {editingBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
          <form
            onSubmit={handleSaveEditBonus}
            className="w-full max-w-md rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-2.5 my-auto max-h-[92vh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-border pb-2.5 shrink-0">
              <h4 className="text-sm font-bold text-fg flex items-center gap-2">
                <Edit className="w-4 h-4 text-accent" />
                <span>Редактировать бонус</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingBonus(null)}
                className="w-7 h-7 rounded-lg hover:bg-surface-raised text-fg-subtle hover:text-fg flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2.5 overflow-y-auto pr-0.5 flex-1 scrollbar-thin">
              <div>
                <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Название кампании</label>
                <input
                  type="text"
                  value={editCampaignTitle}
                  onChange={(e) => setEditCampaignTitle(e.target.value)}
                  className="w-full h-8 px-2.5 bg-surface-raised border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              {editingBonus.bonusType === 'CASH_DISCOUNT' ? (
                <div>
                  <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">Сумма бонуса ($ USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmountUsd}
                    onChange={(e) => setEditAmountUsd(e.target.value)}
                    className="w-full h-8.5 px-3 bg-surface-raised border border-border rounded-lg text-sm font-bold text-accent font-mono focus:border-accent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-surface-raised border border-border space-y-2">
                  <span className="text-[11px] font-semibold text-fg">Данные подарочного устройства:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editBrand}
                      onChange={(e) => setEditBrand(e.target.value)}
                      placeholder="Apple"
                      className="h-8 rounded-lg bg-surface border border-border px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="iPhone 16"
                      className="h-8 rounded-lg bg-surface border border-border px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editStorage}
                      onChange={(e) => setEditStorage(e.target.value)}
                      placeholder="128 GB"
                      className="h-8 rounded-lg bg-surface border border-border px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      placeholder="Black"
                      className="h-8 rounded-lg bg-surface border border-border px-2.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-fg-subtle text-[10px] uppercase font-bold mb-0.5">IMEI</label>
                    <input
                      type="text"
                      required
                      value={editImei}
                      onChange={(e) => setEditImei(e.target.value)}
                      className="w-full h-8 rounded-lg bg-surface border border-border px-2.5 text-xs text-fg font-mono focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-border shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setEditingBonus(null)}
                className="h-8 px-3 text-xs"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={isSubmitting}
                className="h-8 px-3 text-xs font-bold"
              >
                Сохранить
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Удаление бонуса */}
      {deletingBonus && (
        <ConfirmDialog
          open={Boolean(deletingBonus)}
          onCancel={() => setDeletingBonus(null)}
          onConfirm={handleConfirmDeleteBonus}
          title="Удаление бонуса"
          message={`Вы действительно хотите удалить бонус от «${deletingBonus.supplierName}»?`}
          confirmLabel="Удалить"
          loading={isSubmitting}
        />
      )}
    </div>
  );
};
