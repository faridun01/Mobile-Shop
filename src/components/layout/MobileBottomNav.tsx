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

  const NavItem: React.FC<{ routePath: string; label: string; icon: React.ElementType; onSelect: () => void }> = ({
    routePath,
    label,
    icon: Icon,
    onSelect,
  }) => {
    const isActive = location.pathname === routePath;
    return (
      <button
        onClick={onSelect}
        className={`flex-1 h-full min-h-11 flex flex-col items-center justify-center gap-0.5 transition-colors ${
          isActive ? 'text-accent' : 'text-fg-subtle active:text-fg'
        }`}
      >
        <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
        <span className={`text-[10px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      </button>
    );
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 w-full h-16 bg-surface border-t border-border flex items-stretch justify-around select-none safe-area-pb">
      <NavItem
        routePath="/inventory"
        label="Склад"
        icon={Package}
        onSelect={() => {
          setActivePage('INVENTORY');
          navigate('/inventory');
        }}
      />
      <NavItem
        routePath="/sales-history"
        label="История"
        icon={History}
        onSelect={() => {
          setActivePage('SALES_HISTORY');
          navigate('/sales-history');
        }}
      />

      {/* Center primary action — POS */}
      <div className="flex-1 flex justify-center items-center relative">
        <button
          onClick={() => {
            setActivePage('SALE');
            navigate('/sale');
          }}
          className={`w-14 h-14 -mt-5 rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform ${
            isSaleActive ? 'bg-accent-strong text-accent-fg' : 'bg-accent text-accent-fg'
          }`}
          title="POS Терминал"
        >
          <ShoppingBag className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[9px] font-bold tracking-tight leading-none mt-0.5">POS</span>
        </button>
      </div>

      <NavItem
        routePath={PAGE_ROUTES[fourthItem.id] || '/sale'}
        label={fourthItem.label}
        icon={fourthItem.icon}
        onSelect={() => {
          setActivePage(fourthItem.id);
          navigate(PAGE_ROUTES[fourthItem.id] || '/sale');
        }}
      />

      <button
        onClick={() => setDrawerOpen(true)}
        className="flex-1 h-full min-h-11 flex flex-col items-center justify-center gap-0.5 text-fg-subtle active:text-fg transition-colors"
      >
        <div className="relative">
          <Menu className="w-5 h-5" />
          {unreadNotifs > 0 && (
            <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadNotifs}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium leading-none">Меню</span>
      </button>
    </nav>
  );
};
