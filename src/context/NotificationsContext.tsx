import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { NotificationItem } from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import { apiClient } from '../api/client';
import { mapNotification } from '../api/mappers';

interface NotificationsContextType {
  notifications: NotificationItem[];
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  resolveNotification: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

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
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const fetchNotifications = useCallback(async () => {
    const raw = await apiClient<any[]>('/notifications');
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

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true } : n)));
    apiClient(`/notifications/${id}/read`, { method: 'PATCH' }).catch((e) => console.error(e));
  }, []);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
    apiClient('/notifications/read-all', { method: 'POST' }).catch((e) => console.error(e));
  }, []);

  const resolveNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, resolved: true, read: true, isRead: true } : n)));
    apiClient(`/notifications/${id}/resolve`, { method: 'PATCH' }).catch((e) => console.error(e));
  }, []);

  const value = useMemo<NotificationsContextType>(() => ({
    notifications,
    fetchNotifications,
    markNotificationRead,
    markNotificationAsRead: markNotificationRead,
    markAllNotificationsAsRead,
    resolveNotification,
  }), [notifications, fetchNotifications, markNotificationRead, markAllNotificationsAsRead, resolveNotification]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export function useNotifications(): NotificationsContextType {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}
