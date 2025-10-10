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
      <View style={styles.container}><ActivityIndicator size="large" /><Text style={styles.muted}>Ładowanie…</Text></View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Dashboard</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.statsRow}>
        <View style={styles.card}><Text style={styles.cardTitle}>Pracownicy</Text><Text style={styles.cardValue}>{stats.employees}</Text></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Działy</Text><Text style={styles.cardValue}>{stats.departments}</Text></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Stanowiska</Text><Text style={styles.cardValue}>{stats.positions}</Text></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Narzędzia</Text><Text style={styles.cardValue}>{stats.tools}</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Narzędzia (ostatnie)</Text>
      <FlatList
        data={tools}
        keyExtractor={(item) => String(item.id || item.tool_id || Math.random())}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemName}>{item.name || item.tool_name || '—'}</Text>
            <Text style={styles.itemCode}>{item.code || item.inventory_number || ''}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#fff', padding: 16 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexGrow: 1, flexBasis: '45%', padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8 },
  cardTitle: { color: '#666', marginBottom: 4 },
  cardValue: { fontSize: 20, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  muted: { marginTop: 8, color: '#666' },
  error: { color: 'red', marginBottom: 8 }
});