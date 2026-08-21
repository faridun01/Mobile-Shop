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
  Calendar,
  Filter,
  DollarSign,
  Briefcase,
  TrendingUp,
  CreditCard
} from 'lucide-react';

export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    ownerTransactions,
    todayRate,
    createOwnerTransaction,
    updateOwnerProfitShares
  } = useApp();

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isSharesModalOpen, setIsSharesModalOpen] = useState(false);

  // Shares edit state
  const [sharesInput, setSharesInput] = useState<Record<string, string>>({});

  // Tx state
  const [selectedOwnerId, setSelectedOwnerId] = useState(owners[0]?.id || '');
  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT'>('PROFIT_PAYOUT');
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  // History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PROFIT_PAYOUT' | 'INVESTMENT' | 'WITHDRAWAL'>('ALL');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const rate = todayRate?.rate || 9.5;

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        <p className="font-bold">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Раздел собственников доступен только администраторам</p>
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

  const handleSaveShares = (e: React.FormEvent) => {
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

    const res = updateOwnerProfitShares(payload);
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

  const handleCreateTx = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const val = parseFloat(amountUsd) || 0;
    if (val <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите корректную сумму ($ USD)' });
      return;
    }

    const res = createOwnerTransaction({
      ownerId: selectedOwnerId,
      type: txType,
      amountUsd: val,
      note: note.trim() || undefined
    });

    if (res.success) {
      setIsTxModalOpen(false);
      setAmountUsd('');
      setNote('');
      setStatusMessage({
        type: 'success',
        text: `Операция на сумму $${val.toLocaleString()} успешно проведена`
      });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка транзакции' });
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
  const totalPayouts = owners.reduce((acc, o) => acc + (o.totalPaidProfitUsd ?? 0), 0);
  const totalAvailableProfit = owners.reduce((acc, o) => acc + (o.availableProfitUsd ?? 0), 0);

  // Stats of filtered transactions
  const filteredInvestments = filteredTransactions
    .filter(t => t.type === 'INVESTMENT')
    .reduce((acc, t) => acc + (t.amountUsd || 0), 0);

  const filteredPayouts = filteredTransactions
    .filter(t => t.type === 'PROFIT_PAYOUT' || t.type === 'WITHDRAWAL')
    .reduce((acc, t) => acc + (t.amountUsd || 0), 0);

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
      {/* Top Header */}
      <div className="p-3 sm:p-3.5 border-b border-slate-800 bg-[#0F1219] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-xs font-bold text-slate-100 flex items-center space-x-2 uppercase">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <span>ПАРТНЕРЫ И КАПИТАЛ</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Капитал: <strong className="text-slate-100 font-bold">${totalCapitalInvested.toLocaleString()}</strong> • 
            Выплачено: <strong className="text-emerald-400 font-bold">${totalPayouts.toLocaleString()}</strong> • 
            К распределению: <strong className="text-amber-400 font-bold">${totalAvailableProfit.toLocaleString()}</strong>
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={openSharesModal}
            className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-200 flex items-center space-x-1.5 border border-slate-800 hover:border-slate-700 transition-colors"
          >
            <Percent className="w-3.5 h-3.5 text-emerald-400" />
            <span>ДОЛИ ПАРТНЕРОВ</span>
          </button>

          <button
            onClick={() => setIsTxModalOpen(true)}
            className="px-3.5 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-white flex items-center space-x-1.5 shadow-[0_0_12px_rgba(16,185,129,0.5)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>ПРОВЕСТИ ОПЕРАЦИЮ</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 mt-2 p-2.5 rounded text-xs flex items-center justify-between shrink-0 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-800' : 'bg-rose-950/40 text-rose-300 border border-rose-800'
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

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800 overflow-hidden">
        {/* Left Column: Owners Overview Cards (4 cols on lg) */}
        <div className="lg:col-span-4 p-3.5 space-y-3 overflow-y-auto bg-[#0F1219]/30">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
              <span>СОБСТВЕННИКИ БИЗНЕСА</span>
            </span>
            <span className="text-[10px] text-slate-500">{owners.length} партнера</span>
          </div>

          <div className="space-y-3">
            {owners.map((owner) => (
              <div
                key={owner.id}
                className="p-3.5 rounded-xl bg-[#0F1219] border border-slate-800/90 shadow-sm space-y-3 relative overflow-hidden"
              >
                {/* Header of Partner Card */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 font-bold text-xs">
                      {owner.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-100">{owner.name}</h4>
                      <span className="text-[10px] text-slate-400">Партнер / Инвестор</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-800/80 text-emerald-400 text-xs font-bold">
                      {owner.profitSharePercent ?? 0}%
                    </span>
                  </div>
                </div>

                {/* Visual share bar */}
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, owner.profitSharePercent || 0))}%` }}
                  />
                </div>

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2 rounded bg-[#0B0E14] border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Вложенный капитал</span>
                    <span className="font-mono text-slate-200 font-bold text-xs">
                      ${(owner.capitalBalanceUsd ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-[#0B0E14] border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px]">Выведено прибыли</span>
                    <span className="font-mono text-emerald-400 font-bold text-xs">
                      ${(owner.totalPaidProfitUsd ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Available for Payout Banner */}
                <div className="p-2.5 rounded bg-amber-950/20 border border-amber-900/40 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px]">К выплате:</span>
                  <span className="font-bold text-amber-400 text-xs font-mono">
                    ${(owner.availableProfitUsd ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Sleek Redesigned Transactions Ledger (8 cols on lg) */}
        <div className="lg:col-span-8 flex flex-col overflow-hidden bg-[#0B0E14]">
          {/* Header & Controls Bar */}
          <div className="p-3 border-b border-slate-800 bg-[#0F1219] space-y-2.5 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs text-slate-100 uppercase">
                  ИСТОРИЯ ОПЕРАЦИЙ
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">
                  {filteredTransactions.length} зап.
                </span>
              </div>

              {filteredTransactions.length > 0 && (
                <button
                  onClick={handleExportTransactions}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 text-[11px] font-bold transition-colors shrink-0 self-start sm:self-auto"
                  title="Экспорт в CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ЭКСПОРТ (CSV)</span>
                </button>
              )}
            </div>

            {/* Search Input & Partner Selector */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск: партнер / примечание / сумма..."
                  className="w-full rounded bg-[#0B0E14] border border-slate-800 pl-8 pr-8 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
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
                className="bg-[#0B0E14] border border-slate-800 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 shrink-0"
              >
                <option value="ALL">Все партнеры</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>

            {/* Type Filter Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto text-[10px]">
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-2.5 py-1 rounded font-bold uppercase transition-colors shrink-0 bg-transparent ${
                  typeFilter === 'ALL'
                    ? 'text-[#22c55e] border border-[#22c55e]/50'
                    : 'text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                ВСЕ ОПЕРАЦИИ
              </button>
              <button
                onClick={() => setTypeFilter('PROFIT_PAYOUT')}
                className={`px-2.5 py-1 rounded font-bold uppercase transition-colors shrink-0 flex items-center space-x-1 bg-transparent ${
                  typeFilter === 'PROFIT_PAYOUT'
                    ? 'text-[#22c55e] border border-[#22c55e]/50'
                    : 'text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <ArrowUpRight className="w-3 h-3" />
                <span>ВЫПЛАТЫ ПРИБЫЛИ</span>
              </button>
              <button
                onClick={() => setTypeFilter('INVESTMENT')}
                className={`px-2.5 py-1 rounded font-bold uppercase transition-colors shrink-0 flex items-center space-x-1 bg-transparent ${
                  typeFilter === 'INVESTMENT'
                    ? 'text-[#22c55e] border border-[#22c55e]/50'
                    : 'text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <ArrowDownLeft className="w-3 h-3" />
                <span>ВНЕСЕНИЯ КАПИТАЛА</span>
              </button>
              <button
                onClick={() => setTypeFilter('WITHDRAWAL')}
                className={`px-2.5 py-1 rounded font-bold uppercase transition-colors shrink-0 flex items-center space-x-1 bg-transparent ${
                  typeFilter === 'WITHDRAWAL'
                    ? 'text-[#22c55e] border border-[#22c55e]/50'
                    : 'text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <Wallet className="w-3 h-3" />
                <span>ВЫВОД КАПИТАЛА</span>
              </button>
            </div>
          </div>

          {/* Quick Ledger Summary Strip */}
          <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#0B0E14] border-b border-slate-800/80 text-xs shrink-0">
            <div className="p-2 rounded-lg bg-[#0F1219] border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Внесено капитала:</span>
              </div>
              <strong className="text-emerald-400 font-bold">${filteredInvestments.toLocaleString()}</strong>
            </div>

            <div className="p-2 rounded-lg bg-[#0F1219] border border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] text-slate-400">Выплачено / выведено:</span>
              </div>
              <strong className="text-emerald-400 font-bold">${filteredPayouts.toLocaleString()}</strong>
            </div>
          </div>

          {/* Transaction Items Feed */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 bg-[#0B0E14]">
            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono">
                <CreditCard className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-40" />
                <p className="text-xs">Операции не найдены</p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Нажмите «Провести операцию», чтобы внести инвестицию или оформить выплату
                </p>
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const isInvest = tx.type === 'INVESTMENT';
                const isPayout = tx.type === 'PROFIT_PAYOUT';
                const isWithdraw = tx.type === 'WITHDRAWAL';

                return (
                  <div
                    key={tx.id}
                    className="p-3 sm:p-3.5 hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-3"
                  >
                    {/* Left: Icon + Description */}
                    <div className="flex items-start space-x-3 min-w-0">
                      {/* Operation Icon Badge */}
                      <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                        isInvest
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : isPayout
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {isInvest ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : isPayout ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <Wallet className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-100 truncate">
                            {tx.ownerName}
                          </span>

                          <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${
                            isInvest
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isPayout
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {isInvest ? 'ВНЕСЕНИЕ КАПИТАЛА' : isPayout ? 'ВЫПЛАТА ПРИБЫЛИ' : 'ВЫВОД КАПИТАЛА'}
                          </span>
                        </div>

                        {tx.note && (
                          <p className="text-xs text-slate-300 font-normal leading-relaxed">
                            {tx.note}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 font-mono">
                          <span className="flex items-center space-x-1 text-slate-400">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{tx.date}</span>
                          </span>
                          <span>•</span>
                          <span>Оператор: <strong className="text-slate-400">{tx.createdByName || 'Администратор'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount */}
                    <div className="text-right shrink-0 pl-2">
                      <div className={`text-sm sm:text-base font-mono font-bold ${
                        isInvest ? 'text-emerald-400' : 'text-emerald-400'
                      }`}>
                        {isInvest ? '+' : '-'}${ (tx.amountUsd ?? 0).toLocaleString() }
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        ~{Math.round((tx.amountUsd ?? 0) * rate).toLocaleString()} TJS
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Edit Partner Shares */}
      {isSharesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveShares} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-4 sm:p-5 text-slate-200 shadow-2xl space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold uppercase text-white flex items-center space-x-2">
                <Percent className="w-4 h-4 text-emerald-400" />
                <span>ДОЛИ ПАРТНЕРОВ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              Укажите процент доли каждого партнера. Общая сумма должна составлять строго 100%.
            </p>

            <div className="space-y-2.5">
              {owners.map(owner => (
                <div key={owner.id}>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">
                    {owner.name} (%)
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
                      className="w-full rounded-lg bg-[#0B0E14] border border-slate-700 px-3 py-2 text-xs text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="absolute right-3 top-2 text-slate-500 font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800">
              <span className="text-slate-400 text-[11px]">Итого:</span>
              <span className={`font-bold ${
                Math.abs(owners.reduce((acc, o) => acc + (parseFloat(sharesInput[o.id] || '0') || 0), 0) - 100) < 0.01
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}>
                {owners.reduce((acc, o) => acc + (parseFloat(sharesInput[o.id] || '0') || 0), 0)}% / 100%
              </span>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 border border-slate-800"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-white uppercase"
              >
                СОХРАНИТЬ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Capital Transaction */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateTx} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-slate-800 p-4 sm:p-5 text-slate-200 shadow-2xl space-y-3.5 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h4 className="text-xs font-bold text-white uppercase flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>ОПЕРАЦИЯ С КАПИТАЛОМ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Партнер</label>
                <select
                  value={selectedOwnerId ?? ''}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  {owners.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.profitSharePercent ?? 0}%)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Тип операции</label>
                <select
                  value={txType ?? 'PROFIT_PAYOUT'}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  <option value="PROFIT_PAYOUT">Выплата чистой прибыли / дивидендов</option>
                  <option value="INVESTMENT">Внесение инвестиций / пополнение</option>
                  <option value="WITHDRAWAL">Вывод капитала</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Сумма ($ USD)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={amountUsd ?? ''}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-700 px-3 py-2 text-emerald-400 text-xs font-bold focus:border-emerald-500 focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-2 text-slate-500 font-bold">$</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">Основание / Примечание</label>
                <input
                  type="text"
                  value={note ?? ''}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Дивиденды за отчетный период"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-700 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
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
    </div>
  );
};
