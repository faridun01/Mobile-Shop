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
  LogOut,
  X
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
    title: 'Основные операции',
    items: [
      { id: 'SALE', label: 'POS Терминал', icon: ShoppingBag, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SALES_HISTORY', label: 'История продаж', icon: History, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'EXCHANGE', label: 'Обмен (Trade-In)', icon: RefreshCw, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'REPAIR', label: 'Сервис и ремонт', icon: Wrench, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
    ]
  },
  {
    title: 'Склад и логистика',
    items: [
      { id: 'INVENTORY', label: 'Склад товаров', icon: Package, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'PURCHASE', label: 'Приходы (партии)', icon: PlusCircle, roles: ['ADMIN', 'PARTNER'] },
      { id: 'TRANSFER', label: 'Перемещение', icon: ArrowLeftRight, roles: ['ADMIN', 'PARTNER', 'SELLER'] },
      { id: 'SUPPLIERS', label: 'Поставщики', icon: Truck, roles: ['ADMIN', 'PARTNER'] },
    ]
  },
  {
    title: 'Финансы и учёт',
    items: [
      { id: 'REPORTS', label: 'Финансовые отчёты', icon: BarChart3, roles: ['ADMIN', 'PARTNER'] },
      { id: 'EXPENSES', label: 'Расходы магазина', icon: Wallet, roles: ['ADMIN', 'PARTNER'] },
      { id: 'BONUSES', label: 'Бонусы продавцов', icon: Gift, roles: ['ADMIN', 'PARTNER'] },
      { id: 'OWNERS', label: 'Партнеры и капитал', icon: Users, roles: ['ADMIN'] },
    ]
  },
  {
    title: 'Система и доступ',
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
    <div className="fixed inset-0 z-50 flex md:hidden flex-col bg-bg text-fg w-full h-full overflow-hidden">
      <div className="p-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 text-accent font-bold text-sm flex items-center justify-center shrink-0">
            {currentUser?.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg truncate">
              {currentUser?.name || 'Пользователь'}
            </h2>
            <p className="text-xs font-medium text-accent truncate">
              {userStoreName || 'Главный склад'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          aria-label="Закрыть меню"
          className="w-11 h-11 flex items-center justify-center rounded-lg bg-surface-raised text-fg-muted hover:text-fg border border-border transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-24">
        {NAV_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="space-y-2">
              <span className="text-xs font-semibold text-fg-subtle uppercase tracking-wide px-1 block">
                {group.title}
              </span>

              <div className="grid grid-cols-2 gap-2">
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
                      className={`flex flex-col items-start justify-between min-h-18 p-3 rounded-lg border text-left transition-colors active:scale-[0.98] ${
                        isActive ? 'bg-accent/10 text-accent border-accent/40' : 'bg-surface hover:bg-surface-raised text-fg border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <Icon className={`w-4.5 h-4.5 ${isActive ? 'text-accent' : 'text-fg-subtle'}`} />
                        {isNotif && unreadNotifs > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">
                            {unreadNotifs}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-border bg-surface flex items-center justify-between shrink-0 fixed bottom-0 left-0 right-0 z-50 safe-area-pb">
        <button
          onClick={() => {
            setDrawerOpen(false);
            logout();
          }}
          className="h-11 px-4 rounded-lg bg-danger/10 hover:bg-danger/15 text-danger border border-danger/30 text-xs font-semibold transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Выход из системы</span>
        </button>

        <span className="text-[11px] text-fg-subtle">
          Mobile Shop POS
        </span>
      </div>
    </div>
  );
};
