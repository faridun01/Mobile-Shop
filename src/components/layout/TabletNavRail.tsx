import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  LogOut
} from 'lucide-react';

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

const TABLET_NAV_ITEMS: { id: PageId; label: string; icon: React.ElementType; roles: ('ADMIN' | 'PARTNER' | 'SELLER')[] }[] = [
  { id: 'SALE', label: 'POS', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'INVENTORY', label: 'Склад', icon: Package, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'SALES_HISTORY', label: 'Продажи', icon: History, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'EXCHANGE', label: 'Обмен', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'REPAIR', label: 'Ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'TRANSFER', label: 'Перевод', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'EXPENSES', label: 'Расходы', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
  { id: 'REPORTS', label: 'Отчёты', icon: BarChart3, roles: ['ADMIN', 'PARTNER'] },
  { id: 'EMPLOYEES', label: 'Кадры', icon: UserCheck, roles: ['ADMIN'] },
  { id: 'SETTINGS', label: 'Опции', icon: Settings, roles: ['ADMIN', 'PARTNER'] },
];

export const TabletNavRail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setActivePage, notifications, logout } = useApp();

  const userRole = currentUser?.role || 'SELLER';
  const unreadNotifs = notifications.filter(n => !n.read && !n.resolved).length;
  const visibleItems = TABLET_NAV_ITEMS.filter(item => item.roles.includes(userRole));

  return (
    <aside className="hidden md:flex lg:hidden flex-col w-20 border-r border-slate-800 bg-[#0F1219] text-slate-300 select-none shrink-0 h-screen sticky top-0 font-mono py-3 items-center justify-between z-30">
      {/* Top Logo / App Badge */}
      <div className="flex flex-col items-center space-y-1">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-extrabold text-xs flex items-center justify-center shadow-inner">
          POS
        </div>
        <span className="text-[9px] font-bold text-slate-500 tracking-tighter uppercase">Mobile</span>
      </div>

      {/* Center Tablet Navigation Rail Icons */}
      <nav className="flex-1 overflow-y-auto scrollbar-none py-4 space-y-2.5 w-full px-2 flex flex-col items-center">
        {visibleItems.map(item => {
          const Icon = item.icon;
          const routePath = PAGE_ROUTES[item.id] || '/sale';
          const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === 'SALE');

          return (
            <button
              key={item.id}
              onClick={() => {
                setActivePage(item.id);
                navigate(routePath);
              }}
              className={`w-full py-2.5 rounded-xl flex flex-col items-center justify-center transition-all relative group ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent'
              }`}
              title={item.label}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
              <span className="text-[9px] mt-1 tracking-tight leading-none truncate max-w-[60px]">
                {item.label}
              </span>

              {item.id === 'SETTINGS' && unreadNotifs > 0 && (
                <span className="absolute top-1 right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">
                  {unreadNotifs}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User Avatar & Logout */}
      <div className="flex flex-col items-center space-y-2 pt-2 border-t border-slate-800/80 w-full px-2">
        <button
          onClick={logout}
          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
          title="Выйти из системы"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
