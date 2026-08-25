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
  RefreshCw
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
  const isSaleActive = location.pathname === '/sale' || location.pathname === '/' || activePage === 'SALE';

  const fourthItem: { id: PageId; label: string; icon: React.ElementType } =
    userRole === 'ADMIN' || userRole === 'PARTNER'
      ? { id: 'PURCHASE', label: 'Приход', icon: PlusCircle }
      : { id: 'EXCHANGE', label: 'Обмен', icon: RefreshCw };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 w-full bg-[#0F1219] border-t border-slate-800/90 px-2 pt-1.5 pb-4 flex items-center justify-around select-none shadow-[0_-5px_25px_rgba(0,0,0,0.9)] safe-area-pb font-mono">
      {/* 1. Склад */}
      {(() => {
        const routePath = '/inventory';
        const isActive = location.pathname === routePath;
        return (
          <button
            onClick={() => {
              setActivePage('INVENTORY');
              navigate(routePath);
            }}
            className={`flex-1 py-1 flex flex-col items-center justify-center relative transition-colors ${
              isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 tracking-tight">Склад</span>
          </button>
        );
      })()}

      {/* 2. Продажи */}
      {(() => {
        const routePath = '/sales-history';
        const isActive = location.pathname === routePath;
        return (
          <button
            onClick={() => {
              setActivePage('SALES_HISTORY');
              navigate(routePath);
            }}
            className={`flex-1 py-1 flex flex-col items-center justify-center relative transition-colors ${
              isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 tracking-tight">История</span>
          </button>
        );
      })()}

      {/* 3. POS (ПО ЦЕНТРУ - Prominent Action Button) */}
      <div className="flex-1 flex justify-center items-center relative -top-3">
        <button
          onClick={() => {
            setActivePage('SALE');
            navigate('/sale');
          }}
          className={`w-12 h-12 rounded-full flex flex-col items-center justify-center shadow-[0_0_16px_rgba(16,185,129,0.5)] active:scale-90 transition-all ${
            isSaleActive
              ? 'bg-emerald-400 text-slate-950 font-extrabold ring-4 ring-emerald-500/30 scale-105'
              : 'bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400'
          }`}
          title="POS Терминал"
        >
          <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
          <span className="text-[9px] font-extrabold tracking-tighter uppercase leading-none mt-0.5">
            POS
          </span>
        </button>
      </div>

      {/* 4. Обмен / Приход */}
      {(() => {
        const item = fourthItem;
        const Icon = item.icon;
        const routePath = PAGE_ROUTES[item.id] || '/sale';
        const isActive = location.pathname === routePath;
        return (
          <button
            onClick={() => {
              setActivePage(item.id);
              navigate(routePath);
            }}
            className={`flex-1 py-1 flex flex-col items-center justify-center relative transition-colors ${
              isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
          </button>
        );
      })()}

      {/* 5. Меню (Opens Full-Screen Dedicated Menu Page) */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="flex-1 py-1 flex flex-col items-center justify-center relative text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
      >
        <div className="relative">
          <Menu className="w-5 h-5" />
          {unreadNotifs > 0 && (
            <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.7)]">
              {unreadNotifs}
            </span>
          )}
        </div>
        <span className="text-[10px] mt-0.5 tracking-tight">Меню</span>
      </button>
    </div>
  );
};
