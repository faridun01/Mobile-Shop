import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Bell, Store } from 'lucide-react';

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    notifications,
    activePage,
    setActivePage,
    stores
  } = useApp();

  const unreadNotifsCount = notifications.filter(n => !n.read && !n.resolved).length;
  const userStoreName = currentUser?.storeId ? (stores.find(s => s.id === currentUser.storeId)?.name || currentUser.storeName) : currentUser?.storeName;

  const getPageTitle = () => {
    switch (activePage) {
      case 'SALE': return 'POS Терминал';
      case 'SALES_HISTORY': return 'История продаж';
      case 'INVENTORY': return 'Склад товаров';
      case 'PURCHASE': return 'Приходы товара';
      case 'TRANSFER': return 'Перемещение';
      case 'EXCHANGE': return 'Обмен Trade-In';
      case 'REPAIR': return 'Сервис и ремонт';
      case 'SUPPLIERS': return 'Поставщики';
      case 'BONUSES': return 'Бонусы';
      case 'EXPENSES': return 'Расходы';
      case 'OWNERS': return 'Партнеры и капитал';
      case 'EMPLOYEES': return 'Сотрудники';
      case 'REPORTS': return 'Финансовые отчёты';
      case 'AUDIT_LOG': return 'Журнал аудита';
      case 'SETTINGS': return 'Настройки';
      case 'NOTIFICATIONS': return 'Уведомления';
      default: return 'Mobile Shop';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-border bg-surface px-3 md:px-4 select-none shrink-0">
      {/* Left: Page Title + Store Subtitle */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="min-w-0">
          <h1 className="text-sm md:text-base font-bold text-fg truncate tracking-tight">
            {getPageTitle()}
          </h1>
          <p className="text-[11px] text-fg-subtle truncate flex items-center">
            <Store className="w-2.5 h-2.5 mr-1 text-accent shrink-0 inline" />
            <span className="truncate">{userStoreName || (currentUser?.role === 'ADMIN' ? 'Все филиалы' : 'Магазин не привязан')}</span>
          </p>
        </div>
      </div>

      {/* Right: Notifications ONLY */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => {
            if (activePage === 'NOTIFICATIONS') {
              setActivePage('SALE');
              navigate('/sale');
            } else {
              setActivePage('NOTIFICATIONS');
              navigate('/notifications');
            }
          }}
          aria-label={activePage === 'NOTIFICATIONS' ? 'Закрыть уведомления' : 'Уведомления'}
          className={`relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors active:scale-95 border ${
            activePage === 'NOTIFICATIONS'
              ? 'bg-accent/15 text-accent border-accent/40'
              : 'text-fg-muted hover:text-fg hover:bg-surface-raised border-border'
          }`}
        >
          <Bell className="w-4 h-4" />
          {unreadNotifsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadNotifsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
