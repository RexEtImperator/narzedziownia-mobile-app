import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { usePermissions } from '../lib/PermissionsContext';
import { PERMISSIONS } from '../lib/constants';
import { formatDate } from '../lib/utils';

export default function AnalyticsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { hasPermission } = usePermissions();
  const canViewAnalytics = hasPermission(PERMISSIONS.VIEW_ANALYTICS);
  
  // State
  const [serviceSummary, setServiceSummary] = useState({ in_service: [], recent_events: [] });
  const [tools, setTools] = useState([]);
  const [bhpItems, setBhpItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pagination State
  const [svcPage, setSvcPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Helper to robustly extract arrays from various response shapes
  const toArray = (resp) => {
    try {
      if (Array.isArray(resp)) return resp;
      const candidates = ['data', 'rows', 'items', 'list', 'result', 'content'];
      for (const key of candidates) {
        const val = resp?.[key];
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object') {
          const nestedCandidates = ['data', 'rows', 'items', 'list', 'content'];
          for (const n of nestedCandidates) {
            const nested = val?.[n];
            if (Array.isArray(nested)) return nested;
          }
        }
      }
    } catch {}
    return [];
  };

  // Helper to extract service summary
  const resolveServiceSummary = (res) => {
    try {
        if (!res) return { in_service: [], recent_events: [] };
        // Check if res is the object containing keys
        if (Array.isArray(res.in_service) || Array.isArray(res.recent_events)) {
            return {
                in_service: Array.isArray(res.in_service) ? res.in_service : [],
                recent_events: Array.isArray(res.recent_events) ? res.recent_events : []
            };
        }
        // Check inside data/payload
        const candidates = ['data', 'payload', 'result', 'items'];
        for (const key of candidates) {
            const val = res[key];
            if (val && typeof val === 'object') {
                if (Array.isArray(val.in_service) || Array.isArray(val.recent_events)) {
                    return {
                        in_service: Array.isArray(val.in_service) ? val.in_service : [],
                        recent_events: Array.isArray(val.recent_events) ? val.recent_events : []
                    };
                }
            }
        }
    } catch {}
    return { in_service: [], recent_events: [] };
  };

  // Fetch data
  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      if (!canViewAnalytics) return;
      
      setLoading(true);
      try {
        const [serviceRes, toolsRes, bhpRes] = await Promise.all([
            api.get('/api/service-history/summary'),
            api.get('/api/tools'),
            api.get('/api/bhp')
        ]);

        if (mounted) {
            console.log('Analytics fetched:', {
              serviceRaw: serviceRes,
              toolsCount: toArray(toolsRes).length,
              bhpCount: toArray(bhpRes).length
            });
            const svc = resolveServiceSummary(serviceRes);
            setServiceSummary(svc);
            setTools(toArray(toolsRes));
            setBhpItems(toArray(bhpRes));
        }
      } catch (err) {
        if (mounted) {
            setError('Nie udało się pobrać danych');
            console.warn(err);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [canViewAnalytics]);

  // Reset pagination when data changes
  useEffect(() => {
    const svcTotal = Math.max(1, Math.ceil((serviceSummary.in_service?.length || 0) / pageSize));
    const evTotal = Math.max(1, Math.ceil((serviceSummary.recent_events?.length || 0) / pageSize));
    setSvcPage(p => Math.min(Math.max(1, p), svcTotal));
    setEventsPage(p => Math.min(Math.max(1, p), evTotal));
  }, [serviceSummary, pageSize]);

  const getDaysTo = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const now = new Date();
    const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffMs = startOfDate - startOfNow;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const inspections = [
    ...tools.filter(t => !!t.inspection_date).map(t => ({
      id: t.id,
      name: t.name,
      inspection_date: t.inspection_date,
      source: 'tools',
      query: t.sku || t.name || ''
    })),
    ...bhpItems.filter(b => !!b.inspection_date).map(b => ({
      id: b.id,
      name: [b.inventory_number, b.model].filter(Boolean).join(' '),
      inspection_date: b.inspection_date,
      source: 'bhp',
      query: b.inventory_number || b.model || b.serial_number || ''
    }))
  ];

  const upcomingInspections = inspections
    .map(item => ({ ...item, daysTo: getDaysTo(item.inspection_date) }))
    .filter(x => x.daysTo !== null && x.daysTo >= 0 && x.daysTo <= 30)
    .sort((a, b) => a.daysTo - b.daysTo);

  const overdueInspections = inspections
    .map(item => ({ ...item, daysTo: getDaysTo(item.inspection_date) }))
    .filter(x => x.daysTo !== null && x.daysTo < 0)
    .sort((a, b) => a.daysTo - b.daysTo);

  const overdueTools = overdueInspections.filter(x => x.source === 'tools');
  const overdueBhp = overdueInspections.filter(x => x.source === 'bhp');

  useEffect(() => {
    console.log('Inspections calc:', {
      totalInspections: inspections.length,
      overdueTotal: overdueInspections.length,
      overdueTools: overdueTools.length,
      overdueBhp: overdueBhp.length,
      upcoming: upcomingInspections.length
    });
  }, [inspections.length, overdueInspections.length]);

  // Pagination Logic
  const getPaginatedData = (data, page) => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return data.slice(start, end);
  };

  const totalSvcPages = Math.ceil(serviceSummary.in_service.length / pageSize) || 1;
  const totalEventsPages = Math.ceil(serviceSummary.recent_events.length / pageSize) || 1;

  const navigateToDetails = (screen, query) => {
    // Navigate to respective screens with search query if supported
    if (screen === 'tools') {
      navigation.navigate('Narzędzia', { search: query });
    } else if (screen === 'bhp') {
      navigation.navigate('BHP', { search: query });
    }
  };

  if (!canViewAnalytics) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Brak dostępu</Text>
          <Text style={[styles.text, { color: colors.muted }]}>Nie masz uprawnień do przeglądania tej sekcji.</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.muted, marginTop: 10 }}>Ładowanie...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ marginBottom: 16 }}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Statystyki i Raporty</Text>
        <Text style={[styles.headerSubtitle, { color: colors.muted }]}>Przegląd stanu narzędziowni i historia operacji</Text>
      </View>

      {/* Nadchodzące przeglądy */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 20 }]}>
        <View style={[styles.sectionHeader, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'flex-start', gap: 8 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Nadchodzące przeglądy</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: 'bold' }}>Przeterminowane {overdueInspections.length}</Text>
          </View>
          <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#b45309', fontSize: 12, fontWeight: 'bold' }}>Nadchodzące ({'<'}30 dni) {upcomingInspections.length}</Text>
          </View>
        </View>
      </View>
        
        {/* Przeterminowane Narzędzia */}
        <View style={{ padding: 16 }}>
            <Text style={[styles.subTitle, { color: colors.text }]}>Przeterminowane (Narzędzia)</Text>
            {overdueTools.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>Brak przeterminowanych narzędzi.</Text> : (
                overdueTools.slice(0, 10).map((item, idx) => (
                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.name}</Text>
                                <View style={{ backgroundColor: '#dbeafe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#bfdbfe' }}>
                                    <Text style={{ color: '#1d4ed8', fontSize: 10 }}>Narzędzia</Text>
                                </View>
                            </View>
                            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Wysłano: {item.inspection_date ? formatDate(item.inspection_date) : '-'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                            <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{Math.abs(item.daysTo)} dni po terminie</Text>
                            <TouchableOpacity onPress={() => navigateToDetails('tools', item.query)}>
                                <Text style={{ color: colors.primary, fontSize: 12 }}>Szczegóły</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
            )}
        </View>

        {/* Przeterminowane BHP */}
        <View style={{ padding: 16, paddingTop: 0 }}>
            <Text style={[styles.subTitle, { color: colors.text }]}>Przeterminowane (BHP)</Text>
            {overdueBhp.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>Brak przeterminowanych BHP.</Text> : (
                overdueBhp.slice(0, 10).map((item, idx) => (
                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.name}</Text>
                                <View style={{ backgroundColor: '#e0e7ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#c7d2fe' }}>
                                    <Text style={{ color: '#4338ca', fontSize: 10 }}>BHP</Text>
                                </View>
                            </View>
                             <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Wysłano: {item.inspection_date ? formatDate(item.inspection_date) : '-'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                             <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{Math.abs(item.daysTo)} dni po terminie</Text>
                             <TouchableOpacity onPress={() => navigateToDetails('bhp', item.query)}>
                                <Text style={{ color: colors.primary, fontSize: 12 }}>Szczegóły</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
            )}
        </View>

        {/* Nadchodzące */}
        <View style={{ padding: 16, paddingTop: 0 }}>
            <Text style={[styles.subTitle, { color: colors.text }]}>Nadchodzące ({'<'}30 dni)</Text>
            {upcomingInspections.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>Brak nadchodzących przeglądów w ciągu 30 dni.</Text> : (
                upcomingInspections.slice(0, 10).map((item, idx) => (
                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                         <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.name}</Text>
                                <View style={{ backgroundColor: item.source === 'bhp' ? '#e0e7ff' : '#dbeafe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: item.source === 'bhp' ? '#c7d2fe' : '#bfdbfe' }}>
                                    <Text style={{ color: item.source === 'bhp' ? '#4338ca' : '#1d4ed8', fontSize: 10 }}>{item.source === 'tools' ? 'Narzędzia' : 'BHP'}</Text>
                                </View>
                            </View>
                             <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Wysłano: {item.inspection_date ? formatDate(item.inspection_date) : '-'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                             <Text style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 12 }}>za {item.daysTo} dni</Text>
                             <TouchableOpacity onPress={() => navigateToDetails(item.source, item.query)}>
                                <Text style={{ color: colors.primary, fontSize: 12 }}>Szczegóły</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
            )}
        </View>
      </View>

      {/* Historia serwisu */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, { borderBottomColor: colors.border, justifyContent: 'space-between' }]}>
             <Text style={[styles.sectionTitle, { color: colors.text, padding: 0 }]}>Historia serwisu</Text>
             <Text style={{ fontSize: 12, color: colors.muted }}>
                 Razem: {(serviceSummary.in_service?.length || 0) + (serviceSummary.recent_events?.length || 0)}
             </Text>
        </View>

        {/* Aktualnie w serwisie - narzędzia*/}
        <View style={{ padding: 16 }}>
            <Text style={[styles.subTitle, { color: colors.text }]}>Aktualnie w serwisie</Text>
            {serviceSummary.in_service.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Brak narzędzi w serwisie.</Text>
            ) : (
                <>
                {getPaginatedData(serviceSummary.in_service, svcPage).map((item, index) => (
                    <View key={index} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                        <TouchableOpacity onPress={() => navigateToDetails('tools', item.sku)}>
                            <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{item.name || '-'}</Text>
                        </TouchableOpacity>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>SKU: <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{item.sku || '-'}</Text></Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Nr zlecenia: <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{item.service_order_number || '-'}</Text></Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: colors.text, fontWeight: 'bold' }}>{(item.service_quantity ?? '-') + ' szt.'}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{item.service_sent_at ? formatDate(item.service_sent_at) : '-'}</Text>
                    </View>
                    </View>
                ))}
                {/* Pagination Controls */}
                {serviceSummary.in_service.length > pageSize && (
                    <View style={styles.paginationRow}>
                        <TouchableOpacity onPress={() => setSvcPage(p => Math.max(1, p - 1))} disabled={svcPage <= 1} style={[styles.pageBtn, { borderColor: colors.border, opacity: svcPage <= 1 ? 0.5 : 1 }]}>
                            <Text style={{ color: colors.text, fontSize: 12 }}>Poprzednia</Text>
                        </TouchableOpacity>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Strona {svcPage} z {totalSvcPages}</Text>
                        <TouchableOpacity onPress={() => setSvcPage(p => Math.min(totalSvcPages, p + 1))} disabled={svcPage >= totalSvcPages} style={[styles.pageBtn, { borderColor: colors.border, opacity: svcPage >= totalSvcPages ? 0.5 : 1 }]}>
                            <Text style={{ color: colors.text, fontSize: 12 }}>Następna</Text>
                        </TouchableOpacity>
                    </View>
                )}
                </>
            )}
        </View>

        {/* Ostatnie zdarzenia */}
        <View style={{ padding: 16, paddingTop: 0 }}>
            <Text style={[styles.subTitle, { color: colors.text }]}>Ostatnie zdarzenia</Text>
            {serviceSummary.recent_events.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Brak ostatnich zdarzeń.</Text>
            ) : (
              <>
                {getPaginatedData(serviceSummary.recent_events, eventsPage).map((ev, index) => (
                    <View key={index} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: 'bold' }}>{ev.name || '-'}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>SKU: <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{ev.sku || '-'}</Text></Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{ev.action === 'sent' ? 'Wysłano do serwisu' : 'Odebrano z serwisu'}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Nr: <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>{ev.order_number || '-'}</Text></Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: ev.action === 'sent' ? '#f97316' : '#22c55e', fontWeight: 'bold' }}>
                        {(ev.quantity ?? '-') + ' szt.'}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Data: {ev.created_at ? formatDate(ev.created_at) : '-'}</Text>
                    </View>
                    </View>
                ))}
                {/* Pagination Controls */}
                {serviceSummary.recent_events.length > pageSize && (
                  <View style={styles.paginationRow}>
                    <TouchableOpacity onPress={() => setEventsPage(p => Math.max(1, p - 1))} disabled={eventsPage <= 1} style={[styles.pageBtn, { borderColor: colors.border, opacity: eventsPage <= 1 ? 0.5 : 1 }]}>
                      <Text style={{ color: colors.text, fontSize: 12 }}>Poprzednia</Text>
                    </TouchableOpacity>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Strona {eventsPage} z {totalEventsPages}</Text>
                    <TouchableOpacity onPress={() => setEventsPage(p => Math.min(totalEventsPages, p + 1))} disabled={eventsPage >= totalEventsPages} style={[styles.pageBtn, { borderColor: colors.border, opacity: eventsPage >= totalEventsPages ? 0.5 : 1 }]}>
                      <Text style={{ color: colors.text, fontSize: 12 }}>Następna</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: 12,
  },
  subTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  pageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
});
