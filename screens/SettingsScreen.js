import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';

const TZ_OPTIONS = [
  { label: 'Europa/Warszawa', value: 'Europe/Warsaw' },
  { label: 'Europa/Londyn', value: 'Europe/London' },
  { label: 'Ameryka/Nowy Jork', value: 'America/New_York' },
  { label: 'Azja/Tokio', value: 'Asia/Tokyo' }
];

const LANG_OPTIONS = [
  { label: 'Polski', value: 'pl' },
  { label: 'English', value: 'en' }
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [general, setGeneral] = useState({
    appName: 'System Zarządzania',
    companyName: 'Moja Firma',
    timezone: 'Europe/Warsaw',
    language: 'pl',
    dateFormat: 'DD/MM/YYYY'
  });

  // Sekcje i przewijanie do nich
  const scrollRef = useRef(null);
  const [sectionY, setSectionY] = useState({});
  const registerSection = (key) => (e) => {
    const y = e?.nativeEvent?.layout?.y ?? 0;
    setSectionY(prev => ({ ...prev, [key]: y }));
  };
  const scrollTo = (key) => {
    if (scrollRef.current && sectionY[key] != null) {
      scrollRef.current.scrollTo({ y: sectionY[key], animated: true });
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Pobierz ustawienia ogólne
        try {
          const g = await api.get('/api/config/general');
          setGeneral(prev => ({
            appName: g?.appName ?? prev.appName,
            companyName: g?.companyName ?? prev.companyName,
            timezone: g?.timezone ?? prev.timezone,
            language: g?.language ?? prev.language,
            dateFormat: g?.dateFormat ?? prev.dateFormat,
          }));
          // backupFrequency przeniesione do ekranu 💾 Backup
        } catch (e) { /* brak endpointu lub błąd – użyj domyślnych */ }

        // Powiadomienia — sekcja nieużywana; Funkcje — obsługa w dedykowanym ekranie
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveGeneral = async () => {
    try {
      setSavingGeneral(true);
      await api.put('/api/config/general', general);
      Alert.alert('Zapisano', 'Ustawienia ogólne zapisane.');
    } catch (e) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać ustawień ogólnych');
    } finally {
      setSavingGeneral(false);
    }
  };

  // Brak sekcji powiadomień; Funkcje przeniesione do osobnego ekranu

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Ładowanie ustawień…</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.scrollContainer}>
      <View style={styles.pageWrapper}>
      <Text style={styles.pageTitle}>Ustawienia</Text>

      {/* Sekcje (lista nawigacyjna) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sekcje</Text>
        <View>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('🔒Bezpieczeństwo')}>
            <Text style={styles.navItemText}>🔒 Bezpieczeństwo</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('👥Użytkownicy')}>
            <Text style={styles.navItemText}>👥 Użytkownicy</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('🎛️Funkcje')}>
            <Text style={styles.navItemText}>🎛️ Funkcje</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('🏢Działy')}>
            <Text style={styles.navItemText}>🏢 Działy</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('👔Stanowiska')}>
            <Text style={styles.navItemText}>👔 Stanowiska</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('🏷️Kategorie')}>
            <Text style={styles.navItemText}>🏷️ Kategorie</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('💾Backup')}>
            <Text style={styles.navItemText}>💾 Backup</Text>
          </Pressable>
        </View>
      </View>

      {/* Ogólne */}
      <View style={styles.card} onLayout={registerSection('ogolne')}>
        <Text style={styles.sectionTitle}>Ustawienia ogólne</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={styles.label}>Nazwa aplikacji</Text>
            <TextInput
              style={styles.input}
              value={general.appName}
              onChangeText={(v) => setGeneral({ ...general, appName: v })}
              placeholder="System Zarządzania"
              placeholderTextColor="#64748b"
            />
          </View>
          <View className="flex-1 mb-3"> 
            <Text style={styles.label}>Nazwa firmy</Text>
            <TextInput
              style={styles.input}
              value={general.companyName}
              onChangeText={(v) => setGeneral({ ...general, companyName: v })}
              placeholder="Moja Firma"
              placeholderTextColor="#64748b"
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={styles.label}>Strefa czasowa</Text>
            <View className="flex-row flex-wrap gap-2">
              {TZ_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    general.timezone === opt.value && styles.optionChipSelected,
                  ]}
                  onPress={() => setGeneral({ ...general, timezone: opt.value })}
                >
                 <Text
                   style={[
                     styles.optionChipText,
                     general.timezone === opt.value && styles.optionChipTextSelected,
                   ]}
                 >
                   {opt.label}
                 </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={styles.label}>Język</Text>
            <View className="flex-row flex-wrap gap-2">
              {LANG_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    general.language === opt.value && styles.optionChipSelected,
                  ]}
                  onPress={() => setGeneral({ ...general, language: opt.value })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      general.language === opt.value && styles.optionChipTextSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-1 mb-3"> 
            <Text style={styles.label}>Format daty</Text>
            <TextInput
              style={styles.input}
              value={general.dateFormat}
              onChangeText={(v) => setGeneral({ ...general, dateFormat: v })}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#64748b"
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            savingGeneral && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={saveGeneral}
          disabled={savingGeneral}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>
            {savingGeneral ? 'Zapisywanie…' : 'Zapisz ustawienia ogólne'}
          </Text>
        </Pressable>
      </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    backgroundColor: '#f8fafc',
  },
  pageWrapper: {
    padding: 16,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#334155',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rowText: {
    fontSize: 16,
    color: '#0f172a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  optionChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  optionChipSelected: {
    backgroundColor: '#eef2ff',
    borderColor: '#6366f1',
  },
  optionChipText: {
    color: '#0f172a',
  },
  optionChipTextSelected: {
    color: '#3730a3',
    fontWeight: '600',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonPressed: {
    backgroundColor: '#4338ca',
  },
  navItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  navItemText: {
    fontSize: 16,
    color: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 8,
    color: '#475569',
  },
});
// StyleSheet usunięty — ekrany korzystają z klas Nativewind/Tailwind