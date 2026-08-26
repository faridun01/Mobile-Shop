import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Device, DeviceStatus } from '../../types';
import {
  Smartphone,
  ChevronRight,
  ChevronDown,
  Store,
  History,
  DollarSign,
  Download,
  Layers,
  List
} from 'lucide-react';
import { exportInventoryReport } from '../../utils/exportReports';
import { useGroupedDevices } from '../../hooks/useGroupedDevices';
import { SearchBar } from '../ui/SearchBar';
import { FilterPillGroup } from '../ui/FilterPillGroup';
import { Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge, BadgeTone } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/Skeleton';
import { Dialog } from '../ui/Dialog';

const STATUS_LABELS: Record<DeviceStatus, string> = {
  MAIN_WAREHOUSE: 'Главный склад',
  STORE_STOCK: 'В магазине',
  SOLD: 'Продан',
  IN_STOCK_AFTER_EXCHANGE: 'После обмена',
  IN_REPAIR: 'В ремонте',
  TRANSFER_PENDING: 'В транзите',
};

const STATUS_TONE: Record<DeviceStatus, BadgeTone> = {
  MAIN_WAREHOUSE: 'neutral',
  STORE_STOCK: 'success',
  SOLD: 'neutral',
  IN_STOCK_AFTER_EXCHANGE: 'info',
  IN_REPAIR: 'warning',
  TRANSFER_PENDING: 'warning',
};

interface DeviceRowProps {
  device: Device;
  isAdminOrPartner: boolean;
  onClick: () => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({ device, isAdminOrPartner, onClick }) => (
  <button onClick={onClick} className="w-full text-left px-4 py-3 active:bg-surface-raised flex items-center justify-between gap-3 transition-colors">
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-fg truncate">{device.brand} {device.model}</p>
        <Badge tone="neutral">{device.storage}</Badge>
        <Badge tone="neutral">{device.color}</Badge>
      </div>
      <p className="text-xs text-fg-subtle mt-0.5 truncate">
        IMEI: {device.imei}{device.imei2 ? ` / ${device.imei2}` : ''}
        {device.barcode && ` · EAN: ${device.barcode}`}
      </p>
    </div>

    <div className="text-right shrink-0 flex items-center gap-2">
      {(device.purchaseCostUsd === 0 || device.isBonus) ? (
        <Badge tone="accent">Подарок</Badge>
      ) : isAdminOrPartner && device.purchaseCostUsd > 0 ? (
        <span className="text-xs font-semibold text-fg-muted">${device.purchaseCostUsd}</span>
      ) : null}
      <Badge tone={STATUS_TONE[device.status]}>{STATUS_LABELS[device.status] || device.status}</Badge>
      <ChevronRight className="w-4 h-4 text-fg-subtle" />
    </div>
  </button>
);

export const InventoryPage: React.FC = () => {
  const { currentUser, devices, stores, selectedStoreId, setSelectedStoreId, openScanner, isInitialLoading } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('IN_STOCK');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [groupByModel, setGroupByModel] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const isSeller = currentUser?.role === 'SELLER';
  const effectiveStoreId = isSeller ? (currentUser?.storeId || 'store-1') : (selectedStoreId || 'all');
  const isAdminOrPartner = currentUser?.role === 'ADMIN' || currentUser?.role === 'PARTNER';

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (effectiveStoreId !== 'all' && d.locationId !== effectiveStoreId) return false;

      if (selectedStatus === 'IN_STOCK') {
        if (d.status !== 'STORE_STOCK' && d.status !== 'MAIN_WAREHOUSE' && d.status !== 'IN_STOCK_AFTER_EXCHANGE') return false;
      } else if (selectedStatus === 'GIFTS') {
        if ((d.purchaseCostUsd !== 0 && !d.isBonus) || d.status === 'SOLD') return false;
      } else if (selectedStatus === 'ALL') {
        if (d.status === 'SOLD') return false;
      } else if (d.status !== selectedStatus) {
        return false;
      }

      if (selectedBrand !== 'ALL' && d.brand !== selectedBrand) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          d.imei.toLowerCase().includes(q) ||
          d.imei2?.toLowerCase().includes(q) ||
          d.serialNumber?.toLowerCase().includes(q) ||
          d.barcode?.toLowerCase().includes(q) ||
          d.brand.toLowerCase().includes(q) ||
          d.model.toLowerCase().includes(q) ||
          d.color.toLowerCase().includes(q) ||
          d.storage.toLowerCase().includes(q) ||
          d.supplierName?.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [devices, effectiveStoreId, selectedStatus, selectedBrand, searchQuery]);

  const groups = useGroupedDevices(filteredDevices);

  const brands = useMemo(() => {
    const set = new Set<string>();
    devices.forEach((d) => set.add(d.brand));
    return [{ value: 'ALL', label: 'Все бренды' }, ...Array.from(set).map(b => ({ value: b, label: b }))];
  }, [devices]);

  const handleScanDevice = () => {
    openScanner((scannedCode) => {
      const code = scannedCode.trim();
      const match = devices.find(d =>
        (d.imei === code || d.imei2 === code || d.barcode === code || d.serialNumber === code) &&
        (!isSeller || d.locationId === currentUser?.storeId)
      );
      if (match) setSelectedDevice(match);
      else setSearchQuery(code);
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <div className="p-3 border-b border-border bg-bg space-y-2.5 shrink-0">
        <SearchBar value={searchQuery} onChange={setSearchQuery} onScan={handleScanDevice} placeholder="Поиск по IMEI / штрихкоду / модели..." />

        <div className="flex flex-wrap items-center gap-2">
          {!isSeller ? (
            <Select value={effectiveStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="h-9 py-0 w-auto">
              <option value="all">Все склады</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          ) : (
            <span className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-xs font-medium text-fg-muted">
              <Store className="w-3.5 h-3.5 text-accent" />
              {currentUser?.storeName || 'Мой магазин'}
            </span>
          )}

          <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="h-9 py-0 w-auto">
            <option value="IN_STOCK">В наличии</option>
            <option value="GIFTS">Подарочные ($0)</option>
            <option value="ALL">Все статусы</option>
            <option value="SOLD">Проданные</option>
            <option value="IN_REPAIR">В ремонте</option>
            <option value="TRANSFER_PENDING">В транзите</option>
          </Select>

          <button
            type="button"
            onClick={() => setGroupByModel(v => !v)}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              groupByModel ? 'border-accent bg-accent/10 text-accent' : 'border-border text-fg-muted'
            }`}
          >
            {groupByModel ? <Layers className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
            Группировать
          </button>

          <span className="text-xs text-fg-subtle ml-auto">
            Найдено: <strong className="text-accent">{filteredDevices.length}</strong>
          </span>


        </div>

        <FilterPillGroup options={brands} value={selectedBrand} onChange={setSelectedBrand} scrollable />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isInitialLoading ? (
          <LoadingState label="Загрузка склада…" />
        ) : filteredDevices.length === 0 ? (
          <EmptyState icon={Smartphone} title="Устройства не найдены" description="Попробуйте изменить параметры поиска или фильтров" />
        ) : !groupByModel ? (
          <div className="divide-y divide-border">
            {filteredDevices.map((dev) => (
              <DeviceRow key={dev.id} device={dev} isAdminOrPartner={isAdminOrPartner} onClick={() => setSelectedDevice(dev)} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groups.map((group) => {
              const isExpanded = expandedGroups[group.key];
              const allDevices = group.storageGroups.flatMap(sg => sg.colorGroups.flatMap(cg => cg.devices));
              return (
                <div key={group.key}>
                  <button
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 active:bg-surface-raised transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone className="w-4 h-4 text-accent shrink-0" />
                      <div className="min-w-0 text-left">
                        <p className="text-sm font-semibold text-fg truncate">{group.brand} {group.model}</p>
                        <p className="text-xs text-fg-subtle truncate">{group.storageGroups.map(s => s.storage).join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone="accent">{group.count} шт.</Badge>
                      <ChevronDown className={`w-4 h-4 text-fg-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="bg-surface/60 border-t border-border divide-y divide-border">
                      {allDevices.map((dev) => (
                        <DeviceRow key={dev.id} device={dev} isAdminOrPartner={isAdminOrPartner} onClick={() => setSelectedDevice(dev)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog
        open={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        title={selectedDevice ? `${selectedDevice.brand} ${selectedDevice.model}` : ''}
        subtitle="Карточка устройства"
        maxWidth="lg"
        footer={<Button variant="secondary" fullWidth onClick={() => setSelectedDevice(null)}>Закрыть</Button>}
      >
        {selectedDevice && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3 text-sm bg-surface p-3 rounded-lg border border-border">
              <div>
                <span className="text-fg-subtle block text-xs uppercase">Память / цвет</span>
                <span className="font-semibold text-fg">{selectedDevice.storage} · {selectedDevice.color}</span>
              </div>
              <div>
                <span className="text-fg-subtle block text-xs uppercase">Локация</span>
                <span className="font-semibold text-accent flex items-center gap-1 mt-0.5 truncate">
                  <Store className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{selectedDevice.locationName}</span>
                </span>
              </div>

              <div className="col-span-2 pt-2 border-t border-border">
                <span className="text-fg-subtle block text-xs uppercase">IMEI 1</span>
                <span className="text-sm font-semibold text-fg select-all break-all">{selectedDevice.imei}</span>
              </div>
              <div className="col-span-2 pt-2 border-t border-border">
                <span className="text-fg-subtle block text-xs uppercase">IMEI 2</span>
                <span className={`text-sm font-semibold select-all break-all ${selectedDevice.imei2 ? 'text-fg' : 'text-fg-subtle font-normal'}`}>
                  {selectedDevice.imei2 || '— не указан'}
                </span>
              </div>
              <div className="col-span-2 pt-2 border-t border-border">
                <span className="text-fg-subtle block text-xs uppercase">Штрихкод / EAN</span>
                <span className={`text-sm font-semibold select-all break-all ${selectedDevice.barcode ? 'text-fg' : 'text-fg-subtle font-normal'}`}>
                  {selectedDevice.barcode || '— не указан'}
                </span>
              </div>
              {selectedDevice.serialNumber && (
                <div className="col-span-2 pt-2 border-t border-border">
                  <span className="text-fg-subtle block text-xs uppercase">Серийный номер</span>
                  <span className="text-sm text-fg break-all">{selectedDevice.serialNumber}</span>
                </div>
              )}
              <div className="col-span-2 pt-2 border-t border-border flex items-center justify-between">
                <span className="text-fg-subtle text-xs uppercase">Статус</span>
                <Badge tone={STATUS_TONE[selectedDevice.status]}>{STATUS_LABELS[selectedDevice.status] || selectedDevice.status}</Badge>
              </div>
            </div>

            {isAdminOrPartner && (
              <div className="bg-surface p-3 rounded-lg border border-border space-y-2 text-sm">
                <p className="font-semibold text-fg-muted flex items-center gap-1.5 uppercase text-xs tracking-wide">
                  <DollarSign className="w-3.5 h-3.5 text-accent" />
                  Финансовый аудит
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Поставщик</span>
                    <span className="text-fg truncate block">{selectedDevice.supplierName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Накладная</span>
                    <span className="text-fg truncate block">{selectedDevice.invoiceNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Цена закупки</span>
                    <span className="font-semibold text-accent">${selectedDevice.purchaseCostUsd}</span>
                  </div>
                  <div>
                    <span className="text-fg-subtle block text-xs uppercase">Себестоимость</span>
                    <span className="font-semibold text-fg">${selectedDevice.costBasisUsd}</span>
                  </div>
                </div>
                {selectedDevice.isBonus && <Badge tone="accent">Бонус поставщика</Badge>}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-fg-muted uppercase tracking-wide flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                История перемещений и событий
              </p>
              <div className="border border-border rounded-lg bg-surface p-3 space-y-2.5">
                {selectedDevice.timeline && selectedDevice.timeline.length > 0 ? (
                  selectedDevice.timeline.map((event, idx) => (
                    <div key={event.id || idx} className="relative pl-4 before:absolute before:left-1 before:top-1.5 before:bottom-0 before:w-px before:bg-border last:before:hidden">
                      <div className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-accent" />
                      <div className="text-sm">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-fg text-xs uppercase">{event.type}</span>
                          <span className="text-xs text-fg-subtle shrink-0">{event.date}</span>
                        </div>
                        <p className="text-fg-subtle text-xs mt-0.5">{event.description}</p>
                        <p className="text-xs text-fg-subtle mt-0.5">Оператор: {event.user}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-fg-subtle">История событий пуста</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
