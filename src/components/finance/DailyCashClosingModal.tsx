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
  ChevronDown,
  Store as StoreIcon,
  Sparkles,
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

  const [selectedStoreIdState, setSelectedStoreIdState] = useState<string>('');

  useEffect(() => {
    if (explicitStoreId) {
      setSelectedStoreIdState(explicitStoreId);
    } else if (currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER') {
      setSelectedStoreIdState(currentUser.storeId || '');
    } else if (selectedStoreId && selectedStoreId !== 'all') {
      setSelectedStoreIdState(selectedStoreId);
    } else {
      setSelectedStoreIdState('');
    }
  }, [explicitStoreId, currentUser?.role, currentUser?.storeId, selectedStoreId, isOpen]);

  const effectiveStoreId = useMemo(() => {
    if (explicitStoreId) return explicitStoreId;
    if (selectedStoreIdState) return selectedStoreIdState;
    if (currentUser?.role === 'SELLER' || currentUser?.role === 'PARTNER') return currentUser.storeId || '';
    if (selectedStoreId && selectedStoreId !== 'all') return selectedStoreId;
    return '';
  }, [selectedStoreIdState, explicitStoreId, currentUser?.role, currentUser?.storeId, selectedStoreId]);

  const activeStore = useMemo(
    () => stores.find((s) => s.id === effectiveStoreId),
    [stores, effectiveStoreId]
  );
  const effectiveStoreName = explicitStoreName || (activeStore ? formatStoreName(activeStore.name) : 'Магазин');

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DailyClosingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showUsdInput, setShowUsdInput] = useState(false);

  const isCentralCashForbidden = (!effectiveStoreId || activeStore?.isMainWarehouse) && !summary?.alreadyClosed;

  // Form input states
  const [actualCashTjs, setActualCashTjs] = useState<string>('');
  const [actualCashUsd, setActualCashUsd] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [showConfirmDiscrepancy, setShowConfirmDiscrepancy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
        setActualCashTjs(String(data.closing.actualCashTjs));
        setActualCashUsd(String(data.closing.actualCashUsd));
        setComment(data.closing.comment || '');
      } else {
        setActualCashTjs('');
        setActualCashUsd('');
        setComment('');
        setShowDetails(false);
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

  // Calculations
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
    if (actualCashUsd.trim() === '') {
      return expectedUsd;
    }
    const val = parseFloat(actualCashUsd.replace(',', '.'));
    return Number.isFinite(val) ? val : expectedUsd;
  }, [actualCashUsd, expectedUsd]);

  const diffTjs = useMemo(() => {
    if (parsedActualTjs === null) return null;
    return Math.round((parsedActualTjs - expectedTjs) * 100) / 100;
  }, [parsedActualTjs, expectedTjs]);

  const diffUsd = useMemo(() => {
    if (actualCashUsd.trim() === '') return 0;
    if (parsedActualUsd === null) return null;
    return Math.round((parsedActualUsd - expectedUsd) * 100) / 100;
  }, [actualCashUsd, parsedActualUsd, expectedUsd]);

  const hasDiscrepancy = (diffTjs !== null && Math.abs(diffTjs) > 0.001) || (diffUsd !== null && Math.abs(diffUsd) > 0.001);

  // 1-Click Fast Autofill: Sets actual to expected
  const handleAutofillExpected = () => {
    setActualCashTjs(expectedTjs.toFixed(2));
    setActualCashUsd(expectedUsd.toFixed(2));
    soundEffects.playAddToCartSuccess();
  };

  // Submit closing
  const handleSubmitClosing = async () => {
    const finalStoreId = summary?.storeId || effectiveStoreId || selectedStoreIdState || explicitStoreId;
    if (!finalStoreId) {
      setError('Пожалуйста, выберите магазин для закрытия смены.');
      return;
    }

    if (parsedActualTjs === null) {
      setError('Пожалуйста, укажите фактически насчитанную сумму сомони (TJS).');
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
        actualCashUsd: parsedActualUsd ?? expectedUsd,
        comment: comment.trim() || undefined,
      };

      const result = await apiClient<DailyCashClosing>('/daily-closings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      soundEffects.playAddToCartSuccess();
      onClosed?.(result);
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

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={isCentralCashForbidden ? 'Кассовая смена' : summary?.alreadyClosed ? 'Z-отчёт смены' : 'Закрытие смены (Z-отчёт)'}
      subtitle={isCentralCashForbidden ? 'Центральная касса · Только просмотр' : `${effectiveStoreName} · ${summary?.businessDate || explicitBusinessDate || 'Сегодня'}`}
      maxWidth="md"
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {isCentralCashForbidden ? (
            <div className="w-full flex justify-end">
              <Button variant="primary" size="md" onClick={onClose}>
                Понятно
              </Button>
            </div>
          ) : summary?.alreadyClosed ? (
            <>
              <Button
                variant="secondary"
                size="md"
                leftIcon={Printer}
                onClick={handlePrint}
                className="hidden sm:inline-flex"
              >
                Печать Z-отчёта
              </Button>
              <div className="flex-1 sm:flex-initial flex justify-end">
                <Button variant="primary" size="md" onClick={onClose}>
                  Закрыть
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

              <Button
                variant="primary"
                size="md"
                onClick={handleSubmitClosing}
                loading={submitting}
                disabled={loading || parsedActualTjs === null}
                leftIcon={CheckCircle2}
                className="px-5 font-bold"
              >
                {showConfirmDiscrepancy ? 'Подтвердить закрытие' : 'Закрыть смену'}
              </Button>
            </>
          )}
        </div>
      }
    >
      {isCentralCashForbidden ? (
        <div className="p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <StoreIcon className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-fg">Смену закрывает кассир в магазине</h3>
          <p className="text-xs text-fg-subtle max-w-sm mx-auto leading-relaxed">
            Из центральной кассы закрывать смену нельзя. Закрытие выполняется непосредственно в розничном магазине кассиром или партнёром.
          </p>
        </div>
      ) : loading ? (
        <div className="p-8 text-center text-fg-subtle space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Расчёт остатка кассы...</p>
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
          {/* STATE 1: ALREADY CLOSED (Z-REPORT VIEW) */}
          {summary.alreadyClosed ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-success/15 border border-success/30 flex items-center justify-between gap-3 text-success">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">Смена закрыта</p>
                    <p className="text-xs text-success/80 flex items-center gap-1.5 flex-wrap mt-0.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{summary.closing?.closedByName}</span>
                      <span>·</span>
                      <Clock className="w-3.5 h-3.5" />
                      <span>{summary.closing?.createdAt ? new Date(summary.closing.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </p>
                  </div>
                </div>
                <Badge tone="success" className="px-2.5 py-1 text-xs shrink-0 font-bold uppercase">
                  Z-Отчёт ✓
                </Badge>
              </div>

              {/* Closed Cash Amounts */}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 rounded-xl bg-surface-raised border border-border">
                  <span className="text-[10px] uppercase font-bold text-fg-subtle block">Фактически сдано (TJS)</span>
                  <p className="text-lg font-bold font-mono text-fg mt-1">
                    {formatTjs(summary.closing?.actualCashTjs)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-surface-raised border border-border">
                  <span className="text-[10px] uppercase font-bold text-fg-subtle block">Расхождение</span>
                  <p className={`text-lg font-bold font-mono mt-1 ${Number(summary.closing?.differenceTjs) < 0 ? 'text-danger' : Number(summary.closing?.differenceTjs) > 0 ? 'text-info' : 'text-success'}`}>
                    {Number(summary.closing?.differenceTjs) === 0 ? '0.00 (Идеально)' : `${Number(summary.closing?.differenceTjs) > 0 ? '+' : ''}${formatTjs(summary.closing?.differenceTjs)}`}
                  </p>
                </div>
              </div>

              {summary.closing?.comment && (
                <div className="p-2.5 rounded-xl bg-surface border border-border text-xs text-fg-muted">
                  <span className="text-fg-subtle font-medium block text-[10px] uppercase">Комментарий:</span>
                  <p className="mt-0.5 italic">{summary.closing.comment}</p>
                </div>
              )}
            </div>
          ) : (
            /* STATE 2: ACTIVE SHIFT CLOSING (MAXIMUM SIMPLE FLOW) */
            <div className="space-y-3.5">
              {/* 1. HERO CARD: THE ONLY THING THE CASHIER NEEDS TO KNOW */}
              <div className="p-4 rounded-2xl bg-surface-raised border border-border text-center space-y-3 shadow-xs">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle block">
                    В кассе должно быть:
                  </span>
                  <div className="text-3xl font-black font-mono text-accent mt-1 tracking-tight">
                    {formatMoney(expectedTjs)} <span className="text-base font-bold text-fg-subtle">TJS</span>
                  </div>
                  {expectedUsd > 0 && (
                    <div className="text-xs font-mono text-fg-subtle mt-0.5">
                      + ${formatMoney(expectedUsd)} USD
                    </div>
                  )}
                </div>

                {/* THE 1-CLICK INSTANT MATCH BUTTON */}
                <button
                  type="button"
                  onClick={handleAutofillExpected}
                  className="w-full py-3 px-4 rounded-xl bg-accent text-accent-fg font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer shadow-sm select-none"
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Всё сходится ({formatMoney(expectedTjs)} TJS)</span>
                </button>
              </div>

              {/* 2. MANUAL ENTRY IF SUM DIFFERS */}
              <div className="p-3.5 rounded-xl bg-surface border border-border space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-fg">
                  <span>Фактически пересчитано:</span>
                  {actualCashTjs && (
                    <button
                      type="button"
                      onClick={() => { setActualCashTjs(''); setActualCashUsd(''); }}
                      className="text-[11px] text-fg-subtle hover:text-danger cursor-pointer"
                    >
                      Очистить
                    </button>
                  )}
                </div>

                {/* TJS Input */}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={actualCashTjs}
                    onChange={(e) => setActualCashTjs(e.target.value)}
                    placeholder={`Введите сумму, если не ${expectedTjs.toFixed(2)}`}
                    className="w-full h-11 px-3 pr-12 rounded-xl bg-surface-raised border border-border font-mono text-base font-bold text-fg placeholder:text-fg-subtle/50 placeholder:font-normal placeholder:text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-fg-subtle">
                    TJS
                  </span>
                </div>

                {/* Optional USD row toggle */}
                {(expectedUsd > 0 || showUsdInput) ? (
                  <div className="relative pt-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={actualCashUsd}
                      onChange={(e) => setActualCashUsd(e.target.value)}
                      placeholder={`USD (ожидалось: ${expectedUsd.toFixed(2)})`}
                      className="w-full h-10 px-3 pr-12 rounded-xl bg-surface-raised border border-border font-mono text-sm text-fg placeholder:text-fg-subtle/50 focus:outline-none focus:border-accent"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-fg-subtle">
                      USD
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowUsdInput(true)}
                    className="text-[11px] text-fg-subtle hover:text-accent font-medium cursor-pointer inline-flex items-center gap-1"
                  >
                    + Указать наличные доллары (USD)
                  </button>
                )}

                {/* LIVE DISCREPANCY STATUS */}
                {parsedActualTjs !== null && (
                  <div className="pt-1">
                    {diffTjs === 0 && (diffUsd === null || diffUsd === 0) ? (
                      <div className="p-2.5 rounded-lg bg-success/15 border border-success/30 flex items-center gap-2 text-success text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Касса сошлась идеально (0.00 TJS)</span>
                      </div>
                    ) : diffTjs !== null && diffTjs < 0 ? (
                      <div className="p-2.5 rounded-lg bg-danger/15 border border-danger/30 flex items-center gap-2 text-danger text-xs font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Недостача в кассе: -{formatMoney(Math.abs(diffTjs))} TJS</span>
                      </div>
                    ) : diffTjs !== null && diffTjs > 0 ? (
                      <div className="p-2.5 rounded-lg bg-info/15 border border-info/30 flex items-center gap-2 text-info text-xs font-bold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Излишек в кассе: +{formatMoney(diffTjs)} TJS</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Comment field (always visible if discrepancy, optional otherwise) */}
                {(hasDiscrepancy || comment) && (
                  <div className="pt-1">
                    <textarea
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={hasDiscrepancy ? 'Пожалуйста, укажите причину расхождения...' : 'Заметка по кассе (необязательно)...'}
                      className={`w-full p-2.5 rounded-xl bg-surface-raised border text-xs text-fg placeholder:text-fg-subtle/50 focus:outline-none focus:ring-1 resize-none ${
                        hasDiscrepancy && !comment.trim() && showConfirmDiscrepancy
                          ? 'border-warning focus:ring-warning'
                          : 'border-border focus:border-accent focus:ring-accent'
                      }`}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. COLLAPSIBLE SHIFT DETAILS (ALL 6 STATS HIDDEN UNTIL REQUESTED) */}
          <div className="border-t border-border/80 pt-2">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full py-2 px-3 rounded-xl bg-surface hover:bg-surface-raised border border-border text-xs text-fg-subtle hover:text-fg flex items-center justify-between transition-colors cursor-pointer select-none"
            >
              <span className="font-semibold flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-accent" />
                <span>Детали смены ({summary.salesCount} продаж, {summary.expensesCount} расходов)</span>
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </button>

            {showDetails && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs animate-in fade-in duration-200">
                {/* 1. Opening Cash */}
                <div className="p-2.5 rounded-xl bg-surface border border-border space-y-0.5">
                  <div className="flex items-center gap-1 text-fg-subtle text-[11px]">
                    <Building2 className="w-3 h-3" />
                    <span>Остаток на утро</span>
                  </div>
                  <p className="text-xs font-bold font-mono text-fg">
                    {formatMoney(summary.openingCashTjs)} TJS
                  </p>
                </div>

                {/* 2. Cash Sales */}
                <div className="p-2.5 rounded-xl bg-surface border border-border space-y-0.5">
                  <div className="flex items-center justify-between text-success text-[11px]">
                    <span className="flex items-center gap-1">
                      <Banknote className="w-3 h-3" />
                      <span>Продажи (нал)</span>
                    </span>
                    <span className="font-mono text-[10px] text-fg-subtle">
                      {summary.salesCount}
                    </span>
                  </div>
                  <p className="text-xs font-bold font-mono text-success">
                    +{formatMoney(summary.salesCashTjs)} TJS
                  </p>
                </div>

                {/* 3. Card Sales */}
                <div className="p-2.5 rounded-xl bg-surface border border-border space-y-0.5">
                  <div className="flex items-center gap-1 text-info text-[11px]">
                    <CreditCard className="w-3 h-3" />
                    <span>Безнал (карта)</span>
                  </div>
                  <p className="text-xs font-bold font-mono text-fg">
                    {formatMoney(summary.salesCardTjs)} TJS
                  </p>
                </div>

                {/* 4. Expenses */}
                <div className="p-2.5 rounded-xl bg-surface border border-border space-y-0.5">
                  <div className="flex items-center justify-between text-danger text-[11px]">
                    <span className="flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      <span>Расходы кассы</span>
                    </span>
                    <span className="font-mono text-[10px] text-fg-subtle">
                      {summary.expensesCount}
                    </span>
                  </div>
                  <p className="text-xs font-bold font-mono text-danger">
                    -{formatMoney(summary.expensesCashTjs)} TJS
                  </p>
                </div>

                {/* 5. Refunds */}
                <div className="p-2.5 rounded-xl bg-surface border border-border space-y-0.5">
                  <div className="flex items-center justify-between text-warning text-[11px]">
                    <span className="flex items-center gap-1">
                      <ArrowDownRight className="w-3 h-3" />
                      <span>Возвраты</span>
                    </span>
                    <span className="font-mono text-[10px] text-fg-subtle">
                      {summary.refundsCount}
                    </span>
                  </div>
                  <p className="text-xs font-bold font-mono text-warning">
                    -{formatMoney(summary.refundsCashTjs)} TJS
                  </p>
                </div>

                {/* 6. Cash Collections */}
                <div className="p-2.5 rounded-xl bg-surface border border-border space-y-0.5">
                  <div className="flex items-center justify-between text-fg-subtle text-[11px]">
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-accent" />
                      <span>Инкассация</span>
                    </span>
                    <span className="font-mono text-[10px]">
                      {summary.collectionsCount}
                    </span>
                  </div>
                  <p className="text-xs font-bold font-mono text-fg">
                    -{formatMoney(summary.collectionsCashTjs)} TJS
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation warning for discrepancy */}
          {!summary.alreadyClosed && showConfirmDiscrepancy && (
            <div className="p-3 rounded-xl bg-warning/15 border border-warning/40 text-warning text-xs space-y-1 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Зафиксировано расхождение с кассовым расчётом!</span>
              </div>
              <p className="text-[11px] leading-relaxed text-warning/90">
                Разница: <strong>{diffTjs !== null ? `${diffTjs > 0 ? '+' : ''}${diffTjs} TJS` : '0'}</strong>.
                Нажмите «Подтвердить закрытие» для сохранения Z-отчёта.
              </p>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
};
