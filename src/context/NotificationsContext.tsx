import React, { createContext, useContext, useCallback, useEffect, useMemo } from 'react';
import { NotificationItem } from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import { apiClient } from '../api/client';
import { mapNotification } from '../api/mappers';
import { useSharedState } from '../hooks/useSharedState';

interface NotificationsContextType {
  notifications: NotificationItem[];
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  resolveNotification: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);
const NotificationsActionsContext = createContext<Pick<NotificationsContextType, 'fetchNotifications'> | undefined>(undefined);

/**
 * Split out of AppContext (performance audit, P0-2): notifications update on every
 * NOTIFICATION_CREATED realtime event, unrelated to sales/inventory/everything else —
 * inside the one big context, that push re-rendered every page in the app. Living in
 * its own provider, a new notification only re-renders whatever actually reads
 * useNotifications() (the bell icon, the drawer, the Notifications page).
 *
 * Deliberately does NOT open its own WebSocket connection — AppProvider owns the single
 * realtime connection for the whole app and calls this context's fetchNotifications()
 * when it sees a NOTIFICATION_CREATED event, via useNotifications() from inside AppProvider.
 * That's why this provider must wrap AppProvider, not the other way around.
 */
export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authUser = useAuthStore((s) => s.currentUser);
  const authToken = useAuthStore((s) => s.token);
  const [notifications, setNotifications] = useSharedState<NotificationItem[]>([]);

  const fetchNotifications = useCallback(async () => {
    const token = useAuthStore.getState().token;
    const raw = await apiClient<any[]>('/notifications');
    if (useAuthStore.getState().token !== token) return;
    setNotifications(raw.map(mapNotification).sort((a, b) => new Date(b.date || b.timestamp || 0).getTime() - new Date(a.date || a.timestamp || 0).getTime()));
  }, []);

  // Mirrors AppContext's own authToken/authUser gate — loads once a session exists,
  // clears on logout so a new session never briefly shows the previous user's notifications.
  useEffect(() => {
    if (!authToken || !authUser) {
      setNotifications([]);
      return;
    }
    fetchNotifications().catch((e) => console.error('Failed to load notifications', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, authUser?.id]);

  const markNotificationRead = useCallback(async (id: string) => {
    try { await apiClient(`/notifications/${id}/read`, { method: 'PATCH' }); }
    catch { window.alert('Не удалось отметить уведомление прочитанным. Попробуйте ещё раз.'); return; }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true } : n)));
  }, []);

  const markAllNotificationsAsRead = useCallback(async () => {
    try { await apiClient('/notifications/read-all', { method: 'POST' }); }
    catch { window.alert('Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.'); return; }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
  }, []);

  const resolveNotification = useCallback(async (id: string) => {
    try { await apiClient(`/notifications/${id}/resolve`, { method: 'PATCH' }); }
    catch { window.alert('Не удалось закрыть уведомление. Попробуйте ещё раз.'); return; }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, resolved: true, read: true, isRead: true } : n)));
  }, []);

  const value = useMemo<NotificationsContextType>(() => ({
    notifications,
    fetchNotifications,
    markNotificationRead,
    markNotificationAsRead: markNotificationRead,
    markAllNotificationsAsRead,
    resolveNotification,
  }), [notifications, fetchNotifications, markNotificationRead, markAllNotificationsAsRead, resolveNotification]);

  const actions = useMemo(() => ({ fetchNotifications }), [fetchNotifications]);
  return <NotificationsActionsContext.Provider value={actions}><NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider></NotificationsActionsContext.Provider>;
};

export function useNotificationsActions() {
  const value = useContext(NotificationsActionsContext);
  if (!value) throw new Error('useNotificationsActions must be used within NotificationsProvider');
  return value;
}

export function useNotifications(): NotificationsContextType {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
