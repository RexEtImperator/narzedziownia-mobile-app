import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image, Platform } from 'react-native';
import api from '../lib/api';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const navigation = useNavigation();
  const { colors, isDark, toggleDark } = useTheme();
  const autoPromptedRef = useRef(false);

  const styles = StyleSheet.create({
    container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, position: 'relative' },
    title: { fontSize: 24, fontWeight: '600', marginBottom: 12, color: colors.text },
    input: { width: '90%', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, marginBottom: 12, color: colors.text, backgroundColor: colors.card },
    button: { alignSelf: 'stretch', width: '100%', backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
    buttonDisabled: { opacity: 0.6 },
    buttonPressed: { backgroundColor: '#4338ca' },
    buttonText: { color: '#fff', fontWeight: '600' },
    error: { color: colors.danger, marginBottom: 12, marginTop: 8 },
    logoWrapper: { alignItems: 'center', marginBottom: 16 },
    logoBox: { width: 448, height: 128, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    logoImage: { width: 129, height: 200 },
    description: { fontSize: 12, color: colors.muted },
    card: { width: '90%', maxWidth: 420, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16 },
    field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    fieldIcon: { marginRight: 8, fontSize: 16, color: colors.muted },
    inputWithIcon: { flex: 1, width: '100%', borderWidth: 0, marginBottom: 0, paddingVertical: 0, paddingHorizontal: 0 },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
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
        const savedUser = await SecureStore.getItemAsync('auth_username');
        const savedPass = await SecureStore.getItemAsync('auth_password');
        setBioReady(!!savedUser && !!savedPass);
      } catch {}
    };
    bootstrap();
  }, []);

  // Auto-prompt biometrii przy ponownym logowaniu
  useEffect(() => {
    const shouldPrompt = !autoPromptedRef.current && bioEnabled && bioAvailable && bioEnrolled && bioReady && !loading && !bioLoading && Platform.OS !== 'web';
    if (shouldPrompt) {
      autoPromptedRef.current = true;
      loginWithBiometrics();
    }
  }, [bioEnabled, bioAvailable, bioEnrolled, bioReady, loading, bioLoading]);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/login', { username, password });
      if (res && (res.token || res.accessToken)) {
        await api.setToken(res.token || res.accessToken);
        // Zapisz pełną odpowiedź użytkownika do AsyncStorage, aby App mógł określić rolę
        try {
          await AsyncStorage.setItem('@current_user', JSON.stringify(res));
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
        try {
          await AsyncStorage.setItem('@current_user', JSON.stringify(res));
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
          <Text style={styles.fieldIcon}>👤</Text>
          <TextInput
            style={[styles.input, styles.inputWithIcon]}
            placeholder="Nazwa użytkownika"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.field}>
          <Text style={styles.fieldIcon}>🔒</Text>
          <TextInput
            style={[styles.input, styles.inputWithIcon]}
            placeholder="Hasło"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => { if (!loading) handleLogin(); }}
          />
        </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={({ pressed }) => [
          styles.button,
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
            (bioLoading || loading) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={loginWithBiometrics}
          disabled={bioLoading || loading}
        >
          <Text style={styles.buttonText}>{bioLoading ? 'Sprawdzanie...' : 'Zaloguj odciskiem palca'}</Text>
        </Pressable>
      ) : null}
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