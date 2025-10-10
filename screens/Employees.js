import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import api from '../lib/api';

export default function EmployeesScreen() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const data = await api.get('/api/employees');
        setEmployees(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Błąd pobierania pracowników');
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Pracownicy</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <Text style={styles.muted}>Ładowanie…</Text> : (
        <FlatList
          data={employees}
          keyExtractor={(item) => String(item.id)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemName}>{item.first_name} {item.last_name}</Text>
              <Text style={styles.itemCode}>ID: {item.id} | Stanowisko: {item.position_name || item.position_id || '—'}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' }
});