import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image } from 'react-native';
import api from '../lib/api';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();
  const { colors, isDark, toggleDark } = useTheme();

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
    logoImage: { width: 200, height: 200 },
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
    };
    bootstrap();
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/login', { username, password });
      if (res && (res.token || res.accessToken)) {
        await api.setToken(res.token || res.accessToken);
        // App.js przełączy nawidgację na zakładki po ustawieniu tokena.
      }
    } catch (e) {
      setError(e.message || 'Błąd logowania');
    } finally {
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