import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Switch, Alert, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../lib/api';

const ROLE_OPTIONS = [
  { label: 'Użytkownik', value: 'user' },
  { label: 'Kierownik', value: 'manager' },
  { label: 'Administrator', value: 'admin' },
];

export default function UsersSettings() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const list = await api.get('/api/users');
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Nie udało się pobrać użytkowników');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = (users || []).filter(u => {
    if (!search) return true;
    return [u?.username, u?.name, u?.email].filter(Boolean).some(val => String(val).toLowerCase().includes(search.toLowerCase()));
  }).sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || '')));

  

  const cycleRole = (u) => {
    const idx = ROLE_OPTIONS.findIndex(r => r.value === (u?.role || 'user'));
    const next = ROLE_OPTIONS[(idx + 1) % ROLE_OPTIONS.length]?.value || 'user';
    return next;
  };

  const updateUser = async (u, patch) => {
    try {
      await api.put(`/api/users/${encodeURIComponent(u?.id)}`, { ...patch });
      await load();
    } catch (e) {
      Alert.alert('Błąd', e.message || 'Nie udało się zaktualizować użytkownika');
    }
  };

  const resetPassword = async (u) => {
    Alert.alert('Resetować hasło?', `${u?.username || u?.email}`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Resetuj', onPress: async () => {
        try {
          await api.post(`/api/users/${encodeURIComponent(u?.id)}/reset-password`, {});
          Alert.alert('Reset wykonany', 'Użytkownik otrzyma nowe hasło zgodnie z polityką');
        } catch (e) {
          Alert.alert('Błąd', e.message || 'Nie udało się zresetować hasła');
        }
      }}
    ]);
  };

  const removeUser = async (u) => {
    Alert.alert('Usunąć użytkownika?', `${u?.username || u?.email}`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/users/${encodeURIComponent(u?.id)}`);
          await load();
        } catch (e) {
          Alert.alert('Błąd', e.message || 'Nie udało się usunąć użytkownika');
        }
      }}
    ]);
  };

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.container}>
      <Text style={styles.title}>👥 Użytkownicy</Text>
      <Text style={styles.subtitle}>Zarządzanie kontami i rolami</Text>


      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Szukaj</Text>
        <TextInput style={styles.input} placeholder="login, imię/nazwisko, email" value={search} onChangeText={setSearch} placeholderTextColor="#64748b" />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Lista użytkowników</Text>
        {loading ? <Text style={styles.subtitle}>Ładowanie…</Text> : null}
        {error ? <Text style={{ color: '#b91c1c', marginBottom: 8 }}>{error}</Text> : null}
        {(filtered || []).map(u => (
          <View key={String(u?.id || u?.username || u?.email)} style={{ borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 8 }}>
            <View>
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 16, color: '#0f172a', fontWeight: '600' }}>{u?.name || u?.username}</Text>
                {u?.email ? <Text style={{ color: '#475569' }}>{u.email}</Text> : null}
                <Text style={{ color: '#64748b' }}>Rola: {u?.role || 'user'} • {u?.active ? 'Aktywny' : 'Nieaktywny'}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Pressable
                  accessibilityLabel="Zmień rolę"
                  style={[styles.smallButton, { backgroundColor: '#0ea5e9' }]}
                  onPress={() => updateUser(u, { role: cycleRole(u) })}
                >
                  <MaterialIcons name="autorenew" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel={u?.active ? 'Dezaktywuj użytkownika' : 'Aktywuj użytkownika'}
                  style={[styles.smallButton, { backgroundColor: u?.active ? '#334155' : '#22c55e' }]}
                  onPress={() => updateUser(u, { active: !u?.active })}
                >
                  <MaterialIcons name={u?.active ? 'block' : 'check-circle'} size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Resetuj hasło"
                  style={[styles.smallButton, { backgroundColor: '#f59e0b' }]}
                  onPress={() => resetPassword(u)}
                >
                  <MaterialIcons name="vpn-key" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Usuń użytkownika"
                  style={[styles.smallButton, { backgroundColor: '#ef4444' }]}
                  onPress={() => removeUser(u)}
                >
                  <MaterialIcons name="delete" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        {(!loading && filtered.length === 0) ? <Text style={{ color: '#64748b' }}>Brak użytkowników</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  scrollContainer: { backgroundColor: '#f8fafc' },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  subtitle: { color: '#475569', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, color: '#334155', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0f172a' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, backgroundColor: '#ffffff', marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#eef2ff', borderColor: '#6366f1' },
  chipText: { color: '#0f172a' },
  chipTextSelected: { color: '#3730a3', fontWeight: '600' },
  button: { marginTop: 8, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  smallButton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, marginRight: 8, marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { color: '#fff', fontWeight: '600' }
});