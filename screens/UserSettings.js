import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, Pressable, Switch } from 'react-native';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { initNotifications, sendImmediate, saveSettings, getSettings, rescheduleFromSettings, disableAllNotifications, clearAcknowledgements } from '../lib/notifications';

export default function UserSettingsScreen() {
  const { colors } = useTheme();
  const [hasToken, setHasToken] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [notifReady, setNotifReady] = useState(false);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [expiredEnabled, setExpiredEnabled] = useState(false);
  const navigation = useNavigation();

  const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: colors.bg, padding: 16 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: colors.text },
    status: { marginBottom: 12, color: colors.text },
    api: { marginBottom: 12, color: colors.muted },
    spacer: { height: 8 },
    card: { borderWidth: 1, borderRadius: 8, padding: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: colors.text },
    button: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  });

  useEffect(() => {
    const check = async () => {
      const token = await AsyncStorage.getItem('token');
      setHasToken(!!token);
      setBaseUrl(api.baseURL || '');
      try {
        const s = await getSettings();
        setReviewsEnabled(!!s.reviewsEnabled);
        setExpiredEnabled(!!s.expiredEnabled);
      } catch {}
    };
    check();
  }, []);

  const logout = async () => {
    // Wyczyść token w kliencie API i w pamięci trwałej
    await api.setToken(null);
    await AsyncStorage.removeItem('token');
    setHasToken(false);
    // Przenieś użytkownika na ekran logowania, aby nie widział danych ze stanu
    try {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Logowanie' }],
        })
      );
    } catch {}
    alert('Wylogowano');
  };

  const testConnection = async () => {
    try {
      await api.init();
      const res = await api.get('/api/employees');
      if (Array.isArray(res)) {
        alert('Połączono z API (autoryzacja OK).');
      } else {
        alert('Połączono z API.');
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        alert('Połączono z API, ale brak autoryzacji — zaloguj się.');
      } else {
        alert(`Brak połączenia z API: ${e.message || 'nieznany błąd'}`);
      }
    }
  };

  const initNotif = async () => {
    const { granted } = await initNotifications();
    setNotifReady(!!granted);
    if (!granted) alert('Brak zgody na powiadomienia. Zezwól, aby włączyć przypomnienia.');
  };

  const setReminders = async (value) => {
    if (value && !notifReady) { await initNotif(); }
    await saveSettings({ reviewsEnabled: !!value });
    await rescheduleFromSettings();
    setReviewsEnabled(!!value);
  };

  const setExpired = async (value) => {
    if (value && !notifReady) { await initNotif(); }
    await saveSettings({ expiredEnabled: !!value });
    await rescheduleFromSettings();
    setExpiredEnabled(!!value);
  };

  const sendTest = async () => {
    if (!notifReady) { await initNotif(); }
    await sendImmediate('Test powiadomień', 'To jest przykładowe powiadomienie.');
  };

  const disableAll = async () => {
    await disableAllNotifications();
    setReviewsEnabled(false);
    setExpiredEnabled(false);
    alert('Wyłączono wszystkie zaplanowane powiadomienia i zapisano ustawienia.');
  };

  const clearAcks = async () => {
    try {
      await clearAcknowledgements({ reschedule: true });
      alert('Wyczyszczono potwierdzenia powiadomień. Harmonogram został odświeżony.');
    } catch (e) {
      alert('Nie udało się wyczyścić potwierdzeń.');
    }
  };

  return (
    <View className="flex-1 p-4" style={styles.wrapper}>
      <Text style={styles.title}>Ustawienia użytkownika</Text>
      <Text style={styles.status}>{hasToken ? 'Zalogowano' : 'Niezalogowany'}</Text>
      {baseUrl ? <Text style={styles.api}>API: {baseUrl}</Text> : null}
      <Button title="Wyloguj" color={colors.primary} onPress={logout} />
      <View style={styles.spacer} />
      <Button title="Sprawdź połączenie z API" color={colors.primary} onPress={testConnection} />

      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 16 }]}> 
        <Text style={styles.sectionTitle}>Powiadomienia</Text>
        <Text style={{ color: colors.muted, marginBottom: 6 }}>Przeglądy: {reviewsEnabled ? 'Włączone' : 'Wyłączone'} • Przeterminowane: {expiredEnabled ? 'Włączone' : 'Wyłączone'}</Text>
        <Text style={{ color: colors.muted, marginBottom: 12 }}>Powiadomienia pobierane z bazy: alerty o przeterminowanych i przypomnienia 7 dni przed terminem (BHP i narzędzia).</Text>
        <View style={[styles.row, { marginBottom: 8 }]}> 
          <Text style={styles.label}>Przypomnienia 7 dni przed</Text>
          <Switch value={reviewsEnabled} onValueChange={setReminders} thumbColor={reviewsEnabled ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        <View style={[styles.row, { marginBottom: 8 }]}> 
          <Text style={styles.label}>Alerty po terminie</Text>
          <Switch value={expiredEnabled} onValueChange={setExpired} thumbColor={expiredEnabled ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        <View style={{ height: 8 }} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable onPress={sendTest} style={[styles.button, { backgroundColor: colors.primary }]}> 
            <Text style={styles.buttonText}>Wyślij test</Text>
          </Pressable>
          <Pressable onPress={disableAll} style={[styles.button, { backgroundColor: colors.muted }]}> 
            <Text style={styles.buttonText}>Wyłącz wszystkie</Text>
          </Pressable>
          <Pressable onPress={clearAcks} style={[styles.button, { backgroundColor: colors.primary }]}> 
            <Text style={styles.buttonText}>Wyczyść potwierdzenia</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// StyleSheet dodany — kolory i układ pochodzą z motywu