import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, X, Check, CheckCircle2, Loader2, History, Archive, AlertCircle, Calendar } from 'lucide-react';
import { formatUsd } from '../../utils/money';
import { Owner, QuarterClosure } from '../../types';
import { apiClient } from '../../api/client';

interface QuarterReportModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmClose: (data: { quarterName: string; transferRemainingToCapital: boolean }) => Promise<void>;
  displayOwners: Owner[];
  getOwnerDetails: (owner: Owner) => { name: string; roleTag: string; roleSub: string };
  ownerShareLabel: (ownerId: string) => string;
  isSubmitting: boolean;
}

function ownerCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'учредитель';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'учредителя';
  return 'учредителей';
}

function formatClosureDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const MONTH_NAMES_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function getInitialPeriodName(): string {
  const now = new Date();
  const monthName = MONTH_NAMES_RU[now.getMonth()];
  return `${monthName} ${now.getFullYear()}`;
}

function getTodayPeriodName(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `Отчёт на ${day}.${month}.${now.getFullYear()}`;
}

function getYearPeriodName(): string {
  const now = new Date();
  return `${now.getFullYear()} год`;
}

export const QuarterReportModal: React.FC<QuarterReportModalProps> = ({
  open,
  onClose,
  onConfirmClose,
  displayOwners,
  getOwnerDetails,
  ownerShareLabel,
  isSubmitting,
}) => {
  const [activeTab, setActiveTab] = useState<'CLOSE' | 'HISTORY'>('CLOSE');
  const [periodName, setPeriodName] = useState<string>(getInitialPeriodName);
  const [transferRemainingToCapital, setTransferRemainingToCapital] = useState(true);

  const [closures, setClosures] = useState<QuarterClosure[]>([]);
  const [loadingClosures, setLoadingClosures] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('');

  const fetchClosures = useCallback(async () => {
    try {
      setLoadingClosures(true);
      const data = await apiClient<QuarterClosure[]>('/owners/quarter-closures');
      if (Array.isArray(data)) {
        setClosures(data);
        if (data.length > 0 && !selectedHistoryId) {
          setSelectedHistoryId(data[0].id);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoadingClosures(false);
    }
  }, [selectedHistoryId]);

  useEffect(() => {
    if (open) {
      void fetchClosures();
      setPeriodName((prev) => (prev.trim() ? prev : getInitialPeriodName()));
    }
  }, [open, fetchClosures]);

  const periodNameTrimmed = periodName.trim();
  const alreadyClosedCurrent = useMemo(() => {
    if (!periodNameTrimmed) return null;
    return closures.find((c) => c.quarterName.trim().toLowerCase() === periodNameTrimmed.toLowerCase());
  }, [closures, periodNameTrimmed]);

  const selectedClosure = useMemo(() => {
    if (!closures.length) return null;
    return closures.find((c) => c.id === selectedHistoryId) || closures[0];
  }, [closures, selectedHistoryId]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (alreadyClosedCurrent || !periodNameTrimmed) return;
    await onConfirmClose({
      quarterName: periodNameTrimmed,
      transferRemainingToCapital,
    });
    await fetchClosures();
    setActiveTab('HISTORY');
    setSelectedHistoryId('');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quarter-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs"
    >
      <div className="modal-card w-full max-w-xl max-h-[min(92vh,var(--visual-viewport-height,92vh))] overflow-y-auto rounded-2xl bg-surface border border-border p-3.5 sm:p-4 text-fg shadow-2xl space-y-3 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 id="quarter-report-title" className="text-xs sm:text-sm font-bold text-fg leading-tight">
                Финансовый отчёт и закрытие периода
              </h4>
              <p className="text-[10px] text-fg-subtle">
                Сводная ведомость учредителей, фиксация прибыли и архив отчётов
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg p-1.5 rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher: Close period vs History archive */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-raised border border-border">
          <button
            type="button"
            onClick={() => setActiveTab('CLOSE')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'CLOSE'
                ? 'bg-amber-500 text-black shadow-xs font-black'
                : 'text-fg-subtle hover:text-fg hover:bg-surface'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Закрытие периода</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'HISTORY'
                ? 'bg-amber-500 text-black shadow-xs font-black'
                : 'text-fg-subtle hover:text-fg hover:bg-surface'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>История и архив</span>
            {closures.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'HISTORY' ? 'bg-black/20 text-black' : 'bg-surface border border-border text-fg-subtle'
              }`}>
                {closures.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'CLOSE' ? (
          <>
            {/* Flexible Period Selector */}
            <div className="p-2.5 sm:p-3 rounded-xl bg-surface-raised border border-border space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <label htmlFor="period-name-input" className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>Период отчёта:</span>
                </label>
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-fg-subtle text-[10px] mr-0.5">Быстро:</span>
                  {[
                    { label: 'Текущий месяц', value: getInitialPeriodName() },
                    { label: 'На сегодня', value: getTodayPeriodName() },
                    { label: 'С начала года', value: getYearPeriodName() },
                  ].map((p) => {
                    const isSel = periodName.trim() === p.value;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setPeriodName(p.value)}
                        className={`px-2 py-0.5 rounded-lg font-semibold transition-all cursor-pointer ${
                          isSel
                            ? 'bg-amber-500 text-black font-bold shadow-xs'
                            : 'bg-surface border border-border text-fg-subtle hover:text-fg hover:border-amber-500/40'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                id="period-name-input"
                type="text"
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
                placeholder="Например: Октябрь 2026, Отчёт на 07.10.2026 или любое название..."
                className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs sm:text-sm font-semibold text-fg placeholder:text-fg-subtle/50 focus:border-amber-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-fg-subtle">
                Формируйте отчёт в любой момент, когда нужно — за месяц, произвольные даты или с начала года.
              </p>
            </div>

            {/* Already closed banner if selected quarter is in history */}
            {alreadyClosedCurrent && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-fg block">
                      Период «{alreadyClosedCurrent.quarterName}» уже закрыт
                    </span>
                    <span className="text-[11px] text-fg-subtle">
                      Закрыт: {formatClosureDate(alreadyClosedCurrent.closedAt)}. Счетчики периода обнулены.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHistoryId(alreadyClosedCurrent.id);
                    setActiveTab('HISTORY');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-bold text-[11px] shrink-0 hover:bg-amber-400 transition-all cursor-pointer"
                >
                  Открыть в архиве
                </button>
              </div>
            )}

            {/* Breakdown Table */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-fg-subtle px-0.5">
                <span className="font-semibold uppercase tracking-wider">
                  Текущие счетчики периода {periodNameTrimmed ? `(«${periodNameTrimmed}»)` : ''}
                </span>
                <span className="font-mono">{displayOwners.length} {ownerCountLabel(displayOwners.length)}</span>
              </div>

              <div className="overflow-x-auto scrollbar-thin rounded-xl border border-border bg-surface-raised/40">
                <table className="w-full text-left text-xs min-w-[500px]">
                  <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                    <tr>
                      <th className="py-2 px-2.5 font-semibold">Партнер</th>
                      <th className="py-2 px-2 text-right font-semibold">Начислено</th>
                      <th className="py-2 px-2 text-right font-semibold">Выплачено</th>
                      <th className="py-2 px-2 text-right font-semibold">Реинвест</th>
                      <th className="py-2 px-2 text-right font-semibold text-amber-500">Остаток</th>
                      <th className="py-2 px-2.5 text-right font-semibold">Капитал</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-xs">
                    {displayOwners.map((o) => {
                      const isNegative = (o.availableProfitUsd || 0) < 0;
                      return (
                        <tr key={o.id} className="hover:bg-surface/50 font-mono transition-colors">
                          <td className="py-1.5 px-2.5 font-sans">
                            <span className="font-bold text-fg block text-xs truncate max-w-[150px] sm:max-w-none">
                              {getOwnerDetails(o).name}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-fg">
                            {formatUsd(o.totalAccruedProfitUsd)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-fg-subtle">
                            {formatUsd(o.totalPaidProfitUsd)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-accent font-semibold">
                            {formatUsd(o.totalReinvestedUsd)}
                          </td>
                          <td className={`py-1.5 px-2 text-right font-bold ${
                            isNegative ? 'text-rose-500' : (o.availableProfitUsd || 0) > 0 ? 'text-amber-500' : 'text-fg-subtle'
                          }`}>
                            {formatUsd(o.availableProfitUsd)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-medium text-fg">
                            {formatUsd(o.capitalBalanceUsd)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-surface/80 font-bold border-t border-border text-xs font-mono">
                    <tr>
                      <td className="py-2 px-2.5 uppercase font-sans text-fg-subtle text-[11px]">ИТОГО:</td>
                      <td className="py-2 px-2 text-right text-fg">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0))}
                      </td>
                      <td className="py-2 px-2 text-right text-fg-subtle">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0))}
                      </td>
                      <td className="py-2 px-2 text-right text-accent">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.totalReinvestedUsd || 0), 0))}
                      </td>
                      <td className={`py-2 px-2 text-right font-bold ${
                        displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0) < 0
                          ? 'text-rose-500'
                          : 'text-amber-500'
                      }`}>
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0))}
                      </td>
                      <td className="py-2 px-2.5 text-right text-fg">
                        {formatUsd(displayOwners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Sweep option interactive toggle card */}
            <div
              onClick={() => {
                if (!alreadyClosedCurrent) setTransferRemainingToCapital(prev => !prev);
              }}
              className={`p-2 sm:p-2.5 rounded-xl border transition-all select-none flex items-start gap-2.5 ${
                alreadyClosedCurrent
                  ? 'opacity-60 cursor-not-allowed bg-surface-raised border-border'
                  : transferRemainingToCapital
                  ? 'bg-amber-500/10 border-amber-500/30 cursor-pointer'
                  : 'bg-surface-raised border-border hover:border-fg-subtle/30 cursor-pointer'
              }`}
            >
              <div className="pt-0.5 shrink-0">
                <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                  transferRemainingToCapital
                    ? 'bg-amber-500 text-black'
                    : 'border border-border bg-surface text-transparent'
                }`}>
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-fg block leading-tight">
                  Зачислить прибыль в оборотный капитал и обнулить счетчики
                </span>
                <span className="text-[11px] text-fg-subtle block leading-tight mt-0.5">
                  {transferRemainingToCapital
                    ? 'Остаток прибыли пополнит капитал партнеров. Счетчики «Начислено», «Выплачено» и «Реинвест» обнулятся для нового периода и зафиксируются в архиве.'
                    : 'Прибыль останется доступной для выплаты. Счетчики периода обнулятся для нового периода.'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-fg-subtle hover:text-fg hover:bg-surface-raised transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={isSubmitting || Boolean(alreadyClosedCurrent) || !periodNameTrimmed}
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all ${
                  alreadyClosedCurrent || !periodNameTrimmed
                    ? 'bg-surface-raised border border-border text-fg-subtle cursor-not-allowed opacity-70'
                    : 'bg-amber-500 hover:bg-amber-600 text-black cursor-pointer'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Закрытие периода…</span>
                  </>
                ) : alreadyClosedCurrent ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>Период уже закрыт</span>
                  </>
                ) : !periodNameTrimmed ? (
                  <span>Укажите название периода</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Закрыть период «{periodNameTrimmed}»</span>
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* HISTORY & ARCHIVE TAB */
          <div className="space-y-3">
            {loadingClosures ? (
              <div className="p-8 text-center text-fg-subtle flex flex-col items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                <span>Загрузка архива закрытых периодов…</span>
              </div>
            ) : closures.length === 0 ? (
              <div className="p-8 text-center text-fg-subtle rounded-xl border border-dashed border-border bg-surface-raised/20 space-y-1">
                <Archive className="w-8 h-8 text-fg-subtle/50 mx-auto" />
                <p className="font-semibold text-xs text-fg">Архив закрытых периодов пуст</p>
                <p className="text-[11px]">После закрытия периода здесь будет храниться вся финансовая история.</p>
              </div>
            ) : (
              <>
                {/* Closure Select Pills */}
                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-fg-subtle uppercase tracking-wider block">
                    Выберите закрытый период:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {closures.map((c) => {
                      const isSelected = selectedClosure?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedHistoryId(c.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-amber-500 text-black shadow-xs'
                              : 'bg-surface-raised border border-border text-fg-muted hover:text-fg hover:border-amber-500/40'
                          }`}
                        >
                          <CheckCircle2 className={`w-3.5 h-3.5 ${isSelected ? 'text-black' : 'text-amber-500'}`} />
                          <span>{c.quarterName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Closure Details */}
                {selectedClosure && (
                  <div className="space-y-2 rounded-xl border border-border bg-surface-raised/30 p-2.5 sm:p-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                      <div>
                        <span className="font-bold text-fg text-sm block">
                          Архивная ведомость: {selectedClosure.quarterName}
                        </span>
                        <span className="text-[11px] text-fg-subtle block">
                          Зафиксировано при закрытии: {formatClosureDate(selectedClosure.closedAt)}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/20 text-accent font-bold text-[10px]">
                        Архив
                      </span>
                    </div>

                    <div className="overflow-x-auto scrollbar-thin rounded-xl border border-border bg-surface">
                      <table className="w-full text-left text-xs min-w-[500px]">
                        <thead className="bg-surface-raised text-[10px] text-fg-subtle uppercase border-b border-border">
                          <tr>
                            <th className="py-2 px-2.5 font-semibold">Партнер</th>
                            <th className="py-2 px-2 text-right font-semibold">Начислено</th>
                            <th className="py-2 px-2 text-right font-semibold">Выплачено</th>
                            <th className="py-2 px-2 text-right font-semibold">Реинвест</th>
                            <th className="py-2 px-2 text-right font-semibold">Остаток</th>
                            <th className="py-2 px-2.5 text-right font-semibold">Капитал</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60 text-xs font-mono">
                          {(selectedClosure.snapshot || []).map((row, idx) => (
                            <tr key={row.ownerId || idx} className="hover:bg-surface-raised/40 transition-colors">
                              <td className="py-1.5 px-2.5 font-sans">
                                <span className="font-bold text-fg block text-xs truncate max-w-[130px] sm:max-w-none">
                                  {row.name}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-semibold text-fg">
                                {formatUsd(row.totalAccruedProfitUsd)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-fg-subtle">
                                {formatUsd(row.totalPaidProfitUsd)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-accent font-semibold">
                                {formatUsd(row.totalReinvestedUsd ?? row.sweptToCapital ?? 0)}
                              </td>
                              <td className="py-1.5 px-2 text-right text-fg-subtle">
                                {formatUsd(row.availableProfitUsd)}
                              </td>
                              <td className="py-1.5 px-2.5 text-right font-medium text-fg">
                                {formatUsd(row.capitalBalanceUsd)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-surface-raised/80 font-bold border-t border-border text-xs font-mono">
                          <tr>
                            <td className="py-2 px-2.5 uppercase font-sans text-fg-subtle text-[11px]">ИТОГО:</td>
                            <td className="py-2 px-2 text-right text-fg">
                              {formatUsd((selectedClosure.snapshot || []).reduce((sum, r) => sum + (r.totalAccruedProfitUsd || 0), 0))}
                            </td>
                            <td className="py-2 px-2 text-right text-fg-subtle">
                              {formatUsd((selectedClosure.snapshot || []).reduce((sum, r) => sum + (r.totalPaidProfitUsd || 0), 0))}
                            </td>
                            <td className="py-2 px-2 text-right text-accent">
                              {formatUsd((selectedClosure.snapshot || []).reduce((sum, r) => sum + (r.totalReinvestedUsd ?? r.sweptToCapital ?? 0), 0))}
                            </td>
                            <td className="py-2 px-2 text-right text-fg-subtle">
                              {formatUsd((selectedClosure.snapshot || []).reduce((sum, r) => sum + (r.availableProfitUsd || 0), 0))}
                            </td>
                            <td className="py-2 px-2.5 text-right text-fg">
                              {formatUsd((selectedClosure.snapshot || []).reduce((sum, r) => sum + (r.capitalBalanceUsd || 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="p-2 rounded-lg bg-surface border border-border text-[11px] text-fg-subtle flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>
                        Данные зафиксированы на момент закрытия. После закрытия счетчики были сброшены на $0.00 для нового периода.
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg font-bold text-xs transition-colors cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
