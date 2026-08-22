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
  Store,
  Sun,
  Moon
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
    title: 'ОСНОВНОЕ',
    items: [
      { id: 'SALE', label: 'Касса / Продажа', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'EXCHANGE', label: 'Обмен Trade-In', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'REPAIR', label: 'Сервис и Ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
    ]
  },
  {
    title: 'СКЛАД',
    items: [
      { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'PURCHASE', label: 'Приходы (Партии)', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
      { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'ФИНАНСЫ',
    items: [
      { id: 'REPORTS', label: 'Финансовые отчёты', icon: BarChart3, roles: ['ADMIN', 'PARTNER'] },
      { id: 'EXPENSES', label: 'Расходы', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
      { id: 'BONUSES', label: 'Бонусы', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
      { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN'] },
    ]
  },
  {
    title: 'УПРАВЛЕНИЕ',
    items: [
      { id: 'EMPLOYEES', label: 'Сотрудники', icon: UserCheck, roles: ['ADMIN'] },
      { id: 'AUDIT_LOG', label: 'Журнал аудита', icon: FileText, roles: ['ADMIN'] },
      { id: 'NOTIFICATIONS', label: 'Уведомления', icon: Bell, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SETTINGS', label: 'Настройки', icon: Settings, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
    ]
  }
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, activePage, setActivePage, logout, notifications, devices, theme, toggleTheme } = useApp();

  const userRole = currentUser?.role || 'SELLER';
  const unreadNotifs = notifications.filter(n => !n.read && !n.resolved).length;

  return (
    <aside className="hidden md:flex flex-col w-60 border-r border-slate-800/80 bg-[#0F131D] text-slate-300 select-none shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="h-13 flex items-center px-4 border-b border-slate-800/80 bg-[#0B0F17] justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
          <div>
            <span className="font-bold text-xs tracking-wider text-slate-100 uppercase">MOBILE SHOP</span>
          </div>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-semibold">
          POS & ERP
        </span>
      </div>



      {/* Nav List grouped */}
      <nav className="flex-1 overflow-y-auto scrollbar-none px-2.5 py-2.5 space-y-2.5">
        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-1">
              <span className="text-[9px] font-bold text-slate-500 tracking-wider px-2 font-mono uppercase">
                {group.title}
              </span>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const routePath = PAGE_ROUTES[item.id] || '/sale';
                  const isActive = location.pathname === routePath || activePage === item.id;
                  const isNotif = item.id === 'NOTIFICATIONS';

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActivePage(item.id);
                        navigate(routePath);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors bg-transparent ${
                        isActive
                          ? 'text-[#22c55e] font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#22c55e]' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {isNotif && unreadNotifs > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-[0_0_6px_rgba(244,63,94,0.7)]">
                          {unreadNotifs}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Logout button */}
      <div className="p-2.5 border-t border-slate-800/80 bg-[#0B0F17]">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center space-x-2 rounded-xl bg-slate-900 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 py-1.5 text-xs font-medium transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px]">ВЫХОД</span>
        </button>
      </div>
    </aside>
  );
};
