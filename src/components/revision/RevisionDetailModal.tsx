import React from 'react';
import { StockRevision } from '../../types';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { CheckCircle2, AlertTriangle, Store, UserCheck, Calendar, Package, AlertCircle } from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';
import { formatUserName } from '../../utils/formatUser';

interface RevisionDetailModalProps {
  revision: StockRevision | null;
  onClose: () => void;
  isAdmin?: boolean;
}

export const RevisionDetailModal: React.FC<RevisionDetailModalProps> = ({
  revision,
  onClose,
  isAdmin = false,
}) => {
  if (!revision) return null;

  const isMatch = revision.status === 'MATCH';
  const createdDate = new Date(revision.createdAt);
  const formattedDate = !isNaN(createdDate.getTime())
    ? createdDate.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : revision.createdAt;

  const missingList = Array.isArray(revision.missingDevices) ? revision.missingDevices : [];
  const surplusList = Array.isArray(revision.surplusDevices) ? revision.surplusDevices : [];

  return (
    <Dialog
      open={Boolean(revision)}
      onClose={onClose}
      title="Детали ревизии склада"
      maxWidth="xl"
      footer={
        <div className="flex justify-end w-full">
          <Button type="button" variant="primary" onClick={onClose} className="font-semibold">
            Закрыть
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1 text-fg">
        {/* Header Info Banner */}
        <div className="p-3.5 rounded-xl bg-surface-raised border border-border space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-fg">
              <Store className="w-4 h-4 text-accent shrink-0" />
              <span>{revision.storeName || 'Склад / Магазин'}</span>
            </div>

            <div
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                isMatch
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {isMatch ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Всё сошлось (без расхождений)</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Выявлены расхождения</span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-fg-subtle pt-1 border-t border-border/60">
            <div className="flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>
                Проверил:{' '}
                <strong className="text-fg font-medium">
                  {formatUserName(revision.userName)} ({revision.userRole})
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-accent shrink-0" />
              <span>
                Дата сверки: <strong className="text-fg font-medium">{formattedDate}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* 4 Metric KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="p-2.5 rounded-xl bg-surface border border-border text-center">
            <div className="text-[11px] text-fg-subtle">Числилось</div>
            <div className="text-lg font-black font-mono text-fg">{revision.totalExpected}</div>
            <div className="text-[10px] text-fg-muted">на складе</div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">Сверено</div>
            <div className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
              {revision.totalChecked}
            </div>
            <div className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">в наличии</div>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center ${
              revision.totalMissing > 0
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-surface border-border'
            }`}
          >
            <div
              className={`text-[11px] ${
                revision.totalMissing > 0
                  ? 'text-amber-600 dark:text-amber-400 font-semibold'
                  : 'text-fg-subtle'
              }`}
            >
              Недостача
            </div>
            <div
              className={`text-lg font-black font-mono ${
                revision.totalMissing > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-fg'
              }`}
            >
              {revision.totalMissing}
            </div>
            <div className="text-[10px] text-fg-muted">не найдено</div>
          </div>

          <div
            className={`p-2.5 rounded-xl border text-center ${
              revision.totalSurplus > 0
                ? 'bg-rose-500/10 border-rose-500/30'
                : 'bg-surface border-border'
            }`}
          >
            <div
              className={`text-[11px] ${
                revision.totalSurplus > 0 ? 'text-danger font-semibold' : 'text-fg-subtle'
              }`}
            >
              Излишки
            </div>
            <div
              className={`text-lg font-black font-mono ${
                revision.totalSurplus > 0 ? 'text-danger' : 'text-fg'
              }`}
            >
              {revision.totalSurplus}
            </div>
            <div className="text-[10px] text-fg-muted">лишние</div>
          </div>
        </div>

        {/* Comment block if any */}
        {revision.comment && (
          <div className="p-3 rounded-xl bg-surface border border-border text-xs space-y-1">
            <span className="font-semibold text-fg-subtle text-[11px]">Комментарий к сверке:</span>
            <p className="text-fg italic whitespace-pre-wrap">{revision.comment}</p>
          </div>
        )}

        {/* Missing devices list */}
        {missingList.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Недостача ({missingList.length} шт.):
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs bg-surface">
              {missingList.map((item, idx) => (
                <div key={item.id || item.imei || idx} className="p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-fg truncate">
                      {item.brand} {item.model}
                    </div>
                    <div className="text-[11px] text-fg-subtle flex items-center gap-1.5 flex-wrap">
                      {item.storage && <span>{item.storage}</span>}
                      {item.color && <span>• {item.color}</span>}
                      {isAdmin && item.purchasePriceUsd && (
                        <span className="font-mono text-fg-muted">• ${item.purchasePriceUsd}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-[11px] font-semibold text-fg bg-surface-raised px-1.5 py-0.5 rounded border border-border">
                      {item.imei}
                    </span>
                    {item.imei2 && (
                      <div className="font-mono text-[10px] text-fg-subtle mt-0.5">
                        {item.imei2}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Surplus devices list */}
        {surplusList.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-danger">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Излишки ({surplusList.length} шт.):
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-border divide-y divide-border text-xs bg-surface">
              {surplusList.map((item, idx) => (
                <div key={item.code || idx} className="p-2.5 flex items-center justify-between gap-2">
                  <span className="text-fg-subtle text-[11px] truncate">{item.note || 'Не числится на складе'}</span>
                  <span className="font-mono text-fg text-xs font-bold bg-surface-raised px-1.5 py-0.5 rounded border border-border shrink-0">
                    {item.code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checked summary note */}
        {revision.totalChecked > 0 && (
          <div className="text-[11px] text-fg-subtle flex items-center gap-1.5 px-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>
              Успешно сверено позиций на складе: <strong className="text-fg font-medium">{revision.totalChecked} шт.</strong>
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
};
