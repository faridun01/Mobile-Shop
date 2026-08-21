import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Menu, Bell, Scan, DollarSign, Sun, Moon, Store } from 'lucide-react';

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
    toggleTheme
  } = useApp();

  const unreadNotifsCount = notifications.filter(n => !n.read && !n.resolved).length;

  const getPageTitle = () => {
    switch (activePage) {
      case 'SALE': return 'Касса / Продажа';
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
    <header className="sticky top-0 z-30 flex h-13 w-full items-center justify-between border-b border-slate-800/80 bg-[#0F131D] px-3 md:px-4 select-none shrink-0">
      {/* Left: Mobile Title + Store Badge */}
      <div className="flex items-center space-x-2.5 min-w-0">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-700 active:scale-95 md:hidden shrink-0 transition-transform"
          title="Меню"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0">
          <h1 className="text-xs sm:text-sm font-bold text-slate-100 truncate tracking-tight">
            {getPageTitle()}
          </h1>
          <p className="text-[10px] text-slate-400 font-mono truncate flex items-center">
            <Store className="w-2.5 h-2.5 mr-1 text-emerald-400 shrink-0 inline" />
            <span className="truncate">{currentUser?.storeName || (currentUser?.role === 'ADMIN' ? 'Все филиалы' : 'Магазин')}</span>
          </p>
        </div>
      </div>

      {/* Right: Sleek Exchange Rate + Scanner + Notifications + Theme */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        {/* Exchange Rate Button */}
        <button
          onClick={openDailyRateModal}
          className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-mono text-xs font-medium transition-colors"
          title="Курс доллара (нажмите для редактирования)"
        >
          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
          <span>$1 = {todayRate ? todayRate.rate.toFixed(2) : '9.50'}</span>
        </button>

        {/* Theme Toggle (Light / Dark Mode) */}
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-xl border transition-colors flex items-center justify-center active:scale-95 ${
            theme === 'light'
              ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-800'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-amber-400'
          }`}
          title={theme === 'light' ? 'Переключить на темный режим' : 'Переключить на обычный режим'}
        >
          {theme === 'light' ? (
            <Sun className="w-4 h-4 text-amber-600" />
          ) : (
            <Moon className="w-4 h-4 text-slate-300 hover:text-amber-400" />
          )}
        </button>

        {/* Global Scanner Trigger */}
        <button
          onClick={() => openScanner(() => {
            setActivePage('INVENTORY');
          })}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-emerald-400 active:scale-95 transition-all flex items-center space-x-1"
          title="Сканер штрих-кода / IMEI"
        >
          <Scan className="w-4 h-4" />
        </button>

        {/* Notifications Icon with Badge */}
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
          className={`relative p-2 rounded-xl border transition-colors active:scale-95 ${
            activePage === 'NOTIFICATIONS'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
          }`}
          title={activePage === 'NOTIFICATIONS' ? 'Закрыть уведомления' : 'Уведомления'}
        >
          <Bell className="w-4 h-4" />
          {unreadNotifsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(244,63,94,0.7)]">
              {unreadNotifsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
