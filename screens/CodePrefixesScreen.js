import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import { showSnackbar } from '../lib/snackbar';
import { PERMISSIONS } from '../lib/constants';
import { usePermissions } from '../lib/PermissionsContext';

export default function CodePrefixesScreen() {
  const { colors } = useTheme();
  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [general, setGeneral] = useState({ toolsCodePrefix: '', bhpCodePrefix: '', toolCategoryPrefixes: {} });

  const canViewSettings = hasPermission(PERMISSIONS.SYSTEM_SETTINGS);

  const load = async () => {
    setLoading(true);
    try {
      await api.init();
    } catch {}
    try {
      const g = await api.get('/api/config/general');
      setGeneral(prev => ({
        toolsCodePrefix: g?.toolsCodePrefix ?? prev.toolsCodePrefix,
        bhpCodePrefix: g?.bhpCodePrefix ?? prev.bhpCodePrefix,
        toolCategoryPrefixes: g?.toolCategoryPrefixes ?? prev.toolCategoryPrefixes,
      }));
    } catch {}
    try {
      setCategoriesLoading(true);
      const list = await api.get('/api/categories');
      setCategories(Array.isArray(list) ? list : []);
    } catch {
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => { if (!permsReady) return; load(); }, [permsReady]);

  const save = async () => {
    if (!canViewSettings) {
      showSnackbar('Brak uprawnień do zapisywania ustawień', { type: 'error' });
      return;
    }
    try {
      setSaving(true);
      await api.put('/api/config/general', general);
      showSnackbar('Prefiksy zapisane.', { type: 'success' });
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zapisać prefiksów', { type: 'error' });
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Ładowanie…</Text>
      </View>
    );
  }

  if (permsReady && !canViewSettings) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.danger }}>Brak uprawnień do przeglądania ustawień</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.scrollContainer, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }] }>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Globalne prefiksy</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 mb-3">
            <Text style={[styles.label, { color: colors.muted }]}>Prefiks kodów narzędzi</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.toolsCodePrefix}
              onChangeText={(v) => setGeneral(prev => ({ ...prev, toolsCodePrefix: v }))}
              placeholder="np. TOOL-"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View className="flex-1 mb-3">
            <Text style={[styles.label, { color: colors.muted }]}>Prefiks kodów BHP</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.bhpCodePrefix}
              onChangeText={(v) => setGeneral(prev => ({ ...prev, bhpCodePrefix: v }))}
              placeholder="np. BHP-"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }] }>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Prefiksy dla kategorii</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Ustal prefiks generowanych kodów dla każdej kategorii.</Text>
        <View style={{ padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card }}>
          {categoriesLoading ? (
            <Text style={{ color: colors.muted }}>Ładowanie kategorii…</Text>
          ) : (categories || []).length === 0 ? (
            <Text style={{ color: colors.muted }}>Brak kategorii</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {(categories || []).map(cat => (
                <View key={String(cat?.id || cat?.name)} style={{ width: '100%' }}>
                  <Text style={[styles.label, { color: colors.muted }]}>{cat?.name}</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    placeholder="np. CAT-"
                    placeholderTextColor={colors.muted}
                    value={String((general?.toolCategoryPrefixes || {})[cat?.name] || '')}
                    onChangeText={(v) => {
                      setGeneral(prev => ({
                        ...prev,
                        toolCategoryPrefixes: { ...(prev.toolCategoryPrefixes || {}), [cat?.name]: v }
                      }));
                    }}
                  />
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{cat?.tool_count ? `${cat.tool_count} narzędzi` : '—'}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>Pozostaw puste, aby używać globalnego prefiksu.</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && { opacity: 0.9 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Zapisywanie…' : 'Zapisz prefiksy'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { backgroundColor: '#f8fafc' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  subtitle: { color: '#475569', marginBottom: 12 },
  label: { fontSize: 14, color: '#334155', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0f172a' },
  button: { marginTop: 12, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 8 }
});

