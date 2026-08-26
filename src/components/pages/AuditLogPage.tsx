import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { exportAuditLogsReport } from '../../utils/exportReports';
import {
  ShieldCheck,
  Search,
  Download,
  Filter,
  ShoppingCart,
  PackagePlus,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Repeat,
  RotateCcw,
  Wallet,
  Receipt,
  DollarSign,
  UserCheck,
  Trash2,
  Store as StoreIcon,
  Wrench,
  FileText,
  Clock,
  User as UserIcon,
  Lock,
  X,
  Calendar
} from 'lucide-react';

const ACTION_CONFIG: Record<string, { label: string; icon: any; colorClass: string; borderClass: string; bgClass: string }> = {
  SALE: { label: 'ПРОДАЖА', icon: ShoppingCart, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  SALE_BELOW_COST: { label: 'ПРОДАЖА НИЖЕ СЕБЕСТОИМОСТИ', icon: ShoppingCart, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  PURCHASE: { label: 'ПРИХОД ТОВАРА', icon: PackagePlus, colorClass: 'text-sky-400', borderClass: 'border-sky-500/30', bgClass: 'bg-sky-500/10' },
  TRANSFER_REQUEST: { label: 'ЗАПРОС ПЕРЕМЕЩЕНИЯ', icon: ArrowRightLeft, colorClass: 'text-purple-400', borderClass: 'border-purple-500/30', bgClass: 'bg-purple-500/10' },
  TRANSFER_APPROVAL: { label: 'ПЕРЕМЕЩЕНИЕ ПОДТВЕРЖДЕНО', icon: CheckCircle2, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  TRANSFER_REJECT: { label: 'ПЕРЕМЕЩЕНИЕ ОТКЛОНЕНО', icon: XCircle, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  TRANSFER: { label: 'ПРЯМОЕ ПЕРЕМЕЩЕНИЕ', icon: ArrowRightLeft, colorClass: 'text-purple-400', borderClass: 'border-purple-500/30', bgClass: 'bg-purple-500/10' },
  EXCHANGE: { label: 'ОБМЕН (TRADE-IN)', icon: Repeat, colorClass: 'text-amber-400', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-500/10' },
  REFUND: { label: 'ВОЗВРАТ ТОВАРА', icon: RotateCcw, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  SUPPLIER_PAYMENT: { label: 'ВЫПЛАТА ПОСТАВЩИКУ', icon: Wallet, colorClass: 'text-teal-400', borderClass: 'border-teal-500/30', bgClass: 'bg-teal-500/10' },
  SUPPLIER_CREATE: { label: 'ДОБАВЛЕН ПОСТАВЩИК', icon: Wallet, colorClass: 'text-teal-400', borderClass: 'border-teal-500/30', bgClass: 'bg-teal-500/10' },
  SUPPLIER_BONUS: { label: 'БОНУС ОТ ПОСТАВЩИКА', icon: Wallet, colorClass: 'text-teal-400', borderClass: 'border-teal-500/30', bgClass: 'bg-teal-500/10' },
  EXPENSE: { label: 'ОПЕРАЦИОННЫЙ РАСХОД', icon: Receipt, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  RATE_SET: { label: 'КУРС ВАЛЮТ', icon: DollarSign, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  RATE_CHANGE: { label: 'КУРС ВАЛЮТ', icon: DollarSign, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  USER_CREATE: { label: 'СОЗДАН СОТРУДНИК', icon: UserCheck, colorClass: 'text-indigo-400', borderClass: 'border-indigo-500/30', bgClass: 'bg-indigo-500/10' },
  USER_UPDATE: { label: 'ОБНОВЛЕН СОТРУДНИК', icon: UserCheck, colorClass: 'text-indigo-400', borderClass: 'border-indigo-500/30', bgClass: 'bg-indigo-500/10' },
  USER_DELETE: { label: 'УДАЛЕН СОТРУДНИК', icon: Trash2, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  USER_STATUS_CHANGE: { label: 'СТАТУС СОТРУДНИКА ИЗМЕНЕН', icon: UserCheck, colorClass: 'text-indigo-400', borderClass: 'border-indigo-500/30', bgClass: 'bg-indigo-500/10' },
  PASSWORD_RESET: { label: 'СБРОС ПАРОЛЯ', icon: UserCheck, colorClass: 'text-indigo-400', borderClass: 'border-indigo-500/30', bgClass: 'bg-indigo-500/10' },
  STORE_CREATE: { label: 'СОЗДАН ФИЛИАЛ', icon: StoreIcon, colorClass: 'text-sky-400', borderClass: 'border-sky-500/30', bgClass: 'bg-sky-500/10' },
  STORE_UPDATE: { label: 'ОБНОВЛЕН ФИЛИАЛ', icon: StoreIcon, colorClass: 'text-sky-400', borderClass: 'border-sky-500/30', bgClass: 'bg-sky-500/10' },
  STORE_DELETE: { label: 'УДАЛЕН ФИЛИАЛ', icon: Trash2, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  REPAIR_INTAKE: { label: 'ПРИЕМ В РЕМОНТ', icon: Wrench, colorClass: 'text-amber-400', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-500/10' },
  REPAIR_STATUS_CHANGE: { label: 'СТАТУС РЕМОНТА', icon: Wrench, colorClass: 'text-amber-400', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-500/10' },
  OWNER_INVESTMENT: { label: 'ИНВЕСТИЦИЯ ВЛАДЕЛЬЦА', icon: DollarSign, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  OWNER_WITHDRAWAL: { label: 'ИЗЪЯТИЕ КАПИТАЛА', icon: DollarSign, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  PROFIT_PAYOUT: { label: 'ВЫПЛАТА ПРИБЫЛИ', icon: DollarSign, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  REINVEST: { label: 'РЕИНВЕСТИЦИЯ', icon: DollarSign, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/10' },
  PROFIT_SHARE_CHANGE: { label: 'ИЗМЕНЕНЫ ДОЛИ', icon: DollarSign, colorClass: 'text-amber-400', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-500/10' },
  QUARTER_CLOSE: { label: 'ЗАКРЫТИЕ КВАРТАЛА', icon: CheckCircle2, colorClass: 'text-amber-400', borderClass: 'border-amber-500/30', bgClass: 'bg-amber-500/10' },
  CASH_REGISTER_RESET: { label: 'СБРОС КАССЫ', icon: XCircle, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  OWNERS_CAPITAL_RESET: { label: 'СБРОС КАПИТАЛА', icon: XCircle, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  SYSTEM_ZERO_RESET: { label: 'СБРОС СИСТЕМЫ', icon: XCircle, colorClass: 'text-rose-400', borderClass: 'border-rose-500/30', bgClass: 'bg-rose-500/10' },
  LOGIN: { label: 'ВХОД В СИСТЕМУ', icon: UserCheck, colorClass: 'text-slate-400', borderClass: 'border-slate-700', bgClass: 'bg-slate-800/40' },
  LOGOUT: { label: 'ВЫХОД ИЗ СИСТЕМЫ', icon: UserCheck, colorClass: 'text-slate-400', borderClass: 'border-slate-700', bgClass: 'bg-slate-800/40' }
};

const FILTER_CATEGORIES = [
  { id: 'ALL', label: 'ВСЕ СОБЫТИЯ' },
  { id: 'SALES', label: 'ПРОДАЖИ' },
  { id: 'PURCHASES', label: 'ПРИХОДЫ' },
  { id: 'TRANSFERS', label: 'ПЕРЕМЕЩЕНИЯ' },
  { id: 'EXPENSES', label: 'РАСХОДЫ' },
  { id: 'USERS', label: 'ДОСТУП И СОТРУДНИКИ' }
];

export const AuditLogPage: React.FC = () => {
  const { currentUser, auditLogs } = useApp();

  const todayStr = new Date().toISOString().split('T')[0];
  const [dateFilterMode, setDateFilterMode] = useState<'TODAY' | 'SPECIFIC' | 'ALL'>('TODAY');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div className="p-12 text-center text-slate-500 font-mono">
        <Lock className="w-10 h-10 mx-auto mb-2 text-slate-600" />
        <p className="text-sm font-bold text-slate-300">ДОСТУП ОГРАНИЧЕН</p>
        <p className="text-xs text-slate-500 mt-1">Журнал безопасности доступен только Администратору</p>
      </div>
    );
  }

  const filteredLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      // Date filter (Default: TODAY)
      if (dateFilterMode === 'TODAY') {
        const logDate = new Date(log.timestamp).toISOString().split('T')[0];
        if (logDate !== todayStr) return false;
      } else if (dateFilterMode === 'SPECIFIC') {
        if (selectedDate) {
          const logDate = new Date(log.timestamp).toISOString().split('T')[0];
          if (logDate !== selectedDate) return false;
        }
      }

      // Category filter
      if (activeCategoryFilter === 'SALES') {
        if (!['SALE', 'SALE_BELOW_COST', 'EXCHANGE', 'REFUND'].includes(log.action)) return false;
      } else if (activeCategoryFilter === 'PURCHASES') {
        if (!['PURCHASE', 'SUPPLIER_PAYMENT', 'SUPPLIER_CREATE', 'SUPPLIER_BONUS'].includes(log.action)) return false;
      } else if (activeCategoryFilter === 'TRANSFERS') {
        if (!['TRANSFER_REQUEST', 'TRANSFER_APPROVAL', 'TRANSFER_REJECT', 'TRANSFER'].includes(log.action)) return false;
      } else if (activeCategoryFilter === 'EXPENSES') {
        if (!['EXPENSE', 'RATE_SET', 'RATE_CHANGE'].includes(log.action)) return false;
      } else if (activeCategoryFilter === 'USERS') {
        if (!['USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_STATUS_CHANGE', 'PASSWORD_RESET', 'STORE_CREATE', 'STORE_UPDATE', 'STORE_DELETE', 'LOGIN', 'LOGOUT'].includes(log.action)) return false;
      }

      // Text Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesAction = log.action.toLowerCase().includes(q);
        const matchesDetails = log.details.toLowerCase().includes(q);
        const matchesUser = log.userName.toLowerCase().includes(q);
        const matchesRole = log.userRole?.toLowerCase().includes(q);
        const matchesId = log.id.toLowerCase().includes(q);

        if (!matchesAction && !matchesDetails && !matchesUser && !matchesRole && !matchesId) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLogs, dateFilterMode, selectedDate, todayStr, activeCategoryFilter, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg font-mono">
      {/* Header Bar */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0F1219] space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center space-x-2 uppercase">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>НЕИЗМЕНЯЕМЫЙ ЖУРНАЛ АУДИТА И БЕЗОПАСНОСТИ</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
              Сквозная фиксация всех торговых операций, списываний, перемещений и прав доступа
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
              {filteredLogs.length} событий
            </span>


          </div>
        </div>

        {/* Row 2: Date Selector (Default: Today, with Date Picker & All Time options) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mr-1">
            ПЕРИОД:
          </span>

          <button
            type="button"
            onClick={() => setDateFilterMode('TODAY')}
            className={`px-2.5 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-all ${
              dateFilterMode === 'TODAY'
                ? 'border-[#22c55e] text-[#22c55e] bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 bg-[#0B0E14]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>СЕГОДНЯ</span>
          </button>

          <div className={`flex items-center space-x-1.5 rounded-md border px-2.5 py-1 text-xs transition-all ${
            dateFilterMode === 'SPECIFIC'
              ? 'border-[#22c55e] bg-emerald-500/10 text-[#22c55e]'
              : 'border-slate-800 bg-[#0B0E14] text-slate-400'
          }`}>
            <span className="text-[10px] uppercase font-mono font-bold">ВЫБОР ДАТЫ:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setDateFilterMode('SPECIFIC');
              }}
              className="bg-transparent text-slate-100 text-xs font-mono font-bold focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={() => setDateFilterMode('ALL')}
            className={`px-2.5 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider transition-all ${
              dateFilterMode === 'ALL'
                ? 'border-[#22c55e] text-[#22c55e] bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200 bg-[#0B0E14]'
            }`}
          >
            <span>ЗА ВСЕ ВРЕМЯ</span>
          </button>
        </div>

        {/* Row 3: Search & Photo-Style Category Pill Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-800/80">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по событию / сотруднику / IMEI..."
              className="w-full rounded-md bg-[#0B0E14] border border-slate-800 pl-8 pr-8 py-1.5 text-xs font-mono text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
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

          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none">
            {FILTER_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryFilter(cat.id)}
                className={`px-3 py-1 rounded-md border text-xs font-mono font-bold uppercase tracking-wider whitespace-nowrap transition-colors bg-transparent ${
                  activeCategoryFilter === cat.id
                    ? 'border-[#22c55e] text-[#22c55e]'
                    : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Timeline Feed */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#0B0E14] space-y-2.5">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-mono space-y-2">
            <ShieldCheck className="w-8 h-8 mx-auto opacity-20 text-slate-400" />
            <p className="uppercase font-bold tracking-wider">Записи в журнале аудита не найдены</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const config = ACTION_CONFIG[log.action] || {
              label: log.action,
              icon: FileText,
              colorClass: 'text-slate-300',
              borderClass: 'border-slate-700',
              bgClass: 'bg-slate-800/50'
            };
            const ActionIcon = config.icon;
            const formattedDate = new Date(log.timestamp).toLocaleString('ru-RU');

            return (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-[#0F1219] border border-slate-800/90 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 group shadow-sm"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  {/* Category Action Icon Badge */}
                  <div className={`p-2.5 rounded-lg shrink-0 border ${config.bgClass} ${config.borderClass} ${config.colorClass}`}>
                    <ActionIcon className="w-4 h-4" />
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${config.bgClass} ${config.colorClass} ${config.borderClass}`}>
                        {config.label}
                      </span>

                      <div className="flex items-center space-x-1.5 text-xs text-slate-200 font-bold">
                        <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{log.userName}</span>
                        {log.userRole && (
                          <span className="text-[10px] text-slate-500 font-mono font-normal">
                            ({log.userRole})
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs font-mono text-slate-300 leading-relaxed wrap-break-word">
                      {log.details}
                    </p>
                  </div>
                </div>

                {/* Right side: Timestamp & Hash Badge */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0 text-right space-y-1 border-t sm:border-t-0 border-slate-800/60 pt-2 sm:pt-0 font-mono">
                  <div className="flex items-center space-x-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{formattedDate}</span>
                  </div>
                  <span className="text-[9px] text-slate-600 font-mono bg-[#0B0E14] px-1.5 py-0.5 rounded border border-slate-800/80">
                    #{log.id.substring(log.id.length - 8)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
