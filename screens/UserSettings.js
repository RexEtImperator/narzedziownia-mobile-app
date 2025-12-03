import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, Pressable, Switch, Platform, ScrollView, Image, TextInput } from 'react-native';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { initNotifications, sendImmediate, saveSettings, getSettings, rescheduleFromSettings, disableAllNotifications, clearAcknowledgements } from '../lib/notifications';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { showSnackbar } from '../lib/snackbar';
import { Ionicons } from '@expo/vector-icons';

export default function UserSettingsScreen() {
  const { colors, isDark, toggleDark } = useTheme();
  const [hasToken, setHasToken] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [notifReady, setNotifReady] = useState(false);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [expiredEnabled, setExpiredEnabled] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  // Dane pracownika (employees)
  const [employee, setEmployee] = useState(null);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhoneError, setEmpPhoneError] = useState('');
  const [empEmailError, setEmpEmailError] = useState('');
  const navigation = useNavigation();

  const styles = StyleSheet.create({
    wrapper: { flex: 1, backgroundColor: colors.bg, padding: 16 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: colors.text },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 12, borderBottomWidth: 3, borderColor: colors.border },
    identityWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    identityTextWrap: { minWidth: 0 },
    identityName: { fontSize: 16, fontWeight: '700', color: colors.text },
    identityRole: { fontSize: 14, color: colors.muted },
    bellBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
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
      let userMe = null;
      const token = await AsyncStorage.getItem('token');
      setHasToken(!!token);
      setBaseUrl(api.baseURL || '');
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        userMe = raw ? JSON.parse(raw) : null;
        setCurrentUser(userMe);
      } catch {}
      // Pobierz pracownika z bazy i dopasuj do aktualnego użytkownika
      try {
        setEmpLoading(true);
        setEmpError('');
        await api.init();
        const list = await api.get('/api/employees');
        const items = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : (Array.isArray(list?.items) ? list.items : []));
        const uname = String(userMe?.username || userMe?.login || '').trim();
        const uemail = String(userMe?.email || '').trim().toLowerCase();
        const ufull = String(userMe?.full_name || '').trim().toLowerCase();
        const ubr = String(userMe?.brand_number || '').trim();
        const uid = userMe?.id; // ID z odpowiedzi /api/login — potencjalnie = employees.id
        const resolveEmployeeId = (u) => {
          try {
            const candidates = [
              u?.employee_id,
              u?.employeeId,
              u?.employee?.id,
              u?.user?.employee_id,
              u?.user?.employee?.id,
              u?.data?.employee_id,
              u?.payload?.employee_id,
              u?.profile?.employee_id,
            ];
            for (const c of candidates) { if (c !== undefined && c !== null && String(c).length > 0) return c; }
          } catch {}
          return null;
        };
        const eid = resolveEmployeeId(userMe); // nadrzędne dopasowanie po ID pracownika
        const found = (uid ? items.find(e => String(e?.id ?? e?.employee_id) === String(uid)) : null)
          || (eid ? items.find(e => String(e?.id ?? e?.employee_id) === String(eid)) : null)
          || items.find(e => String(e?.login || e?.username || '').trim() === uname)
          || items.find(e => String(e?.email || '').trim().toLowerCase() === uemail)
          || items.find(e => `${String(e?.first_name||'').trim()} ${String(e?.last_name||'').trim()}`.trim().toLowerCase() === ufull)
          || (ubr ? items.find(e => String(e?.brand_number || '').trim() === ubr) : null)
          || null;
        try {
          console.log('[UserSettings] login user id:', uid);
          console.log('[UserSettings] resolved employee_id from current_user:', eid);
          console.log('[UserSettings] employees count:', Array.isArray(items) ? items.length : 0);
          console.log('[UserSettings] matched employee id:', found?.id ?? found?.employee_id ?? null);
          if (found) {
            if (uid) {
              const eqUid = String(found?.id ?? found?.employee_id) === String(uid);
              console.log('[UserSettings] match by login user id:', eqUid);
            }
            if (eid) {
              const eqEid = String(found?.id ?? found?.employee_id) === String(eid);
              console.log('[UserSettings] match by employee_id:', eqEid);
            }
          }
        } catch {}
        if (found) {
          setEmployee(found);
          setEmpPhone(String(found?.phone || ''));
          setEmpEmail(String(found?.email || ''));
        } else {
          setEmployee(null);
          setEmpError('Nie znaleziono rekordu pracownika powiązanego z zalogowanym użytkownikiem.');
        }
      } catch (e) {
        setEmployee(null);
        setEmpError(e?.message || 'Błąd pobierania danych pracownika');
      } finally {
        setEmpLoading(false);
      }
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
      // Preferencje: push
      try {
        const p = await AsyncStorage.getItem('@pref_push_enabled_v1');
        setPushEnabled(p === '1');
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

  const setDarkMode = async (value) => {
    // toggleDark przełącza tryb — ignorujemy wartość i przełączamy
    try { await toggleDark(); } catch { toggleDark(); }
  };

  const setPushPref = async (value) => {
    try {
      if (value && !notifReady) {
        const { granted } = await initNotifications();
        if (!granted) {
          alert('Brak zgody na powiadomienia push. Zezwól, aby włączyć.');
          setPushEnabled(false);
          await AsyncStorage.setItem('@pref_push_enabled_v1', '0');
          return;
        }
        setNotifReady(true);
      }
      setPushEnabled(!!value);
      await AsyncStorage.setItem('@pref_push_enabled_v1', value ? '1' : '0');
    } catch {
      setPushEnabled(false);
      try { await AsyncStorage.setItem('@pref_push_enabled_v1', '0'); } catch {}
    }
  };

  // Walidacje i auto-zapis po opuszczeniu pola
  const isValidEmail = (val) => {
    const s = String(val || '').trim();
    // Prosta walidacja RFC-ish
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };
  const isValidPhone = (val) => {
    const digits = String(val || '').replace(/\D+/g, '');
    return digits.length >= 6 && digits.length <= 20;
  };

  const formatStatus = (s) => {
    const v = String(s || '').toLowerCase();
    if (v === 'active') return 'Aktywny';
    if (v === 'inactive') return 'Nieaktywny';
    if (v === 'suspended') return 'Zawieszony';
    return s ? String(s) : '-';
  };

  const handlePhoneBlur = async () => {
    if (!isValidPhone(empPhone)) {
      setEmpPhoneError('Nieprawidłowy numer telefonu');
      return;
    }
    setEmpPhoneError('');
    // Tylko zapis gdy wartość się zmieniła
    if (employee && String(employee.phone || '') !== String(empPhone || '') || employee && String(employee.email || '') !== String(empEmail || '')) {
      await savePersonalInfo();
    }
  };

  const handleEmailBlur = async () => {
    if (!isValidEmail(empEmail)) {
      setEmpEmailError('Nieprawidłowy adres e-mail');
      return;
    }
    setEmpEmailError('');
    if (employee && String(employee.phone || '') !== String(empPhone || '') || employee && String(employee.email || '') !== String(empEmail || '')) {
      await savePersonalInfo();
    }
  };

  const savePersonalInfo = async () => {
    if (!employee?.id) return;
    try {
      setEmpLoading(true);
      setEmpError('');
      await api.init();
      const payload = { phone: String(empPhone || ''), email: String(empEmail || '') };
      const updated = await api.put(`/api/employees/${employee.id}`, payload);
      const merged = { ...employee, ...payload, ...(typeof updated === 'object' ? updated : {}) };
      setEmployee(merged);
      showSnackbar('Zapisano zmiany w danych osobowych.', { type: 'success' });
    } catch (e) {
      setEmpError(e?.message || 'Nie udało się zapisać zmian');
      showSnackbar(e?.message || 'Nie udało się zapisać zmian', { type: 'error' });
    } finally {
      setEmpLoading(false);
    }
  };

  return (
    <ScrollView style={styles.wrapper} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={styles.headerRow}>
        <View style={styles.identityWrap}>
          <View style={styles.avatar}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{String((currentUser?.full_name || currentUser?.username || 'U').charAt(0)).toUpperCase()}</Text>
          </View>
          <View style={styles.identityTextWrap}>
            <Text numberOfLines={1} style={styles.identityName}>{currentUser?.full_name || currentUser?.username || 'Użytkownik'}</Text>
            <Text numberOfLines={1} style={styles.identityRole}>{currentUser?.role_name || currentUser?.role}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable accessibilityLabel="Otwórz powiadomienia" onPress={() => navigation.navigate('Powiadomienia')} style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.85 : 1 }] }>
            <Ionicons name="notifications" size={22} color={colors.text} />
          </Pressable>
          <Pressable accessibilityLabel="Wyloguj" onPress={logout} style={({ pressed }) => [styles.bellBtn, { opacity: pressed ? 0.85 : 1 }]}>
            <Ionicons name="log-out" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>
      
      <Button title="Sprawdź połączenie z API" color={colors.primary} onPress={testConnection} />

      {/* Informacje osobowe - login (employees) */}
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 16 }]}> 
        <Text style={styles.sectionTitle}>Informacje osobowe — {employee?.login || employee?.username || currentUser?.username || '—'}</Text>
        {empError ? <Text style={{ color: colors.muted, marginBottom: 8 }}>{empError}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Imię</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{String(employee?.first_name || '-')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Nazwisko</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{String(employee?.last_name || '-')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Telefon</Text>
            <TextInput keyboardType="phone-pad" value={employee?.id ? empPhone : '-'} onChangeText={setEmpPhone} onEndEditing={employee?.id ? handlePhoneBlur : undefined}
              editable={!!employee?.id} placeholder="Telefon" placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: employee?.id ? (empPhoneError ? '#ef4444' : colors.border) : colors.border, backgroundColor: employee?.id ? colors.card : colors.bg, color: colors.text, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }} />
            {empPhoneError ? <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{empPhoneError}</Text> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>E-mail</Text>
            <TextInput keyboardType="email-address" autoCapitalize="none" value={employee?.id ? empEmail : '-'} onChangeText={setEmpEmail} onEndEditing={employee?.id ? handleEmailBlur : undefined}
              editable={!!employee?.id} placeholder="E-mail" placeholderTextColor={colors.muted}
              style={{ borderWidth: 1, borderColor: employee?.id ? (empEmailError ? '#ef4444' : colors.border) : colors.border, backgroundColor: employee?.id ? colors.card : colors.bg, color: colors.text, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }} />
            {empEmailError ? <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{empEmailError}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Dział</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{String(employee?.department || employee?.department_name || '-')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Stanowisko</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{String(employee?.position || employee?.position_name || '-')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Status</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{formatStatus(employee?.status)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Przyjęty</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{employee?.created_at ? new Date(employee.created_at).toLocaleDateString() : '-'}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>Numer służbowy</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{String(employee?.brand_number || '-')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, marginBottom: 4 }}>UID karty RFID</Text>
            <Text style={{ color: colors.text, paddingHorizontal: 2, paddingVertical: 8 }}>{String(employee?.rfid_uid || '-')}</Text>
          </View>
        </View>
      </View>

      {/* Preferencje */}
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card, marginTop: 16 }]}> 
        <Text style={styles.sectionTitle}>Preferencje</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name={isDark ? "moon" : "sunny"} size={20} color={colors.text} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Tryb ciemny</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Przełącz motyw ciemny</Text>
            </View>
          </View>
          <Switch value={isDark} onValueChange={setDarkMode} thumbColor={isDark ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Powiadomienia</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Odbieraj powiadomienia push</Text>
            </View>
          </View>
          <Switch value={pushEnabled} onValueChange={setPushPref} thumbColor={pushEnabled ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
      </View>

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

      {/* Stopka */}
      <View style={{ alignItems: 'center', paddingVertical: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
          <Image source={require('../assets/favicon.png')} style={{ width: 24, height: 24, resizeMode: 'contain', marginRight: 8 }} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.muted }}>System Zarządzania Narzędziownią</Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.muted }}>ver. 1.5.0 © 2025 SZN - Wszelkie prawa zastrzeżone</Text>
      </View>
    </ScrollView>
  );
}
