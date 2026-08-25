import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Plus,
  PieChart,
  Percent,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  User,
  Search,
  Download,
  Briefcase,
  TrendingUp,
  CreditCard,
  Building,
  Coins,
  Receipt
} from 'lucide-react';

export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    users,
    ownerTransactions,
    sales,
    expenses,
    todayRate,
    createOwnerTransaction,
    updateOwnerProfitShares,
    resetAllOwnerCapital,
    closeQuarterPeriod
  } = useApp();

  const getOwnerDisplayName = (owner: { id: string; name?: string }) => {
    if (owner.id === 'owner-1') {
      const adminUser = users.find(u => u.role === 'ADMIN' || u.id === 'user-admin' || u.login === 'admin');
      if (adminUser) return adminUser.name;
    }
    if (owner.id === 'owner-2') {
      const partnerUser = users.find(u => u.role === 'PARTNER' || u.id === 'user-partner' || u.login === 'partner');
      if (partnerUser) return partnerUser.name;
    }
    const matched = users.find(u => u.id === owner.id || u.name === owner.name);
    return matched ? matched.name : (owner.name || 'Партнер');
  };

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isSharesModalOpen, setIsSharesModalOpen] = useState(false);
  const [isQuarterModalOpen, setIsQuarterModalOpen] = useState(false);

  // Quarter Report state
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [selectedQuarterYear, setSelectedQuarterYear] = useState<number>(2026);
  const [transferRemainingToCapital, setTransferRemainingToCapital] = useState(true);

  // Shares edit state
  const [sharesInput, setSharesInput] = useState<Record<string, string>>({});

  // Tx state
  const [selectedOwnerId, setSelectedOwnerId] = useState(owners[0]?.id || '');
  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST'>('PROFIT_PAYOUT');
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  // History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PROFIT_PAYOUT' | 'INVESTMENT' | 'WITHDRAWAL' | 'REINVEST'>('ALL');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const rate = todayRate?.rate || 9.5;

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        <p className="font-bold text-slate-300">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Раздел собственников доступен только администраторам и партнерам</p>
      </div>
    );
  }

  const openSharesModal = () => {
    const init: Record<string, string> = {};
    owners.forEach(o => {
      init[o.id] = (o.profitSharePercent ?? 0).toString();
    });
    setSharesInput(init);
    setStatusMessage(null);
    setIsSharesModalOpen(true);
  };

  const openTxModalForOwner = (ownerId: string, defaultType: 'INVESTMENT' | 'PROFIT_PAYOUT' | 'WITHDRAWAL' | 'REINVEST') => {
    setSelectedOwnerId(ownerId);
    setTxType(defaultType);
    setAmountUsd('');
    setNote('');
    setStatusMessage(null);
    setIsTxModalOpen(true);
  };

  const handleShareInputChange = (changedOwnerId: string, valueStr: string) => {
    setSharesInput(prev => {
      const nextState = { ...prev, [changedOwnerId]: valueStr };

      // If there are 2 owners, automatically fill the other partner's share to total 100%
      if (owners.length === 2) {
        const otherOwner = owners.find(o => o.id !== changedOwnerId);
        if (otherOwner) {
          const parsed = parseFloat(valueStr);
          if (!isNaN(parsed)) {
            const complement = Math.max(0, Math.min(100, Math.round((100 - parsed) * 10) / 10));
            nextState[otherOwner.id] = complement.toString();
          } else if (valueStr === '') {
            nextState[otherOwner.id] = '';
          }
        }
      }
      return nextState;
    });
  };

  const handleSaveShares = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = owners.map(o => ({
      ownerId: o.id,
      sharePercent: parseFloat(sharesInput[o.id] || '0') || 0
    }));

    const total = payload.reduce((acc, p) => acc + p.sharePercent, 0);
    if (Math.abs(total - 100) > 0.01) {
      setStatusMessage({
        type: 'error',
        text: `Сумма долей должна быть строго 100% (сейчас ${total}%)`
      });
      return;
    }

    const res = await updateOwnerProfitShares(payload[0]?.sharePercent || 0, payload[1]?.sharePercent || 0);
    if (res.success) {
      setIsSharesModalOpen(false);
      setStatusMessage({
        type: 'success',
        text: 'Доли партнеров успешно обновлены'
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка сохранения долей' });
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const val = parseFloat(amountUsd) || 0;
    if (val <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите корректную сумму ($ USD)' });
      return;
    }

    const currentOwner = owners.find(o => o.id === selectedOwnerId);

    if (txType === 'REINVEST' && currentOwner) {
      if (val > (currentOwner.availableProfitUsd ?? 0)) {
        setStatusMessage({
          type: 'error',
          text: `Сумма реинвестирования ($${val}) превышает доступный остаток к выплате ($${currentOwner.availableProfitUsd ?? 0})`
        });
        return;
      }
    }

    const res = await createOwnerTransaction({
      ownerId: selectedOwnerId,
      type: txType,
      amountUsd: val,
      note: note.trim() || undefined
    });

    if (res.success) {
      setIsTxModalOpen(false);
      setAmountUsd('');
      setNote('');
      const typeText = txType === 'REINVEST' ? 'Реинвестирование из остатка к выплате' : txType === 'INVESTMENT' ? 'Вложение личного капитала' : txType === 'PROFIT_PAYOUT' ? 'Выплата прибыли' : 'Изъятие капитала';
      setStatusMessage({
        type: 'success',
        text: `Операция «${typeText}» на сумму $${val.toLocaleString()} успешно проведена`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка транзакции' });
    }
  };

  const handleExportQuarterlyReport = () => {
    const headers = ['Партнер', 'Доля %', 'Начислено за квартал ($)', 'Выплачено дивидендов ($)', 'Реинвестировано ($)', 'Остаток к выплате ($)', 'Капитал на конец квартала ($)'];
    const rows = owners.map(o => [
      getOwnerDisplayName(o),
      `${o.profitSharePercent || 0}%`,
      o.totalAccruedProfitUsd || 0,
      o.totalPaidProfitUsd || 0,
      o.totalReinvestedUsd || 0,
      o.availableProfitUsd || 0,
      o.capitalBalanceUsd || 0
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF'
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Квартальный_отчет_${selectedQuarter}_${selectedQuarterYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmCloseQuarter = async () => {
    const quarterName = `${selectedQuarter} ${selectedQuarterYear}`;
    const res = await closeQuarterPeriod({
      quarterName,
      transferRemainingToCapital
    });

    if (res.success) {
      setIsQuarterModalOpen(false);
      setStatusMessage({
        type: 'success',
        text: `Финансовый период «Квартал ${quarterName}» официально закрыт. Сформирован квартальный отчет, показатели начислений обнулены для нового квартала.`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка закрытия квартала' });
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return ownerTransactions.filter((tx) => {
      // Type filter
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      // Owner filter
      if (selectedOwnerFilter !== 'ALL' && tx.ownerId !== selectedOwnerFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesOwner = (tx.ownerName || '').toLowerCase().includes(q);
        const matchesNote = (tx.note || '').toLowerCase().includes(q);
        const matchesOperator = (tx.createdByName || '').toLowerCase().includes(q);
        const matchesAmount = (tx.amountUsd?.toString() || '').includes(q);
        if (!matchesOwner && !matchesNote && !matchesOperator && !matchesAmount) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [ownerTransactions, typeFilter, selectedOwnerFilter, searchQuery]);

  const totalCapitalInvested = owners.reduce((acc, o) => acc + (o.capitalBalanceUsd ?? 0), 0);
  const totalAccruedProfit = owners.reduce((acc, o) => acc + (o.totalAccruedProfitUsd ?? 0), 0);
  const totalPayouts = owners.reduce((acc, o) => acc + (o.totalPaidProfitUsd ?? 0), 0);
  const totalAvailableProfit = owners.reduce((acc, o) => acc + (o.availableProfitUsd ?? 0), 0);

  // Helper to export transactions to CSV
  const handleExportTransactions = () => {
    if (filteredTransactions.length === 0) return;
    const headers = ['ID', 'Дата и время', 'Партнер', 'Тип операции', 'Сумма ($)', 'Сумма (TJS)', 'Основание', 'Оператор'];
    const rows = filteredTransactions.map(tx => [
      tx.id,
      tx.date,
      tx.ownerName,
      tx.type === 'INVESTMENT' ? 'Внесение капитала' : tx.type === 'PROFIT_PAYOUT' ? 'Выплата прибыли' : 'Вывод капитала',
      tx.amountUsd,
      Math.round(tx.amountUsd * rate),
      `"${(tx.note || '').replace(/"/g, '""')}"`,
      tx.createdByName || 'Администратор'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `История_операций_партнеры_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300 font-mono">
      {/* Header Bar */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0F1219] space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center space-x-2 uppercase">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span>ПАРТНЕРЫ И КАПИТАЛ БИЗНЕСА</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Учет уставных вложений, распределения долей прибыли и выплат дивидендов учредителям
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setStatusMessage(null);
                setIsQuarterModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-bold transition-colors"
              title="Сформировать квартальный отчёт партнеров и закрыть финансовый период"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>📊 КВАРТАЛЬНЫЙ ОТЧЕТ И ЗАКРЫТИЕ</span>
            </button>

            <button
              onClick={openSharesModal}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition-colors"
            >
              <Percent className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">ДОЛИ ПАРТНЕРОВ</span>
            </button>

            <button
              onClick={() => openTxModalForOwner(owners[0]?.id || '', 'PROFIT_PAYOUT')}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 uppercase tracking-wider flex items-center space-x-1.5 transition-colors shadow-[0_0_12px_rgba(16,185,129,0.4)] shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>ПРОВЕСТИ ОПЕРАЦИЮ</span>
            </button>
          </div>
        </div>

        {/* 4 High-Tech Top Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Total Capital */}
          <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-start justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">ОБЩИЙ ВЛОЖЕННЫЙ КАПИТАЛ</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-xl font-bold text-slate-100">
                  ${totalCapitalInvested.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">USD</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono block mt-1">
                ≈ {(Math.round(totalCapitalInvested * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>

          {/* Card 2: Accrued Profit */}
          <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-start justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">НАЧИСЛЕННОЙ ПРИБЫЛИ</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-xl font-bold text-slate-100">
                  ${totalAccruedProfit.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">USD</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono block mt-1">
                ≈ {(Math.round(totalAccruedProfit * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          {/* Card 3: Paid Profit */}
          <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-start justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">ВЫПЛАЧЕНО ДИВИДЕНДОВ</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-xl font-bold text-emerald-400">
                  ${totalPayouts.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">USD</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono block mt-1">
                ≈ {(Math.round(totalPayouts * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <Coins className="w-4 h-4" />
            </div>
          </div>

          {/* Card 4: Available Profit */}
          <div className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 flex items-start justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase block">К ВЫПЛАТЕ ПАРТНЕРАМ</span>
              <div className="flex items-baseline space-x-2 mt-1">
                <span className="text-xl font-bold text-amber-400">
                  ${totalAvailableProfit.toLocaleString()}
                </span>
                <span className="text-xs text-slate-400 font-mono">USD</span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono block mt-1">
                ≈ {(Math.round(totalAvailableProfit * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-3 p-2.5 rounded-lg text-xs font-mono flex items-center justify-between shrink-0 ${statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
          }`}>
          <div className="flex items-center space-x-2 min-w-0">
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="truncate">{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white ml-2">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 bg-[#0B0E14]">
        {/* Section 1: Owners Cards (Side by Side 2-Column Grid) */}
        <div className="p-4 rounded-xl bg-[#0F1219] border border-slate-800 space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <span className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-emerald-400" />
              <span>СОБСТВЕННИКИ И ВЛОЖЕНИЯ ({owners.length})</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">2 учредителя бизнеса</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {owners.map((owner) => {
              const capitalTjs = Math.round((owner.capitalBalanceUsd ?? 0) * rate);
              return (
                <div
                  key={owner.id}
                  className="p-4 rounded-xl bg-[#0B0E14] border border-slate-800 hover:border-slate-700 transition-all space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header of Partner Card */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 font-bold text-sm shadow-inner">
                          {getOwnerDisplayName(owner).substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-100">{getOwnerDisplayName(owner)}</h4>
                          <span className="text-[10px] text-slate-400">Соучредитель бизнеса</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                          {owner.profitSharePercent ?? 0}% ДОЛИ
                        </span>
                      </div>
                    </div>

                    {/* Share Progress Bar */}
                    <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                        style={{ width: `${Math.min(100, Math.max(0, owner.profitSharePercent || 0))}%` }}
                      />
                    </div>

                    {/* Prominent Capital Investment Display */}
                    <div className="p-3 rounded-lg bg-[#0F1219] border border-emerald-500/30 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
                        <span>ЛИЧНО ВЛОЖЕНО В ОБОРОТ (КАПИТАЛ):</span>
                        <span className="text-emerald-400 font-bold">ВЛОЖЕНИЕ</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-lg text-slate-100 font-bold">
                          ${(owner.capitalBalanceUsd ?? 0).toLocaleString()} USD
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          ≈ {capitalTjs.toLocaleString()} TJS
                        </span>
                      </div>
                    </div>

                    {/* Profit Breakdown Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#0F1219] border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase">Начислено прибыли</span>
                        <span className="font-mono text-slate-200 font-bold text-xs mt-0.5 block">
                          ${(owner.totalAccruedProfitUsd ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#0F1219] border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase">Выплачено дивидендов</span>
                        <span className="font-mono text-emerald-400 font-bold text-xs mt-0.5 block">
                          ${(owner.totalPaidProfitUsd ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Available for Payout Banner */}
                  <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mt-2">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase block">Остаток к выплате:</span>
                      <span className="font-bold text-amber-400 text-sm font-mono mt-0.5 block">
                        ${(owner.availableProfitUsd ?? 0).toLocaleString()} USD
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'INVESTMENT')}
                        className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 text-[11px] font-bold transition-colors"
                        title="Внести новые личные средства в капитал"
                      >
                        + ЛИЧНЫЕ
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'REINVEST')}
                        className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition-colors flex items-center space-x-1"
                        title="Реинвестировать остаток к выплате в бизнес"
                      >
                        <span>🔄 ВЛОЖИТЬ ОСТАТОК</span>
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'PROFIT_PAYOUT')}
                        className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-800 text-[11px] font-bold transition-colors"
                        title="Выплатить прибыль на руки"
                      >
                        ↑ ВЫПЛАТИТЬ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 2: Full Width Transactions Feed */}
        <div className="p-4 rounded-xl bg-[#0F1219] border border-slate-800 space-y-3.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-xs text-slate-100 uppercase">
                ИСТОРИЯ ФИНАНСОВЫХ ОПЕРАЦИЙ
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                {filteredTransactions.length} событий
              </span>
            </div>

            {filteredTransactions.length > 0 && (
              <button
                onClick={handleExportTransactions}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-bold transition-colors shrink-0"
                title="Скачать историю в CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ЭКСПОРТ (CSV)</span>
              </button>
            )}
          </div>

          {/* Controls Bar: Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по партнеру / примечанию / сумме..."
                  className="w-full rounded-md bg-[#0B0E14] border border-slate-800 pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={selectedOwnerFilter}
                onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                className="bg-[#0B0E14] border border-slate-800 text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 shrink-0"
              >
                <option value="ALL">Все партнеры</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{getOwnerDisplayName(o)}</option>
                ))}
              </select>
            </div>

            {/* Photo-Style Pill Filter Buttons */}
            <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${typeFilter === 'ALL'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
              >
                ВСЕ ОПЕРАЦИИ
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('INVESTMENT')}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${typeFilter === 'INVESTMENT'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
              >
                ЛИЧНЫЕ ВЛОЖЕНИЯ
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('REINVEST')}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${typeFilter === 'REINVEST'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
              >
                РЕИНВЕСТИРОВАНИЕ
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('PROFIT_PAYOUT')}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${typeFilter === 'PROFIT_PAYOUT'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
              >
                ВЫПЛАТЫ ПРИБЫЛИ
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('WITHDRAWAL')}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${typeFilter === 'WITHDRAWAL'
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
              >
                ВЫВОД КАПИТАЛА
              </button>
            </div>
          </div>

          {/* Transactions Feed List */}
          <div className="space-y-2.5 pt-1">
            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-xs space-y-2">
                <CreditCard className="w-8 h-8 mx-auto opacity-20 text-slate-400" />
                <p className="uppercase font-bold tracking-wider">История транзакций пуста</p>
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const isDeposit = tx.type === 'INVESTMENT';
                const isReinvest = tx.type === 'REINVEST';
                const isPayout = tx.type === 'PROFIT_PAYOUT';
                const isWithdrawal = tx.type === 'WITHDRAWAL';
                const tjsVal = Math.round((tx.amountUsd || 0) * rate);

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-xl bg-[#0B0E14] border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-start space-x-3 min-w-0">
                      <div className={`p-2.5 rounded-lg shrink-0 border ${
                        isReinvest ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                        isDeposit ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                        isPayout ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' :
                        'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}>
                        {isReinvest ? <Coins className="w-4 h-4" /> :
                         isDeposit ? <ArrowDownLeft className="w-4 h-4" /> :
                         isPayout ? <ArrowUpRight className="w-4 h-4" /> :
                         <Wallet className="w-4 h-4" />}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                            isReinvest ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                            isDeposit ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                            isPayout ? 'bg-sky-500/10 border-sky-500/30 text-sky-400' :
                            'bg-rose-500/10 border-rose-500/30 text-rose-400'
                          }`}>
                            {isReinvest ? '🔄 РЕИНВЕСТИРОВАНИЕ' : isDeposit ? '📥 ВНЕСЕНИЕ КАПИТАЛА' : isPayout ? '📤 ВЫПЛАТА ПРИБЫЛИ' : '🏦 ВЫВОД КАПИТАЛА'}
                          </span>

                          <span className="text-xs font-bold text-slate-200">
                            {tx.ownerName}
                          </span>
                        </div>

                        {tx.note && (
                          <p className="text-xs text-slate-300 font-mono wrap-break-word">
                            {tx.note}
                          </p>
                        )}

                        <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-mono">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>Провел: <strong className="text-slate-400">{tx.createdByName || 'Администратор'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono border-t sm:border-t-0 border-slate-800/60 pt-2 sm:pt-0">
                      <span className={`text-sm font-bold block ${isDeposit ? 'text-emerald-400' : 'text-amber-400'
                        }`}>
                        {isDeposit ? '+' : '-'}${tx.amountUsd?.toLocaleString()} USD
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        ≈ {isDeposit ? '+' : '-'}{tjsVal.toLocaleString()} TJS
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Edit Shares Percent */}
      {isSharesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <form onSubmit={handleSaveShares} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Percent className="w-4 h-4 text-emerald-400" />
                <span>ДОЛИ ПАРТНЕРОВВ БИЗНЕСЕ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Укажите процент доли каждого партнера. Сумма должна составлять строго 100%.
            </p>

            <div className="space-y-2.5">
              {owners.map(owner => (
                <div key={owner.id}>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    {getOwnerDisplayName(owner)} (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      required
                      value={sharesInput[owner.id] ?? ''}
                      onChange={(e) => handleShareInputChange(owner.id, e.target.value)}
                      className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-xs text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-slate-500 font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 border border-slate-800"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 uppercase"
              >
                СОХРАНИТЬ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Capital Transaction */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <form onSubmit={handleCreateTx} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>ОПЕРАЦИЯ С КАПИТАЛОМ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ПАРТНЕР *</label>
                <select
                  value={selectedOwnerId ?? ''}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{getOwnerDisplayName(o)} ({o.profitSharePercent ?? 0}% доли)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ТИП ОПЕРАЦИИ *</label>
                <select
                  value={txType ?? 'PROFIT_PAYOUT'}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="INVESTMENT">📥 Внесение капитала (Личные внешние средства)</option>
                  <option value="REINVEST">🔄 Реинвестирование в бизнес (Из Остатка к выплате)</option>
                  <option value="PROFIT_PAYOUT">📤 Выплата чистой прибыли / дивидендов ($)</option>
                  <option value="WITHDRAWAL">🏦 Изъятие / Вывод капитала ($)</option>
                </select>
              </div>

              {/* Helper box for INVESTMENT / REINVEST */}
              {(() => {
                const currentOwner = owners.find(o => o.id === selectedOwnerId);
                const availProfit = currentOwner?.availableProfitUsd ?? 0;

                if (txType === 'REINVEST' || txType === 'INVESTMENT') {
                  return (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2 font-mono">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Остаток к выплате партнера:</span>
                        <strong className="text-amber-400 font-bold">${availProfit.toLocaleString()} USD</strong>
                      </div>

                      {txType === 'REINVEST' && availProfit > 0 && (
                        <button
                          type="button"
                          onClick={() => setAmountUsd(availProfit.toString())}
                          className="w-full py-1.5 px-2 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/40 flex items-center justify-center space-x-1 transition-colors"
                        >
                          <span>⚡ ВЛОЖИТЬ ВЕСЬ ОСТАТОК (${availProfit.toLocaleString()})</span>
                        </button>
                      )}

                      <p className="text-[10px] text-slate-400 leading-snug">
                        {txType === 'REINVEST'
                          ? '★ Выбранный остаток к выплате будет зачислен в капитал бизнеса без выдачи наличных на руки.'
                          : '★ Внесение дополнительных личных средств владельца.'}
                      </p>
                    </div>
                  );
                }
                return null;
              })()}

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">СУММА ($ USD) *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={amountUsd ?? ''}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-emerald-400 text-xs font-bold focus:border-emerald-500 focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-2 text-slate-500 font-bold">$</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ОСНОВАНИЕ / ПРИМЕЧАНИЕ</label>
                <input
                  type="text"
                  value={note ?? ''}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Дополнительное вложение в оборот"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 border border-slate-800"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-white uppercase"
              >
                ПРОВЕСТИ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Quarterly Report & Period Settlement */}
      {isQuarterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-2xl rounded-xl bg-[#0F1219] border border-amber-500/40 p-5 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-amber-400" />
                <span>📊 КВАРТАЛЬНЫЙ ОТЧЕТ И ЗАКРЫТИЕ ФИНАНСОВОГО ПЕРИОДА</span>
              </h4>
              <button type="button" onClick={() => setIsQuarterModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quarter & Year Selector Controls */}
            <div className="grid grid-cols-2 gap-3 bg-[#0B0E14] p-3 rounded-lg border border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-1 font-bold">ОТЧЕТНЫЙ КВАРТАЛ *</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value as any)}
                  className="w-full rounded-md bg-[#0F1219] border border-slate-800 px-3 py-1.5 text-xs text-amber-300 font-bold focus:border-amber-500 focus:outline-none"
                >
                  <option value="Q1">Q1 (1-й Квартал: Январь - Март)</option>
                  <option value="Q2">Q2 (2-й Квартал: Апрель - Июнь)</option>
                  <option value="Q3">Q3 (3-й Квартал: Июль - Сентябрь)</option>
                  <option value="Q4">Q4 (4-й Квартал: Октябрь - Декабрь)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase mb-1 font-bold">ОТЧЕТНЫЙ ГОД *</label>
                <select
                  value={selectedQuarterYear}
                  onChange={(e) => setSelectedQuarterYear(parseInt(e.target.value))}
                  className="w-full rounded-md bg-[#0F1219] border border-slate-800 px-3 py-1.5 text-xs text-slate-100 font-bold focus:border-amber-500 focus:outline-none"
                >
                  <option value={2026}>2026 год</option>
                  <option value={2025}>2025 год</option>
                  <option value={2024}>2024 год</option>
                </select>
              </div>
            </div>

            {/* Breakdown Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 uppercase">Сводная ведомость по партнерам:</span>
                <span className="text-[10px] text-slate-500 font-mono">Валюта отчета: USD ($)</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0E14]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#0F1219] text-[10px] text-slate-400 uppercase border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Партнер</th>
                      <th className="p-2.5 text-center">Доля</th>
                      <th className="p-2.5 text-right">Начислено ($)</th>
                      <th className="p-2.5 text-right">Выплачено ($)</th>
                      <th className="p-2.5 text-right">Реинвестировано ($)</th>
                      <th className="p-2.5 text-right text-amber-400">Остаток ($)</th>
                      <th className="p-2.5 text-right">Капитал ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-[11px]">
                    {owners.map(o => (
                      <tr key={o.id} className="hover:bg-slate-900/40">
                        <td className="p-2.5 font-bold text-slate-200">{getOwnerDisplayName(o)}</td>
                        <td className="p-2.5 text-center text-slate-400">{o.profitSharePercent || 0}%</td>
                        <td className="p-2.5 text-right font-semibold text-slate-100">${(o.totalAccruedProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right text-sky-400">${(o.totalPaidProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right text-emerald-400">${(o.totalReinvestedUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-amber-400">${(o.availableProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-semibold text-slate-200">${(o.capitalBalanceUsd || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#0F1219] font-bold border-t border-slate-800 text-[11px]">
                    <tr>
                      <td colSpan={2} className="p-2.5 uppercase text-slate-400">ИТОГО КВАРТАЛ:</td>
                      <td className="p-2.5 text-right text-slate-100">${owners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-sky-400">${owners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-emerald-400">${owners.reduce((sum, o) => sum + (o.totalReinvestedUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-amber-400">${owners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-slate-100">${owners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Quarter Settlement Option Checkbox */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
              <label className="flex items-start space-x-2.5 cursor-pointer text-slate-200 text-xs">
                <input
                  type="checkbox"
                  checked={transferRemainingToCapital}
                  onChange={(e) => setTransferRemainingToCapital(e.target.checked)}
                  className="rounded bg-[#0B0E14] border-slate-700 text-amber-500 focus:ring-0 mt-0.5"
                />
                <div>
                  <strong className="block text-amber-300">Автоматически реинвестировать невыплаченный остаток в капитал</strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    При установке этой галочки все невыплаченные средства партнеров будут зачислены в их оборотный капитал бизнеса до обнуления периода.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleExportQuarterlyReport}
                className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-center space-x-1.5 transition-colors"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span>СКАЧАТЬ ОТЧЕТ (CSV)</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmCloseQuarter}
                className="flex-1 py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold uppercase text-slate-950 shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-colors"
              >
                🧹 ЗАКРЫТЬ КВАРТАЛ И ОБНУЛИТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
