import React from 'react';
import { useApp } from '../../context/AppContext';
import { PageId } from '../../types';
import {
  ShoppingBag,
  History,
  Package,
  PlusCircle,
  ArrowLeftRight,
  RefreshCw,
  Wrench,
  Truck,
  Gift,
  Wallet,
  Users,
  UserCheck,
  BarChart3,
  FileText,
  Settings,
  Bell,
  LogOut,
  X,
  Store,
  Sun,
  Moon,
  ChevronRight
} from 'lucide-react';

interface NavGroup {
  title: string;
  items: {
    id: PageId;
    label: string;
    icon: React.ElementType;
    roles: ('ADMIN' | 'PARTNER' | 'SELLER')[];
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'ОСНОВНЫЕ ОПЕРАЦИИ',
    items: [
      { id: 'SALE', label: 'Касса / Продажа', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'REPAIR', label: 'Сервис и Ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
    ]
  },
  {
    title: 'СКЛАД И ЛОГИСТИКА',
    items: [
      { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'PURCHASE', label: 'Приходы (Партии)', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
      { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'ФИНАНСЫ И УЧЕТ',
    items: [
      { id: 'REPORTS', label: 'Финансовые отчёты ($)', icon: BarChart3, roles: ['ADMIN', 'PARTNER'] },
      { id: 'EXPENSES', label: 'Расходы магазина', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
      { id: 'BONUSES', label: 'Бонусы продавцов', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
      { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN'] },
    ]
  },
  {
    title: 'СИСТЕМА И ДОСТУП',
    items: [
      { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
      { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
      { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
    ]
  }
];

export const Drawer: React.FC = () => {
  const {
    currentUser,
    activePage,
    setActivePage,
    drawerOpen,
    setDrawerOpen,
    logout,
    notifications,
    theme,
    toggleTheme
  } = useApp();

  if (!drawerOpen) return null;

  const userRole = currentUser?.role || 'SELLER';
  const unreadNotifs = notifications.filter(n => !n.read && !n.resolved).length;

  return (
    <div className="fixed inset-0 z-50 flex md:hidden font-sans">
      {/* Backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
      />

      {/* Drawer panel matching Loyverse POS Mobile Drawer */}
      <div className="relative flex w-80 max-w-[88vw] flex-1 flex-col bg-[#1e2229] border-r border-[#333842] text-white shadow-2xl safe-area-pb">
        {/* Loyverse POS Style Header: Owner, POS 1, Mobile */}
        <div className="p-5 border-b border-[#333842] bg-[#181a1f]">
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <h2 className="text-xl font-bold text-white tracking-wide">
                {currentUser?.name || 'Owner'}
              </h2>
              <p className="text-xs text-slate-300 font-medium">
                {currentUser?.storeName || 'POS 1'}
              </p>
              <p className="text-xs text-slate-400 font-medium">
                {currentUser?.role === 'ADMIN' ? 'Mobile Terminal' : (currentUser?.role || 'Mobile')}
              </p>
            </div>

            <button
              onClick={() => setDrawerOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Categorized Loyverse POS Menu list */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-3">
          {NAV_GROUPS.map((group, gIdx) => {
            const visibleItems = group.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;

            return (
              <div key={gIdx} className="space-y-0.5">
                {gIdx > 0 && <div className="my-2 border-t border-[#333842]/80" />}
                
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  const isNotif = item.id === 'NOTIFICATIONS';

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        setDrawerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-3 rounded-lg text-sm transition-colors bg-transparent ${
                        isActive
                          ? 'text-[#22c55e] font-semibold'
                          : 'text-white hover:text-slate-200 font-medium'
                      }`}
                    >
                      <div className="flex items-center space-x-3.5 truncate">
                        <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#22c55e]' : 'text-white'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {isNotif && unreadNotifs > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_6px_rgba(244,63,94,0.7)]">
                          {unreadNotifs}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer Theme Switcher & Version info matching Loyverse POS screenshot (v.2.73.1) */}
        <div className="p-3.5 border-t border-[#333842] bg-[#181a1f] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={toggleTheme}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                theme === 'light'
                  ? 'bg-amber-100 border-amber-300 text-amber-900'
                  : 'bg-[#262a33] border-[#333842] text-slate-300 hover:text-white'
              }`}
            >
              {theme === 'light' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-600" />
                  <span>Светлый режим</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Тёмный режим</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setDrawerOpen(false);
                logout();
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold transition-colors flex items-center space-x-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Выход</span>
            </button>
          </div>

          <p className="text-[11px] font-mono text-slate-500 pt-1">
            v.2.73.1
          </p>
        </div>
      </div>
    </div>
  );
};
