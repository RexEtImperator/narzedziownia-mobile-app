import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Switch, ScrollView } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';

const BACKUP_FREQ_OPTIONS = [
  { label: 'Codziennie', value: 'daily' },
  { label: 'Tygodniowo', value: 'weekly' },
  { label: 'Miesięcznie', value: 'monthly' }
];
const DOW_OPTIONS = [
  { label: 'Pn', value: 1 },
  { label: 'Wt', value: 2 },
  { label: 'Śr', value: 3 },
  { label: 'Cz', value: 4 },
  { label: 'Pt', value: 5 },
  { label: 'So', value: 6 },
  { label: 'Nd', value: 7 },
];

export default function BackupSettings() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [automaticBackup, setAutomaticBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState('daily');
  const [backupTime, setBackupTime] = useState('02:00');
  const [backupDayOfWeek, setBackupDayOfWeek] = useState(1);
  const [backupDayOfMonth, setBackupDayOfMonth] = useState(1);
  const [backupRetentionDays, setBackupRetentionDays] = useState(90);
  const [runningNow, setRunningNow] = useState(false);
  const [backups, setBackups] = useState([]);
  const [lastBackupFile, setLastBackupFile] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        try {
          const n = await api.get('/api/config/notifications');
          setAutomaticBackup(n?.automaticBackup ?? true);
          setBackupFrequency(n?.backupFrequency ?? 'daily');
          setBackupTime(n?.backupTime ?? '02:00');
          setBackupDayOfWeek(n?.backupDayOfWeek ?? 1);
          setBackupDayOfMonth(n?.backupDayOfMonth ?? 1);
          setBackupRetentionDays(n?.backupRetentionDays ?? 90);
        } catch {}
        try {
          const g = await api.get('/api/config/general');
          if (g?.backupFrequency) setBackupFrequency(g.backupFrequency);
          if (g?.backupTime) setBackupTime(g.backupTime);
          if (g?.lastBackupAt) setLastBackupAt(g.lastBackupAt);
        } catch {}
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadBackups = async () => {
    try {
      setBackupLoading(true);
      const resp = await api.get('/api/backup/list');
      const list = Array.isArray(resp?.backups) ? resp.backups : [];
      const sorted = list.slice().sort((a, b) => {
        const an = a.file || '';
        const bn = b.file || '';
        if (an < bn) return 1;
        if (an > bn) return -1;
        return 0;
      });
      setBackups(sorted);
      setLastBackupFile((sorted[0] && sorted[0].file) || null);
    } catch (err) {
      // Brak uprawnień (403) lub inny błąd – pokaż tylko lastBackupAt z configu
      console.warn('Nie udało się pobrać listy kopii', err?.message || err);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const save = async () => {
    try {
      // Walidacja czasu HH:MM
      const timeOk = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(backupTime));
      if (!timeOk) {
        showSnackbar({ type: 'warn', text: 'Podaj godzinę w formacie HH:MM, np. 02:00' });
        return;
      }
      setSaving(true);
      await api.put('/api/config/notifications', {
        automaticBackup,
        backupFrequency,
        backupTime,
        backupDayOfWeek,
        backupDayOfMonth,
        backupRetentionDays,
      });
      showSnackbar({ type: 'success', text: 'Ustawienia kopii zapasowych zapisane.' });
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się zapisać ustawień kopii zapasowych' });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    try {
      setRunningNow(true);
      await api.post('/api/backup/run', {});
      showSnackbar({ type: 'success', text: 'Kopia zapasowa została uruchomiona.' });
      // Odśwież informacje po udanym backupie
      try {
        const g = await api.get('/api/config/general');
        if (g?.lastBackupAt) setLastBackupAt(g.lastBackupAt);
      } catch {}
      await loadBackups();
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się uruchomić kopii zapasowej' });
    } finally {
      setRunningNow(false);
    }
  };

  const parseBackupDate = (file) => {
    try {
      const m = String(file).match(/^database-(\d{8})-(\d{6})\.db$/);
      if (!m) return '-';
      const ymd = m[1];
      const hms = m[2];
      const yyyy = ymd.slice(0, 4);
      const mm = ymd.slice(4, 6);
      const dd = ymd.slice(6, 8);
      const hh = hms.slice(0, 2);
      const mi = hms.slice(2, 4);
      const ss = hms.slice(4, 6);
      const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.000Z`;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '-';
      return d.toLocaleString('pl-PL');
    } catch { return '-'; }
  };

  const restoreBackup = async (file) => {
    if (!file) return;
    try {
      setBackupLoading(true);
      await api.post('/api/backup/restore', { file });
      showSnackbar({ type: 'success', text: 'Przywrócono kopię zapasową' });
      Alert.alert(
        'Restart backendu',
        'Aby zastosować zmiany po przywróceniu, uruchom ponownie backend.',
        [
          { text: 'Później', style: 'cancel' },
          {
            text: 'Uruchom teraz',
            onPress: async () => {
              try {
                await api.post('/api/process/backend/restart', {});
                showSnackbar({ type: 'success', text: 'Restart backendu rozpoczęty' });
              } catch (err) {
                showSnackbar({ type: 'error', text: err?.message || 'Nie udało się zrestartować backendu' });
              }
            }
          }
        ]
      );
    } catch (err) {
      showSnackbar({ type: 'error', text: err?.message || 'Nie udało się przywrócić kopii' });
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      {loading ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>Ładowanie…</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: colors.text }]}>Automatyczny backup</Text>
            <Switch value={automaticBackup} onValueChange={setAutomaticBackup} />
          </View>

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

          {backupFrequency === 'weekly' && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Dzień tygodnia</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {DOW_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      backupDayOfWeek === opt.value ? styles.chipSelected : null,
                      backupDayOfWeek === opt.value ? { backgroundColor: colors.primary, borderColor: colors.primary } : null,
                    ]}
                    onPress={() => setBackupDayOfWeek(opt.value)}
                  >
                    <Text style={[
                      styles.chipText,
                      { color: colors.text },
                      backupDayOfWeek === opt.value ? styles.chipTextSelected : null,
                      backupDayOfWeek === opt.value ? { color: '#fff', fontWeight: '600' } : null,
                    ]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {backupFrequency === 'monthly' && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Dzień miesiąca (1–31)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={String(backupDayOfMonth)}
                onChangeText={(v) => {
                  const num = parseInt(v, 10);
                  setBackupDayOfMonth(isNaN(num) ? 1 : Math.max(1, Math.min(31, num)));
                }}
                keyboardType="numeric"
                placeholderTextColor={colors.muted}
              />
            </View>
          )}

          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Zapisywanie…' : 'Zapisz ustawienia backupu'}</Text>
          </Pressable>

          <Pressable style={[styles.button, { backgroundColor: colors.success, marginTop: 8 }]} onPress={runNow} disabled={runningNow}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{runningNow ? 'Uruchamianie…' : 'Backup teraz'}</Text>
          </Pressable>
          
          {/* Podsumowanie ostatniej kopii z konfiguracji i z listy */}
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Ostatnia kopia (z konfiguracji)</Text>
              <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '600', color: colors.text }}>{lastBackupAt ? new Date(lastBackupAt).toLocaleString('pl-PL') : '-'}</Text>
            </View>
            <View style={[styles.infoBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Ostatni plik backupu</Text>
              <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '600', color: colors.text }}>{lastBackupFile || '-'}</Text>
            </View>
          </View>

          {/* Lista kopii zapasowych */}
          <View style={{ marginTop: 16 }}>
            <Text style={[styles.label, { color: colors.text }]}>Lista kopii zapasowych</Text>
            {backupLoading ? (
              <Text style={{ color: colors.muted, marginTop: 6 }}>Ładowanie…</Text>
            ) : (backups || []).length === 0 ? (
              <Text style={{ color: colors.muted, marginTop: 6 }}>Brak danych</Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                {(backups || []).map((b) => (
                  <View key={b.file} style={[styles.backupRow, { borderColor: colors.border }]}> 
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'monospace', color: colors.text }}>{b.file}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{b.createdAt ? new Date(b.createdAt).toLocaleString('pl-PL') : parseBackupDate(b.file)}</Text>
                    </View>
                    <Pressable onPress={() => restoreBackup(b.file)} disabled={backupLoading} style={[styles.restoreBtn, { backgroundColor: colors.success }]}> 
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Przywróć</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  subtitle: { color: '#475569', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  label: { fontSize: 14, color: '#334155', marginBottom: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, backgroundColor: '#ffffff', marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#eef2ff', borderColor: '#6366f1' },
  chipText: { color: '#0f172a' },
  chipTextSelected: { color: '#3730a3', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0f172a' },
  button: { marginTop: 16, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowText: { fontSize: 16, color: '#0f172a' },
  infoBox: { flex: 1, minWidth: 160, padding: 10, borderWidth: 1, borderRadius: 10 },
  backupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  restoreBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }
});
