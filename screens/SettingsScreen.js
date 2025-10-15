import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
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

const BACKUP_FREQ_OPTIONS = [
  { label: 'Codziennie', value: 'daily' },
  { label: 'Tygodniowo', value: 'weekly' },
  { label: 'Miesięcznie', value: 'monthly' }
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);

  const [general, setGeneral] = useState({
    appName: 'System Zarządzania',
    companyName: 'Moja Firma',
    timezone: 'Europe/Warsaw',
    language: 'pl',
    dateFormat: 'DD/MM/YYYY'
  });

  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    auditLogRetention: 90,
    backupFrequency: 'daily'
  });

  const [features, setFeatures] = useState({
    enableAuditLog: true,
    enableReports: true,
    enableMobileApp: true,
    enableApiAccess: false,
    enableDataExport: true
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
          if (g?.backupFrequency) {
            setNotifications(prev => ({ ...prev, backupFrequency: g.backupFrequency }));
          }
        } catch (e) { /* brak endpointu lub błąd – użyj domyślnych */ }

        // Pobierz powiadomienia
        try {
          const n = await api.get('/api/config/notifications');
          setNotifications(prev => ({
            emailNotifications: n?.emailNotifications ?? prev.emailNotifications,
            smsNotifications: n?.smsNotifications ?? prev.smsNotifications,
            pushNotifications: n?.pushNotifications ?? prev.pushNotifications,
            auditLogRetention: n?.auditLogRetention ?? prev.auditLogRetention,
            backupFrequency: n?.backupFrequency ?? prev.backupFrequency,
          }));
        } catch (e) { /* pomiń */ }

        // Pobierz funkcje
        try {
          const f = await api.get('/api/config/features');
          setFeatures(prev => ({
            enableAuditLog: f?.enableAuditLog ?? prev.enableAuditLog,
            enableReports: f?.enableReports ?? prev.enableReports,
            enableMobileApp: f?.enableMobileApp ?? prev.enableMobileApp,
            enableApiAccess: f?.enableApiAccess ?? prev.enableApiAccess,
            enableDataExport: f?.enableDataExport ?? prev.enableDataExport,
          }));
        } catch (e) { /* pomiń */ }
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

  const saveNotifications = async () => {
    try {
      setSavingNotifications(true);
      await api.put('/api/config/notifications', notifications);
      Alert.alert('Zapisano', 'Ustawienia powiadomień zapisane.');
    } catch (e) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać ustawień powiadomień');
    } finally {
      setSavingNotifications(false);
    }
  };

  const saveFeatures = async () => {
    try {
      setSavingFeatures(true);
      await api.put('/api/config/features', features);
      Alert.alert('Zapisano', 'Ustawienia funkcji zapisane.');
    } catch (e) {
      Alert.alert('Błąd', e?.message || 'Nie udało się zapisać ustawień funkcji');
    } finally {
      setSavingFeatures(false);
    }
  };

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
          <Pressable style={styles.navItem} onPress={() => scrollTo('ogolne')}>
            <Text style={styles.navItemText}>Ogólne</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => scrollTo('powiadomienia')}>
            <Text style={styles.navItemText}>Powiadomienia</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => scrollTo('funkcje')}>
            <Text style={styles.navItemText}>Funkcje systemu</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('Działy')}>
            <Text style={styles.navItemText}>Działy</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('Stanowiska')}>
            <Text style={styles.navItemText}>Stanowiska</Text>
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

      {/* Powiadomienia */}
      <View style={styles.card} onLayout={registerSection('powiadomienia')}>
        <Text style={styles.sectionTitle}>Ustawienia powiadomień</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>Powiadomienia email</Text>
          <Switch
            value={notifications.emailNotifications}
            onValueChange={(v) => setNotifications({ ...notifications, emailNotifications: v })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>Powiadomienia SMS</Text>
          <Switch
            value={notifications.smsNotifications}
            onValueChange={(v) => setNotifications({ ...notifications, smsNotifications: v })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>Powiadomienia push</Text>
          <Switch
            value={notifications.pushNotifications}
            onValueChange={(v) => setNotifications({ ...notifications, pushNotifications: v })}
          />
        </View>

        <View className="flex-1 mb-3"> 
          <Text style={styles.label}>Częstotliwość backupu</Text>
          <View className="flex-row flex-wrap gap-2">
            {BACKUP_FREQ_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[
                  styles.optionChip,
                  notifications.backupFrequency === opt.value && styles.optionChipSelected,
                ]}
                onPress={() => setNotifications({ ...notifications, backupFrequency: opt.value })}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    notifications.backupFrequency === opt.value && styles.optionChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View className="flex-1 mb-3"> 
          <Text style={styles.label}>Retencja dziennika audytu (dni)</Text>
          <TextInput
            style={styles.input}
            value={String(notifications.auditLogRetention)}
            onChangeText={(v) => {
              const num = parseInt(v, 10);
              setNotifications({ ...notifications, auditLogRetention: isNaN(num) ? 0 : num });
            }}
            keyboardType="numeric"
            placeholderTextColor="#64748b"
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            savingNotifications && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={saveNotifications}
          disabled={savingNotifications}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>
            {savingNotifications ? 'Zapisywanie…' : 'Zapisz ustawienia powiadomień'}
          </Text>
        </Pressable>
      </View>

      {/* Funkcje */}
      <View style={styles.card} onLayout={registerSection('funkcje')}>
        <Text style={styles.sectionTitle}>Funkcje systemu</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>Dziennik audytu</Text>
          <Switch
            value={features.enableAuditLog}
            onValueChange={(v) => setFeatures({ ...features, enableAuditLog: v })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>Raporty</Text>
          <Switch
            value={features.enableReports}
            onValueChange={(v) => setFeatures({ ...features, enableReports: v })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>Aplikacja mobilna</Text>
          <Switch
            value={features.enableMobileApp}
            onValueChange={(v) => setFeatures({ ...features, enableMobileApp: v })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>Dostęp API</Text>
          <Switch
            value={features.enableApiAccess}
            onValueChange={(v) => setFeatures({ ...features, enableApiAccess: v })}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.rowText}>Eksport danych</Text>
          <Switch
            value={features.enableDataExport}
            onValueChange={(v) => setFeatures({ ...features, enableDataExport: v })}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            savingFeatures && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={saveFeatures}
          disabled={savingFeatures}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>
            {savingFeatures ? 'Zapisywanie…' : 'Zapisz ustawienia funkcji'}
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