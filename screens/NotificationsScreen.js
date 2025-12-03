import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Platform, Dimensions, ScrollView } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { hasPermission, PERMISSIONS } from '../lib/constants';
import { clearAcknowledgements as clearGlobalAcks } from '../lib/notifications';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
    headerRow: { position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 48 },
    backBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    titleCentered: { flex: 1, textAlign: 'center', fontSize: 22, fontWeight: '700', color: colors.text },
    subtitle: { color: colors.muted },
    card: { marginTop: 12, borderTopWidth: 3, borderColor: colors.border },
    notifRow: { flexDirection: 'row', alignItems: 'center' },
    notifIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    notifTitle: { color: colors.text, fontWeight: '600' },
    notifSub: { color: colors.muted },
    sectionHeader: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  });

  useEffect(() => {
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
          created_at: n.created_at || n.createdAt || null,
          inspection_date: n.inspection_date || null,
          read: !!n.read
        }));

        // Przeterminowane przeglądy (BHP/Narzędzia) — jak w TopBar.jsx
        let overdueNotifs = [];
        const canSeeOverdue = (
          hasPermission(user, PERMISSIONS.MANAGE_TOOLS) ||
          hasPermission(user, PERMISSIONS.MANAGE_BHP) ||
          hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS)
        );
        if (canSeeOverdue) {
          const [bhpItems, tools] = await Promise.all([
            api.get('/api/bhp?sortBy=inspection_date&sortDir=asc').catch(() => []),
            api.get('/api/tools?sortBy=inventory_number&sortDir=asc').catch(() => [])
          ]);
          const today = new Date();
          const parseDateFlexible = (val) => {
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
          const onlyOverdue = (arr, pick) => (Array.isArray(arr) ? arr : []).filter(i => {
            const dateStr = pick(i);
            const d = parseDateFlexible(dateStr);
            return !!d && d < today;
          });

          const bhpList = Array.isArray(bhpItems) ? bhpItems : (Array.isArray(bhpItems?.data) ? bhpItems.data : []);
          const overdueBhp = onlyOverdue(bhpList, x => x.inspection_date);
          const toolsList = Array.isArray(tools) ? tools : (Array.isArray(tools?.data) ? tools.data : []);
          const overdueTools = onlyOverdue(toolsList, x => x.inspection_date);

          // Ack mapy jak w TopBar.jsx, w RN używamy AsyncStorage
          const ackBhpRaw = await AsyncStorage.getItem('bhp_overdue_ack_v2');
          const ackToolsRaw = await AsyncStorage.getItem('tools_overdue_ack_v2');
          const ackBhp = ackBhpRaw ? JSON.parse(ackBhpRaw) : {};
          const ackTools = ackToolsRaw ? JSON.parse(ackToolsRaw) : {};

          overdueNotifs = [];
          overdueBhp.forEach(i => {
            const key = String(i.id);
            const dateVal = String(i.inspection_date);
            const read = ackBhp[key] === dateVal;
            overdueNotifs.push({
              id: `bhp-${i.id}`,
              type: 'bhp',
              inventory_number: i.inventory_number || '-',
              inspection_date: i.inspection_date,
              manufacturer: i.manufacturer || '',
              model: i.model || '',
              read
            });
          });
          overdueTools.forEach(t => {
            const key = String(t.id);
            const dateVal = String(t.inspection_date);
            const read = ackTools[key] === dateVal;
            overdueNotifs.push({
              id: `tool-${t.id}`,
              type: 'tool',
              inventory_number: t.inventory_number || t.sku || '-',
              inspection_date: t.inspection_date,
              manufacturer: '',
              model: t.name || '',
              read
            });
          });
        }

        const combined = [ ...userNotifs, ...overdueNotifs ];
        setItems(combined);
      } catch (e) {
        setError(e?.message || 'Nie udało się wczytać powiadomień');
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/read-all', {});
    } catch (_) { /* ignore */ }
    try {
      const ackBhpRaw = await AsyncStorage.getItem('bhp_overdue_ack_v2');
      const ackToolsRaw = await AsyncStorage.getItem('tools_overdue_ack_v2');
      const ackBhp = ackBhpRaw ? JSON.parse(ackBhpRaw) : {};
      const ackTools = ackToolsRaw ? JSON.parse(ackToolsRaw) : {};
      items.forEach(n => {
        const dateVal = String(n.inspection_date || '');
        if (!dateVal) return;
        if (n.type === 'bhp') {
          const key = n.id.replace('bhp-', '');
          ackBhp[key] = dateVal;
        } else if (n.type === 'tool') {
          const key = n.id.replace('tool-', '');
          ackTools[key] = dateVal;
        }
      });
      await AsyncStorage.setItem('bhp_overdue_ack_v2', JSON.stringify(ackBhp));
      await AsyncStorage.setItem('tools_overdue_ack_v2', JSON.stringify(ackTools));
      setItems(prev => prev.map(n => ({ ...n, read: true })));
    } catch (_) { /* ignore */ }
  };

  const clearConfirmations = async () => {
    // Usuń lokalne potwierdzenia (ack) dla przeterminowanych przeglądów BHP/Narzędzia
    try { await AsyncStorage.removeItem('bhp_overdue_ack_v2'); } catch (_) { /* ignore */ }
    try { await AsyncStorage.removeItem('tools_overdue_ack_v2'); } catch (_) { /* ignore */ }
    // Usuń globalne potwierdzenia z lib/notifications.js (@notif_ack_v1) i przeliczenie harmonogramu
    try { await clearGlobalAcks({ reschedule: true }); } catch (_) { /* ignore */ }
    // Odznacz przeczytane w bieżącym widoku (w tym return_request tylko lokalnie)
    setItems(prev => prev.map(n => ({ ...n, read: false })));
    // Zsynchronizuj statusy z backendem (GET /api/notifications)
    try {
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
        created_at: n.created_at || n.createdAt || null,
        inspection_date: n.inspection_date || null,
        read: !!n.read
      }));
      setItems(prev => {
        const nonUser = prev.filter(x => x.type === 'bhp' || x.type === 'tool');
        return [...userNotifs, ...nonUser];
      });
    } catch (_) { /* ignore */ }
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
    // Pełny refetch listy użytkownika z backendu i scalenie z pozycjami BHP/Narzędzia
    try {
      const userNotifsRaw = await api.get('/api/notifications').catch(() => []);
      const userNotifs = (Array.isArray(userNotifsRaw) ? userNotifsRaw : []).map(n2 => ({
        id: String(n2.id || `${(n2.itemType || n2.item_type || 'tool')}-${n2.item_id || Math.random()}`),
        type: String(n2.type || 'return_request'),
        itemType: String(n2.item_type || n2.itemType || 'tool'),
        inventory_number: n2.inventory_number || '-',
        manufacturer: n2.manufacturer || '',
        model: n2.model || '',
        employee_id: n2.employee_id || null,
        employee_brand_number: n2.employee_brand_number || '',
        message: n2.message || '',
        created_at: n2.created_at || n2.createdAt || null,
        inspection_date: n2.inspection_date || null,
        read: !!n2.read
      }));
      setItems(prev => {
        const nonUser = prev.filter(x => x.type === 'bhp' || x.type === 'tool');
        return [...userNotifs, ...nonUser];
      });
    } catch (_) { /* ignore */ }
  };

  const renderItem = ({ item: n }) => {
    const isOverdueType = n.type === 'bhp' || n.type === 'tool';
    const iconBg = isOverdueType ? '#fecaca' : '#bfdbfe';
    const iconColor = isOverdueType ? '#dc2626' : '#1d4ed8';
    const iconName = n.type === 'bhp' ? 'shield' : (n.type === 'tool' ? 'construct' : 'notifications');
    const unread = !n.read;
    const filterValue = (n.inventory_number && String(n.inventory_number).trim()) || (n.model && String(n.model).trim()) || '';
    const handleNavigate = () => {
      if (!filterValue) return;
      if (n.type === 'bhp' || n.itemType === 'bhp') {
        navigation.navigate('MainTabs', { screen: 'BHP', params: { filter: filterValue } });
      } else {
        navigation.navigate('MainTabs', { screen: 'Narzędzia', params: { filter: filterValue } });
      }
    };
    return (
      <Pressable style={{ paddingVertical: 10 }} onPress={handleNavigate} accessibilityRole="button" accessibilityLabel="Otwórz listę powiązaną">
        <View style={styles.notifRow}>
          <View style={[styles.notifIcon, { backgroundColor: iconBg }]}><Ionicons name={iconName} size={18} color={iconColor} /></View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.notifTitle}>{n.inventory_number || n.model || '-'}</Text>
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 11, color: colors.muted }}>{n.type === 'bhp' ? 'BHP' : (n.type === 'tool' ? 'Narzędzie' : (n.itemType === 'bhp' ? 'BHP' : (n.itemType === 'tool' ? 'Narzędzia' : '-')))}</Text>
              </View>
            </View>
            {n.manufacturer || n.model ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>{[n.manufacturer, n.model].filter(Boolean).join(' ')}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {isOverdueType ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="time" size={14} color={colors.danger} />
                  <Text style={{ marginLeft: 4, color: colors.danger, fontSize: 12, fontWeight: '600' }}>Po terminie: {calcDaysOverdue(n.inspection_date) ?? '-'} dni</Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDatePL(n.inspection_date)}</Text>
              </>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 11 }}>{n.created_at ? formatDatePL(n.created_at) : ''}</Text>
            )}
            <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unread ? (
                <Pressable onPress={() => markRead(n)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }} accessibilityLabel="Oznacz jako przeczytane">
                  <Ionicons name="checkmark-outline" size={20} color={colors.text} />
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  {n.type === 'return_request' && (
                    <Pressable
                      onPress={async () => {
                        try { await api.post(`/api/notify-return/${encodeURIComponent(n.id)}/unread`, {}); } catch (_) { /* ignore */ }
                        // Lokalna, natychmiastowa aktualizacja
                        setItems(prev => prev.map(x => x.id === n.id ? ({ ...x, read: false }) : x));
                        // Pełny refetch listy użytkownika z backendu i scalenie z pozycjami BHP/Narzędzia
                        try {
                          const userNotifsRaw = await api.get('/api/notifications').catch(() => []);
                          const userNotifs = (Array.isArray(userNotifsRaw) ? userNotifsRaw : []).map(n2 => ({
                            id: String(n2.id || `${(n2.itemType || n2.item_type || 'tool')}-${n2.item_id || Math.random()}`),
                            type: String(n2.type || 'return_request'),
                            itemType: String(n2.item_type || n2.itemType || 'tool'),
                            inventory_number: n2.inventory_number || '-',
                            manufacturer: n2.manufacturer || '',
                            model: n2.model || '',
                            employee_id: n2.employee_id || null,
                            employee_brand_number: n2.employee_brand_number || '',
                            message: n2.message || '',
                            created_at: n2.created_at || n2.createdAt || null,
                            inspection_date: n2.inspection_date || null,
                            read: !!n2.read
                          }));
                          setItems(prev => {
                            const nonUser = prev.filter(x => x.type === 'bhp' || x.type === 'tool');
                            return [...userNotifs, ...nonUser];
                          });
                        } catch (_) { /* ignore */ }
                      }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
                    >
                      <Text style={{ fontSize: 14, color: colors.text }}>Oznacz jako nieprzeczytane</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
        {n.message ? (
          <Text style={{ marginTop: 6, color: colors.text, fontSize: 13 }}>{n.message}</Text>
        ) : null}
        {n.employee_brand_number ? (
          <Text style={{ marginTop: 4, color: colors.muted, fontSize: 11 }}>Nr pracownika: {n.employee_brand_number}</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 }}>
      <View style={styles.headerRow}>
        <Pressable hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} onPress={() => navigation.navigate('MainTabs', { screen: 'Użytkownik' })} style={[styles.backBtn, { position: 'absolute', left: 0, zIndex: 10 }]} accessibilityRole="button" accessibilityLabel="Wstecz">
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </Pressable>
        <Text style={styles.titleCentered}>Powiadomienia</Text>
      </View>
      {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
      {loading ? <Text style={[styles.subtitle, { marginBottom: 8 }]}>Ładowanie…</Text> : null}
      <View style={styles.card}>
        {items.length > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Pressable onPress={clearConfirmations} style={{ paddingHorizontal: 10, marginTop: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 14, color: colors.text }}>Wyczyść potwierdzenia</Text>
            </Pressable>
            <Pressable onPress={markAllRead} style={{ paddingHorizontal: 10, marginTop: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginLeft: 8 }}>
              <Text style={{ fontSize: 14, color: colors.text }}>Oznacz wszystko jako przeczytane</Text>
            </Pressable>
          </View>
        )}
        {items.length === 0 && !loading ? (
          <Text style={styles.subtitle}>Brak powiadomień do wyświetlenia</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => String(it.id)}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            renderItem={renderItem}
            scrollEnabled={false}
          />
        )}
      </View>
    </ScrollView>
  );
}

// Lokalna kopia pomocniczych funkcji zgodnych z lib/notifications.js
function parseReviewDate(item) {
  const candidates = [
    item?.inspection_date,
    item?.inspectionDate,
    item?.nextReviewAt,
    item?.next_review_at,
    item?.next_review,
    item?.next_check_at,
    item?.next_check,
    item?.reviewDate,
    item?.review_date,
    item?.next_inspection,
    item?.next_inspection_date,
    item?.due_date,
    item?.expiry_date,
    item?.expiration_date,
    item?.bhp_next_check_at,
    item?.bhp_next_review_at,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const time = Date.parse(String(c));
    if (Number.isFinite(time)) return new Date(time);
  }
  try {
    const keys = Object.keys(item || {});
    for (const k of keys) {
      const lower = k.toLowerCase();
      const looksLikeDateKey = (
        (lower.includes('next') && (lower.includes('review') || lower.includes('check') || lower.includes('inspection'))) ||
        (lower.includes('review') && lower.includes('date')) ||
        (lower.includes('due') && lower.includes('date')) ||
        lower.includes('expiry_date') || lower.includes('expiration')
      );
      if (!looksLikeDateKey) continue;
      const val = item[k];
      const time = Date.parse(String(val));
      if (Number.isFinite(time) && time > Date.UTC(2010, 0, 1)) {
        return new Date(time);
      }
    }
  } catch {}
  return null;
}

function getItemKey(item) {
  const parts = [
    item?.id,
    item?.tool_id,
    item?.inventory_number,
    item?.code,
    item?.barcode,
    item?.qr_code,
    item?.sku,
    item?.serial_number,
  ].filter(Boolean).map(String);
  const base = parts.length ? parts.join('|') : String(item?.name || item?.tool_name || 'item');
  return base;
}

async function fetchList(endpoint) {
  try {
    const data = await api.get(endpoint);
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    return list.map(it => ({ ...it, __source: endpoint }));
  } catch {
    return [];
  }
}
