import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeftRight,
  ArrowUpDown,
  Copy,
  Check,
  Warehouse,
  Store as StoreIcon,
  ArrowRight,
  Smartphone,
  AlertCircle,
  Loader2,
  FileText,
} from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { getPhoneColorHex, formatRam } from '../../utils/phoneSpecs';
import { cn } from '../../utils/cn';
import { TransferHistoryListProps } from './types';
import { TransferRequest } from '../../types';
import { CustomSelect, CustomSelectOption } from '../ui/CustomSelect';

export const TransferHistoryList: React.FC<TransferHistoryListProps> = ({
  visibleTransfers,
  filteredTransfers,
  statusCounts,
  historyStatusFilter,
  setHistoryStatusFilter,
  historySearchQuery,
  setHistorySearchQuery,
  isStoreScoped,
  isCentralMode,
  stores,
  mainWarehouse,
  historyFilterChoice,
  setHistoryFilterChoice,
  expandedTransferIds,
  onToggleExpandTransfer,
  copiedImei,
  onCopyText,
  devicesById,
  devicesByImei,
  currentUser,
  processingTransferId,
  onApprove,
  onRequestReject,
  onNavigateToCreate,
  onOpenInvoice,
}) => {
  const [historySort, setHistorySort] = useState<'NEWEST' | 'OLDEST' | 'ITEMS_DESC' | 'ITEMS_ASC'>('NEWEST');

  const sortedTransfers = useMemo(() => {
    return [...filteredTransfers].sort((a, b) => {
      if (historySort === 'NEWEST') {
        return new Date(b.requestedAt || 0).getTime() - new Date(a.requestedAt || 0).getTime();
      }
      if (historySort === 'OLDEST') {
        return new Date(a.requestedAt || 0).getTime() - new Date(b.requestedAt || 0).getTime();
      }
      if (historySort === 'ITEMS_DESC') {
        const countA = (a.deviceIds || []).length;
        const countB = (b.deviceIds || []).length;
        return countB - countA;
      }
      if (historySort === 'ITEMS_ASC') {
        const countA = (a.deviceIds || []).length;
        const countB = (b.deviceIds || []).length;
        return countA - countB;
      }
      return 0;
    });
  }, [filteredTransfers, historySort]);

  const locationOptions = useMemo<CustomSelectOption[]>(() => {
    return [
      { value: 'ALL', label: 'Все локации', icon: <Building2 className="w-3.5 h-3.5 text-accent shrink-0" /> },
      ...stores.map(s => ({
        value: s.id,
        label: s.isMainWarehouse ? 'Главный склад' : formatStoreName(s.name),
        icon: s.isMainWarehouse ? <Warehouse className="w-3.5 h-3.5 text-warning shrink-0" /> : <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />,
        badge: s.isMainWarehouse ? 'Склад' : 'Магазин'
      }))
    ];
  }, [stores]);

  const sortOptions = useMemo<CustomSelectOption[]>(() => [
    { value: 'NEWEST', label: 'Новые' },
    { value: 'OLDEST', label: 'Старые' },
    { value: 'ITEMS_DESC', label: 'Штук (↓)' },
    { value: 'ITEMS_ASC', label: 'Штук (↑)' },
  ], []);

  return (
    <div className="flex-1 p-2 sm:p-3 space-y-2.5 bg-bg flex flex-col max-w-4xl xl:max-w-5xl mx-auto w-full pb-20">
      {/* Header Toolbar: Search + Location Filter + Quick Status Tabs */}
      <div className="space-y-1.5 pb-2 border-b border-border/70 shrink-0">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 flex-wrap">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-fg-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Поиск по номеру, IMEI, модели или точке..."
              className="w-full h-8 pl-8 pr-7 rounded-lg bg-surface border border-border text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent transition-colors"
            />
            {historySearchQuery && (
              <button
                type="button"
                onClick={() => setHistorySearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Location Filter Dropdown (if central / multi-store) */}
            {!isStoreScoped && isCentralMode && (
              <CustomSelect
                value={historyFilterChoice}
                onChange={setHistoryFilterChoice}
                options={locationOptions}
                placeholder="Локация..."
                title="Фильтр по локации"
                size="sm"
                className="w-full sm:w-auto"
                triggerClassName="h-8 px-2.5 rounded-lg text-xs"
              />
            )}

            {/* Sorting Selector */}
            <CustomSelect
              value={historySort}
              onChange={(val) => setHistorySort(val as any)}
              options={sortOptions}
              placeholder="Сортировка..."
              title="Сортировка перемещений"
              icon={<ArrowUpDown className="w-3 h-3 text-accent shrink-0" />}
              size="sm"
              align="right"
              className="w-full sm:w-auto"
              triggerClassName="h-8 px-2.5 rounded-lg text-xs"
            />
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setHistoryStatusFilter('ALL')}
            className={cn(
              'h-6.5 px-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1',
              historyStatusFilter === 'ALL'
                ? 'bg-accent text-accent-fg shadow-2xs'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <span>Все</span>
            <span className="px-1 py-0.1 rounded bg-black/10 dark:bg-white/10 text-[10px] font-mono">
              {statusCounts.ALL}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryStatusFilter('PENDING')}
            className={cn(
              'h-6.5 px-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1',
              historyStatusFilter === 'PENDING'
                ? 'bg-warning text-black shadow-2xs font-black'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <Clock className="w-3 h-3 text-warning" />
            <span>Ожидают</span>
            {statusCounts.PENDING > 0 && (
              <span className="px-1 py-0.1 rounded bg-warning/20 text-warning-fg text-[10px] font-mono font-bold">
                {statusCounts.PENDING}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setHistoryStatusFilter('APPROVED')}
            className={cn(
              'h-6.5 px-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1',
              historyStatusFilter === 'APPROVED'
                ? 'bg-accent text-accent-fg shadow-2xs'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <CheckCircle2 className="w-3 h-3 text-accent" />
            <span>Выполнены</span>
            <span className="px-1 py-0.1 rounded bg-black/10 dark:bg-white/10 text-[10px] font-mono">
              {statusCounts.APPROVED}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHistoryStatusFilter('REJECTED')}
            className={cn(
              'h-6.5 px-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer shrink-0 flex items-center gap-1',
              historyStatusFilter === 'REJECTED'
                ? 'bg-danger text-white shadow-2xs'
                : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
            )}
          >
            <XCircle className="w-3 h-3 text-danger" />
            <span>Отклонены</span>
            <span className="px-1 py-0.1 rounded bg-black/10 dark:bg-white/10 text-[10px] font-mono">
              {statusCounts.REJECTED}
            </span>
          </button>
        </div>
      </div>

      {/* Empty State when no transfers exist at all */}
      {visibleTransfers.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[220px]">
          <div className="w-12 h-12 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle mb-3 shadow-xs">
            <Clock className="w-6 h-6" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-fg">
            История перемещений пуста
          </h3>
          <p className="text-xs text-fg-subtle mt-1 max-w-xs leading-relaxed">
            Здесь будут отображаться созданные перемещения между складами и магазинами, а также их статусы.
          </p>
          <button
            type="button"
            onClick={onNavigateToCreate}
            className="mt-3.5 h-8 px-3.5 rounded-xl bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{isStoreScoped ? 'Создать отправку' : 'Создать перемещение'}</span>
          </button>
        </div>
      ) : filteredTransfers.length === 0 ? (
        /* Empty Search / Filter State */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto min-h-[200px]">
          <div className="w-10 h-10 rounded-xl bg-surface-raised border border-border flex items-center justify-center text-fg-subtle mb-2.5">
            <Search className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-fg">Ничего не найдено</h4>
          <p className="text-xs text-fg-subtle mt-1 max-w-xs">
            По выбранным критериям и фильтрам перемещения отсутствуют.
          </p>
          <button
            type="button"
            onClick={() => { setHistorySearchQuery(''); setHistoryStatusFilter('ALL'); }}
            className="mt-2.5 px-3 py-1 rounded-lg bg-surface border border-border text-xs font-semibold text-accent hover:bg-surface-raised transition-colors cursor-pointer"
          >
            Сбросить фильтры
          </button>
        </div>
      ) : (
        /* Transfers List */
        <div className="space-y-2">
          {sortedTransfers.map((tr: TransferRequest) => {
            const isExpanded = expandedTransferIds.has(tr.id);
            const deviceCount = (tr.deviceIds || []).length;
            const rawModels = tr.deviceModels || [];
            const displayModels = isExpanded || rawModels.length <= 3 ? rawModels : rawModels.slice(0, 3);

            return (
              <div
                key={tr.id}
                className={cn(
                  'p-2.5 sm:p-3 rounded-xl bg-surface border transition-all duration-200 space-y-2 shadow-2xs hover:shadow-xs',
                  tr.status === 'PENDING_APPROVAL'
                    ? 'border-warning/50 hover:border-warning/70'
                    : tr.status === 'REJECTED'
                    ? 'border-danger/30 hover:border-danger/50'
                    : 'border-border/80 hover:border-border-strong'
                )}
              >
                {/* Card Header: Number, Status, Creator, Date */}
                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {/* Status Badge */}
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.2 rounded-full font-bold border shrink-0 ${
                      tr.status === 'APPROVED' ? 'bg-accent/15 text-accent border-accent/30' :
                      tr.status === 'PENDING_APPROVAL' ? 'bg-warning/15 text-warning border-warning/30' :
                      'bg-danger/15 text-danger border-danger/30'
                    }`}>
                      {tr.status === 'APPROVED' && <CheckCircle2 className="w-2.5 h-2.5" />}
                      {tr.status === 'PENDING_APPROVAL' && <Clock className="w-2.5 h-2.5 animate-pulse" />}
                      {tr.status === 'REJECTED' && <XCircle className="w-2.5 h-2.5" />}
                      <span>
                        {tr.status === 'APPROVED' ? 'Выполнено' : tr.status === 'PENDING_APPROVAL' ? 'Ожидает' : 'Отклонено'}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => onOpenInvoice(tr)}
                      title="Открыть накладную"
                      className="font-bold font-mono text-fg text-xs hover:text-accent hover:underline cursor-pointer transition-colors"
                    >
                      #{tr.transferNumber || tr.id.slice(-6)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopyText(tr.transferNumber || tr.id.slice(-6))}
                      title="Скопировать номер"
                      className="text-fg-subtle hover:text-accent p-0.5 rounded cursor-pointer"
                    >
                      {copiedImei === (tr.transferNumber || tr.id.slice(-6)) ? (
                        <Check className="w-3 h-3 text-accent" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>

                    {tr.requestedBy && (
                      <span className="hidden sm:inline text-[10px] text-fg-subtle truncate max-w-[140px]">
                        · {tr.requestedBy}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {tr.requestedAt && (
                      <span className="text-[10px] font-mono text-fg-subtle whitespace-nowrap">
                        {new Date(tr.requestedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}{' '}
                        {new Date(tr.requestedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenInvoice(tr)}
                      title="Накладная"
                      className="h-6 px-1.5 rounded-md bg-surface-raised hover:bg-surface border border-border text-accent text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3 h-3" />
                      <span>Накладная</span>
                    </button>
                  </div>
                </div>

                {/* Compact Route Line */}
                <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-surface-raised/50 border border-border/60 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <StoreIcon className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-semibold text-fg truncate text-[11px] sm:text-xs" title={tr.fromLocationName}>
                      {tr.fromLocationName}
                    </span>
                    <ArrowRight className="w-3 h-3 text-fg-subtle shrink-0" />
                    <span className="font-semibold text-fg truncate text-[11px] sm:text-xs" title={tr.toLocationName}>
                      {tr.toLocationName}
                    </span>
                  </div>

                  <span className="px-1.5 py-0.2 rounded-full bg-accent/15 text-accent font-bold font-mono text-[10px] shrink-0">
                    {deviceCount} шт.
                  </span>
                </div>

                {/* Devices Summary / Expand */}
                <div className="flex items-center justify-between gap-2 px-1 text-[11px]">
                  <div className="text-fg-subtle truncate flex-1 min-w-0">
                    {displayModels.slice(0, 3).join(', ')}{rawModels.length > 3 ? ` и ещё ${rawModels.length - 3} шт.` : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleExpandTransfer(tr.id)}
                    className="text-[10px] font-semibold text-accent hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
                  >
                    <span>{isExpanded ? 'Скрыть устройства' : `Все устройства (${rawModels.length})`}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Expanded Device List (Only when toggled) */}
                {isExpanded && (
                  <div className="rounded-lg border border-border/70 bg-surface-raised/30 divide-y divide-border/50 overflow-hidden text-xs">
                    {rawModels.map((mod, idx) => {
                      const deviceId = tr.deviceIds?.[idx];
                      const imei = tr.deviceImeis?.[idx] || '—';
                      const foundDevice = (deviceId ? devicesById.get(deviceId) : null) || (imei !== '—' ? devicesByImei.get(imei) : null);
                      const brand = tr.deviceBrands?.[idx] || foundDevice?.brand || '';
                      const fullName = brand ? `${brand} ${mod}` : (foundDevice ? `${foundDevice.brand} ${foundDevice.model}` : mod);
                      const color = foundDevice?.color;
                      const colorHex = getPhoneColorHex(color);
                      const storage = foundDevice?.storage;
                      const rawRam = formatRam(foundDevice?.ram);
                      const ram = rawRam && storage && !storage.toLowerCase().includes(rawRam.toLowerCase()) ? rawRam : null;

                      return (
                        <div key={idx} className="p-1.5 sm:p-2 flex items-center justify-between gap-2 hover:bg-surface-raised/60 transition-colors">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Smartphone className="w-3 h-3 text-accent/70 shrink-0" />
                            <span className="font-semibold text-fg truncate text-[11px]">{fullName}</span>
                            {storage && (
                              <span className="px-1 py-0.1 rounded bg-surface border border-border text-[9px] font-mono font-bold text-fg shrink-0">
                                {storage}
                              </span>
                            )}
                            {ram && (
                              <span className="px-1 py-0.1 rounded bg-accent/10 border border-accent/20 text-[9px] font-mono text-accent shrink-0">
                                {ram}
                              </span>
                            )}
                            {colorHex && (
                              <span className="w-2 h-2 rounded-full border border-black/20 shrink-0" style={{ backgroundColor: colorHex }} />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => onCopyText(imei)}
                            className="group flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-border/80 text-[10px] font-mono text-fg-subtle hover:text-fg shrink-0 cursor-pointer"
                            title="Скопировать IMEI"
                          >
                            <span>IMEI:</span>
                            <span className="font-bold text-fg">{imei}</span>
                            {copiedImei === imei ? (
                              <Check className="w-2.5 h-2.5 text-accent" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Rejected Reason Banner */}
                {tr.status === 'REJECTED' && tr.rejectedReason && (
                  <div className="p-2 rounded-lg bg-danger/10 border border-danger/20 text-[11px] text-danger flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-bold">Причина: </span>
                      <span>{tr.rejectedReason}</span>
                    </div>
                  </div>
                )}

                {/* Pending Actions */}
                {tr.status === 'PENDING_APPROVAL' && (() => {
                  const isToWarehouse = tr.toLocationId === mainWarehouse?.id || tr.toLocationName?.toLowerCase().includes('склад');
                  const isFromWarehouse = tr.fromLocationId === mainWarehouse?.id || tr.fromLocationName?.toLowerCase().includes('склад');
                  const involvesWarehouse = isToWarehouse || isFromWarehouse;
                  const canApprove = currentUser?.role === 'ADMIN' ||
                    (currentUser?.role === 'PARTNER' && !involvesWarehouse && currentUser.storeId === tr.toLocationId);

                  if (canApprove) {
                    return (
                      <div className="pt-1.5 border-t border-border/50 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-warning text-[11px] font-semibold">
                          <Clock className="w-3.5 h-3.5 text-warning shrink-0" />
                          <span>Требуется приёмка</span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            type="button"
                            onClick={() => onRequestReject(tr)}
                            disabled={processingTransferId === tr.id}
                            className="h-7 px-2.5 rounded-lg bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Отклонить</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onApprove(tr.id)}
                            disabled={processingTransferId === tr.id}
                            className="h-7 px-3 rounded-lg bg-accent hover:bg-accent-strong text-accent-fg text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                          >
                            {processingTransferId === tr.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3" />
                            )}
                            <span>{processingTransferId === tr.id ? 'Обработка…' : 'Принять'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="pt-1.5 border-t border-border/50 flex items-center gap-1.5 text-[11px] text-warning bg-warning/10 p-2 rounded-lg border border-warning/20">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-medium">
                        {isToWarehouse
                          ? 'Ожидает приёмки на складе'
                          : 'Ожидает подтверждения в магазине'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
