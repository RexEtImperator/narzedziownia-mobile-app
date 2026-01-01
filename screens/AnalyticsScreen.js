import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { usePermissions } from '../lib/PermissionsContext';
import { PERMISSIONS } from '../lib/constants';
import { formatDate } from '../lib/utils'; // Assuming this exists, or I'll implement a simple one

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const { hasPermission } = usePermissions();
  const canViewAnalytics = hasPermission(PERMISSIONS.VIEW_ANALYTICS); // Ensure this permission constant exists or use string
  
  // State
  const [serviceSummary, setServiceSummary] = useState({ in_service: [], recent_events: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch service history
  useEffect(() => {
    let mounted = true;
    const fetchService = async () => {
      if (!canViewAnalytics) return;
      
      setLoading(true);
      try {
        const res = await api.get('/api/service-history/summary');
        if (mounted) {
            setServiceSummary({
              in_service: Array.isArray(res?.in_service) ? res.in_service : [],
              recent_events: Array.isArray(res?.recent_events) ? res.recent_events : []
            });
        }
      } catch (err) {
        if (mounted) {
            setError('Nie udało się pobrać danych serwisu');
            console.warn(err);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchService();
    return () => { mounted = false; };
  }, [canViewAnalytics]);

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
      <View style={{ marginBottom: 20 }}>
        <Text style={[styles.header, { color: colors.text }]}>Analityka Serwisu</Text>
        <Text style={{ color: colors.muted }}>Podsumowanie działań serwisowych</Text>
      </View>

      {/* Narzędzia w serwisie */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Narzędzia w serwisie</Text>
        {serviceSummary.in_service.length === 0 ? (
          <Text style={{ color: colors.muted, padding: 10 }}>Brak narzędzi w serwisie.</Text>
        ) : (
          serviceSummary.in_service.map((item, index) => (
            <View key={index} style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.name || '-'}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>SKU: {item.sku || '-'}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Nr zlecenia: {item.service_order_number || '-'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>{(item.service_quantity ?? '-') + ' szt.'}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{item.service_sent_at ? new Date(item.service_sent_at).toLocaleDateString() : '-'}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Ostatnie zdarzenia */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 20 }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Ostatnie zdarzenia</Text>
        {serviceSummary.recent_events.length === 0 ? (
          <Text style={{ color: colors.muted, padding: 10 }}>Brak ostatnich zdarzeń.</Text>
        ) : (
          serviceSummary.recent_events.map((ev, index) => (
            <View key={index} style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: 'bold' }}>{ev.name || '-'}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{ev.action === 'sent' ? 'Wysłano do serwisu' : 'Odebrano z serwisu'}</Text>
                 <Text style={{ color: colors.muted, fontSize: 12 }}>Nr: {ev.order_number || '-'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: ev.action === 'sent' ? colors.orange : colors.green, fontWeight: 'bold' }}>
                  {(ev.quantity ?? '-') + ' szt.'}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '-'}</Text>
              </View>
            </View>
          ))
        )}
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
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
});
