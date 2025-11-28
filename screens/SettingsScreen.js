import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar, subscribe } from '../lib/snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission } from '../lib/utils';
import { PERMISSIONS } from '../lib/constants';

const TZ_OPTIONS = [
  { label: 'Europa/Warszawa', value: 'Europe/Warsaw' },
  { label: 'Europa/Londyn', value: 'Europe/London' },
  { label: 'Ameryka/Nowy Jork', value: 'America/New_York' },
  { label: 'Azja/Tokio', value: 'Asia/Tokyo' }
];

const LANG_OPTIONS = [
  { label: 'Polski', value: 'pl' },
  { label: 'English', value: 'en' },
  { label: 'Deutsch', value: 'de' }
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { isDark, toggleDark, colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [general, setGeneral] = useState({
    appName: 'System Zarządzania',
    companyName: 'Moja Firma',
    timezone: 'Europe/Warsaw',
    language: 'pl',
    dateFormat: 'DD/MM/YYYY',
    toolsCodePrefix: '',
    bhpCodePrefix: ''
  });
  const [emailCfg, setEmailCfg] = useState({ host: '', port: 587, secure: false, user: '', pass: '', from: 'no-reply@example.com' });
  const [savingEmail, setSavingEmail] = useState(false);

  // Serwer — zdrowie i restart
  const [backendApiHealth, setBackendApiHealth] = useState(null);
  const [backendApiHealthLoading, setBackendApiHealthLoading] = useState(false);
  const [backendRestarting, setBackendRestarting] = useState(false);

  // Formatowanie uptime do dni:godzin:minut:sekund
  const formatUptime = (value) => {
    let seconds = 0;
    if (typeof value === 'number') {
      seconds = value > 1e12 ? Math.round(value / 1000) : Math.round(value);
    } else if (typeof value === 'string') {
      const n = parseFloat(value);
      seconds = isNaN(n) ? 0 : (n > 1e12 ? Math.round(n / 1000) : Math.round(n));
    }
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const pad = (x) => String(x).padStart(2, '0');
    return `${days}:${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  };

  // Permission-related state
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewSettings, setCanViewSettings] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

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
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        const user = raw ? JSON.parse(raw) : null;
        setCurrentUser(user);
        setCanViewSettings(hasPermission(user, PERMISSIONS.SYSTEM_SETTINGS));
      } catch {}
      setPermsReady(true);
    })();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      if (!canViewSettings) {
        return;
      }
      // Pobierz ustawienia ogólne
      try {
        const g = await api.get('/api/config/general');
        setGeneral(prev => ({
          appName: g?.appName ?? prev.appName,
          companyName: g?.companyName ?? prev.companyName,
          timezone: g?.timezone ?? prev.timezone,
          language: g?.language ?? prev.language,
          dateFormat: g?.dateFormat ?? prev.dateFormat,
          toolsCodePrefix: g?.toolsCodePrefix ?? prev.toolsCodePrefix,
          bhpCodePrefix: g?.bhpCodePrefix ?? prev.bhpCodePrefix,
          toolCategoryPrefixes: g?.toolCategoryPrefixes ?? prev.toolCategoryPrefixes,
        }));
      } catch (e) { /* brak endpointu lub błąd – użyj domyślnych */ }


      // Pobierz konfigurację e-mail (SMTP)
      try {
        const e = await api.get('/api/config/email');
        setEmailCfg(prev => ({
          host: e?.host ?? prev.host,
          port: Number(e?.port ?? prev.port),
          secure: !!(e?.secure ?? prev.secure),
          user: e?.user ?? prev.user,
          pass: e?.pass ?? prev.pass,
          from: e?.from ?? prev.from,
        }));
      } catch (e2) { /* opcjonalne */ }
  
      // Powiadomienia — sekcja nieużywana; Funkcje — obsługa w dedykowanym ekranie
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (!permsReady) return; load(); }, [permsReady, canViewSettings]);

  const saveGeneral = async () => {
    if (!canViewSettings) {
      showSnackbar('Brak uprawnień do zapisywania ustawień', { type: 'error' });
      return;
    }
    try {
      setSavingGeneral(true);
      await api.put('/api/config/general', general);
      showSnackbar('Ustawienia ogólne zapisane.', { type: 'success' });
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zapisać ustawień ogólnych', { type: 'error' });
    } finally {
      setSavingGeneral(false);
    }
  };

  const saveEmail = async () => {
    if (!canViewSettings) {
      showSnackbar('Brak uprawnień do zapisywania ustawień', { type: 'error' });
      return;
    }
    try {
      setSavingEmail(true);
      await api.put('/api/config/email', {
        host: emailCfg.host,
        port: emailCfg.port,
        secure: !!emailCfg.secure,
        user: emailCfg.user,
        pass: emailCfg.pass,
        from: emailCfg.from,
      });
      showSnackbar('Ustawienia e-mail zapisane.', { type: 'success' });
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zapisać ustawień e-mail', { type: 'error' });
    } finally {
      setSavingEmail(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Ładowanie ustawień…</Text>
      </View>
    );
  }

  if (permsReady && !canViewSettings) {
    return (
      <ScrollView ref={scrollRef} style={[styles.scrollContainer, { backgroundColor: colors.bg }]}>
        <View style={styles.pageWrapper}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }] }>
            <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 8 }}>⚠️ Brak uprawnień</Text>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>Brak uprawnień do przeglądania ustawień systemu.</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={[styles.scrollContainer, { backgroundColor: colors.bg }]}>
      <View style={styles.pageWrapper}>
      {/* Sekcje (lista nawigacyjna) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }] }>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sekcje</Text>
        <View>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => scrollTo('ogolne')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>⚙️ Ogólne</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🔒Bezpieczeństwo')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🔒 Bezpieczeństwo</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('👥Użytkownicy')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>👥 Użytkownicy</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🎭Role i uprawnienia')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🎭 Role i uprawnienia</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🎛️Funkcje')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🎛️ Funkcje</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🏢Działy')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🏢 Działy</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('👔Stanowiska')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>👔 Stanowiska</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🏷️Kategorie')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🏷️ Kategorie</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => scrollTo('email')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>✉️ E-mail</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🔖Prefiksy kodów')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🔖 Prefiksy kodów</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('💾Kopia zapasowa')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>💾 Kopia zapasowa</Text>
          </Pressable>
          {hasPermission(currentUser, PERMISSIONS.ADMIN) && (
            <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => scrollTo('server')}>
              <Text style={[styles.navItemText, { color: colors.text }]}>🖥️ Serwer</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Wygląd */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('wyglad')}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Wygląd</Text>
        <View style={styles.row}>
          <Text style={[styles.rowText, { color: colors.text }]}>Tryb ciemny</Text>
          <Switch value={isDark} onValueChange={toggleDark} />
        </View>
      </View>

      {/* Ogólne */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('ogolne')}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Ustawienia ogólne</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Nazwa aplikacji</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.appName}
              onChangeText={(v) => setGeneral({ ...general, appName: v })}
              placeholder="System Zarządzania"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Nazwa firmy</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.companyName}
              onChangeText={(v) => setGeneral({ ...general, companyName: v })}
              placeholder="Moja Firma"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Strefa czasowa</Text>
            <View className="flex-row flex-wrap gap-2">
              {TZ_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    general.timezone === opt.value && [{ borderColor: colors.primary }, { backgroundColor: isDark ? '#1f2937' : '#eef2ff' }],
                  ]}
                  onPress={() => setGeneral({ ...general, timezone: opt.value })}
                >
                 <Text
                   style={[
                     styles.optionChipText,
                     { color: colors.text },
                     general.timezone === opt.value && [{ color: colors.primary, fontWeight: '600' }],
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
            <Text style={[styles.label, { color: colors.muted }]}>Język</Text>
            <View className="flex-row flex-wrap gap-2">
              {LANG_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    general.language === opt.value && [{ borderColor: colors.primary }, { backgroundColor: isDark ? '#1f2937' : '#eef2ff' }],
                  ]}
                  onPress={() => setGeneral({ ...general, language: opt.value })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: colors.text },
                      general.language === opt.value && [{ color: colors.primary, fontWeight: '600' }],
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Format daty</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.dateFormat}
              onChangeText={(v) => setGeneral({ ...general, dateFormat: v })}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            savingGeneral && styles.buttonDisabled,
            pressed && { opacity: 0.9 },
          ]}
          onPress={saveGeneral}
          disabled={savingGeneral || !canViewSettings}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>
            {savingGeneral ? 'Zapisywanie…' : 'Zapisz ustawienia ogólne'}
          </Text>
        </Pressable>
      </View>

      {/* E-mail (SMTP) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('email')}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>E-mail (SMTP)</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 mb-3">
            <Text style={[styles.label, { color: colors.muted }]}>Host</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={emailCfg.host}
              onChangeText={(v) => setEmailCfg({ ...emailCfg, host: v })}
              placeholder="smtp.example.com"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View style={{ width: 120 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Port</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={String(emailCfg.port)}
              onChangeText={(v) => setEmailCfg({ ...emailCfg, port: parseInt(v || '0', 10) || 587 })}
              placeholder="587"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
            />
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: colors.text }]}>TLS/SSL</Text>
              <Switch value={!!emailCfg.secure} onValueChange={(v) => setEmailCfg({ ...emailCfg, secure: !!v })} />
            </View>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3">
            <Text style={[styles.label, { color: colors.muted }]}>Użytkownik</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={emailCfg.user}
              onChangeText={(v) => setEmailCfg({ ...emailCfg, user: v })}
              placeholder="login"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View className="flex-1 mb-3">
            <Text style={[styles.label, { color: colors.muted }]}>Hasło</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={emailCfg.pass}
              onChangeText={(v) => setEmailCfg({ ...emailCfg, pass: v })}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3">
            <Text style={[styles.label, { color: colors.muted }]}>Nadawca (From)</Text>
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={emailCfg.from}
              onChangeText={(v) => setEmailCfg({ ...emailCfg, from: v })}
              placeholder="no-reply@example.com"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, savingEmail && styles.buttonDisabled, pressed && { opacity: 0.9 }]}
          onPress={saveEmail}
          disabled={savingEmail || !canViewSettings}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>
            {savingEmail ? 'Zapisywanie…' : 'Zapisz ustawienia e-mail'}
          </Text>
        </Pressable>
      </View>

      {/* Serwer (tylko administrator) */}
      {hasPermission(currentUser, PERMISSIONS.ADMIN) && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('server')}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Serwer</Text>
          <Text style={{ color: colors.muted, marginBottom: 12 }}>Akcje administracyjne backendu: restart i health-check.</Text>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Pressable
              style={({ pressed }) => [styles.serverButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.95 }]}
              disabled={backendApiHealthLoading}
              onPress={async () => {
                try {
                  setBackendApiHealthLoading(true);
                  await api.init();
                  const resp = await api.get('/api/health');
                  const normalized = resp && typeof resp === 'object' ? resp : { status: 'unknown' };
                  setBackendApiHealth(normalized);
                  showSnackbar('Health-check backendu OK', { type: 'success' });
                } catch (e) {
                  showSnackbar(e?.message || 'Błąd health-check backendu', { type: 'error' });
                } finally {
                  setBackendApiHealthLoading(false);
                }
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '600', textAlign: 'center' }}>{backendApiHealthLoading ? 'Sprawdzanie…' : 'Sprawdź zdrowie backendu'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.serverButton, { backgroundColor: colors.danger }, pressed && { opacity: 0.95 }]}
              disabled={backendRestarting}
              onPress={() => {
                Alert.alert('Restart backendu', 'Czy na pewno zrestartować backend?', [
                  { text: 'Anuluj', style: 'cancel' },
                  { text: 'Restartuj', style: 'destructive', onPress: async () => {
                    try {
                      setBackendRestarting(true);
                      await api.init();
                      await api.post('/api/process/backend/restart', {});
                      showSnackbar('Restart backendu rozpoczęty', { type: 'success' });
                    } catch (e) {
                      showSnackbar(e?.message || 'Błąd restartu backendu', { type: 'error' });
                    } finally {
                      setBackendRestarting(false);
                    }
                  } }
                ]);
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '600', textAlign: 'center' }}>{backendRestarting ? 'Restartowanie…' : 'Restart backendu'}</Text>
            </Pressable>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>Ostatni health-check</Text>
            <Text style={{ color: colors.muted }}>Status: {backendApiHealth ? (backendApiHealth.status || '-') : '-'}</Text>
            <Text style={{ color: colors.muted }}>Uptime: {backendApiHealth && typeof backendApiHealth.uptime !== 'undefined' ? formatUptime(backendApiHealth.uptime) : '-'}</Text>
            <Text style={{ color: colors.muted }}>Znacznik czasu: {backendApiHealth && backendApiHealth.timestamp ? new Date(backendApiHealth.timestamp).toLocaleString('pl-PL') : '-'}</Text>
          </View>
        </View>
      )}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
scrollContainer:{backgroundColor:'#f8fafc',},pageWrapper:{padding:16,},
pageTitle:{fontSize:24,fontWeight:'700',color:'#0f172a',marginBottom:16,},
sectionTitle:{fontSize:18,fontWeight:'600',color:'#0f172a',marginBottom:12,},
card:{backgroundColor:'#ffffff',borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',padding:16,marginBottom:16,},
label:{fontSize:14,color:'#334155',marginBottom:6,},
row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12,},
rowText:{fontSize:16,color:'#0f172a',},
input:{borderWidth:1,borderColor:'#cbd5e1',backgroundColor:'#ffffff',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:16,color:'#0f172a',},
optionChip:{paddingVertical:8,paddingHorizontal:12,borderWidth:1,borderColor:'#cbd5e1',borderRadius:999,backgroundColor:'#ffffff',},
optionChipSelected:{backgroundColor:'#eef2ff',borderColor:'#6366f1',},
optionChipText:{color:'#0f172a',},
optionChipTextSelected:{color:'#3730a3',fontWeight:'600',},
button:{marginTop:8,backgroundColor:'#4f46e5',paddingVertical:12,borderRadius:10,alignItems:'center',justifyContent:'center'},
serverButton:{flex:1,minHeight:44,paddingVertical:12,borderRadius:10,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#e5e7eb'},
buttonDisabled:{opacity:.7,},
buttonPressed:{backgroundColor:'#4338ca',},
navItem:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#e5e7eb',},
navItemText:{fontSize:16,color:'#0f172a',},
loadingContainer:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f8fafc',},
loadingText:{marginTop:8,color:'#475569',}
});
// StyleSheet usunięty — ekrany korzystają z klas Nativewind/Tailwind
