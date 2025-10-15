import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, Switch } from 'react-native';
import api from '../lib/api';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [automaticBackup, setAutomaticBackup] = useState(true);
  const [backupFrequency, setBackupFrequency] = useState('daily');
  const [backupTime, setBackupTime] = useState('02:00');
  const [backupDayOfWeek, setBackupDayOfWeek] = useState(1);
  const [backupDayOfMonth, setBackupDayOfMonth] = useState(1);
  const [backupRetentionDays, setBackupRetentionDays] = useState(90);
  const [runningNow, setRunningNow] = useState(false);

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
        } catch {}
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    try {
      // Walidacja czasu HH:MM
      const timeOk = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(backupTime));
      if (!timeOk) {
        Alert.alert('Nieprawidłowy czas', 'Podaj godzinę w formacie HH:MM, np. 02:00');
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
      Alert.alert('Zapisano', 'Ustawienia kopii zapasowych zapisane.');
    } catch (e) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać ustawień kopii zapasowych');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    try {
      setRunningNow(true);
      await api.post('/api/backup/run', {});
      Alert.alert('Backup uruchomiony', 'Kopia zapasowa została uruchomiona.');
    } catch (e) {
      Alert.alert('Błąd', e?.message || 'Nie udało się uruchomić kopii zapasowej');
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>💾 Backup</Text>
      {loading ? (
        <Text style={styles.subtitle}>Ładowanie…</Text>
      ) : (
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>Automatyczny backup</Text>
            <Switch value={automaticBackup} onValueChange={setAutomaticBackup} />
          </View>

          <Text style={styles.label}>Częstotliwość backupu</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {BACKUP_FREQ_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[styles.chip, backupFrequency === opt.value && styles.chipSelected]}
                onPress={() => setBackupFrequency(opt.value)}
              >
                <Text style={[styles.chipText, backupFrequency === opt.value && styles.chipTextSelected]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          {backupFrequency === 'weekly' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.label}>Dzień tygodnia</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {DOW_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, backupDayOfWeek === opt.value && styles.chipSelected]}
                    onPress={() => setBackupDayOfWeek(opt.value)}
                  >
                    <Text style={[styles.chipText, backupDayOfWeek === opt.value && styles.chipTextSelected]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {backupFrequency === 'monthly' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.label}>Dzień miesiąca (1–31)</Text>
              <TextInput
                style={styles.input}
                value={String(backupDayOfMonth)}
                onChangeText={(v) => {
                  const num = parseInt(v, 10);
                  setBackupDayOfMonth(isNaN(num) ? 1 : Math.max(1, Math.min(31, num)));
                }}
                keyboardType="numeric"
                placeholderTextColor="#64748b"
              />
            </View>
          )}

          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Godzina (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={String(backupTime)}
              onChangeText={setBackupTime}
              keyboardType="default"
              placeholder="02:00"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>Retencja kopii (dni)</Text>
            <TextInput
              style={styles.input}
              value={String(backupRetentionDays)}
              onChangeText={(v) => {
                const num = parseInt(v, 10);
                setBackupRetentionDays(isNaN(num) ? 0 : Math.max(0, num));
              }}
              keyboardType="numeric"
              placeholderTextColor="#64748b"
            />
          </View>

          <Pressable style={styles.button} onPress={save} disabled={saving}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Zapisywanie…' : 'Zapisz ustawienia backupu'}</Text>
          </Pressable>

          <Pressable style={[styles.button, { backgroundColor: '#0ea5e9', marginTop: 8 }]} onPress={runNow} disabled={runningNow}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{runningNow ? 'Uruchamianie…' : 'Backup teraz'}</Text>
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
  label: { fontSize: 14, color: '#334155', marginBottom: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, backgroundColor: '#ffffff', marginRight: 8, marginBottom: 8 },
  chipSelected: { backgroundColor: '#eef2ff', borderColor: '#6366f1' },
  chipText: { color: '#0f172a' },
  chipTextSelected: { color: '#3730a3', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#0f172a' },
  button: { marginTop: 16, backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowText: { fontSize: 16, color: '#0f172a' }
});