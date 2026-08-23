import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import {
  Bell,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCheck,
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

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    notifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    setActivePage
  } = useApp();

  if (currentUser?.role === 'SELLER') {
    return <Navigate to="/sale" replace />;
  }

  // Filter notifications according to user role
  const visibleNotifications = notifications.filter(n => {
    if (n.targetRole && n.targetRole !== currentUser?.role) return false;
    if (n.targetUserId && n.targetUserId !== currentUser?.id) return false;
    return true;
  });

  const handleNotificationClick = (n: typeof notifications[0]) => {
    markNotificationAsRead(n.id);
    const target = n.linkPage || n.targetRoute || 'SALE';
    const route = PAGE_ROUTES[target] || '/sale';
    setActivePage(target as any);
    navigate(route);
  };

  const hasUnread = visibleNotifications.some(n => !(n.read ?? n.isRead));

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300">
      {/* Header */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0F1219] flex items-center justify-between shrink-0 font-mono">
        <div>
          <h3 className="text-xs font-bold text-slate-100 flex items-center space-x-2 tracking-wide uppercase">
            <Bell className="w-4 h-4 text-emerald-400" />
            <span>УВЕДОМЛЕНИЯ И ЗАДАЧИ</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 font-sans">
            Запросы на подтверждение перемещений, системные алерты и напоминания
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {hasUnread && (
            <button
              onClick={() => markAllNotificationsAsRead?.()}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-400 text-xs font-mono transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ПРОЧИТАТЬ ВСЕ</span>
            </button>
          )}

          <button
            onClick={() => setActivePage('SALE')}
            className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
            title="Закрыть уведомления"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 bg-[#0B0E14]">
        {visibleNotifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-mono">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-20 text-slate-400" />
            <p>Нет новых уведомлений</p>
          </div>
        ) : (
          visibleNotifications.map((n) => {
            const isUnread = !(n.read ?? n.isRead);
            const dateStr = n.timestamp || n.date || new Date().toISOString();
            const target = n.linkPage || n.targetRoute;

            return (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left p-3.5 hover:bg-slate-900/60 transition-colors flex items-start justify-between group ${
                  isUnread ? 'bg-slate-900/30 border-l-2 border-emerald-500' : ''
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs font-bold ${isUnread ? 'text-slate-100' : 'text-slate-400'}`}>
                      {n.title}
                    </span>
                    {isUnread && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.7)] shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-sans">{n.message}</p>
                  <span className="text-[10px] text-slate-500 font-mono block mt-1">
                    {new Date(dateStr).toLocaleString('ru-RU')}
                  </span>
                </div>

                {target && (
                  <span className="text-xs font-mono text-emerald-400 font-bold shrink-0 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
                    <span>ПЕРЕЙТИ</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
