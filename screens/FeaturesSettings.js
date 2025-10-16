import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Alert } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';

export default function FeaturesSettings() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [features, setFeatures] = useState({
    enableAuditLog: true,
    enableReports: true,
    enableMobileApp: true,
    enableApiAccess: false,
    enableDataExport: true
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        try {
          const f = await api.get('/api/config/features');
          setFeatures(prev => ({
            enableAuditLog: f?.enableAuditLog ?? prev.enableAuditLog,
            enableReports: f?.enableReports ?? prev.enableReports,
            enableMobileApp: f?.enableMobileApp ?? prev.enableMobileApp,
            enableApiAccess: f?.enableApiAccess ?? prev.enableApiAccess,
            enableDataExport: f?.enableDataExport ?? prev.enableDataExport,
          }));
        } catch (e) { /* pomiń */ }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveFeatures = async () => {
    try {
      setSavingFeatures(true);
      await api.put('/api/config/features', features);
      Alert.alert('Zapisano', 'Ustawienia funkcji zapisane.');
    } catch (e) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać ustawień funkcji');
    } finally {
      setSavingFeatures(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>🎛️ Funkcje</Text>
      {loading ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>Ładowanie…</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Dziennik audytu</Text><Switch value={features.enableAuditLog} onValueChange={(v) => setFeatures({ ...features, enableAuditLog: v })} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Raporty</Text><Switch value={features.enableReports} onValueChange={(v) => setFeatures({ ...features, enableReports: v })} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Aplikacja mobilna</Text><Switch value={features.enableMobileApp} onValueChange={(v) => setFeatures({ ...features, enableMobileApp: v })} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Dostęp API</Text><Switch value={features.enableApiAccess} onValueChange={(v) => setFeatures({ ...features, enableApiAccess: v })} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Eksport danych</Text><Switch value={features.enableDataExport} onValueChange={(v) => setFeatures({ ...features, enableDataExport: v })} /></View>
          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={saveFeatures} disabled={savingFeatures}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{savingFeatures ? 'Zapisywanie…' : 'Zapisz ustawienia funkcji'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  subtitle: { color: '#475569', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowText: { fontSize: 16, color: '#0f172a' },
  button: { marginTop: 8, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }
});