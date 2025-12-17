import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Dimensions, ScrollView, DeviceEventEmitter, Linking, RefreshControl } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { hasPermission, PERMISSIONS } from '../lib/constants';
import { clearAcknowledgements as clearGlobalAcks, sendImmediate } from '../lib/notifications';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canOverdue, setCanOverdue] = useState(false);
  const [adminTab, setAdminTab] = useState('general'); // 'general' | 'overdue'

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
    headerRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 48 },
    backBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    titleCentered: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700', color: colors.text },
    subtitle: { color: colors.muted },
    card: { marginTop: 10, borderColor: colors.border },
    notifRow: { flexDirection: 'row', alignItems: 'center' },
    notifIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    notifTitle: { color: colors.text, fontWeight: '600' },
    notifSub: { color: colors.muted },
    sectionHeader: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  });

  const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const rawUser = await AsyncStorage.getItem('@current_user');
        const user = rawUser ? JSON.parse(rawUser) : null;

        // Powiadomienia użytkownika (return_request / inne), zgodnie z TopBar.jsx
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

        // Przeterminowane przeglądy (BHP/Narzędzia) — jak w TopBar.jsx
        let overdueNotifs = [];
        const canSeeOverdue = hasPermission(user, PERMISSIONS.NOTIFY);
        setCanOverdue(!!canSeeOverdue);
        if (canSeeOverdue) {
          const [bhpItems, tools] = await Promise.all([
            api.get('/api/bhp').catch(() => []),
            api.get('/api/tools').catch(() => [])
          ]);

          const dayMs = 1000 * 60 * 60 * 24;
          const daysDelta = (dateStr) => {
            const d = parseDateFlexibleUI(dateStr);
            if (!d) return null;
            const today = new Date();
            const diff = d.setHours(0,0,0,0) - today.setHours(0,0,0,0);
            return Math.ceil(diff / dayMs);
          };
          const makeNotif = (item, itemType, type, msg) => ({
            id: `${type}-${itemType}-${item.id ?? item.inventory_number ?? Math.random()}`,
            type,
            itemType,
            inventory_number: item.inventory_number || '-',
            manufacturer: item.manufacturer || '',
            model: item.model || item.name || '',
            employee_id: null,
            employee_brand_number: '',
            message: msg || '',
            created_at: null,
            inspection_date: item.inspection_date || null,
            read: true,
          });

          const overdue = [
            ...((Array.isArray(tools) ? tools : [])
              .filter(t => t?.inspection_date && (daysDelta(t.inspection_date) ?? 1) < 0)
              .map(t => makeNotif(t, 'tool', 'overdue_inspection', ''))),
            ...((Array.isArray(bhpItems) ? bhpItems : [])
              .filter(b => b?.inspection_date && (daysDelta(b.inspection_date) ?? 1) < 0)
              .map(b => makeNotif(b, 'bhp', 'overdue_inspection', ''))),
          ];

          const upcoming = [
            ...((Array.isArray(tools) ? tools : [])
              .filter(t => t?.inspection_date && (daysDelta(t.inspection_date) ?? -999) >= 0 && (daysDelta(t.inspection_date) ?? 999) <= 30)
              .map(t => {
                const d = daysDelta(t.inspection_date) ?? 0;
                const msg = d <= 7
                  ? `Przegląd narzędzia ${t.inventory_number || '-'} za ${d} dni`
                  : `Przegląd narzędzia ${t.inventory_number || '-'} za ${d} dni`;
                return makeNotif(t, 'tool', 'upcoming_inspection', msg);
              })),
            ...((Array.isArray(bhpItems) ? bhpItems : [])
              .filter(b => b?.inspection_date && (daysDelta(b.inspection_date) ?? -999) >= 0 && (daysDelta(b.inspection_date) ?? 999) <= 30)
              .map(b => {
                const d = daysDelta(b.inspection_date) ?? 0;
                const msg = d <= 7
                  ? `Przegląd BHP ${b.inventory_number || '-'} za ${d} dni`
                  : `Przegląd BHP ${b.inventory_number || '-'} za ${d} dni`;
                return makeNotif(b, 'bhp', 'upcoming_inspection', msg);
              })),
          ];

          overdueNotifs = [...overdue, ...upcoming];
        }

        // Wyświetl push lokalny dla nowych wiadomości (broadcast/custom/admin)
        await ensurePushForUserNotifs(userNotifs);
        const combined = [ ...userNotifs, ...overdueNotifs ];
        setItems(combined);
      } catch (e) {
        setError(e?.message || 'Nie udało się wczytać powiadomień');
        setItems([]);
      } finally {
        setLoading(false);
      }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('notifications:refresh', () => {
      // Odbiór sygnału odświeżenia z lib/notifications.js / App.js
      load();
    });
    return () => { try { sub.remove(); } catch {} };
  }, []);

  // Odśwież przy wejściu na ekran (gdy użytkownik otwiera zakładkę)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      load();
    });
    return unsubscribe;
  }, [navigation]);

  const parseDateFlexibleUI = (val) => {
    if (!val) return null;
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    const m = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const d = new Date(`${yyyy}-${mm}-${dd}`);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  };

  const calcDaysOverdue = (dateStr) => {
    const d = parseDateFlexibleUI(dateStr);
    if (!d) return null;
    const today = new Date();
    const diffMs = d.setHours(0,0,0,0) - today.setHours(0,0,0,0);
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return days < 0 ? Math.abs(days) : 0;
  };

  const formatDatePL = (dateStr) => {
    const d = parseDateFlexibleUI(dateStr);
    if (!d) return String(dateStr || '-');
    try {
      return d.toLocaleDateString('pl-PL');
    } catch (_) {
      return String(dateStr || '-');
    }
  };
  const formatDateTimePL = (dateStr) => {
    const d = parseDateFlexibleUI(dateStr);
    if (!d) return String(dateStr || '-');
    try {
      return d.toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return String(dateStr || '-');
    }
  };

  const markAllRead = async () => {
    // Parzystość z TopBar.jsx: oznacz wszystko jako przeczytane po stronie backendu
    try { await api.post('/api/notifications/read-all', {}); } catch (_) { /* ignore */ }
    // Lokalna aktualizacja i sygnał odświeżenia
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    try { DeviceEventEmitter.emit('notifications:refresh', { source: 'local' }); } catch (_) { /* ignore */ }
  };

  const clearConfirmations = async () => {
    // Parzystość z TopBar.jsx: oznacz wszystkie powiadomienia jako nieprzeczytane po stronie backendu
    try { await api.post('/api/notify-return/unread-all', {}); } catch (_) { /* ignore */ }
    try { await api.post('/api/notifications/unread-all', {}); } catch (_) { /* ignore */ }
    // Lokalna aktualizacja i sygnał odświeżenia
    setItems(prev => prev.map(n => ({ ...n, read: false })));
    try { DeviceEventEmitter.emit('notifications:refresh', { source: 'local' }); } catch (_) { /* ignore */ }
  };

  const markRead = async (n) => {
    try {
      if (n.type === 'return_request') {
        await api.post(`/api/notifications/${encodeURIComponent(n.id)}/read`, {});
      } else if (n.type === 'bhp' || n.type === 'tool') {
        const ackKey = n.type === 'bhp' ? 'bhp_overdue_ack_v2' : 'tools_overdue_ack_v2';
        const raw = await AsyncStorage.getItem(ackKey);
        const map = raw ? JSON.parse(raw) : {};
        const dateVal = String(n.inspection_date || '');
        const key = n.id.replace(n.type === 'bhp' ? 'bhp-' : 'tool-', '');
        map[key] = dateVal;
        await AsyncStorage.setItem(ackKey, JSON.stringify(map));
      }
    } catch (_) { /* ignore */ }
    setItems(prev => prev.map(it => it.id === n.id ? ({ ...it, read: true }) : it));
    try { DeviceEventEmitter.emit('notifications:refresh', { source: 'local' }); } catch (_) { /* ignore */ }
  };

  // Pomocniczo: wyodrębnij nadawcę i treść z wiadomości (jak w TopBar)
  const extractSenderFromMessage = (msg) => {
    try {
      const s = String(msg || '').trim();
      if (!s) return { sender: '', content: '' };
      const lines = s.split(/\r?\n/);
      let sender = '', content = s;
      if (lines.length > 1 && /^(Od|From):/i.test(lines[0])) {
        sender = lines[0].replace(/^(Od|From):\s*/i, '').trim();
        content = lines.slice(1).join('\n').trim();
      }
      return { sender, content };
    } catch (_) {
      return { sender: '', content: '' };
    }
  };

  // Otwieranie adresów URL z powiadomień: wspiera linki zewnętrzne i wewnętrzne ścieżki
  const openNotifUrl = async (u, n) => {
    try {
      const s = String(u || '').trim();
      if (!s) return;
      const lower = s.toLowerCase();
      // Schematy wewnętrzne app://bhp?..., app://narzedzia?...
      if (lower.startsWith('app://')) {
        try {
          const url = new URL(s);
          const host = String(url.hostname || '').toLowerCase();
          const params = url.searchParams;
          const filterParam = (
            params.get('filter') || params.get('q') || params.get('search') ||
            params.get('inv') || params.get('inventory_number') || params.get('model') || params.get('name') || ''
          );
          const filterVal = String(filterParam || n?.inventory_number || n?.model || '').trim();
          if (host.includes('bhp')) {
            navigation.navigate('MainTabs', { screen: 'BHP', params: filterVal ? { filter: filterVal } : undefined });
            return;
          }
          if (host.includes('narzedzia') || host.includes('narzędzia') || host.includes('tools')) {
            navigation.navigate('MainTabs', { screen: 'Narzędzia', params: filterVal ? { filter: filterVal } : undefined });
            return;
          }
        } catch {}
      }
      // Zewnętrzne linki: http/https/mailto
      if (/^(https?:\/\/)/.test(lower) || lower.startsWith('mailto:')) {
        try { await Linking.openURL(s); } catch (_) {}
        return;
      }
      // Wewnętrzne: spróbuj sparsować i nawigować do odpowiedniej zakładki z filtrem
      let path = s;
      try {
        const url = new URL(s.startsWith('/') ? s : ('/' + s), 'https://local');
        path = url.pathname.toLowerCase();
        const params = url.searchParams;
        const filterParam = (
          params.get('filter') || params.get('q') || params.get('search') ||
          params.get('inv') || params.get('inventory_number') || params.get('code') ||
          params.get('sku') || params.get('model') || params.get('name') || ''
        );
        const filterVal = String(filterParam || n?.inventory_number || n?.model || '').trim();
        if (path.includes('bhp')) {
          if (filterVal) {
            navigation.navigate('MainTabs', { screen: 'BHP', params: { filter: filterVal } });
            return;
          }
          navigation.navigate('MainTabs', { screen: 'BHP' });
          return;
        }
        if (path.includes('narzedzia') || path.includes('narzędzia') || path.includes('tools')) {
          if (filterVal) {
            navigation.navigate('MainTabs', { screen: 'Narzędzia', params: { filter: filterVal } });
            return;
          }
          navigation.navigate('MainTabs', { screen: 'Narzędzia' });
          return;
        }
      } catch {
        // jeśli parsowanie się nie powiedzie, spróbuj otworzyć jako zewnętrzny link
      }
      try { await Linking.openURL(s); } catch (_) {}
    } catch {}
  };

  const renderItem = ({ item: n }) => {
    const isInspectionType = n.type === 'overdue_inspection' || n.type === 'upcoming_inspection';
    const iconBg = isInspectionType ? '#fecaca' : '#bfdbfe';
    const iconColor = isInspectionType ? '#dc2626' : '#1d4ed8';
    const isMessageType = n.type === 'broadcast' || n.type === 'custom' || n.type === 'admin';
    const iconName = isMessageType ? 'notifications' : (n.itemType === 'bhp' ? 'shield' : (n.itemType === 'tool' ? 'construct' : 'notifications'));
    const unread = !n.read;
    const filterValue = (n.inventory_number && String(n.inventory_number).trim()) || (n.model && String(n.model).trim()) || '';
    const handleNavigate = () => {
      if (!filterValue) return;
      if (n.itemType === 'bhp') {
        navigation.navigate('MainTabs', { screen: 'BHP', params: { filter: filterValue } });
      } else {
        navigation.navigate('MainTabs', { screen: 'Narzędzia', params: { filter: filterValue } });
      }
    };
    const rowOnPress = () => {
      if (isMessageType && n.url) {
        openNotifUrl(n.url, n);
      } else {
        handleNavigate();
      }
    };
    const bgColorDefault = unread ? '#32445eff' : '#1e293b';
    const renderLeftActions = () => (
      <View style={{ width: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#32445eff' }}>
        <Ionicons name="eye-outline" size={30} color={colors.muted} />
      </View>
    );
    const renderRightActions = () => (
      <View style={{ width: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#FF383C' }}>
        <Ionicons name="eye-off-outline" size={40} color={colors.muted} />
      </View>
    );
    let swipeRef = null;
    const handleSwipeAction = async (direction) => {
      if (direction === 'left') {
        await markRead(n);
      } else if (direction === 'right') {
        await markUnread();
      }
      try { await new Promise((r) => setTimeout(r, 300)); } catch {}
      try { if (swipeRef) swipeRef.close(); } catch {}
    };
    const markUnread = async () => {
      try {
        if (n.type === 'return_request') {
          await api.post(`/api/notify-return/${encodeURIComponent(n.id)}/unread`, {});
        } else {
          await api.post(`/api/notifications/${encodeURIComponent(n.id)}/unread`, {});
        }
      } catch (_) { /* ignore */ }
      setItems(prev => prev.map(x => x.id === n.id ? ({ ...x, read: false }) : x));
    };
    return (
      <Swipeable
        ref={(r) => { swipeRef = r; }}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={30}
        rightThreshold={30}
        friction={1.2}
        overshootFriction={8}
        onSwipeableLeftOpen={() => {
          try { if (swipeRef) swipeRef.close(); } catch {}
          markRead(n);
        }}
        onSwipeableRightOpen={() => {
          try { if (swipeRef) swipeRef.close(); } catch {}
          markUnread();
        }}
      >
        <Pressable
          onPress={rowOnPress}
          style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: pressed ? '#334155e8' : bgColorDefault }]}
          accessibilityRole="button"
          accessibilityLabel={isMessageType && n.url ? 'Otwórz link powiadomienia' : 'Otwórz listę powiązaną'}
        >
        {({ pressed }) => (
        <>
        <View style={styles.notifRow}>
          <View style={[styles.notifIcon, { backgroundColor: iconBg }]}><Ionicons name={iconName} size={18} color={iconColor} /></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, flexGrow: 1, minWidth: 0 }}>
                {isMessageType ? (
                  n.subject ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.notifTitle, pressed ? { textDecorationLine: 'underline' } : null]}>{n.subject}</Text>
                      {n.url ? (<Ionicons name="link-outline" size={16} color={colors.primary} />) : null}
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.notifTitle}>{n.inventory_number || n.model || '-'}</Text>
                      {n.url ? (<Ionicons name="link-outline" size={16} color={colors.primary} />) : null}
                    </View>
                  )
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.notifTitle, pressed ? { textDecorationLine: 'underline' } : null]}>{n.inventory_number || n.model || '-'}</Text>
                      {n.url ? (<Ionicons name="link-outline" size={16} color={colors.primary} />) : null}
                    </View>
                )}
                {!isMessageType && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>{n.itemType === 'bhp' ? 'BHP' : (n.itemType === 'tool' ? 'Narzędzie' : '-')}</Text>
                  </View>
                )}
                {isMessageType && (
                  <>
                    {/* Badge roli nadawcy */}
                    {(() => {
                      const { sender } = extractSenderFromMessage(n.message || '');
                      const isAdminSender = /admin/i.test(String(sender || '')) || n.type === 'admin';
                      return isAdminSender ? (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                          <Text style={{ fontSize: 11, color: colors.text }}>Admin</Text>
                        </View>
                      ) : null;
                    })()}
                    {/* Badge trybu wysyłki */}
                    {n.type === 'broadcast' ? (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 11, color: colors.text }}>Do wszystkich</Text>
                      </View>
                    ) : n.type === 'custom' ? (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 11, color: colors.text }}>Niestandardowe</Text>
                      </View>
                    ) : null}
                  </>
                )}
          </View>
        </View>
        {n.manufacturer || n.model ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>{[n.manufacturer, n.model].filter(Boolean).join(' ')}</Text>
        ) : null}
        {(n.type === 'broadcast' || n.type === 'custom' || n.type === 'admin') ? (
          (() => {
            const { sender, content } = extractSenderFromMessage(n.message);
            return (
              <>
                {sender ? (
                  <Text style={{ marginTop: 4, color: colors.muted, fontSize: 11 }}>Od: {sender}</Text>
                ) : null}
                {content ? (
                  <Text style={{ marginTop: 6, color: colors.text, fontSize: 13 }}>{content}</Text>
                ) : null}
                {/* Link nie jest wyświetlany jako tekst; cała pozycja działa jako hiperłącze */}
              </>
            );
          })()
        ) : (
          <>
            {n.subject ? (
              <Text style={{ marginTop: 6, color: colors.text, fontSize: 13, fontWeight: '600', textDecorationLine: pressed ? 'underline' : 'none' }}>{n.subject}</Text>
            ) : null}
            {n.message ? (
              <Text style={{ marginTop: 6, color: colors.text, fontSize: 13 }}>{n.message}</Text>
            ) : null}
          </>
        )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {isInspectionType ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time" size={14} color={colors.danger} />
                  <Text style={{ marginLeft: 4, color: colors.danger, fontSize: 12, fontWeight: '600' }}>{n.type === 'overdue_inspection' ? `Po terminie: ${calcDaysOverdue(n.inspection_date) ?? '-'} dni` : 'Zbliża się przegląd'}</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDatePL(n.inspection_date)}</Text>
              </>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDatePL(n.created_at)}, {formatDateTimePL(n.created_at)}</Text>
            )}
            <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unread ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                </View>
              )}
            </View>
          </View>
        </View>
        {n.employee_brand_number ? (
          <Text style={{ marginTop: 4, color: colors.muted, fontSize: 11 }}>Nr pracownika: {n.employee_brand_number}</Text>
        ) : null}
        </>)}
        </Pressable>
      </Swipeable>
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ paddingBottom: 16 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} />
      }
    >
      <View style={styles.headerRow}>
        <Pressable hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={() => navigation.navigate('MainTabs', { screen: 'Użytkownik' })} style={[styles.backBtn, { position: 'absolute', left: 0, zIndex: 10 }]} accessibilityRole="button" accessibilityLabel="Wstecz">
          <Ionicons name="chevron-back" size={30} color={colors.primary} />
        </Pressable>
        <Text style={styles.titleCentered}>Powiadomienia</Text>
      </View>
      {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
      {canOverdue && (
        <View style={{ flexDirection: 'row', alignSelf: 'center', marginBottom: 8, marginTop: 8, borderRadius: 999, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 8 }}>
          <Pressable
            onPress={() => setAdminTab('general')}
            accessibilityRole="tab"
            accessibilityLabel="Zakładka Ogólne"
            style={({ pressed }) => [
              { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
              adminTab === 'general'
                ? { backgroundColor: '#334155', borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }
                : { backgroundColor: 'transparent' }
            ]}
          >
            <Text style={{ color: adminTab === 'general' ? colors.text : colors.muted }}>Ogólne</Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminTab('overdue')}
            accessibilityRole="tab"
            accessibilityLabel="Zakładka Po terminie"
            style={({ pressed }) => [
              { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 999 },
              adminTab === 'overdue'
                ? { backgroundColor: '#334155', borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 }
                : { backgroundColor: 'transparent' }
            ]}
          >
            <Text style={{ color: adminTab === 'overdue' ? colors.text : colors.muted }}>Po terminie</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.card}>
        {items.length > 0 && (
          (() => {
            const disabled = (canOverdue && adminTab !== 'general') || items.length === 0;
            return (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Pressable
                  onPress={markAllRead}
                  disabled={disabled}
                  style={{ flex: 1, minHeight: 32, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: disabled ? 0.6 : 1 }}
                  accessibilityRole="button"
                  accessibilityLabel="Oznacz wszystko jako przeczytane"
                >
                  <Text style={{ fontSize: 13, textAlign: 'center', color: colors.text }}>Oznacz wszystko jako przeczytane</Text>
                </Pressable>
              </View>
            );
          })()
        )}
        {items.length === 0 && !loading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
            <Ionicons name="sad-outline" size={45} color={colors.text} />
            <Text style={[styles.subtitle, { fontSize: 18, textAlign: 'center', marginTop: 6 }]}>Brak powiadomień do wyświetlenia</Text>
          </View>
        ) : (
          <FlatList
            data={(canOverdue ? (adminTab === 'overdue' ? items.filter(it => it.type === 'overdue_inspection' || it.type === 'upcoming_inspection') : items.filter(it => !(it.type === 'overdue_inspection' || it.type === 'upcoming_inspection'))) : items)}
            keyExtractor={(it) => String(it.id)}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={renderItem}
            scrollEnabled={false}
          />
        )}
      </View>
    </ScrollView>
  );
}
  // Zapamiętywanie powiadomień, dla których wyświetliliśmy lokalny push (by uniknąć duplikatów)
  const getPushedIds = async () => {
    try {
      const raw = await AsyncStorage.getItem('@notif_pushed_ids_v1');
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? new Set(list.map(String)) : new Set();
    } catch { return new Set(); }
  };
  const savePushedIds = async (set) => {
    try { await AsyncStorage.setItem('@notif_pushed_ids_v1', JSON.stringify(Array.from(set || []).map(String))); } catch {}
  };
  const ensurePushForUserNotifs = async (list) => {
    try {
      const pushed = await getPushedIds();
      for (const n of (Array.isArray(list) ? list : [])) {
        const isMsg = n && (n.type === 'broadcast' || n.type === 'custom' || n.type === 'admin');
        if (!isMsg) continue;
        const id = String(n.id || '');
        if (!id || pushed.has(id)) continue;
        const { sender, content } = extractSenderFromMessage(n.message || '');
        const title = String(n.subject || n.inventory_number || n.model || 'Powiadomienie');
        const body = content || n.message || '';
        try {
          await sendImmediate(title, body, { type: n.type, ackKey: `notif:${id}`, sender });
          pushed.add(id);
        } catch {}
      }
      await savePushedIds(pushed);
    } catch {}
  };
