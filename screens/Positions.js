import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import api from '../lib/api';

export default function PositionsScreen() {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const data = await api.get('/api/positions');
        setPositions(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Błąd pobierania stanowisk');
        setPositions([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <View style={styles.wrapper} className="flex-1 bg-white p-4">
      <Text style={styles.title} className="text-2xl font-bold mb-3">Stanowiska</Text>
      {error ? <Text style={styles.error} className="text-red-500 mb-2">{error}</Text> : null}
      {loading ? <Text style={styles.muted} className="text-slate-600">Ładowanie…</Text> : (
        <FlatList
          data={positions}
          keyExtractor={(item) => String(item.id)}
          ItemSeparatorComponent={() => <View style={styles.separator} className="h-px bg-slate-200" />}
          renderItem={({ item }) => (
            <View style={styles.item} className="py-2">
              <Text style={styles.itemName} className="font-semibold text-gray-800">{item.name}</Text>
              <Text style={styles.itemCode} className="text-slate-600">ID: {item.id}</Text>
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