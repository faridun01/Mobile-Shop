import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { DailyCashClosing } from '../../types';
import { formatTjs, sumMoney } from '../../utils/money';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { DailyCashClosingModal } from './DailyCashClosingModal';
import { useUIStore } from '../../stores/useUIStore';
import { AlertCircle, Banknote, CreditCard, FileCheck2, Calendar, Store, UserCheck } from 'lucide-react';

interface DailyCashClosingListPanelProps {
  month: string;
  storeId?: string | null;
}

/** Closed shifts for the month: cash and bank per day. */
export const DailyCashClosingListPanel: React.FC<DailyCashClosingListPanelProps> = ({
  month,
  storeId,
}) => {
  const { setDailyClosingModalOpen } = useUIStore();
  const [closings, setClosings] = useState<DailyCashClosing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
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
        if (!cancelled) setClosings(Array.isArray(data) ? data : []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить закрытые смены');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [month, storeId, revision]);

  const totals = useMemo(() => ({
    cashTjs: sumMoney(closings.map((c) => Number(c.actualCashTjs) || 0)),
    bankTjs: sumMoney(closings.map((c) => Number(c.salesCardTjs) || 0)),
  }), [closings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-border">
        <h2 className="text-sm font-bold text-fg flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-accent" />
          Закрытые смены
        </h2>
        <Button
          leftIcon={FileCheck2}
          onClick={() => setDailyClosingModalOpen(true, storeId && storeId !== 'all' ? storeId : undefined)}
        >
          Закрыть смену
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
          <span className="text-[11px] text-fg-subtle">Смен</span>
          <p className="text-xl font-bold font-mono text-fg">{closings.length}</p>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border space-y-1 min-w-0">
          <span className="text-[11px] text-fg-subtle flex items-center gap-1"><Banknote className="w-3.5 h-3.5 text-success" />Наличные</span>
          <p className="text-base sm:text-lg font-bold font-mono text-fg truncate">{formatTjs(totals.cashTjs)}</p>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border space-y-1 min-w-0">
          <span className="text-[11px] text-fg-subtle flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-info" />Банк</span>
          <p className="text-base sm:text-lg font-bold font-mono text-fg truncate">{formatTjs(totals.bankTjs)}</p>
        </div>
      </div>

      {loading && closings.length === 0 ? (
        <div className="p-12 text-center text-fg-subtle space-y-2">
          <div className="w-7 h-7 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Загрузка…</p>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center justify-between gap-2" role="alert">
          <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</span>
          <Button variant="secondary" onClick={refresh}>Повторить</Button>
        </div>
      ) : closings.length === 0 ? (
        <EmptyState icon={FileCheck2} title="Закрытых смен нет" description="За выбранный месяц смены не закрывались" />
      ) : (
        <div className="space-y-2.5">
          {/* Phones */}
          <div className="md:hidden space-y-2">
            {closings.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => setInspectClosing(c)}
                className="w-full text-left p-3.5 rounded-2xl bg-surface border border-border shadow-xs space-y-2 active:bg-surface-raised transition-colors"
              >
                <div className="flex items-center gap-1.5 font-bold font-mono text-xs text-fg">
                  <Calendar className="w-3.5 h-3.5 text-accent" />
                  <span>{c.businessDate}</span>
                  <span className="text-[10px] text-fg-subtle font-normal truncate">· {c.store?.name || 'Магазин'} · {c.closedByName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                  <div>
                    <span className="text-[10px] text-fg-subtle block">Наличные</span>
                    <span className="font-bold font-mono text-sm text-fg">{formatTjs(c.actualCashTjs)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-fg-subtle block">Банк</span>
                    <span className="font-bold font-mono text-sm text-fg">{formatTjs(c.salesCardTjs)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Tablet and desktop */}
          <div className="hidden md:block bg-surface rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-raised/50 border-b border-border text-[11px] text-fg-subtle uppercase tracking-wider font-semibold select-none">
                  <tr>
                    <th className="py-3 px-4">Дата</th>
                    <th className="py-3 px-4">Магазин</th>
                    <th className="py-3 px-4">Закрыл</th>
                    <th className="py-3 px-4 text-right">Наличные</th>
                    <th className="py-3 px-4 text-right">Банк</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {closings.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-raised/30 transition-colors cursor-pointer"
                      onClick={() => setInspectClosing(c)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-bold font-mono text-fg">
                          <Calendar className="w-3.5 h-3.5 text-accent" />
                          <span>{c.businessDate}</span>
                        </div>
                        <span className="text-[10px] text-fg-subtle block font-mono mt-0.5">
                          {new Date(c.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-fg font-medium">
                          <Store className="w-3.5 h-3.5 text-fg-subtle" />
                          {c.store?.name || 'Магазин'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="flex items-center gap-1 text-fg-subtle">
                          <UserCheck className="w-3.5 h-3.5" />
                          {c.closedByName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-fg">{formatTjs(c.actualCashTjs)}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-fg">{formatTjs(c.salesCardTjs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
