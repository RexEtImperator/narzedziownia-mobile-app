import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';

export default function CategoriesScreen() {
  const { colors } = useTheme();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const list = await api.get('/api/categories');
      setCategories(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Nie udało się pobrać kategorii');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = (categories || []).filter(c => {
    if (!search) return true;
    return String(c?.name || '').toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));

  const addCategory = async () => {
    if (!newName.trim()) {
      showSnackbar({ type: 'warn', text: 'Podaj nazwę kategorii' });
      return;
    }
    try {
      setSavingNew(true);
      await api.post('/api/categories', { name: newName.trim() });
      setNewName('');
      await load();
    } catch (e) {
      showSnackbar({ type: 'error', text: e.message || 'Nie udało się dodać kategorii' });
    } finally {
      setSavingNew(false);
    }
  };

  const startEdit = (c) => {
    setEditingId(c?.id);
    setEditName(c?.name || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editName.trim()) {
      showSnackbar({ type: 'warn', text: 'Podaj nazwę kategorii' });
      return;
    }
    try {
      setSavingEdit(true);
      await api.put(`/api/categories/${encodeURIComponent(editingId)}`, { name: editName.trim() });
      cancelEdit();
      await load();
    } catch (e) {
      showSnackbar({ type: 'error', text: e.message || 'Nie udało się zapisać zmian' });
    } finally {
      setSavingEdit(false);
    }
  };

  const removeCategory = async (c) => {
    Alert.alert('Usunąć kategorię?', `"${c?.name}"`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          await api.delete(`/api/categories/${encodeURIComponent(c?.id)}`);
          await load();
        } catch (e) {
          showSnackbar({ type: 'error', text: e.message || 'Nie udało się usunąć kategorii' });
        }
      }}
    ]);
  };

  return (
    <ScrollView style={[styles.scrollContainer, { backgroundColor: colors.bg }]} contentContainerStyle={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>🏷️ Kategorie</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Zarządzanie kategoriami narzędzi</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Dodaj kategorię</Text>
        <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwa" value={newName} onChangeText={setNewName} placeholderTextColor={colors.muted} />
        
        <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={addCategory} disabled={savingNew}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{savingNew ? 'Zapisywanie…' : 'Dodaj'}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Szukaj</Text>
        <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwa" value={search} onChangeText={setSearch} placeholderTextColor={colors.muted} />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Lista kategorii</Text>
        {loading ? <Text style={[styles.subtitle, { color: colors.muted }]}>Ładowanie…</Text> : null}
        {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
        {filtered.map((c) => (
          <View key={String(c?.id || c?.name)} style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 }}>
            {editingId === c?.id ? (
              <View>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={editName} onChangeText={setEditName} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Pressable style={[styles.button, { flex: 1, backgroundColor: colors.primary }]} onPress={saveEdit} disabled={savingEdit}><Text style={{ color: '#fff', fontWeight: '600' }}>{savingEdit ? 'Zapisywanie…' : 'Zapisz'}</Text></Pressable>
                  <Pressable style={[styles.button, { flex: 1, backgroundColor: colors.muted }]} onPress={cancelEdit}><Text style={{ color: '#fff', fontWeight: '600' }}>Anuluj</Text></Pressable>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 16, color: colors.text, fontWeight: '600' }}>{c?.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable style={[styles.smallButton, { backgroundColor: colors.primary }]} onPress={() => startEdit(c)}><Text style={styles.smallButtonText}>Edytuj</Text></Pressable>
                  <Pressable style={[styles.smallButton, { backgroundColor: colors.danger }]} onPress={() => removeCategory(c)}><Text style={styles.smallButtonText}>Usuń</Text></Pressable>
                </View>
              </View>
            )}
          </View>
        ))}
        {(!loading && filtered.length === 0) ? <Text style={{ color: colors.muted }}>Brak kategorii</Text> : null}
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
  button: { marginTop: 8, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  smallButton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  smallButtonText: { color: '#fff', fontWeight: '600' }
});