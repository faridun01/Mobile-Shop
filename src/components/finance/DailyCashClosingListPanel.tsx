import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { DailyCashClosing } from '../../types';
import { formatMoney, formatTjs, formatUsd } from '../../utils/money';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { DailyCashClosingModal } from './DailyCashClosingModal';
import { useAppFields } from '../../context/AppContext';
import { useUIStore } from '../../stores/useUIStore';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileCheck2,
  Calendar,
  Store,
  UserCheck,
} from 'lucide-react';

interface DailyCashClosingListPanelProps {
  month: string;
  storeId?: string | null;
}

export const DailyCashClosingListPanel: React.FC<DailyCashClosingListPanelProps> = ({
  month,
  storeId,
}) => {
  const { currentUser } = useAppFields('currentUser');
  const isAdmin = currentUser?.role === 'ADMIN';
  const { setDailyClosingModalOpen } = useUIStore();
  const [closings, setClosings] = useState<DailyCashClosing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  // Selected closing to inspect in modal
  const [inspectClosing, setInspectClosing] = useState<DailyCashClosing | null>(null);

  const refresh = useCallback(() => setRevision((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener('business-data-changed', refresh);
    return () => window.removeEventListener('business-data-changed', refresh);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Compute date range for month (e.g. "2026-10")
    const yearMonth = month.length === 7 ? month : new Date().toISOString().slice(0, 7);
    const startDate = `${yearMonth}-01`;
    const [y, m] = yearMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

    let url = `/daily-closings?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    if (storeId && storeId !== 'all') {
      url += `&storeId=${encodeURIComponent(storeId)}`;
    }

    apiClient<DailyCashClosing[]>(url)
      .then((data) => {
        if (!cancelled) {
          setClosings(Array.isArray(data) ? data : []);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message || 'Не удалось загрузить историю закрытий');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, storeId, revision]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totalCount = closings.length;
    let perfectCount = 0;
    let discrepancyCount = 0;
    let totalDiffTjs = 0;
    let totalDiffUsd = 0;

    for (const c of closings) {
      const diffT = Number(c.differenceTjs) || 0;
      const diffU = Number(c.differenceUsd) || 0;
      totalDiffTjs += diffT;
      totalDiffUsd += diffU;

      if (Math.abs(diffT) < 0.001 && Math.abs(diffU) < 0.001) {
        perfectCount++;
      } else {
        discrepancyCount++;
      }
    }

    return {
      totalCount,
      perfectCount,
      discrepancyCount,
      totalDiffTjs: Math.round(totalDiffTjs * 100) / 100,
      totalDiffUsd: Math.round(totalDiffUsd * 100) / 100,
    };
  }, [closings]);

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-border">
        <div>
          <h2 className="text-sm font-bold text-fg flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-accent" />
            <span>Журнал Z-отчётов и закрытий смен</span>
          </h2>
          <p className="text-xs text-fg-subtle mt-0.5">
            Сверка фактических денег в кассе и расчётных остатков за смену
          </p>
        </div>

        {!isAdmin && (
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={FileCheck2}
              onClick={() => setDailyClosingModalOpen(true, storeId || currentUser?.storeId || undefined)}
              className="cursor-pointer"
            >
              Снять Z-отчёт
            </Button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
          <span className="text-[11px] text-fg-subtle">Всего закрытий смен</span>
          <p className="text-xl font-bold font-mono text-fg">{stats.totalCount}</p>
          <span className="text-[10px] text-fg-subtle">за период {month}</span>
        </div>

        <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
          <span className="text-[11px] text-success flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Сошлось идеально</span>
          </span>
          <p className="text-xl font-bold font-mono text-success">{stats.perfectCount}</p>
          <span className="text-[10px] text-fg-subtle">без расхождений</span>
        </div>

        <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
          <span className="text-[11px] text-warning flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>С расхождениями</span>
          </span>
          <p className="text-xl font-bold font-mono text-warning">{stats.discrepancyCount}</p>
          <span className="text-[10px] text-fg-subtle">смен с недостачей/излишком</span>
        </div>

        <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
          <span className="text-[11px] text-fg-subtle">Суммарная разница</span>
          <p
            className={`text-lg font-bold font-mono ${
              stats.totalDiffTjs < 0 ? 'text-danger' : stats.totalDiffTjs > 0 ? 'text-info' : 'text-success'
            }`}
          >
            {stats.totalDiffTjs > 0 ? '+' : ''}{formatMoney(stats.totalDiffTjs)} TJS
          </p>
          <p
            className={`text-xs font-mono ${
              stats.totalDiffUsd < 0 ? 'text-danger' : stats.totalDiffUsd > 0 ? 'text-info' : 'text-fg-subtle'
            }`}
          >
            {stats.totalDiffUsd > 0 ? '+' : ''}${formatMoney(stats.totalDiffUsd)}
          </p>
        </div>
      </div>

      {/* Main List */}
      {loading && closings.length === 0 ? (
        <div className="p-12 text-center text-fg-subtle space-y-2">
          <div className="w-7 h-7 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Загрузка закрытий смен...</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : closings.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="Нет закрытых смен за выбранный месяц"
          description="Смены за выбранный период не найдены"
        />
      ) : (
        <div className="space-y-2.5">
          {/* Mobile Card View (< md) */}
          <div className="md:hidden space-y-2">
            {closings.map((c) => {
              const diffTjs = Number(c.differenceTjs) || 0;
              const isMatch = Math.abs(diffTjs) < 0.001;

              return (
                <div
                  key={c.id}
                  onClick={() => setInspectClosing(c)}
                  className="p-3.5 rounded-2xl bg-surface border border-border shadow-xs space-y-2.5 active:bg-surface-raised cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold font-mono text-xs text-fg">
                      <Calendar className="w-3.5 h-3.5 text-accent" />
                      <span>{c.businessDate}</span>
                      <span className="text-[10px] text-fg-subtle font-normal">
                        ({new Date(c.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    </div>

                    {isMatch ? (
                      <Badge tone="success" className="text-[10px] py-0.5 px-2">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>0.00 TJS</span>
                      </Badge>
                    ) : diffTjs < 0 ? (
                      <Badge tone="danger" className="text-[10px] py-0.5 px-2">
                        <AlertTriangle className="w-3 h-3" />
                        <span>-{formatMoney(Math.abs(diffTjs))} TJS</span>
                      </Badge>
                    ) : (
                      <Badge tone="info" className="text-[10px] py-0.5 px-2">
                        <AlertCircle className="w-3 h-3" />
                        <span>+{formatMoney(diffTjs)} TJS</span>
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="text-[10px] text-fg-subtle block">Сдано в кассу</span>
                      <span className="font-bold font-mono text-sm text-fg">{formatTjs(c.actualCashTjs)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-fg-subtle block">Ожидалось</span>
                      <span className="font-mono text-xs text-fg-muted">{formatTjs(c.expectedCashTjs)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-fg-subtle pt-1">
                    <span className="truncate">{c.store?.name || 'Магазин'} · {c.closedByName}</span>
                    <span className="text-accent font-semibold shrink-0">Z-Отчёт →</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-raised/50 border-b border-border text-[11px] text-fg-subtle uppercase tracking-wider font-semibold select-none">
                  <tr>
                    <th className="py-3 px-4">Дата и время</th>
                    <th className="py-3 px-4">Магазин</th>
                    <th className="py-3 px-4">Кассир</th>
                    <th className="py-3 px-4 text-right">Ожидалось</th>
                    <th className="py-3 px-4 text-right">Фактически</th>
                    <th className="py-3 px-4 text-center">Расхождение TJS</th>
                    <th className="py-3 px-4 text-center">Расхождение USD</th>
                    <th className="py-3 px-4">Комментарий</th>
                    <th className="py-3 px-4 text-right">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {closings.map((c) => {
                    const diffTjs = Number(c.differenceTjs) || 0;
                    const diffUsd = Number(c.differenceUsd) || 0;

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-surface-raised/30 transition-colors cursor-pointer"
                        onClick={() => setInspectClosing(c)}
                      >
                        {/* Date / Time */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-bold font-mono text-fg">
                            <Calendar className="w-3.5 h-3.5 text-accent" />
                            <span>{c.businessDate}</span>
                          </div>
                          <span className="text-[10px] text-fg-subtle block font-mono mt-0.5">
                            {new Date(c.createdAt).toLocaleString('ru-RU')}
                          </span>
                        </td>

                        {/* Store */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-fg font-medium">
                            <Store className="w-3.5 h-3.5 text-fg-subtle" />
                            <span>{c.store?.name || 'Магазин'}</span>
                          </div>
                        </td>

                        {/* Cashier */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-fg-subtle">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{c.closedByName}</span>
                          </div>
                        </td>

                        {/* Expected */}
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                          <div className="text-fg">{formatTjs(c.expectedCashTjs)}</div>
                          <div className="text-[10px] text-fg-subtle">{formatUsd(c.expectedCashUsd)}</div>
                        </td>

                        {/* Actual */}
                        <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                          <div className="text-fg">{formatTjs(c.actualCashTjs)}</div>
                          <div className="text-[10px] text-fg-subtle">{formatUsd(c.actualCashUsd)}</div>
                        </td>

                        {/* Diff TJS */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                          {Math.abs(diffTjs) < 0.001 ? (
                            <Badge tone="success" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>0.00 TJS</span>
                            </Badge>
                          ) : diffTjs < 0 ? (
                            <Badge tone="danger" className="gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>-{formatMoney(Math.abs(diffTjs))} TJS</span>
                            </Badge>
                          ) : (
                            <Badge tone="info" className="gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>+{formatMoney(diffTjs)} TJS</span>
                            </Badge>
                          )}
                        </td>

                        {/* Diff USD */}
                        <td className="py-3 px-4 text-center whitespace-nowrap font-mono">
                          {Math.abs(diffUsd) < 0.001 ? (
                            <Badge tone="success" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>$0.00</span>
                            </Badge>
                          ) : diffUsd < 0 ? (
                            <Badge tone="danger" className="gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>-${formatMoney(Math.abs(diffUsd))}</span>
                            </Badge>
                          ) : (
                            <Badge tone="info" className="gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>+${formatMoney(diffUsd)}</span>
                            </Badge>
                          )}
                        </td>

                        {/* Comment */}
                        <td className="py-3 px-4 max-w-xs truncate text-fg-subtle">
                          {c.comment || <span className="text-fg-subtle/40">—</span>}
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="md"
                            className="h-8 px-2.5 text-xs text-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectClosing(c);
                            }}
                          >
                            Z-Отчёт
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Existing Closing Modal */}
      {inspectClosing && (
        <DailyCashClosingModal
          isOpen={true}
          onClose={() => setInspectClosing(null)}
          storeId={inspectClosing.storeId}
          storeName={inspectClosing.store?.name}
          businessDate={inspectClosing.businessDate}
        />
      )}
    </div>
  );
};
