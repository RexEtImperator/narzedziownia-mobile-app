import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import api from './api';
import { usePermissions } from './PermissionsContext';
import { initializeAndRestore, registerDevicePushToken, addAck, acknowledgeOverdueItem } from './notifications';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const NotificationsContext = createContext({
  unreadCount: 0,
  items: [],
  loading: false,
  error: null,
  refresh: async () => {},
  markAsRead: async (id) => {},
});

export const useNotifications = () => useContext(NotificationsContext);

export const NotificationsProvider = ({ children }) => {
  const { currentUser, hasPermission } = usePermissions();
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  const responseListener = useRef();
  const notificationListener = useRef();

  const fetchNotifications = useCallback(async () => {
    if (!currentUser) {
        setItems([]);
        setUnreadCount(0);
        return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.init();
      // Fetch user notifications
      const userNotifsRaw = await api.get('/api/notifications').catch(() => []);
      const userNotifs = (Array.isArray(userNotifsRaw) ? userNotifsRaw : []).map(n => ({
        id: String(n.id || `${(n.itemType || n.item_type || 'tool')}-${n.item_id || Math.random()}`),
        type: String(n.type || 'return_request'),
        itemType: String(n.item_type || n.itemType || 'tool'),
        inventory_number: n.inventory_number || '-',
        manufacturer: n.manufacturer || '',
        model: n.model || '',
        employee_id: n.employee_id || null,
        employee_brand_number: n.employee_brand_number || '',
        message: n.message || '',
        subject: n.subject || '',
        url: n.url || n.uri || null,
        created_at: n.created_at || n.createdAt || null,
        inspection_date: n.inspection_date || null,
        read: !!n.read
      }));

      // Calculate unread count from user notifications
      const count = userNotifs.filter(n => !n.read).length;
      setUnreadCount(count);
      setItems(userNotifs);
    } catch (e) {
      console.log('Error fetching notifications:', e);
      setError(e?.message || 'Nie udało się pobrać powiadomień');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const markAsRead = useCallback(async (notification) => {
    if (!notification) return;
    
    // Optimistic update
    setItems(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      if (notification.type === 'return_request') {
        await api.post(`/api/notifications/${encodeURIComponent(notification.id)}/read`, {});
      } else if (notification.type === 'bhp' || notification.type === 'tool') {
        await acknowledgeOverdueItem(notification.type, notification.id, notification.inspection_date);
      } else {
        // Fallback for generic notifications
        await api.post(`/api/notifications/${encodeURIComponent(notification.id)}/read`, {}).catch(() => {});
      }
    } catch (e) {
      console.log('Error marking as read:', e);
      // Revert on error? Usually not worth the UX jitter for read status, but maybe log it.
    }
    // Fetch to sync with server
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await api.post('/api/notifications/read-all', {});
    } catch (e) {
      console.log('Error marking all as read:', e);
    }
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsUnread = useCallback(async (notification) => {
    if (!notification) return;
    
    // Optimistic update
    setItems(prev => prev.map(n => n.id === notification.id ? { ...n, read: false } : n));
    setUnreadCount(prev => prev + 1);

    try {
      if (notification.type === 'return_request') {
        await api.post(`/api/notify-return/${encodeURIComponent(notification.id)}/unread`, {});
      } else if (['bhp', 'tool', 'overdue_inspection', 'upcoming_inspection'].includes(notification.type)) {
        // Skip API for these types as they don't support unread or use different logic
        // This prevents "Invalid notification ID" errors for items that aren't standard notifications
      } else {
        await api.post(`/api/notifications/${encodeURIComponent(notification.id)}/unread`, {});
      }
    } catch (e) {
      // Ignore specific backend errors that shouldn't crash the UI
      if (e?.code === 'NOTIFICATIONS_INVALID_ID' || e?.message?.includes('Invalid notification ID')) {
        // Silent ignore
      } else {
        console.log('Error marking as unread:', e);
      }
    }
    fetchNotifications();
  }, [fetchNotifications]);

  const refresh = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Initial setup and token registration
  useEffect(() => {
    if (currentUser) {
      const init = async () => {
        try {
          await initializeAndRestore();
          await registerDevicePushToken();
          await fetchNotifications();
        } catch (e) {
          console.log('Notification init error:', e);
        }
      };
      init();

      // Refresh notifications when app returns from background
      const subscription = AppState.addEventListener('change', nextAppState => {
        if (nextAppState === 'active') {
          fetchNotifications();
        }
      });
      return () => {
        subscription.remove();
      };
    }
  }, [currentUser, fetchNotifications]);

  // Notification listeners
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    // Even in Expo Go we might want some handling, but based on previous code, we skip some parts.
    // However, the listener registration is generally safe.

    // Listener for when a user taps a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response?.notification?.request?.content?.data || {};
      const url = data?.url || data?.uri || data?.link || data?.path || null;
      
      // Handle ACK if present
      const ackKey = data?.ackKey;
      if (ackKey) {
        try { addAck(ackKey); } catch {}
      }

      if (url) {
        setPendingNavigation({ url, data });
      }
    });

    // Listener for when a notification is received while app is foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        const data = notification?.request?.content?.data || {};
        const type = String(data?.type || '').trim();
        // Refresh if requested
        if (type === 'notifications:refresh' || data?.refresh === true) {
            refresh();
        }
        // Also refresh on any notification just in case?
        // refresh(); 
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, [refresh]);

  const value = {
    unreadCount,
    items,
    loading,
    error,
    refresh,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    pendingNavigation,
    setPendingNavigation
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
