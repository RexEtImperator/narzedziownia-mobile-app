import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission } from '../lib/utils';

export default function DepartmentsScreen() {
  const { colors } = useTheme();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewDepartments, setCanViewDepartments] = useState(false);
  const [canManageDepartments, setCanManageDepartments] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try { await api.init(); } catch {}
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        const me = raw ? JSON.parse(raw) : null;
        setCurrentUser(me);
        const canManage = hasPermission(me, 'manage_departments');
        const canView = canManage || hasPermission(me, 'view_admin') || hasPermission(me, 'system_settings');
        setCanManageDepartments(canManage);
        setCanViewDepartments(!!canView);
      } catch {
        setCurrentUser(null);
        setCanManageDepartments(false);
        setCanViewDepartments(false);
      } finally {
        setPermsReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!permsReady || !canViewDepartments) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const data = await api.get('/api/departments');
        setDepartments(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Błąd pobierania działów');
        setDepartments([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [permsReady, canViewDepartments]);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold mb-3">Działy</Text>
      {!permsReady ? (
        <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie uprawnień…</Text>
      ) : !canViewDepartments ? (
        <Text style={[styles.error, { color: colors.danger }]}>Brak uprawnień do przeglądania działów</Text>
      ) : (
        <>
          {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
          {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
            <FlatList
              data={departments}
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
  wrapper: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' }
});