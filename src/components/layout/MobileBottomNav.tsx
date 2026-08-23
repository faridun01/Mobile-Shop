import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { PageId } from '../../types';
import {
  ShoppingBag,
  History,
  Package,
  PlusCircle,
  Menu,
  RefreshCw,
  Sparkles
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

export const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    activePage,
    setActivePage,
    setDrawerOpen,
    notifications
  } = useApp();

  const userRole = currentUser?.role || 'SELLER';
  const unreadNotifs = notifications.filter(n => !n.read && !n.resolved).length;

  const fourthItem: { id: PageId; label: string; icon: React.ElementType } =
    userRole === 'ADMIN' || userRole === 'PARTNER'
      ? { id: 'PURCHASE', label: 'Приход', icon: PlusCircle }
      : { id: 'EXCHANGE', label: 'Обмен', icon: RefreshCw };

  const navButtons = [
    { id: 'SALE' as PageId, label: 'Касса', icon: ShoppingBag },
    { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
    { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
    fourthItem
  ];

  return (
    <div className="md:hidden sticky bottom-0 z-40 w-full bg-[#0F131D]/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-1 flex items-center justify-around select-none safe-area-pb">
      {navButtons.map(item => {
        const Icon = item.icon;
        const routePath = PAGE_ROUTES[item.id] || '/sale';
        const isActive = location.pathname === routePath || (location.pathname === '/' && item.id === 'SALE');
        const badgeCount = 'badge' in item ? (item.badge as number) : 0;

        return (
          <button
            key={item.id}
            onClick={() => {
              setActivePage(item.id);
              navigate(routePath);
            }}
            className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center relative rounded-xl transition-all ${
              isActive
                ? 'text-[#22c55e] font-bold'
                : 'text-slate-400 hover:text-slate-200 active:scale-95'
            }`}
          >
            <div className="relative">
              <div
                className={`p-1 rounded-lg transition-colors ${
                  isActive ? 'text-[#22c55e]' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              {badgeCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(16,185,129,0.7)]">
                  {badgeCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight leading-none truncate max-w-[64px]">
              {item.label}
            </span>
            {isActive && (
              <span className="w-1 h-1 rounded-full bg-[#22c55e] mt-1" />
            )}
          </button>
        );
      })}

      {/* Menu / Drawer Button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="flex-1 py-1.5 px-1 flex flex-col items-center justify-center relative rounded-xl text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
      >
        <div className="relative">
          <div className="p-1 rounded-lg text-slate-400">
            <Menu className="w-5 h-5" />
          </div>
          {unreadNotifs > 0 && (
            <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.7)]">
              {unreadNotifs}
            </span>
          )}
        </div>
        <span className="text-[10px] mt-0.5 tracking-tight leading-none">Меню</span>
      </button>
    </div>
  );
};
