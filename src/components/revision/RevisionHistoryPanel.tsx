import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from '../../api/client';
import { StockRevision } from '../../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { RevisionDetailModal } from './RevisionDetailModal';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Store,
  UserCheck,
  Calendar,
  Eye,
  SlidersHorizontal,
  Package,
  X,
  FileCheck2,
} from 'lucide-react';
import { formatUserName } from '../../utils/formatUser';

interface RevisionHistoryPanelProps {
  storeId?: string | null;
  isAdmin?: boolean;
}

export const RevisionHistoryPanel: React.FC<RevisionHistoryPanelProps> = ({
  storeId,
  isAdmin = false,
}) => {
  const [revisions, setRevisions] = useState<StockRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCH' | 'DISCREPANCY'>('ALL');
  const [selectedRevision, setSelectedRevision] = useState<StockRevision | null>(null);

  const fetchRevisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = '/revisions';
      if (storeId && storeId !== 'all') {
        url += `?storeId=${encodeURIComponent(storeId)}`;
      }
      const data = await apiClient<StockRevision[]>(url);
      setRevisions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить историю ревизий');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchRevisions();
  }, [fetchRevisions]);

  useEffect(() => {
    const handleSync = () => {
      fetchRevisions();
    };
    window.addEventListener('business-data-changed', handleSync);
    return () => window.removeEventListener('business-data-changed', handleSync);
  }, [fetchRevisions]);

  const filteredRevisions = useMemo(() => {
    return revisions.filter((rev) => {
      // Status filter
      if (statusFilter === 'MATCH' && rev.status !== 'MATCH') return false;
      if (statusFilter === 'DISCREPANCY' && rev.status !== 'DISCREPANCY') return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const storeMatch = rev.storeName?.toLowerCase().includes(query);
        const userMatch = rev.userName?.toLowerCase().includes(query);
        const commentMatch = rev.comment?.toLowerCase().includes(query);
        if (!storeMatch && !userMatch && !commentMatch) return false;
      }

      return true;
    });
  }, [revisions, statusFilter, searchQuery]);

  return (
    <div className="space-y-3">
      {/* Top Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-surface p-2.5 rounded-xl border border-border">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по проверяющему, магазину или заметке..."
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-surface-raised border border-border text-fg placeholder:text-fg-subtle focus:outline-hidden focus:border-accent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills & Refresh */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <div className="flex items-center bg-surface-raised border border-border rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                statusFilter === 'ALL'
                  ? 'bg-accent text-accent-fg font-bold shadow-2xs'
                  : 'text-fg-subtle hover:text-fg'
              }`}
            >
              Все ({revisions.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('MATCH')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                statusFilter === 'MATCH'
                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                  : 'text-fg-subtle hover:text-fg'
              }`}
            >
              Сходится ({revisions.filter((r) => r.status === 'MATCH').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('DISCREPANCY')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                statusFilter === 'DISCREPANCY'
                  ? 'bg-amber-600 text-white font-bold shadow-2xs'
                  : 'text-fg-subtle hover:text-fg'
              }`}
            >
              Расхождения ({revisions.filter((r) => r.status === 'DISCREPANCY').length})
            </button>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={fetchRevisions}
            disabled={loading}
            leftIcon={RotateCcw}
            data-compact="true"
            className="min-h-0 h-8 px-2.5 text-xs"
            title="Обновить историю ревизий"
          >
            {loading ? 'Загрузка...' : 'Обновить'}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={fetchRevisions}
            className="underline font-bold hover:opacity-80"
          >
            Повторить
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && revisions.length === 0 && (
        <div className="space-y-2 py-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl bg-surface border border-border animate-pulse flex flex-col gap-2"
            >
              <div className="h-4 bg-surface-raised rounded-md w-1/3" />
              <div className="h-3 bg-surface-raised rounded-md w-1/2" />
              <div className="h-8 bg-surface-raised rounded-md w-full mt-2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && revisions.length === 0 && !error && (
        <div className="py-12 bg-surface rounded-2xl border border-border text-center">
          <EmptyState
            icon={FileCheck2}
            title="История ревизий пуста"
            description="Завершённые ревизии склада будут автоматически сохраняться и отображаться здесь с полным отчётом о расхождениях."
          />
        </div>
      )}

      {/* Filtered Empty State */}
      {!loading && revisions.length > 0 && filteredRevisions.length === 0 && (
        <div className="py-8 bg-surface rounded-xl border border-border text-center text-fg-subtle text-xs">
          Ни одной ревизии не найдено по заданному фильтру.
        </div>
      )}

      {/* Revisions Cards List */}
      <div className="space-y-2.5">
        {filteredRevisions.map((rev) => {
          const isMatch = rev.status === 'MATCH';
          const createdDate = new Date(rev.createdAt);
          const formattedDate = !isNaN(createdDate.getTime())
            ? createdDate.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : rev.createdAt;

          return (
            <div
              key={rev.id}
              className="p-3 sm:p-4 rounded-xl bg-surface border border-border hover:border-accent/40 transition-all shadow-2xs space-y-3"
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="inline-flex items-center gap-1.5 font-bold text-xs text-fg">
                    <Store className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span>{rev.storeName}</span>
                  </span>

                  <span className="text-border">•</span>

                  <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                    <Calendar className="w-3 h-3 text-accent shrink-0" />
                    <span>{formattedDate}</span>
                  </span>

                  <span className="text-border">•</span>

                  <span className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                    <UserCheck className="w-3 h-3 text-accent shrink-0" />
                    <span>
                      {formatUserName(rev.userName)}{' '}
                      <span className="text-fg-muted font-mono">({rev.userRole})</span>
                    </span>
                  </span>
                </div>

                {/* Status Pill */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    isMatch
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  }`}
                >
                  {isMatch ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Сошлось ✓</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        Расхождения
                        {rev.totalMissing > 0 && ` (недостача: ${rev.totalMissing})`}
                        {rev.totalSurplus > 0 && ` (излишки: ${rev.totalSurplus})`}
                      </span>
                    </>
                  )}
                </span>
              </div>

              {/* Stats Chips Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-surface-raised border border-border/70 flex items-center justify-between">
                  <span className="text-fg-subtle text-[11px]">Числилось:</span>
                  <span className="font-bold font-mono text-fg">{rev.totalExpected} шт.</span>
                </div>

                <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">Сверено:</span>
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {rev.totalChecked} шт.
                  </span>
                </div>

                <div
                  className={`p-2 rounded-lg border flex items-center justify-between ${
                    rev.totalMissing > 0
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-surface-raised border-border/70'
                  }`}
                >
                  <span
                    className={`text-[11px] ${
                      rev.totalMissing > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-fg-subtle'
                    }`}
                  >
                    Недостача:
                  </span>
                  <span
                    className={`font-bold font-mono ${
                      rev.totalMissing > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-fg'
                    }`}
                  >
                    {rev.totalMissing} шт.
                  </span>
                </div>

                <div
                  className={`p-2 rounded-lg border flex items-center justify-between ${
                    rev.totalSurplus > 0
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-surface-raised border-border/70'
                  }`}
                >
                  <span
                    className={`text-[11px] ${
                      rev.totalSurplus > 0 ? 'text-danger font-semibold' : 'text-fg-subtle'
                    }`}
                  >
                    Излишки:
                  </span>
                  <span
                    className={`font-bold font-mono ${
                      rev.totalSurplus > 0 ? 'text-danger' : 'text-fg'
                    }`}
                  >
                    {rev.totalSurplus} шт.
                  </span>
                </div>
              </div>

              {/* Comment row if any */}
              {rev.comment && (
                <div className="text-xs text-fg-subtle italic bg-surface-raised/60 p-2 rounded-lg border border-border/50">
                  <span className="font-medium text-fg not-italic">Заметка: </span>
                  {rev.comment}
                </div>
              )}

              {/* Bottom action row */}
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={Eye}
                  onClick={() => setSelectedRevision(rev)}
                  data-compact="true"
                  className="min-h-0 h-7.5 px-3 text-xs font-semibold cursor-pointer"
                >
                  Посмотреть детали
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspect Modal */}
      <RevisionDetailModal
        revision={selectedRevision}
        onClose={() => setSelectedRevision(null)}
        isAdmin={isAdmin}
      />
    </div>
  );
};
