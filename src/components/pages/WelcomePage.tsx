import React from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useAppFields } from '../../context/AppContext';
import { useUIStore } from '../../stores/useUIStore';
import { formatUserName } from '../../utils/formatUser';
import { formatStoreName } from '../../utils/storeContext';
import { Smartphone, Menu, Calendar, Store, ShieldCheck } from 'lucide-react';

export const WelcomePage: React.FC = () => {
  const { currentUser } = useAuthStore();
  const { stores, selectedStoreId, setDrawerOpen: setAppDrawerOpen } = useAppFields(
    'stores',
    'selectedStoreId',
    'setDrawerOpen'
  );
  const setUiDrawerOpen = useUIStore((s) => s.setDrawerOpen);

  const handleOpenMenu = () => {
    setAppDrawerOpen(true);
    setUiDrawerOpen(true);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Доброе утро';
    if (hour >= 12 && hour < 18) return 'Добрый день';
    if (hour >= 18 && hour < 23) return 'Добрый вечер';
    return 'Доброй ночи';
  };

  const userName = formatUserName(currentUser?.name) || 'Администратор';

  const activeStoreLabel =
    currentUser?.storeName ||
    (currentUser?.storeId ? stores.find((s) => s.id === currentUser.storeId)?.name : undefined) ||
    (selectedStoreId && selectedStoreId !== 'all' ? stores.find((s) => s.id === selectedStoreId)?.name : undefined) ||
    'Главный офис / Все точки';

  const todayStr = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  // Capitalize first letter of weekday
  const capitalizedDate = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  return (
    <div
      data-welcome-page="true"
      className="flex-1 w-full h-full min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 text-center select-none relative overflow-hidden bg-bg"
    >
      {/* Subtle decorative background glow */}
      <div className="absolute -top-32 -left-32 w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Welcome Card */}
      <div className="max-w-md w-full bg-surface border border-border/80 rounded-3xl p-6 sm:p-8 shadow-sm backdrop-blur-xs relative z-10 space-y-4 sm:space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* App Logo Badge */}
        <div className="relative inline-flex items-center justify-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-surface-raised border border-border flex items-center justify-center text-accent shadow-2xs">
            <Smartphone className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-accent border-2 border-surface flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-fg animate-pulse" />
          </span>
        </div>

        {/* Headings */}
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-fg tracking-tight">
            {getGreeting()}, {userName}!
          </h1>
          <p className="text-xs sm:text-sm text-fg-muted">
            Добро пожаловать в Mobile Shop OS
          </p>
        </div>

        {/* Context info pill */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised border border-border/70 text-[11px] font-medium text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3 text-accent shrink-0" />
            <span>{capitalizedDate}</span>
          </span>
          <span className="text-border">•</span>
          <span className="inline-flex items-center gap-1">
            <Store className="w-3 h-3 text-accent shrink-0" />
            <span className="truncate max-w-[150px] sm:max-w-none">{formatStoreName(activeStoreLabel)}</span>
          </span>
        </div>

        {/* Minimalist instruction */}
        <div className="p-3.5 rounded-2xl bg-surface-raised/60 border border-border/50 text-xs text-fg-subtle leading-relaxed">
          <p>
            Для начала работы выберите нужный раздел в меню.
          </p>
        </div>

        {/* Mobile menu trigger */}
        <div className="md:hidden pt-1">
          <button
            type="button"
            onClick={handleOpenMenu}
            className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-accent hover:bg-accent-strong active:scale-95 text-xs sm:text-sm font-bold text-accent-fg uppercase tracking-wider transition-all shadow-md cursor-pointer"
          >
            <Menu className="w-5 h-5" />
            <span>Открыть меню разделов</span>
          </button>
        </div>

        <div className="pt-2 flex items-center justify-center gap-1.5 text-[10px] text-fg-subtle uppercase tracking-widest">
          <ShieldCheck className="w-3.5 h-3.5 text-accent" />
          <span>Система готова к работе</span>
        </div>
      </div>
    </div>
  );
};
