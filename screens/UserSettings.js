import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, Pressable, Switch, Platform, ScrollView } from 'react-native';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { initNotifications, sendImmediate, saveSettings, getSettings, rescheduleFromSettings, disableAllNotifications, clearAcknowledgements } from '../lib/notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { showSnackbar } from '../lib/snackbar';

export default function UserSettingsScreen() {
  const { colors } = useTheme();
  const [hasToken, setHasToken] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [notifReady, setNotifReady] = useState(false);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [expiredEnabled, setExpiredEnabled] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
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
      // Biometria: sprawdź sprzęt, status i przełącznik
      try {
        const enabled = await AsyncStorage.getItem('@bio_enabled_v1');
        setBioEnabled(enabled === '1');
        if (Platform.OS !== 'web') {
          const hasHw = await LocalAuthentication.hasHardwareAsync();
          const enrolled = hasHw ? await LocalAuthentication.isEnrolledAsync() : false;
          setBioAvailable(!!hasHw);
          setBioEnrolled(!!enrolled);
        } else {
          setBioAvailable(false);
          setBioEnrolled(false);
        }
      } catch {}
    };
    check();
  }, []);

  const logout = async () => {
    // Wyczyść token w kliencie API i w pamięci trwałej
    await api.setToken(null);
    await AsyncStorage.removeItem('token');
    setHasToken(false);
    // Nie resetujemy ręcznie nawigacji — App.js przełączy na ekran logowania po zmianie tokena
    try {
      // Opcjonalnie przejdź do ekranu logowania, jeśli aktualny navigator to root
      navigation.dispatch({ type: 'NAVIGATE', payload: { name: 'Login' } });
    } catch {}
  };

  const testConnection = async () => {
    try {
      await api.init();
      const res = await api.get('/api/health');
      if (Array.isArray(res)) {
        showSnackbar('Połączono z API (autoryzacja OK).', { type: 'success' });
      } else {
        showSnackbar('Połączono z API.', { type: 'success' });
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        showSnackbar('Połączono z API, ale brak autoryzacji — zaloguj się.', { type: 'warn' });
      } else {
        showSnackbar(`Brak połączenia z API: ${e.message || 'nieznany błąd'}`, { type: 'error' });
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
    showSnackbar('Wyłączono wszystkie zaplanowane powiadomienia i zapisano ustawienia.', { type: 'success' });
  };

  const clearAcks = async () => {
    try {
      await clearAcknowledgements({ reschedule: true });
      showSnackbar('Wyczyszczono potwierdzenia powiadomień. Harmonogram został odświeżony.', { type: 'success' });
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się wyczyścić potwierdzeń.', { type: 'error' });
    }
  };

  const toggleBiometrics = async (value) => {
    try {
      if (Platform.OS === 'web') {
        alert('Biometria nie jest dostępna w wersji web.');
        setBioEnabled(false);
        await AsyncStorage.setItem('@bio_enabled_v1', '0');
        return;
      }
      if (value) {
        const hasHw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hasHw ? await LocalAuthentication.isEnrolledAsync() : false;
        if (!hasHw || !enrolled) {
          alert('Urządzenie nie wspiera biometrii lub brak zapisanych danych biometrycznych.');
          setBioAvailable(!!hasHw);
          setBioEnrolled(!!enrolled);
          setBioEnabled(false);
          await AsyncStorage.setItem('@bio_enabled_v1', '0');
          return;
        }
        const savedUser = await SecureStore.getItemAsync('auth_username');
        const savedPass = await SecureStore.getItemAsync('auth_password');
        if (!savedUser || !savedPass) {
          alert('Najpierw zaloguj się tradycyjnie, aby zapisać dane do logowania biometrycznego.');
          setBioEnabled(false);
          await AsyncStorage.setItem('@bio_enabled_v1', '0');
          return;
        }
        await AsyncStorage.setItem('@bio_enabled_v1', '1');
        setBioEnabled(true);
        alert('Biometria włączona. Przy kolejnym logowaniu możesz użyć odcisku palca.');
      } else {
        await AsyncStorage.setItem('@bio_enabled_v1', '0');
        setBioEnabled(false);
        alert('Biometria wyłączona.');
      }
    } catch {}
  };

  const clearSavedCredentials = async () => {
    try {
      await SecureStore.deleteItemAsync('auth_username');
      await SecureStore.deleteItemAsync('auth_password');
      await AsyncStorage.removeItem('@bio_enabled_v1');
      setBioEnabled(false);
      alert('Usunięto zapisane dane logowania biometrycznego.');
    } catch {
      alert('Nie udało się usunąć zapisanych danych.');
    }
  };

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={{ paddingBottom: 32 }}>
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

      {Platform.OS !== 'web' ? (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 16 }]}> 
          <Text style={styles.sectionTitle}>Logowanie biometryczne</Text>
          <Text style={{ color: colors.muted, marginBottom: 8 }}>
            Po pierwszym zwykłym zalogowaniu zapisujemy login i hasło w pamięci szyfrowanej.
            Włączenie poniższego przełącznika pozwoli logować się odciskiem palca na wspieranych urządzeniach.
          </Text>
          <View style={[styles.row, { marginBottom: 8 }]}> 
            <Text style={styles.label}>Używaj biometrii</Text>
            <Switch value={bioEnabled} onValueChange={toggleBiometrics} thumbColor={bioEnabled ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <Text style={{ color: colors.muted, marginBottom: 12 }}>
            Sprzęt: {bioAvailable ? 'Tak' : 'Nie'} • Zapis biometrii: {bioEnrolled ? 'Tak' : 'Nie'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable onPress={clearSavedCredentials} style={[styles.button, { backgroundColor: colors.muted }]}> 
              <Text style={styles.buttonText}>Usuń zapisane dane</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

// StyleSheet dodany — kolory i układ pochodzą z motywu
