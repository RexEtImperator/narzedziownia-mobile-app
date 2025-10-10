import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList } from 'react-native';
import api from '../lib/api';

export default function ToolsScreen() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [foundTool, setFoundTool] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const data = await api.get('/api/tools');
      setTools(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Błąd pobierania narzędzi');
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const searchByCode = async () => {
    setError('');
    setFoundTool(null);
    try {
      await api.init();
      const result = await api.get(`/api/tools/search?code=${encodeURIComponent(code)}`);
      setFoundTool(result);
    } catch (e) {
      setError(e.message || 'Nie znaleziono narzędzia');
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Narzędzia</Text>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Kod/QR/SKU" value={code} onChangeText={setCode} />
        <Button title="Szukaj" onPress={searchByCode} />
      </View>
      {foundTool && (
        <View style={styles.card}>
          <Text style={styles.toolName}>{foundTool.name}</Text>
          <Text style={styles.toolMeta}>SKU: {foundTool.sku || '—'} | Kod: {foundTool.inventory_number || foundTool.barcode || foundTool.qr_code || '—'}</Text>
          <Text style={styles.toolMeta}>Ilość: {foundTool.quantity} | Status: {foundTool.status || '—'}</Text>
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <Text style={styles.muted}>Ładowanie…</Text> : (
        <FlatList
          data={tools}
          keyExtractor={(item) => String(item.id)}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemCode}>{item.inventory_number || item.sku}</Text>
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
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 12 },
  toolName: { fontSize: 18, fontWeight: '600' },
  toolMeta: { color: '#666' },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' }
});