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
  HandCoins,
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
  CUSTOMERS: '/customers',
};

const TABLET_NAV_ITEMS: { id: PageId; label: string; icon: React.ElementType; roles: ('ADMIN' | 'PARTNER' | 'SELLER')[] }[] = [
  { id: 'SALE', label: 'POS', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'INVENTORY', label: 'Склад', icon: Package, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'SALES_HISTORY', label: 'Продажи', icon: History, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'EXCHANGE', label: 'Обмен', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'REPAIR', label: 'Ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'TRANSFER', label: 'Перевод', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
  { id: 'PURCHASE', label: 'Приход', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
  { id: 'SUPPLIERS', label: 'Поставщ.', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
  { id: 'EXPENSES', label: 'Расходы', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
  { id: 'BONUSES', label: 'Бонусы', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
  { id: 'CUSTOMERS', label: 'Долги', icon: HandCoins, roles: ['ADMIN', 'PARTNER'] },
  { id: 'REPORTS', label: 'Отчёты', icon: BarChart3, roles: ['ADMIN', 'PARTNER'] },
  { id: 'OWNERS', label: 'Партнеры', icon: Users, roles: ['ADMIN', 'PARTNER'] },
  { id: 'EMPLOYEES', label: 'Кадры', icon: UserCheck, roles: ['ADMIN'] },
  { id: 'AUDIT_LOG', label: 'Аудит', icon: FileText, roles: ['ADMIN'] },
  { id: 'NOTIFICATIONS', label: 'Увед.', icon: Bell, roles: ['ADMIN', 'PARTNER'] },
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
    <aside className="hidden md:flex lg:hidden flex-col w-20 border-r border-border bg-surface text-fg-muted select-none shrink-0 h-screen sticky top-0 py-3 items-center justify-between z-30">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 text-accent font-extrabold text-xs flex items-center justify-center">
          POS
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-none py-4 space-y-2 w-full px-2 flex flex-col items-center">
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
              className={`w-full min-h-11 py-2 rounded-lg flex flex-col items-center justify-center transition-colors relative ${
                isActive ? 'bg-accent/10 text-accent' : 'text-fg-subtle hover:text-fg hover:bg-surface-raised'
              }`}
              title={item.label}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] mt-1 tracking-tight leading-none truncate max-w-15">
                {item.label}
              </span>

              {item.id === 'NOTIFICATIONS' && unreadNotifs > 0 && (
                <span className="absolute top-1 right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-danger px-1 text-[8px] font-bold text-white">
                  {unreadNotifs}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col items-center pt-2 border-t border-border w-full px-2">
        <button
          onClick={logout}
          className="w-11 h-11 flex items-center justify-center rounded-lg bg-surface-raised hover:bg-danger/10 text-fg-muted hover:text-danger border border-border transition-colors"
          title="Выйти из системы"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
