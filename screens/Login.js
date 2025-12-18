import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image, Platform } from 'react-native';
import api from '../lib/api';
import { showSnackbar } from '../lib/snackbar';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { isAdmin } from '../lib/utils';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [explicitLoggedOut, setExplicitLoggedOut] = useState(false);
  const navigation = useNavigation();
  const { colors, isDark, toggleDark } = useTheme();
  const autoPromptedRef = useRef(false);

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, position: 'relative' },
    title: { fontSize: 24, fontWeight: '600', marginBottom: 12, color: colors.text },
    input: { width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, marginBottom: 12, color: colors.text, backgroundColor: colors.card },
    button: { alignSelf: 'stretch', width: '100%', backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
    buttonDisabled: { opacity: 0.6 },
    buttonPressed: { backgroundColor: '#4338ca' },
    buttonText: { color: '#fff', fontWeight: '600' },
    error: { color: colors.danger, marginBottom: 12, marginTop: 8 },
    logoWrapper: { alignItems: 'center', marginBottom: 16 },
    logoBox: { width: 448, height: 128, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    logoImage: { width: 129, height: 200 },
    description: { fontSize: 12, color: colors.muted },
    card: { width: '100%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, alignSelf: 'stretch' },
    field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, width: '100%' },
    fieldIcon: { marginRight: 8, fontSize: 20, color: colors.muted },
    inputWithIcon: { flex: 1, width: '100%', borderWidth: 0, marginBottom: 0, paddingVertical: 0, paddingHorizontal: 0 },
    divider: { marginVertical: 10 },
    darkToggle: { position: 'absolute', right: 16, bottom: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    darkToggleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    darkToggleOff: { backgroundColor: colors.card, borderColor: colors.border },
  });

  useEffect(() => {
    const bootstrap = async () => {
      await api.init();
      // Przekierowanie po tokenie obsługuje App.js; bez ręcznego navigate.
      // Przygotuj biometrię i sprawdź, czy mamy zapamiętane dane logowania
      try {
        if (Platform.OS !== 'web') {
          const hasHw = await LocalAuthentication.hasHardwareAsync();
          const enrolled = hasHw ? await LocalAuthentication.isEnrolledAsync() : false;
          setBioAvailable(!!hasHw);
          setBioEnrolled(!!enrolled);
        } else {
          setBioAvailable(false);
          setBioEnrolled(false);
        }
        const enabled = await AsyncStorage.getItem('@bio_enabled_v1');
        setBioEnabled(enabled === '1');
        const explicit = await AsyncStorage.getItem('@explicit_logout_v1');
        setExplicitLoggedOut(explicit === '1');
        const savedUser = await SecureStore.getItemAsync('auth_username');
        const savedPass = await SecureStore.getItemAsync('auth_password');
        setBioReady(!!savedUser && !!savedPass);
      } catch {}
    };
    bootstrap();
  }, []);

  // Auto-prompt biometrii przy ponownym logowaniu
  useEffect(() => {
    const shouldPrompt = !autoPromptedRef.current && !explicitLoggedOut && bioEnabled && bioAvailable && bioEnrolled && bioReady && !loading && !bioLoading && Platform.OS !== 'web';
    if (shouldPrompt) {
      autoPromptedRef.current = true;
      loginWithBiometrics();
    }
  }, [explicitLoggedOut, bioEnabled, bioAvailable, bioEnrolled, bioReady, loading, bioLoading]);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/login', { username, password });
      if (res && (res.token || res.accessToken)) {
        // Ustaw token tymczasowo, aby sprawdzić status pracownika
        await api.setToken(res.token || res.accessToken);
        // Usuń znacznik explicite wylogowania, aby zezwolić na auto-odświeżanie sesji
        try { await AsyncStorage.removeItem('@explicit_logout_v1'); } catch {}
        try {
          const list = await api.get('/api/employees');
          const items = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : (Array.isArray(list?.items) ? list.items : []));
          // Administrator NIE powinien być mapowany na employee_id (np. login id:1)
          const shouldMapEmployee = !isAdmin(res) && String(res?.id || '') !== '1';
          const found = shouldMapEmployee ? items.find(e => String(e?.id ?? e?.employee_id) === String(res?.id)) : null;
          if (found && String(found.status || '').toLowerCase() === 'suspended') {
            // Blokuj logowanie dla zawieszonego pracownika
            await api.setToken(null);
            showSnackbar('Twoje konto jest zawieszone. Skontaktuj się ze swoim pracodawcą.', { type: 'error' });
            return;
          }
        } catch {}
        // Zapisz pełną odpowiedź użytkownika do AsyncStorage, aby App mógł określić rolę
        try {
          const normalizedUser = (String(res?.id || '') === '1' || /admin|administrator/i.test(String(res?.role || res?.role_name || '')))
            ? { ...res, employee_id: 0, employeeId: 0 }
            : res;
          await AsyncStorage.setItem('@current_user', JSON.stringify(normalizedUser));
        } catch {}
        // Pobierz role-permissions z backendu i zapisz/ustaw override
        try {
          const map = await api.get('/api/role-permissions');
          if (map && typeof map === 'object') {
            try { await AsyncStorage.setItem('@role_permissions_map_v1', JSON.stringify(map)); } catch {}
            try { const { setRolePermissionsOverride } = await import('../lib/constants'); setRolePermissionsOverride(map); } catch {}
          }
        } catch {}
        // Po pierwszym zalogowaniu zapisz dane dla logowania biometrycznego (jeśli dostępne)
        try {
          if (Platform.OS !== 'web') {
            const hasHw = await LocalAuthentication.hasHardwareAsync();
            const enrolled = hasHw ? await LocalAuthentication.isEnrolledAsync() : false;
            if (hasHw && enrolled) {
              await SecureStore.setItemAsync('auth_username', String(username || ''));
              await SecureStore.setItemAsync('auth_password', String(password || ''));
              await AsyncStorage.setItem('@bio_enabled_v1', '1');
              setBioEnabled(true);
              setBioReady(true);
            }
          }
        } catch {}
        // App.js przełączy nawigację na zakładki po ustawieniu tokena.
      }
    } catch (e) {
      setError(e.message || 'Błąd logowania');
    } finally {
      setLoading(false);
    }
  };

  const loginWithBiometrics = async () => {
    setBioLoading(true);
    setError('');
    try {
      if (Platform.OS === 'web') {
        setError('Biometria nie jest dostępna w wersji web');
        return;
      }
      const supported = await LocalAuthentication.hasHardwareAsync();
      const enrolled = supported ? await LocalAuthentication.isEnrolledAsync() : false;
      if (!supported || !enrolled) {
        setError('Urządzenie nie wspiera biometrii lub brak zapisanych danych biometrycznych');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Potwierdź odciskiem palca',
        cancelLabel: 'Anuluj',
        disableDeviceFallback: false,
      });
      if (!result.success) {
        setError('Nie udało się potwierdzić biometrii');
        return;
      }
      const savedUser = await SecureStore.getItemAsync('auth_username');
      const savedPass = await SecureStore.getItemAsync('auth_password');
      if (!savedUser || !savedPass) {
        setError('Brak zapamiętanych danych logowania');
        return;
      }
      setLoading(true);
      const res = await api.post('/api/login', { username: savedUser, password: savedPass });
      if (res && (res.token || res.accessToken)) {
        // Zapisz token z odpowiedzi biometrycznej
        await api.setToken(res.token || res.accessToken);
        // Usuń znacznik explicite wylogowania, aby zezwolić na auto-odświeżanie sesji
        try { await AsyncStorage.removeItem('@explicit_logout_v1'); } catch {}
        // Sprawdź status pracownika
        try {
          const list = await api.get('/api/employees');
          const items = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : (Array.isArray(list?.items) ? list.items : []));
          // Administrator NIE powinien być mapowany na employee_id (np. login id:1)
          const shouldMapEmployee = !isAdmin(res) && String(res?.id || '') !== '1';
          const found = shouldMapEmployee ? items.find(e => String(e?.id ?? e?.employee_id) === String(res?.id)) : null;
          if (found && String(found.status || '').toLowerCase() === 'suspended') {
            await api.setToken(null);
            showSnackbar('Twoje konto jest zawieszone. Skontaktuj się ze swoim pracodawcą.', { type: 'error' });
            return;
          }
        } catch {}
        try {
          const normalizedUser = (String(res?.id || '') === '1' || /admin|administrator/i.test(String(res?.role || res?.role_name || '')))
            ? { ...res, employee_id: 0, employeeId: 0 }
            : res;
          await AsyncStorage.setItem('@current_user', JSON.stringify(normalizedUser));
        } catch {}
        // Pobierz role-permissions z backendu i zapisz/ustaw override
        try {
          const map = await api.get('/api/role-permissions');
          if (map && typeof map === 'object') {
            try { await AsyncStorage.setItem('@role_permissions_map_v1', JSON.stringify(map)); } catch {}
            try { const { setRolePermissionsOverride } = await import('../lib/constants'); setRolePermissionsOverride(map); } catch {}
          }
        } catch {}
      }
    } catch (e) {
      setError(e.message || 'Błąd logowania biometrycznego');
    } finally {
      setBioLoading(false);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <View style={styles.logoBox}>
          <Image source={require('../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <Text style={styles.description}>System Zarządzania Narzędziownią</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>Zaloguj się</Text>
        <View style={styles.field}>
          <Ionicons name="person-outline" size={20} color={colors.muted} style={styles.fieldIcon} />
          <TextInput
            style={[styles.input, styles.inputWithIcon]}
            placeholder="Nazwa użytkownika"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            // Wsparcie Android Autofill/Google: podpowiedzi i zapis do konta
            autoComplete="username"
            textContentType="username"
            importantForAutofill="yes"
            nativeID="login-username"
            value={username}
            onChangeText={setUsername}
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.field}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.muted} style={styles.fieldIcon} />
          <TextInput
            style={[styles.input, styles.inputWithIcon]}
            placeholder="Hasło"
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            // Wsparcie Android Autofill/Google: podpowiedzi i zapis do konta
            autoComplete="password"
            textContentType="password"
            importantForAutofill="yes"
            nativeID="login-password"
            keyboardType="default"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => { if (!loading) handleLogin(); }}
          />
          <Pressable accessibilityLabel={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'} onPress={() => setShowPassword((s) => !s)} style={({ pressed }) => ({ paddingHorizontal: 4, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={20} color={showPassword ? colors.text : colors.muted} />
          </Pressable>
        </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: '#4f46e5' },
          loading && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Logowanie...' : 'Zaloguj się'}</Text>
      </Pressable>

      {(bioEnabled && bioAvailable && bioEnrolled && bioReady) ? (
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: '#4f46e5' },
            (bioLoading || loading) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={loginWithBiometrics}
          disabled={bioLoading || loading}
        >
          <Text style={styles.buttonText}>{bioLoading ? 'Sprawdzanie...' : 'Zaloguj odciskiem palca'}</Text>
        </Pressable>
      ) : null}
      <Text style={{ marginTop: 20, color: colors.muted, fontSize: 10 }}>Server: {api.baseURL}</Text>
    </View>

      {/* Floating Dark Mode Toggle */}
      <Pressable
        onPress={toggleDark}
        style={[styles.darkToggle, isDark ? styles.darkToggleOn : styles.darkToggleOff]}
        accessibilityRole="button"
        accessibilityLabel={isDark ? 'Wyłącz tryb ciemny' : 'Włącz tryb ciemny'}
      >
        <Ionicons name={isDark ? 'moon' : 'sunny'} size={20} color={isDark ? '#fff' : colors.muted} />
      </Pressable>
    </View>
  );
}
