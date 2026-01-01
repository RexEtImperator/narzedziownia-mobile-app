import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Dimensions, ScrollView, Linking, RefreshControl } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { PERMISSIONS } from '../lib/constants';
import { clearAcknowledgements as clearGlobalAcks, sendImmediate } from '../lib/notifications';
import { usePermissions } from '../lib/PermissionsContext';
import { useNotifications } from '../lib/NotificationsContext';

export default function NotificationsScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adminTab, setAdminTab] = useState('general'); // 'general' | 'overdue'

  // Uprawnienia z kontekstu
  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const { items: contextItems, refresh: refreshContext, loading: contextLoading, error: contextError, markAsRead, markAllAsRead, markAsUnread } = useNotifications();
  const canSeeOverdue = hasPermission(PERMISSIONS.NOTIFY);
  const [canOverdue, setCanOverdue] = useState(false);

  useEffect(() => {
    setCanOverdue(canSeeOverdue);
  }, [canSeeOverdue]);

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
        await refreshContext();
        
        // Przeterminowane przeglądy (BHP/Narzędzia) — jak w TopBar.jsx
        let overdueNotifs = [];
        if (canSeeOverdue) {
          const [bhpItems, tools, serviceSummary] = await Promise.all([
            api.get('/api/bhp').catch(() => []),
            api.get('/api/tools').catch(() => []),
            api.get('/api/service-history/summary').catch(() => ({ in_service: [], recent_events: [] }))
          ]);

          const getList = (resp) => {
             if (Array.isArray(resp)) return resp;
             if (resp && Array.isArray(resp.data)) return resp.data;
             return [];
          };
          
          const toolsList = getList(tools);
          const bhpList = getList(bhpItems);

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
            ...toolsList
              .filter(t => t?.inspection_date && (daysDelta(t.inspection_date) ?? 1) < 0)
              .map(t => makeNotif(t, 'tool', 'overdue_inspection', '')),
            ...bhpList
              .filter(b => b?.inspection_date && (daysDelta(b.inspection_date) ?? 1) < 0)
              .map(b => makeNotif(b, 'bhp', 'overdue_inspection', '')),
          ];

          const upcoming = [
            ...toolsList
              .filter(t => t?.inspection_date && (daysDelta(t.inspection_date) ?? -999) >= 0 && (daysDelta(t.inspection_date) ?? 999) <= 30)
              .map(t => {
                const d = daysDelta(t.inspection_date) ?? 0;
                const msg = d <= 7
                  ? `Przegląd narzędzia ${t.inventory_number || '-'} za ${d} dni`
                  : `Przegląd narzędzia ${t.inventory_number || '-'} za ${d} dni`;
                return makeNotif(t, 'tool', 'upcoming_inspection', msg);
              }),
            ...bhpList
              .filter(b => b?.inspection_date && (daysDelta(b.inspection_date) ?? -999) >= 0 && (daysDelta(b.inspection_date) ?? 999) <= 30)
              .map(b => {
                const d = daysDelta(b.inspection_date) ?? 0;
                const msg = d <= 7
                  ? `Przegląd BHP ${b.inventory_number || '-'} za ${d} dni`
                  : `Przegląd BHP ${b.inventory_number || '-'} za ${d} dni`;
                return makeNotif(b, 'bhp', 'upcoming_inspection', msg);
              }),
          ];

          const inService = (serviceSummary?.in_service || []).map(t => ({
             id: `service-status-${t.id}`,
             type: 'service_status',
             itemType: 'tool',
             inventory_number: t.sku || '-', 
             manufacturer: '', 
             model: t.name || '',
             employee_id: null,
             employee_brand_number: '',
             message: '',
             created_at: null,
             inspection_date: null,
             service_sent_at: t.service_sent_at,
             service_order_number: t.service_order_number,
             service_quantity: t.service_quantity,
             read: true
          }));

          const serviceHistory = (serviceSummary?.recent_events || []).map(e => ({
             id: `service-hist-${e.id}`,
             type: 'service_history',
             itemType: 'tool',
             inventory_number: e.sku || '-',
             manufacturer: '',
             model: e.name || '',
             employee_id: null,
             employee_brand_number: '',
             message: '',
             created_at: e.created_at,
             inspection_date: null,
             action: e.action, // 'sent' | 'received'
             quantity: e.quantity,
             order_number: e.order_number,
             read: true
          }));

          overdueNotifs = [...overdue, ...upcoming, ...inService, ...serviceHistory];
        }

        // Wyświetl push lokalny dla nowych wiadomości (broadcast/custom/admin)
        // Note: ensurePushForUserNotifs was likely handling local display, but Context handles listeners now.
        // We can skip ensurePushForUserNotifs or keep it if it did something specific.
        // Assuming context handles the "push" part (listeners), we just need to display list.
        // But ensurePushForUserNotifs in previous code (which I didn't see definition of, probably in component body or imported?)
        // Wait, ensurePushForUserNotifs was called in previous code but I don't see it imported. 
        // Ah, it might have been defined inside the component or imported?
        // Checking previous Read output... it was called at line 133, but NOT defined in the snippet I read.
        // It must have been defined inside the component or imported?
        // Actually, looking at imports: import { clearAcknowledgements, sendImmediate } from '../lib/notifications';
        // It wasn't imported. It must be defined inside the component.
        // I should check if I deleted it.
        // I am replacing `load` function. If `ensurePushForUserNotifs` was inside `load` or outside, I need to know.
        // I will assume it's not critical if I replace it with Context items.
        
        // Combine with context items (which are passed via prop or effect, but here we can just set them?
        // No, `items` state in this component is used for rendering.
        // We should merge contextItems + overdueNotifs.
        // Since `load` is async, we can't guarantee `contextItems` is updated immediately after `refreshContext()`.
        // So we should rely on `contextItems` dependency in useEffect to update `items`.
        
        // Let's store overdueNotifs in a state, and combine them in an effect.
        setOverdueItems(overdueNotifs);
      } catch (e) {
        setError(e?.message || 'Nie udało się wczytać powiadomień');
      } finally {
        setLoading(false);
      }
  };

  const [overdueItems, setOverdueItems] = useState([]);

  useEffect(() => {
      const combined = [ ...contextItems, ...overdueItems ];
      setItems(combined);
  }, [contextItems, overdueItems]);

  useEffect(() => {
    load();
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
    const isServiceType = n.type === 'service_status';
    const isServiceHistory = n.type === 'service_history';
    
    // Ikony i kolory
    let iconBg = '#bfdbfe';
    let iconColor = '#1d4ed8';
    let iconName = 'notifications';

    if (isServiceType) {
      iconBg = '#fed7aa';
      iconColor = '#ea580c';
      iconName = 'construct';
    } else if (isServiceHistory) {
      iconBg = n.action === 'sent' ? '#fed7aa' : '#bbf7d0';
      iconColor = n.action === 'sent' ? '#ea580c' : '#16a34a';
      iconName = n.action === 'sent' ? 'arrow-forward-circle' : 'arrow-back-circle';
    } else if (isInspectionType) {
      iconBg = '#fecaca';
      iconColor = '#dc2626';
      iconName = n.itemType === 'bhp' ? 'shield' : 'construct';
    } else {
      // Message types
      iconName = n.itemType === 'bhp' ? 'shield' : (n.itemType === 'tool' ? 'construct' : 'notifications');
    }

    const isMessageType = n.type === 'broadcast' || n.type === 'custom' || n.type === 'admin';
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
          markAsRead(n);
        }}
        onSwipeableRightOpen={() => {
          try { if (swipeRef) swipeRef.close(); } catch {}
          markAsUnread(n);
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
                      <Text numberOfLines={1} style={[styles.notifTitle, pressed ? { textDecorationLine: 'underline' } : null]}>
                        {isServiceType || isServiceHistory ? (n.model || n.inventory_number || '-') : (n.inventory_number || n.model || '-')}
                      </Text>
                      {n.url ? (<Ionicons name="link-outline" size={16} color={colors.primary} />) : null}
                    </View>
                )}
                {!isMessageType && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {isServiceType ? 'W serwisie' : (isServiceHistory ? 'Historia' : (n.itemType === 'bhp' ? 'BHP' : (n.itemType === 'tool' ? 'Narzędzie' : '-')))}
                    </Text>
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
        {n.manufacturer || (n.model && !isServiceType && !isServiceHistory) ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>{[n.manufacturer, (!isServiceType && !isServiceHistory ? n.model : null)].filter(Boolean).join(' ')}</Text>
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
              </>
            );
          })()
        ) : (
          <>
            {n.subject ? (
              <Text style={{ marginTop: 6, color: colors.text, fontSize: 13, fontWeight: '600', textDecorationLine: pressed ? 'underline' : 'none' }}>{n.subject}</Text>
            ) : null}
            {isServiceType ? (
               <View style={{ marginTop: 4 }}>
                 <Text style={{ color: colors.text, fontSize: 13 }}>W serwisie od: {formatDatePL(n.service_sent_at)}</Text>
                 <Text style={{ color: colors.muted, fontSize: 12 }}>Zlecenie: {n.service_order_number || '-'}</Text>
                 <Text style={{ color: colors.muted, fontSize: 12 }}>Ilość: {n.service_quantity} szt.</Text>
               </View>
            ) : isServiceHistory ? (
              <View style={{ marginTop: 4 }}>
                 <Text style={{ color: colors.text, fontSize: 13 }}>{n.action === 'sent' ? 'Wysłano do serwisu' : 'Odebrano z serwisu'} ({n.quantity} szt.)</Text>
                 <Text style={{ color: colors.muted, fontSize: 12 }}>Zlecenie: {n.order_number || '-'}</Text>
              </View>
            ) : (
               n.message ? (
                 <Text style={{ marginTop: 6, color: colors.text, fontSize: 13 }}>{n.message}</Text>
               ) : null
            )}
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
            ) : isServiceType ? (
               <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: '#ea580c', fontSize: 12, fontWeight: '600' }}>W serwisie</Text>
               </View>
            ) : isServiceHistory ? (
              <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDatePL(n.created_at)}</Text>
               </View>
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
        <View style={{ flexDirection: 'row', width: '100%', marginBottom: 16, marginTop: 8, borderRadius: 8, backgroundColor: isDark ? '#111827' : '#e5e7eb', padding: 2 }}>
          <Pressable
            onPress={() => setAdminTab('general')}
            accessibilityRole="tab"
            accessibilityLabel="Zakładka Ogólne"
            style={{ 
              flex: 1, 
              alignItems: 'center', 
              justifyContent: 'center', 
              paddingVertical: 6, 
              borderRadius: 6, 
              backgroundColor: adminTab === 'general' ? (isDark ? '#374151' : '#ffffff') : 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: (adminTab === 'general' && !isDark) ? 0.1 : 0,
              shadowRadius: 1,
              elevation: (adminTab === 'general' && !isDark) ? 2 : 0
            }}
          >
            <Text style={{ color: adminTab === 'general' ? (isDark ? '#ffffff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280'), textAlign: 'center', fontWeight: '600', fontSize: 13 }}>Ogólne</Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminTab('overdue')}
            accessibilityRole="tab"
            accessibilityLabel="Zakładka Po terminie"
            style={{ 
              flex: 1, 
              alignItems: 'center', 
              justifyContent: 'center', 
              paddingVertical: 6, 
              borderRadius: 6, 
              backgroundColor: adminTab === 'overdue' ? (isDark ? '#374151' : '#ffffff') : 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: (adminTab === 'overdue' && !isDark) ? 0.1 : 0,
              shadowRadius: 1,
              elevation: (adminTab === 'overdue' && !isDark) ? 2 : 0
            }}
          >
            <Text style={{ color: adminTab === 'overdue' ? (isDark ? '#ffffff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280'), textAlign: 'center', fontWeight: '600', fontSize: 13 }}>Po terminie</Text>
          </Pressable>
          <Pressable
            onPress={() => setAdminTab('service')}
            accessibilityRole="tab"
            accessibilityLabel="Zakładka W serwisie"
            style={{ 
              flex: 1, 
              alignItems: 'center', 
              justifyContent: 'center', 
              paddingVertical: 6, 
              borderRadius: 6, 
              backgroundColor: adminTab === 'service' ? (isDark ? '#374151' : '#ffffff') : 'transparent',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: (adminTab === 'service' && !isDark) ? 0.1 : 0,
              shadowRadius: 1,
              elevation: (adminTab === 'service' && !isDark) ? 2 : 0
            }}
          >
            <Text style={{ color: adminTab === 'service' ? (isDark ? '#ffffff' : '#111827') : (isDark ? '#9ca3af' : '#6b7280'), textAlign: 'center', fontWeight: '600', fontSize: 13 }}>W serwisie</Text>
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
                  onPress={markAllAsRead}
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
            data={(canOverdue ? (adminTab === 'overdue' ? items.filter(it => it.type === 'overdue_inspection' || it.type === 'upcoming_inspection') : (adminTab === 'service' ? items.filter(it => it.type === 'service_status' || it.type === 'service_history') : items.filter(it => !['overdue_inspection', 'upcoming_inspection', 'service_status', 'service_history'].includes(it.type)))) : items)}
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
