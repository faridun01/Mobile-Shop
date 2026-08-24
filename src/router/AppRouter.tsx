import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { PageId } from '../types';

// Layouts & Modals
import { TopBar } from '../components/layout/TopBar';
import { Sidebar } from '../components/layout/Sidebar';
import { TabletNavRail } from '../components/layout/TabletNavRail';
import { Drawer } from '../components/layout/Drawer';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';
import { DailyRateModal } from '../components/common/DailyRateModal';
import { BarcodeScannerModal } from '../components/common/BarcodeScannerModal';
import { PWAInstallPrompt } from '../components/pwa/PWAInstallPrompt';
import { PWAUpdateNotifier } from '../components/pwa/PWAUpdateNotifier';
import { useUIStore } from '../stores/useUIStore';
import { useApp } from '../context/AppContext';

// Lazy-loaded page components for Code Splitting
const LoginPage = lazy(() => import('../components/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SalePage = lazy(() => import('../components/pages/SalePage').then(m => ({ default: m.SalePage })));
const SalesHistoryPage = lazy(() => import('../components/pages/SalesHistoryPage').then(m => ({ default: m.SalesHistoryPage })));
const InventoryPage = lazy(() => import('../components/pages/InventoryPage').then(m => ({ default: m.InventoryPage })));
const PurchasePage = lazy(() => import('../components/pages/PurchasePage').then(m => ({ default: m.PurchasePage })));
const TransferPage = lazy(() => import('../components/pages/TransferPage').then(m => ({ default: m.TransferPage })));
const ExchangePage = lazy(() => import('../components/pages/ExchangePage').then(m => ({ default: m.ExchangePage })));
const RepairPage = lazy(() => import('../components/pages/RepairPage').then(m => ({ default: m.RepairPage })));
const SuppliersPage = lazy(() => import('../components/pages/SuppliersPage').then(m => ({ default: m.SuppliersPage })));
const BonusesPage = lazy(() => import('../components/pages/BonusesPage').then(m => ({ default: m.BonusesPage })));
const ExpensesPage = lazy(() => import('../components/pages/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const OwnersPage = lazy(() => import('../components/pages/OwnersPage').then(m => ({ default: m.OwnersPage })));
const EmployeesPage = lazy(() => import('../components/pages/EmployeesPage').then(m => ({ default: m.EmployeesPage })));
const ReportsPage = lazy(() => import('../components/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const AuditLogPage = lazy(() => import('../components/pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })));
const SettingsPage = lazy(() => import('../components/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const NotificationsPage = lazy(() => import('../components/pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));

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

function LoadingFallback() {
  return (
    <div className="flex flex-1 h-full items-center justify-center bg-[#0B0F17] text-slate-400">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono tracking-widest text-slate-400">ЗАГРУЗКА МОДУЛЯ...</span>
      </div>
    </div>
  );
}

function MainLayout() {
  const location = useLocation();
  const { currentUser } = useAuthStore();
  const { isDailyRateModalOpen, setDailyRateModalOpen } = useUIStore();
  const { isRateModalOpen, activePage, setActivePage } = useApp();

  React.useEffect(() => {
    const matched = Object.entries(PAGE_ROUTES).find(([_, path]) => path === location.pathname);
    if (matched) {
      const pageId = matched[0] as PageId;
      if (pageId !== activePage) {
        setActivePage(pageId);
      }
    }
  }, [location.pathname]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] w-screen overflow-hidden bg-[#0B0F17] text-slate-200 antialiased selection:bg-blue-500 selection:text-white">
      <Drawer />
      <TabletNavRail />
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#0B0F17] relative">
        <TopBar />
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto relative bg-[#0B0F17] pb-20 lg:pb-0">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Navigate to="/sale" replace />} />
              <Route path="/sale" element={<SalePage />} />
              <Route path="/sales-history" element={<SalesHistoryPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/purchase" element={<PurchasePage />} />
              <Route path="/transfer" element={<TransferPage />} />
              <Route path="/exchange" element={<ExchangePage />} />
              <Route path="/repair" element={<RepairPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/bonuses" element={<BonusesPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/owners" element={<OwnersPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/audit-log" element={<AuditLogPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="*" element={<Navigate to="/sale" replace />} />
            </Routes>
          </Suspense>
        </main>
        <MobileBottomNav />

        <footer className="hidden md:flex h-6 shrink-0 border-t border-slate-800 bg-[#0F131D] px-3 items-center justify-between text-[10px] font-mono text-slate-400 select-none z-20">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-slate-300 font-medium">СИСТЕМА: АКТИВНА</span>
            </span>
            <span>|</span>
            <span className="text-slate-400">ТОЧКА: {currentUser?.storeName || 'ГЛАВНЫЙ СКЛАД'}</span>
            <span>|</span>
            <span>ПОЛЬЗОВАТЕЛЬ: {currentUser?.name}</span>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-slate-400">ВАЛЮТА: USD / TJS</span>
            <span>|</span>
            <span className="text-slate-300 font-medium">ОНЛАЙН СИНХРОНИЗАЦИЯ</span>
          </div>
        </footer>
      </div>

      <DailyRateModal isOpen={isDailyRateModalOpen || isRateModalOpen} onClose={() => setDailyRateModalOpen(false)} />
      <BarcodeScannerModal />
      <PWAInstallPrompt />
      <PWAUpdateNotifier />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Suspense fallback={<LoadingFallback />}><LoginPage /></Suspense>} />
        <Route path="/*" element={<MainLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
