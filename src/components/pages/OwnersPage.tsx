import React, { useState, useMemo, useEffect } from 'react';
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
  Briefcase,
  TrendingUp,
  CreditCard,
  Coins
} from 'lucide-react';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';

export const OwnersPage: React.FC = () => {
  const {
    currentUser,
    owners,
    users,
    ownerTransactions,
    todayRate,
    createOwnerTransaction,
    updateOwnerProfitShares,
    closeQuarterPeriod
  } = useApp();

  const displayOwners = useMemo(() => {
    if (owners.length >= 2) return owners;
    const adminUser = users.find(u => u.role === 'ADMIN' || u.id === 'user-admin' || u.login === 'admin');
    const partnerUser = users.find(u => u.role === 'PARTNER' || u.id === 'user-partner' || u.login === 'partner');

    const o1 = owners[0] || {
      id: adminUser?.id || 'owner-1',
      name: adminUser?.name || 'Администратор',
      profitSharePercent: 50,
      capitalBalanceUsd: 0,
      totalAccruedProfitUsd: 0,
      totalPaidProfitUsd: 0,
      totalReinvestedUsd: 0,
      availableProfitUsd: 0
    };
    const o2 = owners[1] || {
      id: partnerUser?.id || 'owner-2',
      name: partnerUser?.name || 'Партнер',
      profitSharePercent: 50,
      capitalBalanceUsd: 0,
      totalAccruedProfitUsd: 0,
      totalPaidProfitUsd: 0,
      totalReinvestedUsd: 0,
      availableProfitUsd: 0
    };
    return [o1, o2];
  }, [owners, users]);

  const getOwnerDetails = (owner: { id: string; name?: string }, index: number) => {
    const adminUser = users.find(u => u.role === 'ADMIN' || u.id === 'user-admin' || u.login === 'admin');
    const partnerUser = users.find(u => u.role === 'PARTNER' || u.id === 'user-partner' || u.login === 'partner');

    if (owner.id === 'owner-1' || owner.id === adminUser?.id || index === 0) {
      return {
        name: adminUser?.name || owner.name || 'Администратор',
        roleTag: 'АДМИНИСТРАТОР',
        roleSub: 'Главный администратор & Владелец бизнеса'
      };
    }
    return {
      name: partnerUser?.name || owner.name || 'Партнер',
      roleTag: 'ПАРТНЕР',
      roleSub: 'Партнер & Соучредитель бизнеса'
    };
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

  // Owners load asynchronously — resync once they arrive.
  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
    }
  }, [owners, selectedOwnerId]);

  const [txType, setTxType] = useState<'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST'>('PROFIT_PAYOUT');
  const [amountUsd, setAmountUsd] = useState('');
  const [note, setNote] = useState('');

  // History filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PROFIT_PAYOUT' | 'INVESTMENT' | 'WITHDRAWAL' | 'REINVEST'>('ALL');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('ALL');

  const [statusBanner, setStatusBanner] = useState<StatusMessage | null>(null);

  const rate = todayRate?.rate || 9.5;

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-fg-muted text-xs">
        <p className="font-bold text-fg uppercase">Доступ ограничен</p>
        <p className="mt-1 text-fg-subtle">Раздел собственников доступен только администраторам и партнерам</p>
      </div>
    );
  }

  const openSharesModal = () => {
    const init: Record<string, string> = {};
    owners.forEach(o => {
      init[o.id] = (o.profitSharePercent ?? 0).toString();
    });
    setSharesInput(init);
    setStatusBanner(null);
    setIsSharesModalOpen(true);
  };

  const openTxModalForOwner = (ownerId: string, defaultType: 'INVESTMENT' | 'PROFIT_PAYOUT' | 'WITHDRAWAL' | 'REINVEST') => {
    setSelectedOwnerId(ownerId);
    setTxType(defaultType);
    setAmountUsd('');
    setNote('');
    setStatusBanner(null);
    setIsTxModalOpen(true);
  };

  const handleShareInputChange = (changedOwnerId: string, valueStr: string) => {
    setSharesInput(prev => {
      const nextState = { ...prev, [changedOwnerId]: valueStr };

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
      setStatusBanner({
        tone: 'error',
        text: `Сумма долей должна быть строго 100% (сейчас ${total}%)`
      });
      return;
    }

    const res = await updateOwnerProfitShares(payload[0]?.sharePercent || 0, payload[1]?.sharePercent || 0);
    if (res.success) {
      setIsSharesModalOpen(false);
      setStatusBanner({
        tone: 'success',
        text: 'Доли партнеров успешно обновлены'
      });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка сохранения долей' });
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);

    const val = parseFloat(amountUsd) || 0;
    if (val <= 0) {
      setStatusBanner({ tone: 'error', text: 'Укажите корректную сумму ($ USD)' });
      return;
    }

    const currentOwner = owners.find(o => o.id === selectedOwnerId);

    if (txType === 'REINVEST' && currentOwner) {
      if (val > (currentOwner.availableProfitUsd ?? 0)) {
        setStatusBanner({
          tone: 'error',
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
      setStatusBanner({
        tone: 'success',
        text: `Операция «${typeText}» на сумму $${val.toLocaleString()} успешно проведена`
      });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка транзакции' });
    }
  };

  const handleConfirmCloseQuarter = async () => {
    const quarterName = `${selectedQuarter} ${selectedQuarterYear}`;
    const res = await closeQuarterPeriod({
      quarterName,
      transferRemainingToCapital
    });

    if (res.success) {
      setIsQuarterModalOpen(false);
      setStatusBanner({
        tone: 'success',
        text: `Финансовый период «Квартал ${quarterName}» официально закрыт.`
      });
    } else {
      setStatusBanner({ tone: 'error', text: res.message || 'Ошибка закрытия квартала' });
    }
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return ownerTransactions.filter((tx) => {
      if (typeFilter !== 'ALL' && tx.type !== typeFilter) {
        return false;
      }
      if (selectedOwnerFilter !== 'ALL' && tx.ownerId !== selectedOwnerFilter) {
        return false;
      }
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg">
      <StatusBanner message={statusBanner} onDismiss={() => setStatusBanner(null)} />

      {/* Row 1: Top Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-surface flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-fg flex items-center space-x-2 uppercase tracking-wide">
            <PieChart className="w-4 h-4 text-accent" />
            <span>ПАРТНЕРЫ И КАПИТАЛ БИЗНЕСА</span>
          </h3>
          <p className="text-xs text-fg-muted mt-0.5">
            Учет уставных вложений, распределения долей прибыли и выплат дивидендов учредителям
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setStatusBanner(null);
              setIsQuarterModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 text-xs font-bold transition-colors"
            title="Сформировать квартальный отчёт партнеров и закрыть финансовый период"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Квартальный отчет</span>
          </button>

          <button
            onClick={openSharesModal}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-surface-raised hover:bg-surface border border-border text-fg text-xs font-bold transition-colors"
          >
            <Percent className="w-3.5 h-3.5 text-accent" />
            <span>Доли партнеров</span>
          </button>

          <button
            onClick={() => openTxModalForOwner(owners[0]?.id || '', 'PROFIT_PAYOUT')}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent-strong active:scale-95 text-xs font-bold text-accent-fg uppercase tracking-wider flex items-center space-x-1.5 transition-colors shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Провести операцию</span>
          </button>
        </div>
      </div>

      {/* Row 2: Top Summary KPI Cards Bar */}
      <div className="p-3 sm:p-4 border-b border-border bg-bg shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Total Capital */}
          <div className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block font-semibold">Общий вложенный капитал</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl font-bold text-fg">
                  ${totalCapitalInvested.toLocaleString()}
                </span>
                <span className="text-xs text-fg-subtle font-medium">USD</span>
              </div>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                ≈ {(Math.round(totalCapitalInvested * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>

          {/* Card 2: Accrued Profit */}
          <div className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block font-semibold">Начислено прибыли</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl font-bold text-fg">
                  ${totalAccruedProfit.toLocaleString()}
                </span>
                <span className="text-xs text-fg-subtle font-medium">USD</span>
              </div>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                ≈ {(Math.round(totalAccruedProfit * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-xl bg-info/10 border border-info/20 text-info shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          {/* Card 3: Paid Profit */}
          <div className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block font-semibold">Выплачено дивидендов</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl font-bold text-accent">
                  ${totalPayouts.toLocaleString()}
                </span>
                <span className="text-xs text-fg-subtle font-medium">USD</span>
              </div>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                ≈ {(Math.round(totalPayouts * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 text-accent shrink-0">
              <Coins className="w-4 h-4" />
            </div>
          </div>

          {/* Card 4: Available Profit */}
          <div className="p-3.5 rounded-xl bg-surface border border-border flex items-start justify-between">
            <div>
              <span className="text-[10px] text-fg-subtle uppercase block font-semibold">К выплате партнерам</span>
              <div className="flex items-baseline space-x-1.5 mt-1">
                <span className="text-xl font-bold text-warning">
                  ${totalAvailableProfit.toLocaleString()}
                </span>
                <span className="text-xs text-fg-subtle font-medium">USD</span>
              </div>
              <span className="text-[10px] text-fg-muted block mt-0.5">
                ≈ {(Math.round(totalAvailableProfit * rate)).toLocaleString()} TJS
              </span>
            </div>
            <div className="p-2 rounded-xl bg-warning/10 border border-warning/20 text-warning shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-4 bg-bg">
        {/* Section 1: Owners Cards (2-Column Grid) */}
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-bold text-fg uppercase tracking-wider flex items-center space-x-2">
              <Briefcase className="w-4 h-4 text-accent" />
              <span>СОБСТВЕННИКИ И ВЛОЖЕНИЯ ({owners.length})</span>
            </span>
            <span className="text-xs text-fg-subtle">2 учредителя бизнеса</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayOwners.map((owner, idx) => {
              const info = getOwnerDetails(owner, idx);
              const capitalTjs = Math.round((owner.capitalBalanceUsd ?? 0) * rate);
              return (
                <div
                  key={owner.id}
                  className="p-4 rounded-xl bg-surface-raised border border-border hover:border-fg-subtle transition-all space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header of Partner Card */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center text-accent font-bold text-sm shadow-xs shrink-0">
                          {info.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <h4 className="text-xs sm:text-sm font-bold text-fg">{info.name}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent uppercase tracking-wider">
                              {info.roleTag}
                            </span>
                          </div>
                          <span className="text-xs text-fg-subtle block mt-0.5">{info.roleSub}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-bold">
                          {owner.profitSharePercent ?? 0}% ДОЛИ
                        </span>
                      </div>
                    </div>

                    {/* Share Progress Bar */}
                    <div className="w-full bg-surface h-2 rounded-full overflow-hidden p-0.5 border border-border">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, owner.profitSharePercent || 0))}%` }}
                      />
                    </div>

                    {/* Capital Investment Display */}
                    <div className="p-3 rounded-xl bg-surface border border-border space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-fg-subtle uppercase">
                        <span>ЛИЧНО ВЛОЖЕНО В ОБОРОТ (КАПИТАЛ):</span>
                        <span className="text-accent font-bold">ВЛОЖЕНИЕ</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-base sm:text-lg text-fg font-bold">
                          ${(owner.capitalBalanceUsd ?? 0).toLocaleString()} USD
                        </span>
                        <span className="text-xs text-fg-subtle">
                          ≈ {capitalTjs.toLocaleString()} TJS
                        </span>
                      </div>
                    </div>

                    {/* Profit Breakdown Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-surface border border-border">
                        <span className="text-fg-subtle block text-[10px] uppercase">Начислено прибыли</span>
                        <span className="text-fg font-bold text-xs mt-0.5 block">
                          ${(owner.totalAccruedProfitUsd ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-surface border border-border">
                        <span className="text-fg-subtle block text-[10px] uppercase">Выплачено дивидендов</span>
                        <span className="text-accent font-bold text-xs mt-0.5 block">
                          ${(owner.totalPaidProfitUsd ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Available for Payout Banner */}
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mt-2">
                    <div>
                      <span className="text-fg-subtle text-[10px] uppercase block">Остаток к выплате:</span>
                      <span className="font-bold text-warning text-sm mt-0.5 block">
                        ${(owner.availableProfitUsd ?? 0).toLocaleString()} USD
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'INVESTMENT')}
                        className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-raised text-accent border border-border text-xs font-bold transition-colors"
                        title="Внести новые личные средства в капитал"
                      >
                        + ЛИЧНЫЕ
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'REINVEST')}
                        className="px-2.5 py-1 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning border border-warning/40 text-xs font-bold transition-colors flex items-center space-x-1"
                        title="Реинвестировать остаток к выплате в бизнес"
                      >
                        <span>🔄 ВЛОЖИТЬ ОСТАТОК</span>
                      </button>
                      <button
                        onClick={() => openTxModalForOwner(owner.id, 'PROFIT_PAYOUT')}
                        className="px-2.5 py-1 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent border border-accent/30 text-xs font-bold transition-colors"
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
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <CreditCard className="w-4 h-4 text-accent" />
              <span className="font-bold text-xs text-fg uppercase tracking-wide">
                ИСТОРИЯ ФИНАНСОВЫХ ОПЕРАЦИЙ
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold">
                {filteredTransactions.length} событий
              </span>
            </div>
          </div>

          {/* Controls Bar: Search & Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative w-full sm:w-64 md:w-80">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-fg-subtle" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск по партнеру / примечанию / сумме..."
                  className="w-full rounded-xl bg-surface-raised border border-border pl-9 pr-8 py-1.5 text-xs text-fg placeholder-fg-subtle focus:border-accent focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-fg-subtle hover:text-fg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={selectedOwnerFilter}
                onChange={(e) => setSelectedOwnerFilter(e.target.value)}
                className="bg-surface-raised border border-border text-fg text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent shrink-0"
              >
                <option value="ALL">Все партнеры</option>
                {displayOwners.map((o, idx) => (
                  <option key={o.id} value={o.id}>{getOwnerDetails(o, idx).name}</option>
                ))}
              </select>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none shrink-0">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                  typeFilter === 'ALL'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
                }`}
              >
                Все операции
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('INVESTMENT')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                  typeFilter === 'INVESTMENT'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
                }`}
              >
                Личные вложения
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('REINVEST')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                  typeFilter === 'REINVEST'
                    ? 'border-warning bg-warning/10 text-warning'
                    : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
                }`}
              >
                Реинвестирование
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('PROFIT_PAYOUT')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                  typeFilter === 'PROFIT_PAYOUT'
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
                }`}
              >
                Выплаты прибыли
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('WITHDRAWAL')}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold uppercase whitespace-nowrap transition-colors ${
                  typeFilter === 'WITHDRAWAL'
                    ? 'border-danger bg-danger/10 text-danger'
                    : 'border-border bg-surface-raised text-fg-muted hover:text-fg'
                }`}
              >
                Вывод капитала
              </button>
            </div>
          </div>

          {/* Transactions Feed List */}
          <div className="space-y-2.5 pt-1">
            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-fg-muted text-xs space-y-2">
                <CreditCard className="w-8 h-8 mx-auto opacity-30 text-fg-subtle" />
                <p className="uppercase font-bold tracking-wider">История транзакций пуста</p>
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const isDeposit = tx.type === 'INVESTMENT';
                const isReinvest = tx.type === 'REINVEST';
                const isPayout = tx.type === 'PROFIT_PAYOUT';
                const tjsVal = Math.round((tx.amountUsd || 0) * rate);

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-xl bg-surface-raised border border-border hover:border-fg-subtle transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-start space-x-3 min-w-0">
                      <div className={`p-2.5 rounded-xl shrink-0 border ${
                        isReinvest ? 'bg-warning/10 border-warning/30 text-warning' :
                        isDeposit ? 'bg-accent/10 border-accent/30 text-accent' :
                        isPayout ? 'bg-info/10 border-info/30 text-info' :
                        'bg-danger/10 border-danger/30 text-danger'
                      }`}>
                        {isReinvest ? <Coins className="w-4 h-4" /> :
                         isDeposit ? <ArrowDownLeft className="w-4 h-4" /> :
                         isPayout ? <ArrowUpRight className="w-4 h-4" /> :
                         <Wallet className="w-4 h-4 text-danger" />}
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${
                            isReinvest ? 'bg-warning/10 border-warning/30 text-warning' :
                            isDeposit ? 'bg-accent/10 border-accent/30 text-accent' :
                            isPayout ? 'bg-info/10 border-info/30 text-info' :
                            'bg-danger/10 border-danger/30 text-danger'
                          }`}>
                            {isReinvest ? '🔄 РЕИНВЕСТИРОВАНИЕ' : isDeposit ? '📥 ВНЕСЕНИЕ КАПИТАЛА' : isPayout ? '📤 ВЫПЛАТА ПРИБЫЛИ' : '🏦 ВЫВОД КАПИТАЛА'}
                          </span>

                          <span className="text-xs font-bold text-fg">
                            {tx.ownerName}
                          </span>
                        </div>

                        {tx.note && (
                          <p className="text-xs text-fg-muted wrap-break-word">
                            {tx.note}
                          </p>
                        )}

                        <div className="flex items-center space-x-2 text-[10px] text-fg-subtle">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>Провел: <strong className="text-fg font-semibold">{tx.createdByName || 'Администратор'}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 border-t sm:border-t-0 border-border pt-2 sm:pt-0">
                      <span className={`text-sm font-bold block ${isDeposit ? 'text-accent' : 'text-warning'}`}>
                        {isDeposit ? '+' : '-'}${tx.amountUsd?.toLocaleString()} USD
                      </span>
                      <span className="text-[10px] text-fg-subtle block">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveShares} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-fg uppercase tracking-wide flex items-center space-x-2">
                <Percent className="w-4 h-4 text-accent" />
                <span>ДОЛИ ПАРТНЕРОВ В БИЗНЕСЕ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="text-fg-subtle hover:text-fg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fg-muted">
              Укажите процент доли каждого партнера. Сумма должна составлять строго 100%.
            </p>

            <div className="space-y-3">
              {displayOwners.map((owner, idx) => (
                <div key={owner.id}>
                  <label className="block text-[11px] uppercase font-semibold text-fg-subtle mb-1">
                    {getOwnerDetails(owner, idx).name} (%)
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
                      className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-xs text-accent font-bold focus:border-accent focus:outline-none pr-8"
                    />
                    <span className="absolute right-3 top-2.5 text-fg-subtle font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsSharesModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted border border-border uppercase"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase"
              >
                Сохранить
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Capital Transaction */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <form onSubmit={handleCreateTx} className="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 text-fg shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-fg uppercase flex items-center space-x-2">
                <CreditCard className="w-4 h-4 text-accent" />
                <span>ОПЕРАЦИЯ С КАПИТАЛОМ</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="text-fg-subtle hover:text-fg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">ПАРТНЕР *</label>
                <select
                  value={selectedOwnerId ?? ''}
                  onChange={(e) => setSelectedOwnerId(e.target.value)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs font-semibold focus:border-accent focus:outline-none"
                >
                  {displayOwners.map((o, idx) => (
                    <option key={o.id} value={o.id}>{getOwnerDetails(o, idx).name} ({o.profitSharePercent ?? 0}% доли)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">ТИП ОПЕРАЦИИ *</label>
                <select
                  value={txType ?? 'PROFIT_PAYOUT'}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs font-semibold focus:border-accent focus:outline-none"
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
                    <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-fg-muted">Остаток к выплате партнера:</span>
                        <strong className="text-warning font-bold">${availProfit.toLocaleString()} USD</strong>
                      </div>

                      {txType === 'REINVEST' && availProfit > 0 && (
                        <button
                          type="button"
                          onClick={() => setAmountUsd(availProfit.toString())}
                          className="w-full py-1.5 px-2 rounded-lg bg-warning/20 hover:bg-warning/30 text-warning text-xs font-bold border border-warning/40 flex items-center justify-center space-x-1 transition-colors"
                        >
                          <span>⚡ ВЛОЖИТЬ ВЕСЬ ОСТАТОК (${availProfit.toLocaleString()})</span>
                        </button>
                      )}

                      <p className="text-[11px] text-fg-subtle leading-snug">
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
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">СУММА ($ USD) *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={amountUsd ?? ''}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-accent text-xs font-bold focus:border-accent focus:outline-none pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-fg-subtle font-bold">$</span>
                </div>
              </div>

              <div>
                <label className="block text-fg-subtle text-[11px] uppercase mb-1 font-semibold">ОСНОВАНИЕ / ПРИМЕЧАНИЕ</label>
                <input
                  type="text"
                  value={note ?? ''}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Дополнительное вложение в оборот"
                  className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-fg text-xs focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="flex space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted border border-border uppercase"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent-strong text-xs font-bold text-accent-fg uppercase"
              >
                Провести
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Quarterly Report & Period Settlement */}
      {isQuarterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-surface border border-warning/40 p-5 text-fg shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h4 className="text-sm font-bold text-warning uppercase tracking-wide flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-warning" />
                <span>📊 КВАРТАЛЬНЫЙ ОТЧЕТ И ЗАКРЫТИЕ ФИНАНСОВОГО ПЕРИОДА</span>
              </h4>
              <button type="button" onClick={() => setIsQuarterModalOpen(false)} className="text-fg-subtle hover:text-fg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quarter & Year Selector Controls */}
            <div className="grid grid-cols-2 gap-3 bg-surface-raised p-3 rounded-xl border border-border">
              <div>
                <label className="block text-[11px] text-fg-subtle uppercase mb-1 font-bold">ОТЧЕТНЫЙ КВАРТАЛ *</label>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(e.target.value as any)}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-warning font-bold focus:border-warning focus:outline-none"
                >
                  <option value="Q1">Q1 (1-й Квартал: Январь - Март)</option>
                  <option value="Q2">Q2 (2-й Квартал: Апрель - Июнь)</option>
                  <option value="Q3">Q3 (3-й Квартал: Июль - Сентябрь)</option>
                  <option value="Q4">Q4 (4-й Квартал: Октябрь - Декабрь)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-fg-subtle uppercase mb-1 font-bold">ОТЧЕТНЫЙ ГОД *</label>
                <select
                  value={selectedQuarterYear}
                  onChange={(e) => setSelectedQuarterYear(parseInt(e.target.value))}
                  className="w-full rounded-xl bg-surface border border-border px-3 py-2 text-xs text-fg font-bold focus:border-warning focus:outline-none"
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
                <span className="font-bold text-fg uppercase">Сводная ведомость по партнерам:</span>
                <span className="text-[11px] text-fg-subtle">Валюта отчета: USD ($)</span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface text-[10px] text-fg-subtle uppercase border-b border-border">
                    <tr>
                      <th className="p-2.5">Партнер</th>
                      <th className="p-2.5 text-center">Доля</th>
                      <th className="p-2.5 text-right">Начислено ($)</th>
                      <th className="p-2.5 text-right">Выплачено ($)</th>
                      <th className="p-2.5 text-right">Реинвестировано ($)</th>
                      <th className="p-2.5 text-right text-warning">Остаток ($)</th>
                      <th className="p-2.5 text-right">Капитал ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-xs">
                    {displayOwners.map((o, idx) => (
                      <tr key={o.id} className="hover:bg-surface/50">
                        <td className="p-2.5 font-bold text-fg">{getOwnerDetails(o, idx).name}</td>
                        <td className="p-2.5 text-center text-fg-subtle">{o.profitSharePercent || 0}%</td>
                        <td className="p-2.5 text-right font-semibold text-fg">${(o.totalAccruedProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right text-info">${(o.totalPaidProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right text-accent">${(o.totalReinvestedUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-warning">${(o.availableProfitUsd || 0).toLocaleString()}</td>
                        <td className="p-2.5 text-right font-semibold text-fg">${(o.capitalBalanceUsd || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-surface font-bold border-t border-border text-xs">
                    <tr>
                      <td colSpan={2} className="p-2.5 uppercase text-fg-subtle">ИТОГО КВАРТАЛ:</td>
                      <td className="p-2.5 text-right text-fg">${displayOwners.reduce((sum, o) => sum + (o.totalAccruedProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-info">${displayOwners.reduce((sum, o) => sum + (o.totalPaidProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-accent">${displayOwners.reduce((sum, o) => sum + (o.totalReinvestedUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-warning">${displayOwners.reduce((sum, o) => sum + (o.availableProfitUsd || 0), 0).toLocaleString()}</td>
                      <td className="p-2.5 text-right text-fg">${displayOwners.reduce((sum, o) => sum + (o.capitalBalanceUsd || 0), 0).toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Quarter Settlement Option Checkbox */}
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 space-y-2">
              <label className="flex items-start space-x-2.5 cursor-pointer text-fg text-xs">
                <input
                  type="checkbox"
                  checked={transferRemainingToCapital}
                  onChange={(e) => setTransferRemainingToCapital(e.target.checked)}
                  className="rounded bg-surface border-border text-warning focus:ring-0 mt-0.5"
                />
                <div>
                  <strong className="block text-warning">Автоматически реинвестировать невыплаченный остаток в капитал</strong>
                  <span className="text-[11px] text-fg-subtle block mt-0.5">
                    При установке этой галочки все невыплаченные средства партнеров будут зачислены в их оборотный капитал бизнеса до обнуления периода.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsQuarterModalOpen(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-surface-raised hover:bg-surface text-xs font-bold text-fg-muted border border-border uppercase"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseQuarter}
                className="flex-1 py-2.5 px-3 rounded-xl bg-warning hover:bg-warning/90 text-xs font-bold uppercase text-black shadow-xs transition-colors"
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
