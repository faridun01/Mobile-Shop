import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { FormField } from '../ui/FormField';
import { apiClient } from '../../api/client';
import { useAppFields } from '../../context/AppContext';
import { DailyClosingSummary, DailyCashClosing } from '../../types';
import { formatMoney, formatTjs, formatUsd } from '../../utils/money';
import { soundEffects } from '../../utils/sound';
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Banknote,
  DollarSign,
  TrendingDown,
  ArrowDownRight,
  CreditCard,
  Building2,
  Clock,
  UserCheck,
  FileText,
  Printer,
  Sparkles,
  Store as StoreIcon,
} from 'lucide-react';
import { formatStoreName } from '../../utils/storeContext';

interface DailyCashClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string;
  storeName?: string;
  businessDate?: string;
  onClosed?: (closing: DailyCashClosing) => void;
}

export const DailyCashClosingModal: React.FC<DailyCashClosingModalProps> = ({
  isOpen,
  onClose,
  storeId: explicitStoreId,
  storeName: explicitStoreName,
  businessDate: explicitBusinessDate,
  onClosed,
}) => {
  const { currentUser, stores, selectedStoreId } = useAppFields('currentUser', 'stores', 'selectedStoreId');

  const retailStores = useMemo(
    () => stores.filter((s) => !s.isMainWarehouse && s.active),
    [stores]
  );

  // Store selector state inside modal
  const [selectedStoreIdState, setSelectedStoreIdState] = useState<string>('');

  useEffect(() => {
    if (explicitStoreId) {
      setSelectedStoreIdState(explicitStoreId);
    } else if (currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER') {
      setSelectedStoreIdState(currentUser.storeId || '');
    } else if (selectedStoreId && selectedStoreId !== 'all') {
      setSelectedStoreIdState(selectedStoreId);
    } else if (retailStores.length > 0) {
      setSelectedStoreIdState((prev) => (prev && retailStores.some(s => s.id === prev) ? prev : retailStores[0].id));
    }
  }, [explicitStoreId, currentUser?.role, currentUser?.storeId, selectedStoreId, retailStores, isOpen]);

  // Determine effective store
  const effectiveStoreId = useMemo(() => {
    if (selectedStoreIdState) return selectedStoreIdState;
    if (explicitStoreId) return explicitStoreId;
    if (currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER') return currentUser.storeId || '';
    if (selectedStoreId && selectedStoreId !== 'all') return selectedStoreId;
    return retailStores[0]?.id || '';
  }, [selectedStoreIdState, explicitStoreId, currentUser?.role, currentUser?.storeId, selectedStoreId, retailStores]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === effectiveStoreId),
    [stores, effectiveStoreId]
  );
  const effectiveStoreName = explicitStoreName || activeStore?.name || 'Магазин';

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DailyClosingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form input states
  const [actualCashTjs, setActualCashTjs] = useState<string>('');
  const [actualCashUsd, setActualCashUsd] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [initialOpeningTjs, setInitialOpeningTjs] = useState<string>('');
  const [initialOpeningUsd, setInitialOpeningUsd] = useState<string>('');
  const [showConfirmDiscrepancy, setShowConfirmDiscrepancy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch summary when modal opens
  const fetchSummary = async () => {
    const targetStoreId = effectiveStoreId || explicitStoreId || selectedStoreIdState;
    if (!targetStoreId) return;
    setLoading(true);
    setError(null);
    setShowConfirmDiscrepancy(false);
    try {
      let url = `/daily-closings/summary?storeId=${encodeURIComponent(targetStoreId)}`;
      if (explicitBusinessDate) {
        url += `&businessDate=${encodeURIComponent(explicitBusinessDate)}`;
      }
      const data = await apiClient<DailyClosingSummary>(url);
      setSummary(data);

      if (data.alreadyClosed && data.closing) {
        // Pre-fill with closed values for review
        setActualCashTjs(String(data.closing.actualCashTjs));
        setActualCashUsd(String(data.closing.actualCashUsd));
        setComment(data.closing.comment || '');
      } else {
        // Clear for fresh counting
        setActualCashTjs('');
        setActualCashUsd('');
        setComment('');
        setInitialOpeningTjs('');
        setInitialOpeningUsd('');
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось загрузить данные кассы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && effectiveStoreId) {
      void fetchSummary();
    }
  }, [isOpen, effectiveStoreId, explicitBusinessDate]);

  // Live Calculations
  const expectedTjs = useMemo(() => {
    if (!summary) return 0;
    return parseFloat(summary.expectedCashTjs) || 0;
  }, [summary]);

  const expectedUsd = useMemo(() => {
    if (!summary) return 0;
    return parseFloat(summary.expectedCashUsd) || 0;
  }, [summary]);

  const parsedActualTjs = useMemo(() => {
    if (actualCashTjs.trim() === '') return null;
    const val = parseFloat(actualCashTjs.replace(',', '.'));
    return Number.isFinite(val) ? val : null;
  }, [actualCashTjs]);

  const parsedActualUsd = useMemo(() => {
    if (actualCashUsd.trim() === '') return null;
    const val = parseFloat(actualCashUsd.replace(',', '.'));
    return Number.isFinite(val) ? val : null;
  }, [actualCashUsd]);

  const diffTjs = useMemo(() => {
    if (parsedActualTjs === null) return null;
    return Math.round((parsedActualTjs - expectedTjs) * 100) / 100;
  }, [parsedActualTjs, expectedTjs]);

  const diffUsd = useMemo(() => {
    if (parsedActualUsd === null) return null;
    return Math.round((parsedActualUsd - expectedUsd) * 100) / 100;
  }, [parsedActualUsd, expectedUsd]);

  const hasDiscrepancy = (diffTjs !== null && diffTjs !== 0) || (diffUsd !== null && diffUsd !== 0);

  // Autofill helpers
  const handleAutofillExpected = () => {
    setActualCashTjs(expectedTjs.toFixed(2));
    setActualCashUsd(expectedUsd.toFixed(2));
  };

  // Submit closing
  const handleSubmitClosing = async () => {
    const finalStoreId = summary?.storeId || effectiveStoreId || selectedStoreIdState || explicitStoreId;
    if (!finalStoreId) {
      setError('Пожалуйста, выберите магазин для закрытия смены.');
      return;
    }

    if (parsedActualTjs === null || parsedActualUsd === null) {
      setError('Пожалуйста, укажите фактические суммы в кассе (TJS и USD).');
      return;
    }

    if (hasDiscrepancy && !showConfirmDiscrepancy) {
      setShowConfirmDiscrepancy(true);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payload: any = {
        storeId: finalStoreId,
        businessDate: explicitBusinessDate || summary?.businessDate,
        actualCashTjs: parsedActualTjs,
        actualCashUsd: parsedActualUsd,
        comment: comment.trim() || undefined,
      };

      if (initialOpeningTjs.trim() !== '') {
        payload.initialOpeningCashTjs = parseFloat(initialOpeningTjs.replace(',', '.'));
      }
      if (initialOpeningUsd.trim() !== '') {
        payload.initialOpeningCashUsd = parseFloat(initialOpeningUsd.replace(',', '.'));
      }

      const result = await apiClient<DailyCashClosing>('/daily-closings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      soundEffects.playAddToCartSuccess();
      onClosed?.(result);
      // Reload summary to show completed state
      await fetchSummary();
    } catch (err: any) {
      setError(err?.message || 'Ошибка при сохранении закрытия смены');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const renderDiscrepancyBadge = (diff: number | null, currency: 'TJS' | 'USD') => {
    if (diff === null) {
      return (
        <span className="text-[11px] text-fg-subtle">
          Введите фактическую сумму
        </span>
      );
    }
    if (diff === 0) {
      return (
        <Badge tone="success" className="gap-1 py-1 px-2 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Касса сошлась идеально (0.00 {currency})</span>
        </Badge>
      );
    }
    if (diff < 0) {
      return (
        <Badge tone="danger" className="gap-1 py-1 px-2 text-xs">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Недостача: -{formatMoney(Math.abs(diff))} {currency}</span>
        </Badge>
      );
    }
    return (
      <Badge tone="info" className="gap-1 py-1 px-2 text-xs">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Излишек: +{formatMoney(diff)} {currency}</span>
      </Badge>
    );
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Закрытие кассовой смены (Z-отчёт)"
      subtitle={`${effectiveStoreName} · ${summary?.businessDate || explicitBusinessDate || 'Сегодня'}`}
      maxWidth="lg"
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {summary?.alreadyClosed ? (
            <>
              <Button
                variant="secondary"
                size="md"
                leftIcon={Printer}
                onClick={handlePrint}
                className="hidden sm:inline-flex"
              >
                Печать
              </Button>
              <div className="flex-1 sm:flex-initial flex justify-end">
                <Button variant="primary" size="md" onClick={onClose}>
                  Понятно
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="md"
                onClick={onClose}
                disabled={submitting}
              >
                Отмена
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleSubmitClosing}
                  loading={submitting}
                  disabled={loading || parsedActualTjs === null || parsedActualUsd === null}
                  leftIcon={CheckCircle2}
                >
                  {showConfirmDiscrepancy ? 'Подтвердить и закрыть' : 'Закрыть смену'}
                </Button>
              </div>
            </>
          )}
        </div>
      }
    >
      {/* Admin Store Switcher (if admin has access to multiple retail stores) */}
      {currentUser?.role === 'ADMIN' && retailStores.length > 1 && !summary?.alreadyClosed && (
        <div className="flex items-center justify-between gap-3 p-2.5 sm:p-3 bg-surface-raised border border-border rounded-xl mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <StoreIcon className="w-4 h-4 text-accent shrink-0" />
            <span className="text-xs font-semibold text-fg shrink-0">Касса магазина:</span>
          </div>
          <select
            value={effectiveStoreId}
            onChange={(e) => {
              setSelectedStoreIdState(e.target.value);
              setActualCashTjs('');
              setActualCashUsd('');
              setComment('');
              setError(null);
              setShowConfirmDiscrepancy(false);
            }}
            disabled={submitting || loading}
            className="text-xs font-semibold bg-surface text-fg border border-border rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-accent/40 cursor-pointer"
          >
            {retailStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-fg-subtle space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Формирование расчёта кассы...</p>
        </div>
      ) : error && !summary ? (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Не удалось рассчитать данные кассы</p>
            <p className="text-xs mt-1 text-danger/90">{error}</p>
            <Button
              variant="secondary"
              size="md"
              onClick={fetchSummary}
              className="mt-3 text-xs h-8"
            >
              Попробовать снова
            </Button>
          </div>
        </div>
      ) : summary ? (
        <div className="space-y-4">
          {/* Header Status Notice */}
          {summary.alreadyClosed ? (
            <div className="p-3.5 rounded-xl bg-success/15 border border-success/30 flex items-center justify-between gap-3 text-success">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">Смена за этот день успешно закрыта</p>
                  <p className="text-xs text-success/80 flex items-center gap-1.5 flex-wrap mt-0.5">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Закрыл(а): {summary.closing?.closedByName}</span>
                    <span>·</span>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{summary.closing?.createdAt ? new Date(summary.closing.createdAt).toLocaleString('ru-RU') : ''}</span>
                  </p>
                </div>
              </div>
              <Badge tone="success" className="px-2.5 py-1 text-xs shrink-0 font-bold uppercase">
                Z-Отчёт сохранён
              </Badge>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-between gap-2 text-xs text-accent">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  Сверка физической наличности против расчётного баланса операций за день
                </span>
              </div>
              <button
                type="button"
                onClick={handleAutofillExpected}
                className="font-bold underline hover:opacity-80 transition-opacity cursor-pointer shrink-0 text-accent"
                title="Заполнить фактические поля ожидаемыми суммами"
              >
                Совпадает с расчётом
              </button>
            </div>
          )}

          {/* Breakdown Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {/* 1. Opening Cash */}
            <div className="p-2.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center gap-1.5 text-fg-subtle">
                <Building2 className="w-3.5 h-3.5" />
                <span>Остаток на утро</span>
              </div>
              <p className="text-sm font-bold font-mono text-fg">
                {formatMoney(summary.openingCashTjs)} TJS
              </p>
              <p className="text-[11px] font-mono text-fg-subtle">
                ${formatMoney(summary.openingCashUsd)}
              </p>
            </div>

            {/* 2. Cash Sales */}
            <div className="p-2.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle">
                <span className="flex items-center gap-1 text-success">
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Продажи (нал)</span>
                </span>
                <span className="font-mono text-[10px] text-fg-subtle">
                  {summary.salesCount} чеков
                </span>
              </div>
              <p className="text-sm font-bold font-mono text-success">
                +{formatMoney(summary.salesCashTjs)} TJS
              </p>
              <p className="text-[11px] font-mono text-fg-subtle">
                +${formatMoney(summary.salesCashUsd)}
              </p>
            </div>

            {/* 3. Card Sales (informational, not in drawer) */}
            <div className="p-2.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center gap-1 text-fg-subtle">
                <CreditCard className="w-3.5 h-3.5 text-info" />
                <span>Безнал (карта)</span>
              </div>
              <p className="text-sm font-bold font-mono text-fg">
                {formatMoney(summary.salesCardTjs)} TJS
              </p>
              <p className="text-[10px] text-fg-subtle">
                на расчётный счёт
              </p>
            </div>

            {/* 4. Expenses */}
            <div className="p-2.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle">
                <span className="flex items-center gap-1 text-danger">
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Расходы кассы</span>
                </span>
                <span className="font-mono text-[10px] text-fg-subtle">
                  {summary.expensesCount}
                </span>
              </div>
              <p className="text-sm font-bold font-mono text-danger">
                -{formatMoney(summary.expensesCashTjs)} TJS
              </p>
              <p className="text-[11px] font-mono text-fg-subtle">
                -${formatMoney(summary.expensesCashUsd)}
              </p>
            </div>

            {/* 5. Refunds */}
            <div className="p-2.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle">
                <span className="flex items-center gap-1 text-warning">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  <span>Возвраты клиентам</span>
                </span>
                <span className="font-mono text-[10px] text-fg-subtle">
                  {summary.refundsCount}
                </span>
              </div>
              <p className="text-sm font-bold font-mono text-warning">
                -{formatMoney(summary.refundsCashTjs)} TJS
              </p>
              <p className="text-[11px] font-mono text-fg-subtle">
                -${formatMoney(summary.refundsCashUsd)}
              </p>
            </div>

            {/* 6. Cash Collections */}
            <div className="p-2.5 rounded-xl bg-surface border border-border space-y-1">
              <div className="flex items-center justify-between text-fg-subtle">
                <span className="flex items-center gap-1 text-fg-subtle">
                  <Building2 className="w-3.5 h-3.5 text-accent" />
                  <span>Инкассация в офис</span>
                </span>
                <span className="font-mono text-[10px] text-fg-subtle">
                  {summary.collectionsCount}
                </span>
              </div>
              <p className="text-sm font-bold font-mono text-fg">
                -{formatMoney(summary.collectionsCashTjs)} TJS
              </p>
              <p className="text-[11px] font-mono text-fg-subtle">
                -${formatMoney(summary.collectionsCashUsd)}
              </p>
            </div>
          </div>

          {/* Expected vs Actual Section */}
          <div className="p-4 rounded-2xl bg-surface-raised border border-border space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <span>Сверка наличности (Expected vs Actual)</span>
            </h3>

            {/* Currency 1: TJS */}
            <div className="p-3 rounded-xl bg-surface border border-border space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-accent" />
                    <span>Наличные сомони (TJS)</span>
                  </span>
                  <p className="text-[11px] text-fg-subtle mt-0.5">
                    Ожидается по операциям: <strong className="font-mono text-fg font-semibold">{formatTjs(expectedTjs)}</strong>
                  </p>
                </div>
                <div>{renderDiscrepancyBadge(diffTjs, 'TJS')}</div>
              </div>

              {!summary.alreadyClosed ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={actualCashTjs}
                      onChange={(e) => setActualCashTjs(e.target.value)}
                      placeholder={`Фактически пересчитано (ожидалось: ${expectedTjs.toFixed(2)})`}
                      className="w-full h-11 px-3 rounded-xl bg-surface-raised border border-border font-mono text-sm text-fg placeholder:text-fg-subtle/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle font-bold font-mono">
                      TJS
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActualCashTjs(expectedTjs.toFixed(2))}
                    className="h-11 px-3 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-subtle hover:text-fg transition-colors shrink-0"
                    title="Установить равным расчёту"
                  >
                    = Ожидаемо
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
                  <div className="p-2 rounded-lg bg-surface-raised border border-border/70">
                    <span className="text-[10px] text-fg-subtle block">Ожидалось</span>
                    <span className="font-bold text-fg">{formatTjs(expectedTjs)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-raised border border-border/70">
                    <span className="text-[10px] text-fg-subtle block">Фактически</span>
                    <span className="font-bold text-fg">{formatTjs(summary.closing?.actualCashTjs)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-raised border border-border/70">
                    <span className="text-[10px] text-fg-subtle block">Разница</span>
                    <span className={`font-bold ${Number(summary.closing?.differenceTjs) < 0 ? 'text-danger' : Number(summary.closing?.differenceTjs) > 0 ? 'text-info' : 'text-success'}`}>
                      {Number(summary.closing?.differenceTjs) > 0 ? '+' : ''}{formatTjs(summary.closing?.differenceTjs)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Currency 2: USD */}
            <div className="p-3 rounded-xl bg-surface border border-border space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                    <span>Наличные доллары (USD)</span>
                  </span>
                  <p className="text-[11px] text-fg-subtle mt-0.5">
                    Ожидается по операциям: <strong className="font-mono text-fg font-semibold">{formatUsd(expectedUsd)}</strong>
                  </p>
                </div>
                <div>{renderDiscrepancyBadge(diffUsd, 'USD')}</div>
              </div>

              {!summary.alreadyClosed ? (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={actualCashUsd}
                      onChange={(e) => setActualCashUsd(e.target.value)}
                      placeholder={`Фактически пересчитано (ожидалось: ${expectedUsd.toFixed(2)})`}
                      className="w-full h-11 px-3 rounded-xl bg-surface-raised border border-border font-mono text-sm text-fg placeholder:text-fg-subtle/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle font-bold font-mono">
                      USD
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActualCashUsd(expectedUsd.toFixed(2))}
                    className="h-11 px-3 rounded-xl bg-surface-raised hover:bg-surface border border-border text-xs font-semibold text-fg-subtle hover:text-fg transition-colors shrink-0"
                    title="Установить равным расчёту"
                  >
                    = Ожидаемо
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-xs">
                  <div className="p-2 rounded-lg bg-surface-raised border border-border/70">
                    <span className="text-[10px] text-fg-subtle block">Ожидалось</span>
                    <span className="font-bold text-fg">{formatUsd(expectedUsd)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-raised border border-border/70">
                    <span className="text-[10px] text-fg-subtle block">Фактически</span>
                    <span className="font-bold text-fg">{formatUsd(summary.closing?.actualCashUsd)}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-surface-raised border border-border/70">
                    <span className="text-[10px] text-fg-subtle block">Разница</span>
                    <span className={`font-bold ${Number(summary.closing?.differenceUsd) < 0 ? 'text-danger' : Number(summary.closing?.differenceUsd) > 0 ? 'text-info' : 'text-success'}`}>
                      {Number(summary.closing?.differenceUsd) > 0 ? '+' : ''}{formatUsd(summary.closing?.differenceUsd)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Comment / Discrepancy Note */}
            {!summary.alreadyClosed ? (
              <FormField
                label="Комментарий к закрытию / Причина расхождения"
                hint={hasDiscrepancy ? '⚠ Обнаружено расхождение кассы. Обязательно опишите причину в комментарии.' : 'Необязательно. Любые заметки по кассе.'}
                error={hasDiscrepancy && !comment.trim() && showConfirmDiscrepancy ? 'Пожалуйста, поясните причину расхождения' : undefined}
              >
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Например: размен купюр, округление, возврат без чека..."
                  className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-sm text-fg placeholder:text-fg-subtle/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                />
              </FormField>
            ) : summary.closing?.comment ? (
              <div className="p-3 rounded-xl bg-surface border border-border text-xs space-y-1">
                <span className="text-fg-subtle font-medium">Комментарий кассира:</span>
                <p className="text-fg italic font-sans">{summary.closing.comment}</p>
              </div>
            ) : null}

            {/* Confirmation Banner for Discrepancies */}
            {!summary.alreadyClosed && showConfirmDiscrepancy && (
              <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/40 text-warning text-xs space-y-2 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Внимание: зафиксировано расхождение с кассовым расчётом!</span>
                </div>
                <p className="leading-relaxed text-warning/90">
                  Разница TJS: <strong>{diffTjs !== null ? `${diffTjs > 0 ? '+' : ''}${diffTjs} TJS` : '0'}</strong>,
                  Разница USD: <strong>{diffUsd !== null ? `${diffUsd > 0 ? '+' : ''}${diffUsd} USD` : '0'}</strong>.
                  Уведомление об этом расхождении будет автоматически отправлено администраторам.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
};
