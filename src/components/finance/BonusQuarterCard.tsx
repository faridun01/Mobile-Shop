import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  CalendarCheck,
  History,
  Building2,
  Users,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Gift,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { StatusBanner, type StatusMessage } from '../ui/StatusBanner';
import { useDataRefreshRevision } from '../../hooks/useDataRefreshRevision';
import { usd, tjs } from './reportTypes';
import { formatMoney } from '../../utils/money';
import { cn } from '../../utils/cn';

interface MonthBonusSummary {
  since: string | null;
  month: string | null;
  cashBonusesCount: number;
  cashBonusesUsd: number;
  cashBonusesTjs: number;
  bonusDevicesReceived: number;
  bonusDevicesSold: number;
  bonusDeviceProfitUsd: number;
  bonusDeviceProfitTjs: number;
  totalBonusUsd?: number;
}

interface MonthCloseRecord {
  id: string;
  periodName: string;
  totalAmountUsd: number;
  totalAmountTjs?: number | null;
  type: string; // 'BUSINESS_REINVEST' | 'PROFIT_PAYOUT' | 'ANNULMENT' | 'DISTRIBUTION'
  allocations?: any;
  note?: string | null;
  performedByName?: string | null;
  createdAt: string;
}

type AdminDecision = 'BUSINESS' | 'PAYOUT' | 'RECORD';

const defaultPeriodName = () => {
  const now = new Date();
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
};

const dateRu = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');

/**
 * Monthly bonus tracking and fixation:
 * Fixes what was sold in the month, allows admin to decide whether to reinvest in business
 * or distribute as profit, and provides an archive to view history month by month.
 */
export const BonusQuarterCard: React.FC = () => {
  const [summary, setSummary] = useState<MonthBonusSummary | null>(null);
  const [history, setHistory] = useState<MonthCloseRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [periodName, setPeriodName] = useState(defaultPeriodName);
  const [decision, setDecision] = useState<AdminDecision>('BUSINESS');
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('ALL');
  const revision = useDataRefreshRevision();

  const load = useCallback(async () => {
    try {
      const [sum, closes] = await Promise.all([
        apiClient<MonthBonusSummary>('/bonuses/quarter'),
        apiClient<MonthCloseRecord[]>('/bonuses/quarter-history'),
      ]);
      setSummary(sum);
      setHistory(closes || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные по бонусам');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const totalBonusUsd = Number(summary?.totalBonusUsd ?? (Number(summary?.cashBonusesUsd ?? 0) + Number(summary?.bonusDeviceProfitUsd ?? 0)));
  const totalBonusTjs = Number(summary?.cashBonusesTjs ?? 0) + Number(summary?.bonusDeviceProfitTjs ?? 0);
  const isEmpty = !summary || (summary.cashBonusesCount === 0 && summary.bonusDevicesSold === 0 && summary.bonusDevicesReceived === 0);

  const handleFixateMonth = async () => {
    if (closing) return;
    setClosing(true);
    try {
      await apiClient('/bonuses/annul-pool', {
        method: 'POST',
        body: JSON.stringify({
          periodName: periodName.trim() || defaultPeriodName(),
          action: decision,
          note: note.trim() || undefined,
        }),
      });

      const decisionLabel =
        decision === 'BUSINESS'
          ? 'внесены в бизнес (кассу)'
          : decision === 'PAYOUT'
          ? 'выданы как прибыль (поделены)'
          : 'зафиксированы за месяц';

      setConfirmOpen(false);
      setStatus({
        tone: 'success',
        text: `Бонусы за «${periodName.trim()}» успешно ${decisionLabel}. Счётчики обновлены.`,
      });
      await load();
    } catch (err) {
      setStatus({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Не удалось зафиксировать бонусы за месяц',
      });
    } finally {
      setClosing(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (selectedHistoryMonth === 'ALL') return history;
    return history.filter(h => h.periodName === selectedHistoryMonth);
  }, [history, selectedHistoryMonth]);

  const uniqueMonths = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => {
      if (h.periodName) set.add(h.periodName);
    });
    return Array.from(set);
  }, [history]);

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-3.5 sm:p-4 space-y-3.5 shadow-2xs"
      aria-labelledby="bonus-month-title"
    >
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1 border-b border-border/70">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <Gift className="w-4 h-4" />
            </div>
            <h2 id="bonus-month-title" className="text-sm sm:text-base font-bold text-fg tracking-tight truncate">
              Учёт бонусов по месяцам
            </h2>
          </div>
          {summary?.since ? (
            <p className="text-[11px] text-fg-subtle truncate pl-9">
              Период с последнего закрытия ({dateRu(summary.since)}) · Продажи за текущий месяц
            </p>
          ) : (
            <p className="text-[11px] text-fg-subtle truncate pl-9">
              Фиксация проданных бонусных устройств и скидок поставщиков
            </p>
          )}
        </div>

        <Button
          variant="primary"
          className="!h-8.5 !px-3.5 text-xs font-bold shrink-0 shadow-xs ml-auto sm:ml-0"
          disabled={!summary || isEmpty}
          leftIcon={CalendarCheck}
          onClick={() => {
            setPeriodName(defaultPeriodName());
            setDecision('BUSINESS');
            setNote('');
            setConfirmOpen(true);
          }}
        >
          <span>Зафиксировать месяц</span>
        </Button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-2 text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl p-3">
          <span>{error}</span>
          <Button variant="secondary" onClick={() => void load()}>Повторить</Button>
        </div>
      ) : (
        /* Monthly Hero Stats Grid */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Card 1: Bonus phones sold */}
          <div className="rounded-xl bg-surface-raised border border-border/80 p-3 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Продано бонусных телефонов
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base sm:text-lg font-black text-fg font-mono">
                {summary ? `${summary.bonusDevicesSold} шт.` : '—'}
              </span>
              <span className="text-xs font-bold text-emerald-400 font-mono">
                {summary ? `+$${formatMoney(summary.bonusDeviceProfitUsd)}` : ''}
              </span>
            </div>
            <div className="text-[10px] text-fg-subtle truncate">
              {summary ? `≈ ${formatMoney(summary.bonusDeviceProfitTjs)} TJS · получено ${summary.bonusDevicesReceived} шт.` : ''}
            </div>
          </div>

          {/* Card 2: Cash discounts from suppliers */}
          <div className="rounded-xl bg-surface-raised border border-border/80 p-3 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-subtle">
              Денежные бонусы (скидки)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-base sm:text-lg font-black text-accent font-mono">
                {summary ? `+$${formatMoney(summary.cashBonusesUsd)}` : '—'}
              </span>
              <span className="text-xs font-semibold text-fg-subtle font-mono">
                {summary ? `(${summary.cashBonusesCount} шт.)` : ''}
              </span>
            </div>
            <div className="text-[10px] text-fg-subtle truncate">
              {summary ? `≈ ${formatMoney(summary.cashBonusesTjs)} TJS от поставщиков` : ''}
            </div>
          </div>

          {/* Card 3: Total month bonus profit */}
          <div className="rounded-xl bg-accent/10 border border-accent/30 p-3 space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-accent">
              Итого бонусов к распределению
            </div>
            <div className="text-base sm:text-xl font-black text-accent font-mono">
              {summary ? `+$${formatMoney(totalBonusUsd)}` : '—'}
            </div>
            <div className="text-[10px] text-fg-subtle truncate">
              {summary ? `≈ ${formatMoney(totalBonusTjs)} TJS за период` : ''}
            </div>
          </div>
        </div>
      )}

      {/* History by Months ("потом чтобы мог посмотреть по месяцам") */}
      {history.length > 0 && (
        <div className="rounded-xl border border-border/80 bg-surface-raised/40 overflow-hidden text-xs">
          <div
            onClick={() => setHistoryExpanded(prev => !prev)}
            className="flex items-center justify-between p-3 bg-surface-raised/80 hover:bg-surface-raised cursor-pointer transition-colors border-b border-border/60"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-accent" />
              <span className="font-bold text-fg">История и архив по месяцам</span>
              <span className="px-1.5 py-0.2 rounded-md bg-surface border border-border text-[10px] font-mono font-bold text-fg-muted">
                {history.length}
              </span>
            </div>

            <div className="flex items-center gap-1 text-fg-subtle hover:text-fg text-[11px] font-medium">
              <span>{historyExpanded ? 'Свернуть' : 'Развернуть'}</span>
              {historyExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </div>

          {historyExpanded && (
            <div className="p-3 space-y-3">
              {/* Month Filter Selector (if multiple months exist) */}
              {uniqueMonths.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryMonth('ALL')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0',
                      selectedHistoryMonth === 'ALL'
                        ? 'bg-accent text-accent-fg font-bold shadow-2xs'
                        : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
                    )}
                  >
                    Все месяцы
                  </button>
                  {uniqueMonths.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSelectedHistoryMonth(m)}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0',
                        selectedHistoryMonth === m
                          ? 'bg-accent text-accent-fg font-bold shadow-2xs'
                          : 'bg-surface border border-border/80 text-fg-muted hover:text-fg hover:bg-surface-raised'
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {/* Monthly Records List */}
              <div className="divide-y divide-border/60 border border-border/70 rounded-xl overflow-hidden bg-surface">
                {filteredHistory.map((close) => {
                  const isBusiness = close.type === 'BUSINESS_REINVEST';
                  const isPayout = close.type === 'PROFIT_PAYOUT';
                  const isDist = close.type === 'DISTRIBUTION';

                  const badgeClass = isBusiness
                    ? 'bg-accent/15 text-accent border-accent/30'
                    : isPayout
                    ? 'bg-info/15 text-info border-info/30'
                    : 'bg-surface-raised text-fg-muted border-border';

                  const badgeLabel = isBusiness
                    ? '🏢 Внесено в бизнес'
                    : isPayout
                    ? '👥 Выдано как прибыль (поделено)'
                    : isDist
                    ? 'Распределено'
                    : '📄 Зафиксировано за месяц';

                  const alloc = close.allocations;

                  return (
                    <div key={close.id} className="p-3 hover:bg-surface-raised/50 transition-colors space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-fg text-xs sm:text-sm">
                            {close.periodName}
                          </span>
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold border', badgeClass)}>
                            {badgeLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono ml-auto sm:ml-0">
                          <span className="text-xs sm:text-sm font-black text-accent">
                            +${formatMoney(Number(close.totalAmountUsd || 0))}
                          </span>
                          <span className="text-[11px] text-fg-subtle">
                            {dateRu(close.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Details row */}
                      {alloc && typeof alloc === 'object' && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-subtle font-medium">
                          {alloc.devicesSold !== undefined && (
                            <span>Продано устройств: <strong className="text-fg">{alloc.devicesSold} шт.</strong> (${formatMoney(alloc.devicesProfitUsd || 0)})</span>
                          )}
                          {alloc.cashBonusesCount !== undefined && (
                            <span>Денежные бонусы: <strong className="text-fg">{alloc.cashBonusesCount} шт.</strong> (${formatMoney(alloc.cashBonusesUsd || 0)})</span>
                          )}
                          {close.performedByName && (
                            <span>Зафиксировал: <strong className="text-fg-muted">{close.performedByName}</strong></span>
                          )}
                        </div>
                      )}

                      {close.note && (
                        <p className="text-[11px] text-fg-muted italic bg-surface-raised/70 px-2.5 py-1.5 rounded-lg border border-border/60">
                          {close.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin Decision Modal: Reinvest in business vs payout vs record */}
      <Dialog
        open={confirmOpen}
        onClose={() => { if (!closing) setConfirmOpen(false); }}
        title="Фиксация бонусов за месяц"
        subtitle={`Принятие решения по бонусной прибыли: $${formatMoney(totalBonusUsd)}`}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-2.5 w-full">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={closing}
              className="px-4 py-2 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-muted hover:text-fg transition-colors cursor-pointer disabled:opacity-50"
            >
              Отмена
            </button>
            <Button
              variant="primary"
              className="!h-9 !px-5 text-xs font-bold shadow-xs flex items-center gap-2"
              disabled={closing}
              onClick={handleFixateMonth}
            >
              {closing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Сохранение...</span>
                </>
              ) : (
                <>
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Подтвердить и зафиксировать</span>
                </>
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Month Name */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Название периода / месяца
            </label>
            <input
              type="text"
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              className="w-full rounded-xl bg-surface-raised border border-border px-3.5 py-2 text-fg text-sm font-semibold focus:border-accent focus:outline-none transition-colors"
              placeholder="Например: Октябрь 2026"
            />
          </div>

          {/* Month Summary Banner */}
          <div className="p-3 rounded-xl bg-surface-raised border border-border/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-fg">Бонусная прибыль за месяц:</span>
              <span className="text-sm font-black font-mono text-accent">
                +${formatMoney(totalBonusUsd)}
              </span>
            </div>
            <div className="text-[11px] text-fg-subtle flex flex-wrap gap-x-3 gap-y-0.5">
              <span>Продано бонусных телефонов: <strong>{summary?.bonusDevicesSold ?? 0} шт.</strong></span>
              <span>Денежные скидки: <strong>{summary?.cashBonusesCount ?? 0} шт.</strong> (${formatMoney(summary?.cashBonusesUsd ?? 0)})</span>
            </div>
          </div>

          {/* Decision Cards: Reinvest vs Payout vs Record */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Что сделать с бонусами этого месяца?
            </label>

            <div className="space-y-2">
              {/* Option 1: Reinvest in Business */}
              <div
                onClick={() => setDecision('BUSINESS')}
                className={cn(
                  'p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3',
                  decision === 'BUSINESS'
                    ? 'bg-accent/10 border-accent text-fg shadow-2xs ring-1 ring-accent/30'
                    : 'bg-surface-raised/60 border-border/80 text-fg-muted hover:border-border hover:bg-surface-raised'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                  decision === 'BUSINESS' ? 'bg-accent text-accent-fg' : 'bg-surface border border-border text-fg-subtle'
                )}>
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-fg">Внести в бизнес (реинвест)</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/20 text-accent font-bold">
                      В кассу / оборот
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">
                    Сумма направляется в оборотные средства компании (Центральную кассу) для развития бизнеса.
                  </p>
                </div>
              </div>

              {/* Option 2: Payout as Profit / Split */}
              <div
                onClick={() => setDecision('PAYOUT')}
                className={cn(
                  'p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3',
                  decision === 'PAYOUT'
                    ? 'bg-info/10 border-info text-fg shadow-2xs ring-1 ring-info/30'
                    : 'bg-surface-raised/60 border-border/80 text-fg-muted hover:border-border hover:bg-surface-raised'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                  decision === 'PAYOUT' ? 'bg-info text-white' : 'bg-surface border border-border text-fg-subtle'
                )}>
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-fg">Выдать как прибыль (поделить)</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-info/20 text-info font-bold">
                      Дивиденды
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">
                    Бонусная прибыль выдаётся владельцам / делится между партнерами как дивиденды.
                  </p>
                </div>
              </div>

              {/* Option 3: Record Only */}
              <div
                onClick={() => setDecision('RECORD')}
                className={cn(
                  'p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3',
                  decision === 'RECORD'
                    ? 'bg-surface-raised border-fg-subtle text-fg shadow-2xs ring-1 ring-border'
                    : 'bg-surface-raised/60 border-border/80 text-fg-muted hover:border-border hover:bg-surface-raised'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                  decision === 'RECORD' ? 'bg-fg-muted text-surface' : 'bg-surface border border-border text-fg-subtle'
                )}>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-fg">Просто зафиксировать</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border text-fg-subtle">
                      Архив
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-subtle mt-0.5 leading-relaxed">
                    Зафиксировать факт продаж за месяц и обнулить текущий период в отчётах без движения средств.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Note Input */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Примечание (необязательно)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl bg-surface-raised border border-border px-3.5 py-2 text-fg text-xs focus:border-accent focus:outline-none transition-colors"
              placeholder="Например: План перевыполнен, бонусы за сентябрь"
            />
          </div>
        </div>
      </Dialog>
    </section>
  );
};

export const BonusMonthCard = BonusQuarterCard;
