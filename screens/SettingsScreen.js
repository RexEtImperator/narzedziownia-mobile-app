import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, Switch, FlatList } from 'react-native';
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

  // Powiadomienia — stan i logika
  const [notifTab, setNotifTab] = useState('all'); // 'all' | 'selected'
  const [notifSender, setNotifSender] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifSending, setNotifSending] = useState(false);
  // All recipients toggles
  const [notifPushAllSelected, setNotifPushAllSelected] = useState(true);
  const [notifFanoutAllSelected, setNotifFanoutAllSelected] = useState(false);
  // Selected recipients toggles
  const [notifPushSelected, setNotifPushSelected] = useState(true);
  const [notifFanoutSelected, setNotifFanoutSelected] = useState(false);
  // Users selection
  const [notifUsers, setNotifUsers] = useState([]);
  const [notifUsersLoading, setNotifUsersLoading] = useState(false);
  const [notifSelectedIds, setNotifSelectedIds] = useState([]);
  // History — all
  const [notifHistoryAll, setNotifHistoryAll] = useState([]);
  const [notifAllQuery, setNotifAllQuery] = useState('');
  const [notifAllLimit, setNotifAllLimit] = useState(10);
  const [notifAllPage, setNotifAllPage] = useState(1);
  const [notifAllTotal, setNotifAllTotal] = useState(0);
  const [notifHistoryLoadingAll, setNotifHistoryLoadingAll] = useState(false);
  // History — selected
  const [notifHistorySelected, setNotifHistorySelected] = useState([]);
  const [notifSelQuery, setNotifSelQuery] = useState('');
  const [notifSelLimit, setNotifSelLimit] = useState(10);
  const [notifSelPage, setNotifSelPage] = useState(1);
  const [notifSelTotal, setNotifSelTotal] = useState(0);
  const [notifHistoryLoadingSelected, setNotifHistoryLoadingSelected] = useState(false);
  // Expand rows
  const [notifExpandedSel, setNotifExpandedSel] = useState([]);
  const [notifExpandedAll, setNotifExpandedAll] = useState([]);
  // Confirm broadcast modal
  const [showConfirmBroadcast, setShowConfirmBroadcast] = useState(false);

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

  const formatDateTime = (value) => {
    try {
      const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
      return d.toLocaleString(undefined, { hour12: false });
    } catch {
      return String(value ?? '—');
    }
  };

  const toggleSelectUser = (id) => {
    setNotifSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const loadNotifUsers = async () => {
    setNotifUsersLoading(true);
    try {
      // Spróbuj kilku możliwych endpointów
      let users = [];
      try {
        users = await api.get('/api/users');
      } catch {
        try {
          users = await api.get('/api/employees');
        } catch {}
      }
      users = Array.isArray(users) ? users : (Array.isArray(users?.data) ? users.data : []);
      const mapped = (users || []).map(u => ({
        id: u.id ?? u.user_id ?? u.userId ?? u.employee_id ?? u.employeeId,
        name: u.fullName ?? u.full_name ?? u.username ?? u.name ?? '—',
        status: (typeof u.status !== 'undefined'
          ? String(u.status).toLowerCase()
          : (typeof u.state !== 'undefined'
            ? String(u.state).toLowerCase()
            : (typeof u.active !== 'undefined'
              ? (u.active ? 'active' : 'inactive')
              : (typeof u.is_active !== 'undefined'
                ? (u.is_active ? 'active' : 'inactive')
                : null))))
      })).filter(u => u.id != null);
      setNotifUsers(mapped);
    } catch {
      setNotifUsers([]);
    } finally {
      setNotifUsersLoading(false);
    }
  };

  const loadNotifHistoryAll = async () => {
    setNotifHistoryLoadingAll(true);
    try {
      const params = `?type=broadcast&q=${encodeURIComponent(notifAllQuery)}&page=${notifAllPage}&limit=${notifAllLimit}`;
      const res = await api.get(`/api/notifications/history${params}`);
      const items = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
      const total = Number(res?.total ?? items.length ?? 0);
      setNotifHistoryAll(items || []);
      setNotifAllTotal(total);
    } catch {
      setNotifHistoryAll([]);
      setNotifAllTotal(0);
    } finally {
      setNotifHistoryLoadingAll(false);
    }
  };

  const loadNotifHistorySelected = async () => {
    setNotifHistoryLoadingSelected(true);
    try {
      const params = `?type=custom&q=${encodeURIComponent(notifSelQuery)}&page=${notifSelPage}&limit=${notifSelLimit}`;
      const res = await api.get(`/api/notifications/history${params}`);
      const items = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
      const total = Number(res?.total ?? items.length ?? 0);
      setNotifHistorySelected(items || []);
      setNotifSelTotal(total);
    } catch {
      setNotifHistorySelected([]);
      setNotifSelTotal(0);
    } finally {
      setNotifHistoryLoadingSelected(false);
    }
  };

  const reallySendAllNotifications = async () => {
    if (!canViewSettings) {
      showSnackbar('Brak uprawnień do wysyłania powiadomień', { type: 'error' });
      return;
    }
    try {
      setNotifSending(true);
      const payload = {
        sender: notifSender,
        message: notifMessage,
        push: !!notifPushAllSelected,
        fanout: !!notifFanoutAllSelected,
      };
      await api.post('/api/notifications/broadcast', payload);
      showSnackbar('Wysłano powiadomienia do wszystkich użytkowników.', { type: 'success' });
      loadNotifHistoryAll().catch(() => void 0);
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się wysłać powiadomień (wszyscy).', { type: 'error' });
    } finally {
      setNotifSending(false);
    }
  };

  const sendAllNotifications = async () => {
    setShowConfirmBroadcast(true);
  };

  const sendSelectedNotifications = async () => {
    if (!canViewSettings) {
      showSnackbar('Brak uprawnień do wysyłania powiadomień', { type: 'error' });
      return;
    }
    if (notifSelectedIds.length === 0) {
      showSnackbar('Wybierz co najmniej jednego użytkownika.', { type: 'warning' });
      return;
    }
    try {
      setNotifSending(true);
      const payload = {
        userIds: notifSelectedIds,
        sender: notifSender,
        message: notifMessage,
        push: !!notifPushSelected,
        fanout: !!notifFanoutSelected,
      };
      await api.post('/api/notifications/custom', payload);
      showSnackbar('Wysłano powiadomienia do wybranych użytkowników.', { type: 'success' });
      loadNotifHistorySelected().catch(() => void 0);
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się wysłać powiadomień (wybrani).', { type: 'error' });
    } finally {
      setNotifSending(false);
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

  // Powiadomienia — ładowanie danych zależnie od aktywnej zakładki
  useEffect(() => {
    if (!canViewSettings) return;
    if (notifTab === 'all') {
      loadNotifHistoryAll().catch(() => void 0);
    } else {
      if (notifUsers.length === 0 && !notifUsersLoading) {
        loadNotifUsers().catch(() => void 0);
      }
      loadNotifHistorySelected().catch(() => void 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifTab, canViewSettings]);

  useEffect(() => { if (notifTab === 'all' && canViewSettings) loadNotifHistoryAll().catch(() => void 0); }, [notifAllQuery, notifAllPage, notifAllLimit, notifTab, canViewSettings]);
  useEffect(() => { if (notifTab === 'selected' && canViewSettings) loadNotifHistorySelected().catch(() => void 0); }, [notifSelQuery, notifSelPage, notifSelLimit, notifTab, canViewSettings]);

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
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => scrollTo('powiadomienia')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🔔 Powiadomienia</Text>
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

      {/* Powiadomienia */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('powiadomienia')}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Powiadomienia</Text>
        {/* Zakładki */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {['all','selected'].map(key => (
            <Pressable
              key={key}
              onPress={() => setNotifTab(key)}
              style={[
                styles.optionChip,
                { backgroundColor: colors.card, borderColor: colors.border },
                notifTab === key && [{ borderColor: colors.primary }, { backgroundColor: isDark ? '#1f2937' : '#eef2ff' }],
              ]}
            >
              <Text style={[styles.optionChipText, { color: colors.text }, notifTab === key && [{ color: colors.primary, fontWeight: '600' }]]}>
                {key === 'all' ? 'Wszyscy' : 'Wybrani'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Formularz nadawcy i treści */}
        <View style={{ gap: 12 }}>
          <View>
            <Text style={[styles.label, { color: colors.muted }]}>Nadawca</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={notifSender}
              onChangeText={setNotifSender}
              placeholder="np. System"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View>
            <Text style={[styles.label, { color: colors.muted }]}>Wiadomość</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text, minHeight: 90, textAlignVertical: 'top' }]}
              value={notifMessage}
              onChangeText={setNotifMessage}
              placeholder="Treść powiadomienia"
              placeholderTextColor={colors.muted}
              multiline
            />
          </View>
          <View>
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, notifSending && styles.buttonDisabled, pressed && { opacity: 0.9 }]}
              onPress={notifTab === 'all' ? sendAllNotifications : sendSelectedNotifications}
              disabled={notifSending || (notifTab === 'selected' && notifSelectedIds.length === 0) || !canViewSettings}
            >
              <Text style={{ color: '#ffffff', fontWeight: '600' }}>{notifSending ? 'Wysyłanie…' : 'Wyślij powiadomienia'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Przełączniki trybu wysyłki */}
        {notifTab === 'all' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: colors.text }]}>Push</Text>
              <Switch value={!!notifPushAllSelected} onValueChange={setNotifPushAllSelected} />
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: colors.text }]}>Fanout</Text>
              <Switch value={!!notifFanoutAllSelected} onValueChange={setNotifFanoutAllSelected} />
            </View>
          </View>
        )}
        {notifTab === 'selected' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: colors.text }]}>Push</Text>
              <Switch value={!!notifPushSelected} onValueChange={setNotifPushSelected} />
            </View>
            <View style={styles.row}>
              <Text style={[styles.rowText, { color: colors.text }]}>Fanout</Text>
              <Switch value={!!notifFanoutSelected} onValueChange={setNotifFanoutSelected} />
            </View>
          </View>
        )}

        {/* Historia i lista użytkowników */}
        {notifTab === 'selected' && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>Lista użytkowników</Text>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
              {notifUsersLoading ? (
                <View style={{ padding: 12 }}><Text style={{ color: colors.muted }}>Ładowanie użytkowników…</Text></View>
              ) : (
              <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
                {(!notifUsers || notifUsers.length === 0) ? (
                  <View style={{ padding: 12 }}>
                    <Text style={{ color: colors.muted }}>Brak danych</Text>
                  </View>
                ) : (
                  notifUsers.map((item) => {
                    const selected = notifSelectedIds.includes(item.id);
                    const statusLabel = item.status === 'inactive' ? 'nieaktywny' : (item.status === 'active' ? 'aktywny' : undefined);
                    return (
                      <Pressable
                        key={String(item.id)}
                        onPress={() => toggleSelectUser(item.id)}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: selected ? (isDark ? '#1f2937' : '#eef2ff') : 'transparent' }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ color: colors.text }}>{item.name}</Text>
                          {statusLabel && (<Text style={{ color: colors.muted, marginLeft: 8 }}>({statusLabel})</Text>)}
                        </View>
                        {selected && (<Text style={{ color: colors.primary }}>✓</Text>)}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
              )}
            </View>
          </View>
        )}

        {/* Historia — Selected */}
        {notifTab === 'selected' && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Historia (wybrani)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={notifSelQuery}
                onChangeText={(v) => { setNotifSelQuery(v); setNotifSelPage(1); }}
                placeholder="Filtruj…"
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={[styles.input, { width: 80, borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={String(notifSelLimit)}
                onChangeText={(v) => { const n = parseInt(v || '10', 10); setNotifSelLimit(n > 0 ? n : 10); setNotifSelPage(1); }}
                keyboardType="numeric"
              />
            </View>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
              {notifHistoryLoadingSelected ? (
                <View style={{ padding: 12 }}><Text style={{ color: colors.muted }}>Ładowanie historii…</Text></View>
              ) : (notifHistorySelected || []).length === 0 ? (
                <View style={{ padding: 12 }}><Text style={{ color: colors.muted }}>Brak wpisów</Text></View>
              ) : (
                (notifHistorySelected || []).map((h, idx) => {
                  const at = h.created_at || h.sent_at || h.at || h.timestamp;
                  const sender = h.sender || h.from || '';
                  const message = h.message || h.text || '';
                  const recips = h.recipients || h.user_names || h.users || [];
                  const names = Array.isArray(recips) ? recips.map(r => (typeof r === 'string' ? r : (r.fullName || r.full_name || r.username || r.name || String(r)))) : [];
                  const hid = String(h.id ?? `sel-${idx}`);
                  const expanded = notifExpandedSel.includes(hid);
                  return (
                    <View key={`${hid}-sel`} style={{ paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>Wysłano: {formatDateTime(at)}</Text>
                          <Text style={{ color: colors.text }}>Nadawca: {sender || '—'}</Text>
                          <Text style={{ color: colors.text }}>Wiadomość: {message || '—'}</Text>
                        </View>
                        <Pressable onPress={() => setNotifExpandedSel(prev => expanded ? prev.filter(id => id !== hid) : [...prev, hid])}>
                          <Text style={{ color: colors.muted }}>{expanded ? 'Zwiń' : 'Rozwiń'}</Text>
                        </Pressable>
                      </View>
                      {expanded && (
                        <View style={{ marginTop: 6 }}>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>Odbiorcy:</Text>
                          <Text style={{ color: colors.text }}>{names.length ? names.join(', ') : '—'}</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Strona {notifSelPage} z {Math.max(1, Math.ceil((notifSelTotal || 0) / (notifSelLimit || 1)))} (łącznie: {notifSelTotal || 0})</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setNotifSelPage(p => Math.max(1, p - 1))} disabled={notifSelPage <= 1} style={[styles.button, { backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.text }}>Poprzednia</Text>
                </Pressable>
                <Pressable onPress={() => setNotifSelPage(p => p + 1)} disabled={Math.ceil((notifSelTotal || 0) / (notifSelLimit || 1)) <= notifSelPage} style={[styles.button, { backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.text }}>Następna</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Historia — All */}
        {notifTab === 'all' && (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Historia (wszyscy)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={notifAllQuery}
                onChangeText={(v) => { setNotifAllQuery(v); setNotifAllPage(1); }}
                placeholder="Filtruj…"
                placeholderTextColor={colors.muted}
              />
              <TextInput
                style={[styles.input, { width: 80, borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={String(notifAllLimit)}
                onChangeText={(v) => { const n = parseInt(v || '10', 10); setNotifAllLimit(n > 0 ? n : 10); setNotifAllPage(1); }}
                keyboardType="numeric"
              />
            </View>
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
              {notifHistoryLoadingAll ? (
                <View style={{ padding: 12 }}><Text style={{ color: colors.muted }}>Ładowanie historii…</Text></View>
              ) : (notifHistoryAll || []).length === 0 ? (
                <View style={{ padding: 12 }}><Text style={{ color: colors.muted }}>Brak wpisów</Text></View>
              ) : (
                (notifHistoryAll || []).map((h, idx) => {
                  const at = h.created_at || h.sent_at || h.at || h.timestamp;
                  const sender = h.sender || h.from || '';
                  const message = h.message || h.text || '';
                  const hid = String(h.id ?? `all-${idx}`);
                  const expanded = notifExpandedAll.includes(hid);
                  return (
                    <View key={`${hid}-all`} style={{ paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <View>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>Wysłano: {formatDateTime(at)}</Text>
                          <Text style={{ color: colors.text }}>Nadawca: {sender || '—'}</Text>
                          <Text style={{ color: colors.text }}>Wiadomość: {message || '—'}</Text>
                        </View>
                        <Pressable onPress={() => {
                          if (expanded) {
                            setNotifExpandedAll(prev => prev.filter(id => id !== hid));
                          } else {
                            if ((notifUsers || []).length === 0 && !notifUsersLoading) { loadNotifUsers().catch(() => void 0); }
                            setNotifExpandedAll(prev => [...prev, hid]);
                          }
                        }}>
                          <Text style={{ color: colors.muted }}>{expanded ? 'Zwiń' : 'Rozwiń'}</Text>
                        </Pressable>
                      </View>
                      {expanded && (
                        <View style={{ marginTop: 6 }}>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>Odbiorcy:</Text>
                          <Text style={{ color: colors.text }}>{(notifUsers || []).length ? (notifUsers || []).map(u => u.name).join(', ') : '—'}</Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Strona {notifAllPage} z {Math.max(1, Math.ceil((notifAllTotal || 0) / (notifAllLimit || 1)))} (łącznie: {notifAllTotal || 0})</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setNotifAllPage(p => Math.max(1, p - 1))} disabled={notifAllPage <= 1} style={[styles.button, { backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.text }}>Poprzednia</Text>
                </Pressable>
                <Pressable onPress={() => setNotifAllPage(p => p + 1)} disabled={Math.ceil((notifAllTotal || 0) / (notifAllLimit || 1)) <= notifAllPage} style={[styles.button, { backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.text }}>Następna</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Potwierdzenie wysyłki do wszystkich */}
        {showConfirmBroadcast && (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <View style={{ width: '100%', maxWidth: 480, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>Wyślij do wszystkich?</Text>
              </View>
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.muted, marginBottom: 16 }}>Ta akcja wyśle powiadomienie do wszystkich użytkowników.</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setShowConfirmBroadcast(false)} style={[styles.button, { flex: 1, backgroundColor: colors.card }]}>
                    <Text style={{ color: colors.text }}>Anuluj</Text>
                  </Pressable>
                  <Pressable onPress={async () => { setShowConfirmBroadcast(false); await reallySendAllNotifications(); }} style={[styles.button, { flex: 1, backgroundColor: '#ef4444' }]}>
                    <Text style={{ color: '#ffffff' }}>Wyślij</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        )}
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
