import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppFields } from '../../context/AppContext';
import {
  ShoppingBag,
  History,
  Package,
  PlusCircle,
  Menu,
  Landmark,
  Truck,
  ArrowLeftRight,
} from 'lucide-react';

export const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentUser,
    setActivePage,
    drawerOpen,
    setDrawerOpen,
    selectedStoreId,
  } = useAppFields('currentUser', 'setActivePage', 'drawerOpen', 'setDrawerOpen', 'selectedStoreId');

  const userRole = currentUser?.role || 'SELLER';
  const isAdmin = userRole === 'ADMIN';
  const isCentralCashMode = isAdmin && (!selectedStoreId || selectedStoreId === 'all');

  const NavItem: React.FC<{
    routePath: string;
    label: string;
    icon: React.ElementType;
    title?: string;
    onSelect: () => void;
  }> = ({
    routePath,
    label,
    icon: Icon,
    title,
    onSelect,
  }) => {
    const isActive = location.pathname === routePath;
    return (
      <button
        onClick={onSelect}
        title={title || label}
        className={`flex-1 pt-2 pb-1 flex flex-col items-center justify-start gap-1 transition-colors ${
          isActive ? 'text-accent' : 'text-fg-subtle active:text-fg'
        }`}
      >
        <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
        <span className={`text-[10px] leading-none ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      </button>
    );
  };

  if (isCentralCashMode) {
    const isFinanceActive = location.pathname === '/finance' || location.pathname === '/';

    return (
      <nav className="app-bottom-nav md:hidden shrink-0 w-full bg-surface border-t border-border flex items-stretch justify-around select-none">
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
          routePath="/suppliers"
          label="Поставщики"
          icon={Truck}
          onSelect={() => {
            setActivePage('SUPPLIERS');
            navigate('/suppliers');
          }}
        />

        {/* Center primary action in Central Cash — Finance Dashboard */}
        <div className="flex-1 flex justify-center items-center relative">
          <button
            onClick={() => {
              setActivePage('FINANCE');
              navigate('/finance');
            }}
            className={`w-13 h-13 -mt-4 rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md ${
              isFinanceActive ? 'bg-accent-strong text-accent-fg' : 'bg-accent text-accent-fg'
            }`}
            title="Центральная касса и финансы"
          >
            <Landmark className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-[9px] font-bold tracking-tight leading-none mt-0.5">Офис</span>
          </button>
        </div>

        <NavItem
          routePath="/transfer"
          label="Перемещение"
          icon={ArrowLeftRight}
          onSelect={() => {
            setActivePage('TRANSFER');
            navigate('/transfer');
          }}
        />

        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          className={`flex-1 pt-2 pb-1 flex flex-col items-center justify-start gap-1 transition-colors ${
            drawerOpen ? 'text-accent' : 'text-fg-subtle active:text-fg'
          }`}
        >
          <div className="relative">
            <Menu className="w-5 h-5" strokeWidth={drawerOpen ? 2.5 : 2} />
          </div>
          <span className={`text-[10px] leading-none ${drawerOpen ? 'font-semibold' : 'font-medium'}`}>Меню</span>
        </button>
      </nav>
    );
  }

  // Retail Store mode / Seller / Partner
  const isSaleActive = location.pathname === '/sale' || location.pathname === '/';

  return (
    <nav className="app-bottom-nav md:hidden shrink-0 w-full bg-surface border-t border-border flex items-stretch justify-around select-none">
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
          className={`w-13 h-13 -mt-4 rounded-full flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md ${
            isSaleActive ? 'bg-accent-strong text-accent-fg' : 'bg-accent text-accent-fg'
          }`}
          title="POS Терминал"
        >
          <ShoppingBag className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-[9px] font-bold tracking-tight leading-none mt-0.5">POS</span>
        </button>
      </div>

      {isAdmin ? (
        <NavItem
          routePath="/purchase"
          label="Приход"
          title="Приход товара"
          icon={PlusCircle}
          onSelect={() => {
            setActivePage('PURCHASE');
            navigate('/purchase');
          }}
        />
      ) : (
        <NavItem
          routePath="/transfer"
          label="Перемещение"
          icon={ArrowLeftRight}
          onSelect={() => {
            setActivePage('TRANSFER');
            navigate('/transfer');
          }}
        />
      )}

      <button
        onClick={() => setDrawerOpen(!drawerOpen)}
        className={`flex-1 pt-2 pb-1 flex flex-col items-center justify-start gap-1 transition-colors ${
          drawerOpen ? 'text-accent' : 'text-fg-subtle active:text-fg'
        }`}
      >
        <div className="relative">
          <Menu className="w-5 h-5" strokeWidth={drawerOpen ? 2.5 : 2} />
        </div>
        <span className={`text-[10px] leading-none ${drawerOpen ? 'font-semibold' : 'font-medium'}`}>Меню</span>
      </button>
    </nav>
  );
};
