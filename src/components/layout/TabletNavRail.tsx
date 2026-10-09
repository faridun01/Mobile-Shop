import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useUIStore } from '../../stores/useUIStore';
import { PageId } from '../../types';
import {
  ShoppingBag,
  History,
  Package,
  PackagePlus,
  ClipboardCheck,
  PlusCircle,
  ArrowLeftRight,
  RefreshCw,
  Wrench,
  Truck,
  Gift,
  Wallet,
  HandCoins,
  Users,
  UserCheck,
  FileText,
  Settings,
  Bell,
  Landmark,
  TrendingUp,
  Store,
  Home,
} from 'lucide-react';
import { NAV_PAGE_ROUTES } from '../../router/navRoutes';
import { useNavUsage, sortNavItemsByUsage, recordNavVisit } from '../../utils/navUsage';

export const TabletNavRail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    stores,
    selectedStoreId,
    setSelectedStoreId,
  } = useAppFields(
    'currentUser',
    'setActivePage',
    'stores',
    'selectedStoreId',
    'setSelectedStoreId'
  );
  const { notifications } = useNotifications();
  const { setStoreSwitchModalOpen, triggerStoreTransition } = useUIStore();

  const userRole = currentUser?.role || 'SELLER';
  const isSeller = userRole === 'SELLER';
  const isPartner = userRole === 'PARTNER';
  const isAdmin = userRole === 'ADMIN';
  const isStoreScoped = isSeller || isPartner;
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');
  const activeRetailStore = isAdmin && !isCentralCashMode ? stores.find(s => s.id === selectedStoreId && !s.isMainWarehouse) : null;

  const unreadNotifs = notifications.filter(n => !n.read).length;

  const visibleItems = useMemo(() => {
    if (isSeller) {
      return [
        { id: 'SALE' as PageId, label: 'POS', icon: ShoppingBag },
        { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
        { id: 'EXCHANGE' as PageId, label: 'Обмен', icon: RefreshCw },
        { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench },
        { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
        { id: 'STORE_RECEIPT' as PageId, label: 'Приход', icon: PackagePlus },
        { id: 'REVISION' as PageId, label: 'Ревизия', icon: ClipboardCheck },
        { id: 'TRANSFER' as PageId, label: 'Перемещ.', icon: ArrowLeftRight },
      ];
    }

    if (isPartner) {
      return [
        { id: 'SALE' as PageId, label: 'POS', icon: ShoppingBag },
        { id: 'STORE_RECEIPT' as PageId, label: 'Приход', icon: PackagePlus },
        { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
        { id: 'CASH_DESK' as PageId, label: 'Касса', icon: Wallet },
        { id: 'EXCHANGE' as PageId, label: 'Обмен', icon: RefreshCw },
        { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench },
        { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
        { id: 'REVISION' as PageId, label: 'Ревизия', icon: ClipboardCheck },
        { id: 'TRANSFER' as PageId, label: 'Перемещ.', icon: ArrowLeftRight },
        { id: 'EXPENSES' as PageId, label: 'Расходы', icon: Wallet },
        { id: 'SETTINGS' as PageId, label: 'Опции', icon: Settings },
      ];
    }

    if (isCentralCashMode) {
      const items: { id: PageId; label: string; icon: any }[] = [
        { id: 'PURCHASE' as PageId, label: 'Приход', icon: PlusCircle },
        { id: 'CASH_DESK' as PageId, label: 'Касса', icon: Wallet },
        { id: 'REPORTS' as PageId, label: 'Отчёты', icon: TrendingUp },
        { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
        { id: 'CASH_COLLECTION' as PageId, label: 'Инкасс.', icon: HandCoins },
        { id: 'EXPENSES' as PageId, label: 'Расходы', icon: Wallet },
        { id: 'BONUSES' as PageId, label: 'Бонусы', icon: Gift },
        { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
        { id: 'REVISION' as PageId, label: 'Ревизия', icon: ClipboardCheck },
        { id: 'TRANSFER' as PageId, label: 'Перемещ.', icon: ArrowLeftRight },
        { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench },
        { id: 'SUPPLIERS' as PageId, label: 'Поставщ.', icon: Truck },
        { id: 'OWNERS' as PageId, label: 'Партнеры', icon: Users },
        { id: 'EMPLOYEES' as PageId, label: 'Кадры', icon: UserCheck },
        { id: 'CUSTOMERS' as PageId, label: 'Клиенты', icon: Users },
        { id: 'AUDIT_LOG' as PageId, label: 'Аудит', icon: FileText },
        { id: 'NOTIFICATIONS' as PageId, label: 'Увед.', icon: Bell },
        { id: 'SETTINGS' as PageId, label: 'Опции', icon: Settings },
      ];
      return items;
    }

    // Retail Store Selling Mode for Admin — matches Partner
    return [
      { id: 'SALE' as PageId, label: 'POS', icon: ShoppingBag },
      { id: 'STORE_RECEIPT' as PageId, label: 'Приход', icon: PackagePlus },
      { id: 'SALES_HISTORY' as PageId, label: 'Продажи', icon: History },
      { id: 'CASH_DESK' as PageId, label: 'Касса', icon: Wallet },
      { id: 'FINANCE' as PageId, label: 'Отчёты', icon: TrendingUp },
      { id: 'CASH_COLLECTION' as PageId, label: 'Инкасс.', icon: HandCoins },
      { id: 'EXCHANGE' as PageId, label: 'Обмен', icon: RefreshCw },
      { id: 'REPAIR' as PageId, label: 'Ремонт', icon: Wrench },
      { id: 'INVENTORY' as PageId, label: 'Склад', icon: Package },
      { id: 'REVISION' as PageId, label: 'Ревизия', icon: ClipboardCheck },
      { id: 'TRANSFER' as PageId, label: 'Перемещ.', icon: ArrowLeftRight },
      { id: 'EXPENSES' as PageId, label: 'Расходы', icon: Wallet },
      { id: 'SETTINGS' as PageId, label: 'Опции', icon: Settings },
    ];
  }, [isSeller, isPartner, isCentralCashMode]);

  const navUsage = useNavUsage();
  const sortedVisibleItems = useMemo(() => {
    return sortNavItemsByUsage(visibleItems, navUsage);
  }, [visibleItems, navUsage]);

  return (
    <aside className="hidden md:flex lg:hidden flex-col w-20 border-r border-border bg-surface text-fg-muted select-none shrink-0 h-full sticky top-0 pb-3 items-center justify-between z-30">
      <div className="w-full shrink-0" style={{ height: 'var(--sa-top)' }} />
      <div className="flex flex-col items-center gap-1.5 w-full px-2 pt-3">
        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              if (!isCentralCashMode) {
                triggerStoreTransition({
                  storeName: 'Центральная касса (Главный офис)',
                  storeId: 'all',
                  isCentral: true,
                });
                setSelectedStoreId('all');
                setActivePage('WELCOME');
                navigate('/');
              } else if (location.pathname !== '/') {
                setActivePage('WELCOME');
                navigate('/');
              } else {
                setStoreSwitchModalOpen(true);
              }
            }}
            className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center transition-all active:scale-95 shadow-xs cursor-pointer ${
              isCentralCashMode
                ? 'bg-accent/15 border-accent/40 text-accent hover:bg-accent/25'
                : 'bg-warning/15 border-warning/40 text-warning hover:bg-warning/25'
            }`}
            title={
              isCentralCashMode
                ? location.pathname === '/'
                  ? 'Главная (Нажмите для выбора магазина)'
                  : 'На главную'
                : `${activeRetailStore?.name || 'Магазин'} (Нажмите для перехода на Главную)`
            }
          >
            {isCentralCashMode ? <Home className="w-5 h-5" /> : <Store className="w-5 h-5" />}
            <span className="text-[10px] font-bold mt-0.5 leading-none truncate max-w-11">
              {isCentralCashMode ? 'Главная' : (activeRetailStore?.name || 'Магазин')}
            </span>
          </button>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/30 text-accent flex items-center justify-center" aria-hidden="true">
            <Store className="w-5 h-5" />
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-none py-3 space-y-1.5 w-full px-2 flex flex-col items-center">
        {sortedVisibleItems.map((item) => {
          const Icon = item.icon;
          const routePath = NAV_PAGE_ROUTES[item.id] || '/sale';
          const isActive = location.pathname === routePath || (location.pathname === '/' && isStoreScoped && item.id === 'SALE');

          return (
            <button
              key={item.id}
              onClick={() => {
                recordNavVisit(item.id);
                setActivePage(item.id);
                navigate(routePath);
              }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full min-h-12 py-1.5 rounded-lg flex flex-col items-center justify-center transition-colors relative ${
                isActive ? 'bg-accent/15 text-accent font-bold' : 'text-fg-subtle hover:text-fg-muted hover:bg-surface-raised'
              }`}
              title={item.label}
            >
              <Icon className="w-4 h-4" />
              <span className="text-[11px] mt-1 leading-tight text-center line-clamp-2 max-w-full px-0.5 wrap-break-word">
                {item.label}
              </span>

              {item.id === 'NOTIFICATIONS' && unreadNotifs > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {unreadNotifs}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
