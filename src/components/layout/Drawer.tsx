import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { PageId } from '../../types';

const PAGE_ROUTES: Record<string, string> = {
  SALE: '/sale',
  SALES_HISTORY: '/sales-history',
  INVENTORY: '/inventory',
  PURCHASE: '/purchase',
  TRANSFER: '/transfer',
  EXCHANGE: '/exchange',
  REPAIR: '/repair',
  SUPPLIERS: '/suppliers',
  BONUSES: '/bonuses',
  EXPENSES: '/expenses',
  OWNERS: '/owners',
  EMPLOYEES: '/employees',
  REPORTS: '/reports',
  AUDIT_LOG: '/audit-log',
  SETTINGS: '/settings',
  NOTIFICATIONS: '/notifications',
};
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
      { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
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
      { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
      { id: 'SETTINGS', label: 'Настройки системы', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
    ]
  }
];

export const Drawer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    activePage,
    setActivePage,
    drawerOpen,
    setDrawerOpen,
    logout,
    notifications,
    stores
  } = useApp();

  if (!drawerOpen) return null;

  const userRole = currentUser?.role || 'SELLER';
  const unreadNotifs = notifications.filter(n => !n.read && !n.resolved).length;
  const userStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;

  return (
    <div className="fixed inset-0 z-50 flex md:hidden flex-col bg-[#0B0E14] text-slate-100 font-mono w-full h-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
      {/* Top Bar Header */}
      <div className="p-4 border-b border-slate-800 bg-[#0F1219] flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-sm flex items-center justify-center font-mono shrink-0">
            {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-100 truncate">
              {currentUser?.name || 'Пользователь'}
            </h2>
            <p className="text-xs font-bold text-emerald-400 truncate">
              {userStoreName || 'Главный склад'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all flex items-center space-x-1.5 active:scale-95"
        >
          <X className="w-4 h-4" />
          <span>ЗАКРЫТЬ</span>
        </button>
      </div>

      {/* Main Full-Screen Categorized Menu Options Grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 block flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 inline-block" />
                {group.title}
              </span>

              <div className="grid grid-cols-2 gap-2.5">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const routePath = PAGE_ROUTES[item.id] || '/sale';
                  const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === 'SALE');
                  const isNotif = item.id === 'NOTIFICATIONS';

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        navigate(routePath);
                        setDrawerOpen(false);
                      }}
                      className={`flex flex-col items-start justify-between p-3.5 rounded-xl border text-left transition-all active:scale-95 ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                          : 'bg-[#0F1219] hover:bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        {isNotif && unreadNotifs > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.7)]">
                            {unreadNotifs}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-xs font-bold block text-slate-100 leading-tight">{item.label}</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Перейти →</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Exit Bar */}
      <div className="p-3 border-t border-slate-800 bg-[#0F1219] flex items-center justify-between shrink-0 fixed bottom-0 left-0 right-0 z-50">
        <button
          onClick={() => {
            setDrawerOpen(false);
            logout();
          }}
          className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all flex items-center space-x-2"
        >
          <LogOut className="w-4 h-4" />
          <span>ВЫХОД ИЗ СИСТЕМЫ</span>
        </button>

        <span className="text-[11px] font-mono text-slate-500">
          Mobile Shop POS v2.73
        </span>
      </div>
    </div>
  );
};
