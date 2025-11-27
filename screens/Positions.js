import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission } from '../lib/utils';

export default function PositionsScreen() {
  const { colors } = useTheme();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewPositions, setCanViewPositions] = useState(false);
  const [canManagePositions, setCanManagePositions] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try { await api.init(); } catch {}
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        const me = raw ? JSON.parse(raw) : null;
        setCurrentUser(me);
        const canManage = hasPermission(me, 'manage_positions');
        const canView = canManage || hasPermission(me, 'view_admin') || hasPermission(me, 'system_settings');
        setCanManagePositions(canManage);
        setCanViewPositions(!!canView);
      } catch {
        setCurrentUser(null);
        setCanManagePositions(false);
        setCanViewPositions(false);
      } finally {
        setPermsReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!permsReady || !canViewPositions) return;
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
  }, [permsReady, canViewPositions]);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold mb-3">Stanowiska</Text>
      {!permsReady ? (
        <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie uprawnień…</Text>
      ) : !canViewPositions ? (
        <Text style={[styles.error, { color: colors.danger }]}>Brak uprawnień do przeglądania stanowisk</Text>
      ) : (
        <>
          {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
          {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
            <FlatList
              data={positions}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} className="h-px" />}
              renderItem={({ item }) => (
                <View style={styles.item} className="py-2">
                  <Text style={[styles.itemName, { color: colors.text }]} className="font-semibold">{item.name}</Text>
                  <Text style={[styles.itemCode, { color: colors.muted }]}>ID: {item.id}</Text>
                </View>
              )}
            />
          )}
        </>
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