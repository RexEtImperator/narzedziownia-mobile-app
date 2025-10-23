import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Alert } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission } from '../lib/utils';

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
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewSettings, setCanViewSettings] = useState(false);
  const [canManageSettings, setCanManageSettings] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        const user = raw ? JSON.parse(raw) : null;
        setCurrentUser(user);
        // Wykorzystujemy istniejące uprawnienie systemowe
        const allowed = hasPermission(user, 'system_settings');
        setCanViewSettings(allowed);
        setCanManageSettings(allowed);
      } catch {}
      setPermsReady(true);
    })();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        if (!canViewSettings) {
          return;
        }
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
    if (!permsReady) return;
    load();
  }, [permsReady, canViewSettings]);

  const saveFeatures = async () => {
    if (!canManageSettings) {
      showSnackbar({ type: 'error', text: 'Brak uprawnień do zapisu ustawień funkcji' });
      return;
    }
    try {
      setSavingFeatures(true);
      await api.put('/api/config/features', features);
      showSnackbar({ type: 'success', text: 'Ustawienia funkcji zapisane.' });
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się zapisać ustawień funkcji' });
    } finally {
      setSavingFeatures(false);
    }
  };

  if (permsReady && !canViewSettings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>🎛️ Funkcje</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 8 }}>⚠️ Brak uprawnień</Text>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>Brak uprawnień do przeglądania ustawień funkcji.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}> 
      <Text style={[styles.title, { color: colors.text }]}>🎛️ Funkcje</Text>
      {loading ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>Ładowanie…</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Dziennik audytu</Text><Switch value={features.enableAuditLog} onValueChange={(v) => setFeatures({ ...features, enableAuditLog: v })} disabled={!canManageSettings} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Raporty</Text><Switch value={features.enableReports} onValueChange={(v) => setFeatures({ ...features, enableReports: v })} disabled={!canManageSettings} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Aplikacja mobilna</Text><Switch value={features.enableMobileApp} onValueChange={(v) => setFeatures({ ...features, enableMobileApp: v })} disabled={!canManageSettings} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Dostęp API</Text><Switch value={features.enableApiAccess} onValueChange={(v) => setFeatures({ ...features, enableApiAccess: v })} disabled={!canManageSettings} /></View>
          <View style={styles.row}><Text style={[styles.rowText, { color: colors.text }]}>Eksport danych</Text><Switch value={features.enableDataExport} onValueChange={(v) => setFeatures({ ...features, enableDataExport: v })} disabled={!canManageSettings} /></View>
          <Pressable style={[styles.button, { backgroundColor: colors.primary, opacity: (!canManageSettings || savingFeatures) ? 0.7 : 1 }]} onPress={saveFeatures} disabled={savingFeatures || !canManageSettings}>
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