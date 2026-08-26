import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Menu, Bell, Scan, DollarSign, Sun, Moon, Store } from 'lucide-react';
import { IconButton } from '../ui/IconButton';

export const TopBar: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    todayRate,
    notifications,
    activePage,
    setActivePage,
    setDrawerOpen,
    openScanner,
    openDailyRateModal,
    theme,
    toggleTheme,
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
      {/* Left: Mobile Title + Store Badge */}
      <div className="flex items-center gap-2.5 min-w-0">
        <IconButton icon={Menu} aria-label="Меню" onClick={() => setDrawerOpen(true)} className="md:hidden" />

        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-fg truncate tracking-tight">
            {getPageTitle()}
          </h1>
          {currentUser?.role !== 'SELLER' && (
            <p className="text-[11px] text-fg-subtle truncate flex items-center">
              <Store className="w-2.5 h-2.5 mr-1 text-accent shrink-0 inline" />
              <span className="truncate">{userStoreName || (currentUser?.role === 'ADMIN' ? 'Все филиалы' : 'Главный склад')}</span>
            </p>
          )}
        </div>
      </div>

      {/* Right: Exchange Rate + Scanner + Notifications + Theme */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={openDailyRateModal}
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg bg-surface-raised hover:border-fg-subtle border border-border text-fg text-xs font-semibold transition-colors"
          title="Курс доллара (нажмите для редактирования)"
        >
          <DollarSign className="w-3.5 h-3.5 text-fg-subtle" />
          <span>$1 = {todayRate ? todayRate.rate.toFixed(2) : '9.50'}</span>
        </button>

        <IconButton
          icon={theme === 'light' ? Sun : Moon}
          aria-label={theme === 'light' ? 'Переключить на тёмный режим' : 'Переключить на светлый режим'}
          onClick={toggleTheme}
          size="sm"
        />

        <IconButton
          icon={Scan}
          aria-label="Сканер штрих-кода / IMEI"
          size="sm"
          onClick={() => openScanner(() => setActivePage('INVENTORY'))}
        />

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
          className={`relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors active:scale-95 ${
            activePage === 'NOTIFICATIONS'
              ? 'bg-accent/15 text-accent'
              : 'text-fg-muted hover:text-fg hover:bg-surface-raised'
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
