import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, Alert, TextInput } from 'react-native';
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
  // Dodatkowe ustawienia powiązane z eksportem danych (zgodnie z AppConfigScreen.jsx)
  const [auditLogRetention, setAuditLogRetention] = useState(90);
  const [backupFrequency, setBackupFrequency] = useState('daily');
  const BACKUP_FREQ_OPTIONS = [
    { label: 'Codziennie', value: 'daily' },
    { label: 'Tygodniowo', value: 'weekly' },
    { label: 'Miesięcznie', value: 'monthly' }
  ];
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
        try {
          const n = await api.get('/api/config/notifications');
          setAuditLogRetention(n?.auditLogRetention ?? 90);
          setBackupFrequency(n?.backupFrequency ?? 'daily');
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

  const [savingNotifications, setSavingNotifications] = useState(false);
  const saveNotifications = async () => {
    if (!canManageSettings) {
      showSnackbar({ type: 'error', text: 'Brak uprawnień do zapisu dodatkowych ustawień' });
      return;
    }
    // Walidacja retencji (dni >= 0)
    const days = parseInt(auditLogRetention, 10);
    if (isNaN(days) || days < 0) {
      showSnackbar({ type: 'warn', text: 'Retencja audytu musi być liczbą nieujemną' });
      return;
    }
    try {
      setSavingNotifications(true);
      await api.put('/api/config/notifications', {
        auditLogRetention: days,
        backupFrequency,
      });
      showSnackbar({ type: 'success', text: 'Dodatkowe ustawienia zapisane.' });
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się zapisać dodatkowych ustawień' });
    } finally {
      setSavingNotifications(false);
    }
  };

  if (permsReady && !canViewSettings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 8 }}>⚠️ Brak uprawnień</Text>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>Brak uprawnień do przeglądania ustawień funkcji.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
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

          {features.enableDataExport && (
            <View style={{ marginTop: 20 }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Inne ustawienia</Text>
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Retencja dziennika audytu (dni)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                  value={String(auditLogRetention)}
                  onChangeText={(v) => {
                    const num = parseInt(v, 10);
                    setAuditLogRetention(isNaN(num) ? '' : String(Math.max(0, num)));
                  }}
                  keyboardType="numeric"
                  placeholderTextColor={colors.muted}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Częstotliwość backupu</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {BACKUP_FREQ_OPTIONS.map(opt => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.chip,
                        { borderColor: colors.border, backgroundColor: colors.card },
                        backupFrequency === opt.value ? styles.chipSelected : null,
                        backupFrequency === opt.value ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
                      ]}
                      onPress={() => setBackupFrequency(opt.value)}
                      disabled={!canManageSettings}
                    >
                      <Text style={[
                        styles.chipText,
                        { color: colors.text },
                        backupFrequency === opt.value ? styles.chipTextSelected : null,
                        backupFrequency === opt.value ? { color: '#fff', fontWeight: '600' } : null,
                      ]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <Pressable style={[styles.button, { backgroundColor: colors.primary, marginTop: 12, opacity: (!canManageSettings || savingNotifications) ? 0.7 : 1 }]} onPress={saveNotifications} disabled={savingNotifications || !canManageSettings}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{savingNotifications ? 'Zapisywanie…' : 'Zapisz dodatkowe ustawienia'}</Text>
              </Pressable>
            </View>
          )}
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
  button: { marginTop: 8, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, backgroundColor: '#ffffff', marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#eef2ff', borderColor: '#6366f1' },
  chipText: { fontSize: 14, color: '#0f172a' },
  chipTextSelected: { color: '#3730a3' }
});
