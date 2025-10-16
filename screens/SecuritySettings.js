import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';

export default function SecuritySettings() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [strongPasswords, setStrongPasswords] = useState(true);
  const [minLength, setMinLength] = useState('10');
  const [requireUppercase, setRequireUppercase] = useState(true);
  const [requireNumber, setRequireNumber] = useState(true);
  const [requireSymbol, setRequireSymbol] = useState(true);

  const [lockoutThreshold, setLockoutThreshold] = useState('5');
  const [lockoutWindowMinutes, setLockoutWindowMinutes] = useState('15');

  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState('30');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const cfg = await api.get('/api/config/security');
      if (cfg && typeof cfg === 'object') {
        setStrongPasswords(Boolean(cfg.strongPasswords ?? strongPasswords));
        setMinLength(String(cfg.minLength ?? minLength));
        setRequireUppercase(Boolean(cfg.requireUppercase ?? requireUppercase));
        setRequireNumber(Boolean(cfg.requireNumber ?? requireNumber));
        setRequireSymbol(Boolean(cfg.requireSymbol ?? requireSymbol));
        setLockoutThreshold(String(cfg.lockoutThreshold ?? lockoutThreshold));
        setLockoutWindowMinutes(String(cfg.lockoutWindowMinutes ?? lockoutWindowMinutes));
        setSessionTimeoutMinutes(String(cfg.sessionTimeoutMinutes ?? sessionTimeoutMinutes));
      }
    } catch (e) {
      if (e && e.status === 404) {
        setError("Endpoint '/api/config/security' nieobsługiwany przez API (404). Używam wartości domyślnych.");
      } else {
        setError(e.message || 'Nie udało się pobrać konfiguracji bezpieczeństwa');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const numeric = (val) => {
    const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const save = async () => {
    const payload = {
      strongPasswords,
      minLength: Math.max(6, numeric(minLength)),
      requireUppercase,
      requireNumber,
      requireSymbol,
      lockoutThreshold: Math.max(0, numeric(lockoutThreshold)),
      lockoutWindowMinutes: Math.max(1, numeric(lockoutWindowMinutes)),
      sessionTimeoutMinutes: Math.min(1440, Math.max(5, numeric(sessionTimeoutMinutes))),
    };
    try {
      setSaving(true);
      await api.put('/api/config/security', payload);
      Alert.alert('Zapisano', 'Ustawienia bezpieczeństwa zostały zapisane');
    } catch (e) {
      if (e && e.status === 404) {
        Alert.alert('Endpoint nieobsługiwany', "Backend nie obsługuje '/api/config/security' (404). Zapis niedostępny.");
      } else {
        Alert.alert('Błąd', e.message || 'Nie udało się zapisać ustawień');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.scrollContainer, { backgroundColor: colors.bg }]} contentContainerStyle={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>🔒 Bezpieczeństwo</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Polityka haseł, blokada logowań, sesje, 2FA</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Polityka haseł</Text>
        {error ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{error}</Text> : null}
        {loading ? <Text style={[styles.subtitle, { color: colors.muted }]}>Ładowanie…</Text> : null}
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Wymagaj silnych haseł</Text>
          <Switch value={strongPasswords} onValueChange={setStrongPasswords} />
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Minimalna długość</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={minLength} onChangeText={setMinLength} keyboardType="numeric" />
        </View>
        <View style={styles.row}><Text style={[styles.label, { color: colors.text }]}>Wymagaj wielkiej litery</Text><Switch value={requireUppercase} onValueChange={setRequireUppercase} /></View>
        <View style={styles.row}><Text style={[styles.label, { color: colors.text }]}>Wymagaj cyfry</Text><Switch value={requireNumber} onValueChange={setRequireNumber} /></View>
        <View style={styles.row}><Text style={[styles.label, { color: colors.text }]}>Wymagaj symbolu</Text><Switch value={requireSymbol} onValueChange={setRequireSymbol} /></View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Blokada logowań</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Ilość błędnych prób</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={lockoutThreshold} onChangeText={setLockoutThreshold} keyboardType="numeric" />
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Okno (min)</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={lockoutWindowMinutes} onChangeText={setLockoutWindowMinutes} keyboardType="numeric" />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sesja</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Timeout sesji (min)</Text>
          <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={sessionTimeoutMinutes} onChangeText={setSessionTimeoutMinutes} keyboardType="numeric" />
        </View>
        
      </View>

      <Pressable style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Zapisywanie…' : 'Zapisz ustawienia'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f8fafc', padding: 16, paddingBottom: 24 },
  scrollContainer: { backgroundColor: '#f8fafc', flex: 1 },
  title: { fontSize: 22, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  subtitle: { color: '#475569', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 14, color: '#334155' },
  input: { width: 100, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: '#0f172a', textAlign: 'center' },
  saveButton: { backgroundColor: '#4f46e5', paddingVertical: 12, borderRadius: 10, alignItems: 'center' }
});