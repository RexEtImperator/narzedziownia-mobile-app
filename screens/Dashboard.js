import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import api from '../lib/api';

export default function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ employees: 0, departments: 0, positions: 0, tools: 0 });
  const [tools, setTools] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const [deps, poss, emps, tls] = await Promise.all([
          api.get('/api/departments'),
          api.get('/api/positions'),
          api.get('/api/employees'),
          api.get('/api/tools'),
        ]);
        setStats({
          employees: Array.isArray(emps) ? emps.length : 0,
          departments: Array.isArray(deps) ? deps.length : 0,
          positions: Array.isArray(poss) ? poss.length : 0,
          tools: Array.isArray(tls) ? tls.length : (Array.isArray(tls?.data) ? tls.data.length : 0),
        });
        const list = Array.isArray(tls) ? tls : (Array.isArray(tls?.data) ? tls.data : []);
        setTools(list.slice(0, 20));
      } catch (e) {
        setError(e.message || 'Błąd pobierania danych');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.container} className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" />
        <Text style={styles.muted} className="mt-2 text-slate-500">Ładowanie…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper} className="flex-1 bg-slate-50 p-4">
      <View style={styles.headerRow} className="flex-row items-center justify-between mb-4">
        <Text style={styles.title} className="text-2xl font-bold text-slate-900">Panel główny</Text>
        <View style={styles.badge} className="bg-indigo-50 rounded-full py-1 px-3"><Text style={styles.badgeText} className="text-indigo-600 font-semibold">Podgląd</Text></View>
      </View>
      {error ? <Text style={styles.error} className="text-red-500 mb-2">{error}</Text> : null}

      <View style={styles.statsRow} className="flex-row flex-wrap gap-3">
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader} className="flex-row items-center mb-2">
            <View style={[styles.iconBox, { backgroundColor: '#4f46e5' }]} className="w-7 h-7 rounded-lg mr-2" />
            <Text style={styles.cardTitle} className="text-slate-700 font-semibold">Pracownicy</Text>
          </View>
          <Text style={styles.cardValue} className="text-xl font-bold text-slate-900">{stats.employees}</Text>
        </View>
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader} className="flex-row items-center mb-2">
            <View style={[styles.iconBox, { backgroundColor: '#6366f1' }]} className="w-7 h-7 rounded-lg mr-2" />
            <Text style={styles.cardTitle} className="text-slate-700 font-semibold">Działy</Text>
          </View>
          <Text style={styles.cardValue} className="text-xl font-bold text-slate-900">{stats.departments}</Text>
        </View>
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader} className="flex-row items-center mb-2">
            <View style={[styles.iconBox, { backgroundColor: '#22c55e' }]} className="w-7 h-7 rounded-lg mr-2" />
            <Text style={styles.cardTitle} className="text-slate-700 font-semibold">Stanowiska</Text>
          </View>
          <Text style={styles.cardValue} className="text-xl font-bold text-slate-900">{stats.positions}</Text>
        </View>
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader} className="flex-row items-center mb-2">
            <View style={[styles.iconBox, { backgroundColor: '#0ea5e9' }]} className="w-7 h-7 rounded-lg mr-2" />
            <Text style={styles.cardTitle} className="text-slate-700 font-semibold">Narzędzia</Text>
          </View>
          <Text style={styles.cardValue} className="text-xl font-bold text-slate-900">{stats.tools}</Text>
        </View>
      </View>

      <View style={[styles.sectionCard, styles.cardShadow]} className="mt-4 p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
        <View style={styles.sectionHeader} className="flex-row items-center mb-2">
          <View style={[styles.iconBox, { backgroundColor: '#4f46e5' }]} />
          <Text style={styles.sectionTitle} className="text-lg font-semibold text-slate-900">Historia narzędzi (ostatnie)</Text>
        </View>
        <FlatList
          data={tools}
          keyExtractor={(item) => String(item.id || item.tool_id || Math.random())}
          ItemSeparatorComponent={() => <View style={styles.separator} className="h-px bg-slate-200" />}
          renderItem={({ item }) => (
            <View style={styles.item} className="py-2">
              <Text style={styles.itemName} className="font-semibold text-slate-900">{item.name || item.tool_name || '—'}</Text>
              <Text style={styles.itemCode} className="text-slate-600">{item.code || item.inventory_number || ''}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  badge: { backgroundColor: '#EEF2FF', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  badgeText: { color: '#4f46e5', fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: '45%', padding: 14, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  cardShadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconBox: { width: 28, height: 28, borderRadius: 8, marginRight: 8 },
  cardTitle: { color: '#334155', fontWeight: '600' },
  cardValue: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  sectionCard: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  separator: { height: 1, backgroundColor: '#e2e8f0' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600', color: '#0f172a' },
  itemCode: { color: '#475569' },
  muted: { marginTop: 8, color: '#64748b' },
  error: { color: '#ef4444', marginBottom: 8 }
});