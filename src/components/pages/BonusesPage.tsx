import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppFields } from '../../context/AppContext';
import { SupplierBonus } from '../../types';
import { FALLBACK_EXCHANGE_RATE } from '../../utils/exchangeRate';
import { apiClient } from '../../api/client';
import { formatMoney, formatTjs, formatUsd } from '../../utils/money';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../utils/cn';
import {
  Gift,
  Plus,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Building2,
  Users,
  History,
  TrendingUp,
  Wallet,
  Banknote,
  ChevronRight,
  X,
  Scan,
  Edit,
  Trash2,
  Loader2,
  Landmark,
  HandCoins,
  Package,
  ArrowUpRight,
  Clock,
  Sparkles,
} from 'lucide-react';

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
    currentUser,
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

  const rate = todayRate?.rate || FALLBACK_EXCHANGE_RATE;
  const isAdmin = currentUser?.role === 'ADMIN';

  // Active view tab
  const [activeTab, setActiveTab] = useState<MainTab>('HISTORY');
  const [deviceFilter, setDeviceFilter] = useState<'ALL' | 'IN_STOCK' | 'SOLD'>('ALL');

  // Async server data: bonus account, operations, devices, summary
  const [balance, setBalance] = useState<BonusAccountBalance | null>(null);
  const [operations, setOperations] = useState<BonusOperation[]>([]);
  const [bonusDevices, setBonusDevices] = useState<BonusDeviceItem[]>([]);
  const [monthStats, setMonthStats] = useState<MonthBonusStats | null>(null);
  const [loadingData, setLoadingData] = useState(false);
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
  const [selectedBonus, setSelectedBonus] = useState<SupplierBonus | null>(null);
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
      const [balancesRes, opsRes, devicesRes, statsRes] = await Promise.allSettled([
        apiClient<{ bonusAccount: BonusAccountBalance }>('/cash-collections/balances'),
        apiClient<BonusOperation[]>('/bonus-account/operations'),
        apiClient<BonusDeviceItem[]>('/bonuses/devices'),
        apiClient<MonthBonusStats>('/bonuses/quarter'),
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
  }, []);

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

  const totalBonusDevicesSoldRevenueUsd = useMemo(() => {
    return bonusDevices.filter((d) => d.isSold).reduce((acc, d) => acc + (d.soldPriceUsd || 0), 0);
  }, [bonusDevices]);

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

      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
            <Gift className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-fg leading-tight flex items-center gap-2">
              <span>Бонусы поставщиков</span>
              {isAdmin && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  1 USD = {rate.toFixed(2)} TJS
                </span>
              )}
            </h1>
            <p className="text-xs text-fg-subtle">
              Учёт подарочных телефонов ($0 себестоимость) и денежных бонусов с распределением
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={Plus}
            onClick={() => setIsCreateModalOpen(true)}
            className="cursor-pointer"
          >
            Зафиксировать бонус
          </Button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
        {/* 3 PRIMARY METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* CARD 1: Денежные бонусы */}
          <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                  Денежные бонусы (за месяц)
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-accent mt-1">
                  ${formatMoney(monthStats?.cashBonusesUsd || 0)} <span className="text-xs font-semibold">USD</span>
                </div>
                <span className="text-xs font-semibold text-fg-subtle font-mono mt-0.5 block">
                  ≈ {formatMoney(monthStats?.cashBonusesTjs || 0)} TJS
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent shrink-0">
                <Banknote className="w-5 h-5" />
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-border flex items-center justify-between text-[11px] text-fg-subtle">
              <span>Кампаний: <strong className="text-fg font-semibold">{monthStats?.cashBonusesCount || 0}</strong></span>
              <span className="text-accent font-medium">От поставщиков</span>
            </div>
          </div>

          {/* CARD 2: Подарочные телефоны */}
          <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                  Подарочные телефоны ($0)
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-warning mt-1">
                  {totalBonusDevicesInStock} <span className="text-sm font-semibold">на складе</span>
                </div>
                <span className="text-xs font-semibold text-success font-mono mt-0.5 block">
                  Продано: {totalBonusDevicesSold} шт. (+${formatMoney(totalBonusDevicesSoldRevenueUsd)})
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/25 flex items-center justify-center text-warning shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-border flex items-center justify-between text-[11px]">
              <span className="text-fg-subtle">Себестоимость: $0</span>
              <button
                type="button"
                onClick={() => { setActiveTab('DEVICES'); setDeviceFilter('IN_STOCK'); }}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer"
              >
                Посмотреть устройства →
              </button>
            </div>
          </div>

          {/* CARD 3: Бонусный резерв */}
          <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-accent/40 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                  Бонусный резерв
                </span>
                <div className="text-xl sm:text-2xl font-black font-mono text-success mt-1">
                  ${formatMoney(availableReserveUsd)} <span className="text-xs font-semibold">USD</span>
                </div>
                <span className="text-xs font-semibold text-fg-subtle font-mono mt-0.5 block">
                  ≈ {formatMoney(availableReserveTjs)} TJS (не распределено)
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-success/15 border border-success/25 flex items-center justify-center text-success shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-border flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={availableReserveUsd <= 0}
                onClick={() => openReserveAction('transfer')}
                className="text-xs font-bold text-accent hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40"
                title="Перевести в Центральную кассу"
              >
                <Landmark className="w-3.5 h-3.5" /> В кассу
              </button>
              <button
                type="button"
                disabled={availableReserveUsd <= 0}
                onClick={() => openReserveAction('payout')}
                className="text-xs font-bold text-warning hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-40"
                title="Выдать как прибыль / дивиденды"
              >
                <HandCoins className="w-3.5 h-3.5" /> Выдать
              </button>
            </div>
          </div>
        </div>

        {/* NAVIGATION TAB PILL BAR */}
        <div className="flex items-center justify-between gap-3 border-b border-border pb-2 pt-1 flex-wrap">
          <FilterPillGroup
            options={[
              { value: 'HISTORY', label: 'Журнал бонусов и решений' },
              { value: 'DEVICES', label: `Подарочные телефоны (${bonusDevices.length})` },
            ]}
            value={activeTab}
            onChange={(val) => setActiveTab(val as MainTab)}
          />

          {activeTab === 'DEVICES' && (
            <div className="flex items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setDeviceFilter('ALL')}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer',
                  deviceFilter === 'ALL' ? 'bg-accent text-accent-fg' : 'bg-surface border border-border text-fg-subtle hover:text-fg'
                )}
              >
                Все ({bonusDevices.length})
              </button>
              <button
                type="button"
                onClick={() => setDeviceFilter('IN_STOCK')}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer',
                  deviceFilter === 'IN_STOCK' ? 'bg-warning/20 text-warning border border-warning/30 font-bold' : 'bg-surface border border-border text-fg-subtle hover:text-fg'
                )}
              >
                На складе ({totalBonusDevicesInStock})
              </button>
              <button
                type="button"
                onClick={() => setDeviceFilter('SOLD')}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer',
                  deviceFilter === 'SOLD' ? 'bg-success/20 text-success border border-success/30 font-bold' : 'bg-surface border border-border text-fg-subtle hover:text-fg'
                )}
              >
                Проданы ({totalBonusDevicesSold})
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: ЖУРНАЛ БОНУСОВ И РЕШЕНИЙ */}
        {activeTab === 'HISTORY' ? (
          <div className="space-y-3">
            {supplierBonuses.length === 0 ? (
              <EmptyState
                icon={Gift}
                title="Бонусов пока нет"
                description="Зафиксируйте первый денежный бонус или подарочное устройство от поставщика"
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
              <div className="space-y-2">
                {[...supplierBonuses]
                  .sort((a, b) => new Date(b.dateReceived || b.date || 0).getTime() - new Date(a.dateReceived || a.date || 0).getTime())
                  .map((bonus) => {
                    const isCash = bonus.bonusType === 'CASH_DISCOUNT';
                    const hasFreeDevices = Boolean(bonus.freeDevices && bonus.freeDevices.length > 0);
                    const bonusDate = formatBonusDate(bonus.date || bonus.dateReceived);

                    return (
                      <div
                        key={bonus.id}
                        className="p-3 sm:p-4 rounded-2xl bg-surface border border-border hover:border-accent/40 transition-colors shadow-2xs space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-fg truncate">
                                {bonus.campaignTitle || bonus.campaignName || `Бонус от ${bonus.supplierName}`}
                              </span>
                              <span
                                className={cn(
                                  'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider',
                                  isCash
                                    ? 'bg-accent/15 text-accent border border-accent/25'
                                    : 'bg-warning/15 text-warning border border-warning/30'
                                )}
                              >
                                {isCash ? 'Денежный бонус' : 'Подарочный телефон ($0)'}
                              </span>
                            </div>

                            <p className="text-xs text-fg-subtle">
                              Поставщик: <strong className="text-fg font-semibold">{bonus.supplierName}</strong>
                              {bonusDate && <span> • Дата: {bonusDate}</span>}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            {isCash ? (
                              <div>
                                <span className="text-base sm:text-lg font-black font-mono text-accent block">
                                  +${formatMoney(bonus.amountUsd || 0)} USD
                                </span>
                                <span className="text-[11px] text-fg-subtle font-mono block">
                                  ≈ {formatMoney((bonus.amountUsd || 0) * (bonus.exchangeRate || rate))} TJS
                                </span>
                              </div>
                            ) : (
                              <div>
                                <span className="text-sm font-bold font-mono text-warning block">
                                  +{bonus.freeDevices?.length || 1} шт. бесплатно
                                </span>
                                <span className="text-[10px] text-success font-semibold block">
                                  Себестоимость $0
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Details for Free Devices */}
                        {hasFreeDevices && (
                          <div className="p-2.5 rounded-xl bg-surface-raised border border-border text-xs space-y-1">
                            <div className="flex items-center gap-1.5 text-warning font-semibold">
                              <Smartphone className="w-3.5 h-3.5" />
                              <span>Подарочные телефоны на складе:</span>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {bonus.freeDevices!.map((fd) => (
                                <span
                                  key={fd.imei}
                                  className="px-2 py-1 rounded-lg bg-surface border border-border font-mono text-[11px] text-fg"
                                >
                                  {fd.brand} {fd.model} {fd.storage} • IMEI: <strong>{fd.imei}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="pt-2 border-t border-border flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            {isCash && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-fg-subtle">Действие:</span>
                                <button
                                  type="button"
                                  onClick={() => openReserveAction('transfer', bonus.amountUsd)}
                                  className="text-[11px] font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Перевести сумму в Центральную кассу"
                                >
                                  <Landmark className="w-3 h-3 text-accent" /> В кассу
                                </button>
                                <span className="text-border">•</span>
                                <button
                                  type="button"
                                  onClick={() => openReserveAction('payout', bonus.amountUsd)}
                                  className="text-[11px] font-semibold text-warning hover:underline flex items-center gap-1 cursor-pointer"
                                  title="Выдать как прибыль / дивиденды"
                                >
                                  <HandCoins className="w-3 h-3 text-warning" /> Выдать
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditBonus(bonus)}
                              className="text-fg-subtle hover:text-accent p-1 cursor-pointer transition-colors"
                              title="Редактировать бонус"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingBonus(bonus)}
                              className="text-fg-subtle hover:text-danger p-1 cursor-pointer transition-colors"
                              title="Удалить бонус"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
          <div className="space-y-3">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredBonusDevices.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-2xl bg-surface border border-border shadow-xs space-y-2 hover:border-accent/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-fg">
                          {d.brand} {d.model}
                        </h3>
                        <p className="text-xs text-fg-subtle">
                          {d.storage} • {d.color} {d.ram && `• RAM ${d.ram}`}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider',
                          d.isSold
                            ? 'bg-success/15 text-success border border-success/30'
                            : 'bg-warning/15 text-warning border border-warning/30'
                        )}
                      >
                        {d.isSold ? 'Продан' : 'На складе'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-surface-raised border border-border text-xs space-y-1">
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>IMEI:</span>
                        <strong className="text-fg font-mono font-bold">{d.imei}</strong>
                      </div>
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>Поставщик:</span>
                        <strong className="text-fg">{d.supplierName}</strong>
                      </div>
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>Себестоимость:</span>
                        <strong className="text-success font-mono font-bold">$0 (подарок)</strong>
                      </div>
                      <div className="flex items-center justify-between text-fg-subtle">
                        <span>Локация:</span>
                        <strong className="text-fg">{d.storeName}</strong>
                      </div>
                    </div>

                    {d.isSold ? (
                      <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                        <span className="text-fg-subtle">
                          Чек: <strong className="text-fg font-mono font-bold">#{d.saleReceiptNumber}</strong>
                          {d.saleDate && ` (${new Date(d.saleDate).toLocaleDateString('ru-RU')})`}
                        </span>
                        <span className="text-success font-bold font-mono">
                          +{formatMoney(d.soldPriceUsd || 0)} USD в кассу
                        </span>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-warning">
                        <span>Готов к продаже</span>
                        <span className="text-fg-subtle font-mono">
                          Поступил: {new Date(d.createdAt).toLocaleDateString('ru-RU')}
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

      {/* MODAL: ЗАФИКСИРОВАТЬ БОНУС С РЕШЕНИЕМ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs overflow-y-auto">
          <form
            onSubmit={handleCreateBonus}
            className="w-full max-w-lg rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-accent" />
                <h3 className="text-base font-bold text-fg">Зафиксировать бонус от поставщика</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-fg-subtle hover:text-fg p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Поставщик */}
              <div>
                <label className="block text-fg font-semibold mb-1">Поставщик *</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Название кампании */}
              <div>
                <label className="block text-fg font-semibold mb-1">Название / Повод (опционально)</label>
                <input
                  type="text"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="Бонус за объем продаж, сезонная акция..."
                  className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>

              {/* Тип бонуса: Переключатель */}
              <div>
                <label className="block text-fg font-semibold mb-1.5">В каком виде получен бонус? *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBonusType('CASH_DISCOUNT')}
                    className={cn(
                      'p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer',
                      bonusType === 'CASH_DISCOUNT'
                        ? 'border-accent bg-accent/15 text-accent shadow-xs'
                        : 'border-border bg-surface-raised text-fg-subtle hover:text-fg hover:border-accent/40'
                    )}
                  >
                    <Banknote className="w-5 h-5" />
                    <span>💵 Деньгами (Скидка)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBonusType('FREE_DEVICES')}
                    className={cn(
                      'p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer',
                      bonusType === 'FREE_DEVICES'
                        ? 'border-warning bg-warning/15 text-warning shadow-xs'
                        : 'border-border bg-surface-raised text-fg-subtle hover:text-fg hover:border-warning/40'
                    )}
                  >
                    <Smartphone className="w-5 h-5" />
                    <span>📱 Подарочный телефон ($0)</span>
                  </button>
                </div>
              </div>

              {/* ЕСЛИ ДЕНЕЖНЫЙ БОНУС */}
              {bonusType === 'CASH_DISCOUNT' ? (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-fg font-semibold mb-1">Сумма бонуса ($ USD) *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-accent font-bold">$</span>
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
                        className="w-full h-10 pl-8 pr-3 bg-surface-raised border border-border rounded-xl text-base font-bold font-mono text-accent focus:outline-none focus:border-accent"
                      />
                    </div>
                    {amountUsd && Number(amountUsd) > 0 && (
                      <span className="text-[11px] text-fg-subtle font-mono mt-1 block">
                        ≈ {formatMoney(Number(amountUsd) * rate)} TJS по текущему курсу {rate}
                      </span>
                    )}
                  </div>

                  {/* РЕШЕНИЕ АДМИНИСТРАТОРА */}
                  <div className="p-3.5 rounded-2xl bg-surface-raised border border-border space-y-2.5">
                    <label className="block text-xs font-bold text-fg flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-accent" />
                      <span>Что сделать с бонусом прямо сейчас?</span>
                    </label>

                    <div className="space-y-2">
                      <label
                        className={cn(
                          'p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all',
                          cashAction === 'CENTRAL_CASH'
                            ? 'border-accent bg-accent/10 text-fg'
                            : 'border-border/80 bg-surface hover:border-accent/40 text-fg-muted'
                        )}
                      >
                        <input
                          type="radio"
                          name="cashAction"
                          checked={cashAction === 'CENTRAL_CASH'}
                          onChange={() => setCashAction('CENTRAL_CASH')}
                          className="mt-0.5 text-accent"
                        />
                        <div className="text-xs">
                          <span className="font-bold block text-accent flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5" /> Внести в центральную кассу (в бизнес)
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            Деньги сразу поступят в Центральную кассу компании и будут в обороте для закупок
                          </span>
                        </div>
                      </label>

                      <label
                        className={cn(
                          'p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all',
                          cashAction === 'PAYOUT'
                            ? 'border-warning bg-warning/10 text-fg'
                            : 'border-border/80 bg-surface hover:border-warning/40 text-fg-muted'
                        )}
                      >
                        <input
                          type="radio"
                          name="cashAction"
                          checked={cashAction === 'PAYOUT'}
                          onChange={() => setCashAction('PAYOUT')}
                          className="mt-0.5 text-warning"
                        />
                        <div className="text-xs">
                          <span className="font-bold block text-warning flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" /> Выдать как прибыль (поделить)
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            Сразу зафиксировать выплату прибыли/дивидендов на руки (не раздувает кассу)
                          </span>
                        </div>
                      </label>

                      <label
                        className={cn(
                          'p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all',
                          cashAction === 'RESERVE'
                            ? 'border-border bg-surface-raised text-fg font-semibold'
                            : 'border-border/80 bg-surface hover:border-border text-fg-muted'
                        )}
                      >
                        <input
                          type="radio"
                          name="cashAction"
                          checked={cashAction === 'RESERVE'}
                          onChange={() => setCashAction('RESERVE')}
                          className="mt-0.5"
                        />
                        <div className="text-xs">
                          <span className="font-bold block text-fg">
                            ⏳ Оставить в резерве на бонусном счёте
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            Решение перевести в кассу или выдать можно принять позже
                          </span>
                        </div>
                      </label>
                    </div>

                    {cashAction === 'CENTRAL_CASH' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-fg-subtle mb-1">
                          Примечание к операции (необязательно)
                        </label>
                        <input
                          type="text"
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          placeholder="Основание для перевода в кассу..."
                          className="w-full h-8 px-2.5 bg-surface border border-border rounded-lg text-xs text-fg focus:outline-none focus:border-accent"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* ЕСЛИ ПОДАРОЧНЫЙ ТЕЛЕФОН */
                <div className="space-y-3 pt-1">
                  <div className="p-3 bg-warning/10 border border-warning/25 rounded-xl text-xs text-warning">
                    Подарочный телефон приходуется на склад с <strong>себестоимостью $0</strong>. При продаже вся вырученная сумма сразу поступает в кассу точки как 100% прибыль.
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-fg font-semibold mb-1">Бренд *</label>
                      <input
                        type="text"
                        required
                        list="bonus-brand-list"
                        value={bonusBrand}
                        onChange={(e) => setBonusBrand(e.target.value)}
                        placeholder="Apple"
                        className="w-full h-9 px-2.5 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-brand-list">
                        {brandOptions.map((b) => (
                          <option key={b} value={b} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-fg font-semibold mb-1">Модель *</label>
                      <input
                        type="text"
                        required
                        list="bonus-model-list"
                        value={bonusModel}
                        onChange={(e) => setBonusModel(e.target.value)}
                        placeholder="iPhone 15"
                        className="w-full h-9 px-2.5 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-model-list">
                        {getModelOptions(bonusBrand).map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-fg font-semibold mb-1">RAM (ОЗУ) *</label>
                      <input
                        type="text"
                        required
                        list="bonus-ram-list"
                        value={bonusRam}
                        onChange={(e) => setBonusRam(e.target.value)}
                        placeholder="8 GB"
                        className="w-full h-9 px-2.5 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-ram-list">
                        {ramOptions.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-fg font-semibold mb-1">Память (ROM) *</label>
                      <input
                        type="text"
                        required
                        list="bonus-storage-list"
                        value={bonusStorage}
                        onChange={(e) => setBonusStorage(e.target.value)}
                        placeholder="128 GB"
                        className="w-full h-9 px-2.5 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-storage-list">
                        {storageOptions.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-fg font-semibold mb-1">Цвет</label>
                      <input
                        type="text"
                        list="bonus-color-list"
                        value={bonusColor}
                        onChange={(e) => setBonusColor(e.target.value)}
                        placeholder="Black"
                        className="w-full h-9 px-2.5 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                      />
                      <datalist id="bonus-color-list">
                        {colorOptions.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block text-fg font-semibold mb-1">IMEI устройства *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={bonusImei}
                        onChange={(e) => setBonusImei(e.target.value)}
                        placeholder="15-значный IMEI..."
                        className="flex-1 h-9 px-2.5 bg-surface-raised border border-border rounded-xl text-xs font-mono text-fg focus:outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => openScanner((code) => setBonusImei(code.trim()))}
                        className="h-9 px-3 bg-surface-raised hover:bg-surface border border-border rounded-xl text-xs font-semibold text-fg flex items-center gap-1 cursor-pointer"
                        title="Сканировать IMEI"
                      >
                        <Scan className="w-3.5 h-3.5" />
                        <span>Сканер</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-fg font-semibold mb-1">Склад поступления *</label>
                    <select
                      value={destinationLocationId}
                      onChange={(e) => setDestinationLocationId(e.target.value)}
                      className="w-full h-9 px-3 bg-surface-raised border border-border rounded-xl text-xs font-semibold text-fg focus:outline-none focus:border-accent cursor-pointer"
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

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => setIsCreateModalOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
                leftIcon={CheckCircle2}
              >
                {bonusType === 'CASH_DISCOUNT' && cashAction === 'CENTRAL_CASH'
                  ? 'Зафиксировать и внести в кассу'
                  : bonusType === 'CASH_DISCOUNT' && cashAction === 'PAYOUT'
                  ? 'Зафиксировать и выдать'
                  : 'Зафиксировать бонус'}
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
          <form onSubmit={handleExecuteReserveAction} className="space-y-4 pt-1">
            <div className="p-3 bg-surface-raised rounded-xl border border-border text-xs space-y-1">
              <div className="flex items-center justify-between text-fg-subtle">
                <span>Доступно в резерве:</span>
                <strong className="text-success font-mono font-bold">${formatMoney(availableReserveUsd)} USD</strong>
              </div>
              <p className="text-[11px] text-fg-subtle mt-1">
                {reserveModalKind === 'transfer'
                  ? 'Деньги перейдут в Центральную кассу компании и будут доступны для закупок.'
                  : 'Сумма будет списана с Бонусного счёта.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-fg mb-1">Сумма ($ USD) *</label>
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
                className="w-full h-10 px-3 bg-surface-raised border border-border rounded-xl text-base font-bold font-mono text-fg focus:outline-none focus:border-accent"
              />
            </div>

            {reserveModalKind === 'transfer' && (
              <div>
                <label className="block text-xs font-semibold text-fg mb-1">
                  Примечание / Комментарий (необязательно)
                </label>
                <input
                  type="text"
                  value={reserveCommentInput}
                  onChange={(e) => setReserveCommentInput(e.target.value)}
                  placeholder="Пополнение центральной кассы..."
                  className="w-full h-9 px-3 bg-surface-raised border border-border rounded-xl text-xs text-fg focus:outline-none focus:border-accent"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmittingReserveAction}
                onClick={() => setReserveModalKind(null)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmittingReserveAction}
                leftIcon={CheckCircle2}
              >
                {reserveModalKind === 'transfer' ? 'Перевести в кассу' : 'Выдать'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* MODAL: Редактирование бонуса */}
      {editingBonus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSaveEditBonus}
            className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-sm font-bold text-fg flex items-center gap-2">
                <Edit className="w-4 h-4 text-accent" />
                <span>Редактировать бонус</span>
              </h4>
              <button
                type="button"
                onClick={() => setEditingBonus(null)}
                className="text-fg-subtle hover:text-fg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-fg-subtle mb-1">Название кампании</label>
                <input
                  type="text"
                  value={editCampaignTitle}
                  onChange={(e) => setEditCampaignTitle(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg focus:border-accent focus:outline-none"
                />
              </div>

              {editingBonus.bonusType === 'CASH_DISCOUNT' ? (
                <div>
                  <label className="block text-fg font-semibold mb-1">Сумма бонуса ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmountUsd}
                    onChange={(e) => setEditAmountUsd(e.target.value)}
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs font-bold text-accent font-mono focus:border-accent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-surface-raised border border-border space-y-2">
                  <span className="text-[11px] font-semibold text-fg">Данные подарочного устройства:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editBrand}
                      onChange={(e) => setEditBrand(e.target.value)}
                      placeholder="Apple"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="iPhone 16"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editStorage}
                      onChange={(e) => setEditStorage(e.target.value)}
                      placeholder="128 GB"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      placeholder="Black"
                      className="rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-fg-subtle text-[10px] uppercase font-bold mb-0.5">IMEI</label>
                    <input
                      type="text"
                      required
                      value={editImei}
                      onChange={(e) => setEditImei(e.target.value)}
                      className="w-full rounded-lg bg-surface border border-border px-2 py-1.5 text-xs text-fg font-mono focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => setEditingBonus(null)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
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
