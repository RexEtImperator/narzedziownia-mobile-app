import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Switch, Alert, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';
import { isAdmin } from '../lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROLE_OPTIONS = [
  { label: 'Użytkownik', value: 'user' },
  { label: 'Pracownik', value: 'employee' },
  { label: 'Kierownik', value: 'manager' },
  { label: 'Narzędziowiec', value: 'toolsmaster' },
  { label: 'Kadry', value: 'hr' },
  { label: 'Mistrz', value: 'supervisor' },
  { label: 'Inżynier', value: 'engineer' },
  { label: 'Administrator', value: 'admin' }
];

export default function UsersSettings() {
  const { colors } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const roleLabel = (r) => {
    const v = String(r || '').toLowerCase();
    if (v === 'admin' || v === 'administrator') return 'Administrator';
    if (v === 'manager') return 'Kierownik';
    if (v === 'toolsmaster') return 'Narzędziowiec';
    if (v === 'hr') return 'Kadry';
    if (v === 'supervisor') return 'Mistrz';
    if (v === 'engineer') return 'Inżynier';
    if (v === 'employee' || v === 'pracownik') return 'Pracownik';
    if (v === 'user' || !v) return 'Użytkownik';
    return r || 'Nieznane';
  };
  
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      
      // Sprawdź uprawnienia użytkownika na podstawie zapisanego @current_user
      try {
        const saved = await AsyncStorage.getItem('@current_user');
        const me = saved ? JSON.parse(saved) : null;
        setCurrentUser(me);
        setUserIsAdmin(isAdmin(me));
      } catch {
        setUserIsAdmin(false);
      }
      
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
    const terms = [
      u?.username,
      u?.email,
      u?.full_name,
    ].filter(Boolean).map(v => String(v).toLowerCase());
    const q = String(search).toLowerCase();
    return terms.some(val => val.includes(q));
  }).sort((a, b) => String(a?.username || '').localeCompare(String(b?.username || '')));

  

  const cycleRole = (u) => {
    const idx = ROLE_OPTIONS.findIndex(r => r.value === (u?.role || 'user'));
    const next = ROLE_OPTIONS[(idx + 1) % ROLE_OPTIONS.length]?.value || 'user';
    return next;
  };

  const updateUser = async (u, patch) => {
    if (!userIsAdmin) {
      showSnackbar('Wymagane uprawnienia administratora', { type: 'error' });
      return;
    }
    try {
      await api.put(`/api/users/${encodeURIComponent(u?.id)}`, { ...patch });
      await load();
    } catch (e) {
      showSnackbar(e.message || 'Nie udało się zaktualizować użytkownika', { type: 'error' });
    }
  };

  const resetPassword = async (u) => {
    if (!userIsAdmin) {
      showSnackbar('Wymagane uprawnienia administratora', { type: 'error' });
      return;
    }
    Alert.alert('Resetować hasło?', `${u?.username || u?.email}`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Resetuj', onPress: async () => {
        try {
          await api.post(`/api/users/${encodeURIComponent(u?.id)}/reset-password`, {});
          showSnackbar('Użytkownik otrzyma nowe hasło zgodnie z polityką', { type: 'success' });
        } catch (e) {
          showSnackbar(e.message || 'Nie udało się zresetować hasła', { type: 'error' });
        }
      }}
    ]);
  };

  const removeUser = async (u) => {
    if (!userIsAdmin) {
      showSnackbar('Wymagane uprawnienia administratora', { type: 'error' });
      return;
    }
    Alert.alert('Usunąć użytkownika?', `${u?.username || u?.email}`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/users/${encodeURIComponent(u?.id)}`);
          await load();
        } catch (e) {
          showSnackbar(e.message || 'Nie udało się usunąć użytkownika', { type: 'error' });
        }
      }}
    ]);
  };

  return (
    <ScrollView style={[styles.scrollContainer, { backgroundColor: colors.bg }]} contentContainerStyle={[styles.container, { backgroundColor: colors.bg }]}>
      {!userIsAdmin && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 8 }}>⚠️ Brak uprawnień</Text>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>Ta funkcja wymaga uprawnień administratora</Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Szukaj</Text>
        <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="login, imię/nazwisko, email" value={search} onChangeText={setSearch} placeholderTextColor={colors.muted} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Lista użytkowników</Text>
        {loading ? <Text style={[styles.subtitle, { color: colors.muted }]}>Ładowanie…</Text> : null}
        {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
        {(filtered || []).map(u => (
          <View key={String(u?.id || u?.username || u?.email)} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}>
            <View>
              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 16, color: colors.text, fontWeight: '600' }}>
                  {u?.full_name || u?.username || '—'}
                </Text>
                {u?.username ? <Text style={{ color: colors.muted }}>{u.username}</Text> : null}
                {u?.email ? <Text style={{ color: colors.muted }}>{u.email}</Text> : null}
                <Text style={{ color: colors.muted }}>Rola: {roleLabel(u?.role)}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                <Pressable
                  accessibilityLabel="Zmień rolę"
                  style={[styles.smallButton, { backgroundColor: userIsAdmin ? colors.primary : colors.muted }]}
                  onPress={() => updateUser(u, { role: cycleRole(u) })}
                  disabled={!userIsAdmin}
                >
                  <MaterialIcons name="autorenew" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel={u?.active ? 'Dezaktywuj użytkownika' : 'Aktywuj użytkownika'}
                  style={[styles.smallButton, { backgroundColor: userIsAdmin ? colors.primary : colors.muted }]}
                  onPress={() => updateUser(u, { active: !u?.active })}
                  disabled={!userIsAdmin}
                >
                  <MaterialIcons name={u?.active ? 'block' : 'check-circle'} size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Resetuj hasło"
                  style={[styles.smallButton, { backgroundColor: userIsAdmin ? colors.primary : colors.muted }]}
                  onPress={() => resetPassword(u)}
                  disabled={!userIsAdmin}
                >
                  <MaterialIcons name="vpn-key" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  accessibilityLabel="Usuń użytkownika"
                  style={[styles.smallButton, { backgroundColor: userIsAdmin ? colors.danger : colors.muted }]}
                  onPress={() => removeUser(u)}
                  disabled={!userIsAdmin}
                >
                  <MaterialIcons name="delete" size={20} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        {(!loading && filtered.length === 0) ? <Text style={{ color: colors.muted }}>Brak użytkowników</Text> : null}
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
