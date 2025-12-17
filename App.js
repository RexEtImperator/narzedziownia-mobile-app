import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import api from './lib/api';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, Modal, Animated, Easing, Platform, Linking } from 'react-native';  
import GestureHandlerRootView from './components/GestureRoot';
import SettingsScreen from './screens/SettingsScreen';
import SecuritySettings from './screens/SecuritySettings';
import UsersSettings from './screens/UsersSettings';
import RolesPermissions from './screens/RolesPermissions';
import FeaturesSettings from './screens/FeaturesSettings';
import CategoriesScreen from './screens/CategoriesScreen';
import BackupSettings from './screens/BackupSettings';
import LoginScreen from './screens/Login';
import DashboardScreen from './screens/Dashboard';
import ToolsScreen from './screens/Tools';
import BhpScreen from './screens/bhpscreen';
import EmployeesScreen from './screens/Employees';
import DepartmentsScreen from './screens/Departments';
import PositionsScreen from './screens/Positions';
import CodePrefixesScreen from './screens/CodePrefixesScreen';
import UserSettingsScreen from './screens/UserSettings';
import InventoryScreen from './screens/Inventory';
import AuditLogScreen from './screens/AuditLog';
import NotificationsScreen from './screens/NotificationsScreen';
import ChatScreen from './screens/ChatScreen';
import ChatDetailsScreen from './screens/ChatDetailsScreen';
import { ThemeProvider, useTheme } from './lib/theme';
import { setDynamicRolePermissions, PERMISSIONS } from './lib/constants';
import { isOnline, onConnectivityChange } from './lib/net';
import { initializeAndRestore, registerDevicePushToken } from './lib/notifications';
import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeviceEventEmitter } from 'react-native';
import { subscribe as subscribeSnackbar } from './lib/snackbar';
import { isAdmin, hasPermission, hasRole } from './lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ROLES } from './lib/constants';

const Tab = createBottomTabNavigator();
const SettingsStackNav = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
import ScanScreen from './screens/ScanScreen';

function SettingsStack() {
  return (
    <SettingsStackNav.Navigator>
      <SettingsStackNav.Screen name="⚙️Ustawienia" component={SettingsScreen} />
      <SettingsStackNav.Screen name="🔒Bezpieczeństwo" component={SecuritySettings} />
      <SettingsStackNav.Screen name="👥Użytkownicy" component={UsersSettings} />
      <SettingsStackNav.Screen name="🎭Role i uprawnienia" component={RolesPermissions} />
      <SettingsStackNav.Screen name="🎛️Funkcje" component={FeaturesSettings} />
      <SettingsStackNav.Screen name="🔖Prefiksy kodów" component={CodePrefixesScreen} />
      <RootStack.Screen name="🏢Działy" component={DepartmentsScreen} />
      <RootStack.Screen name="👔Stanowiska" component={PositionsScreen} />
      <RootStack.Screen name="🏷️Kategorie" component={CategoriesScreen} />
      <SettingsStackNav.Screen name="💾Kopia zapasowa" component={BackupSettings} />
      <RootStack.Screen name="📝Dziennik audytu" component={AuditLogScreen} />
    </SettingsStackNav.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation, onPressScan, isAdmin, unreadCount, chatUnreadCount }) {
  const { colors, isDark } = useTheme();
  const activeColor = '#fff';
  const bubbleBg = colors.primary;
  const inactiveColor = colors.muted;
  const [menuVisible, setMenuVisible] = useState(false);

  // Helper to render a tab button
  const renderTabButton = (routeName, iconName, label) => {
    const routeIndex = state.routes.findIndex(r => r.name === routeName);
    if (routeIndex === -1) return null;

    const isFocused = state.index === routeIndex;
    const bubbleStyle = isFocused ? { backgroundColor: bubbleBg } : { backgroundColor: 'transparent' };
    const iconColor = isFocused ? activeColor : inactiveColor;
    const finalIcon = isFocused ? iconName : (iconName + '-outline');

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: state.routes[routeIndex].key,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    };

    return (
      <Pressable 
        key={routeName} 
        onPress={onPress} 
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={[{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, bubbleStyle]}>
          <Ionicons name={finalIcon} size={25} color={iconColor} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
      {renderTabButton('Dashboard', 'home')}
      {renderTabButton('Narzędzia', 'construct')}
      {renderTabButton('BHP', 'medkit')}

      {/* Środkowy przycisk skanowania */}
      <Pressable onPress={onPressScan} style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1, alignItems: 'center', justifyContent: 'center', ...(Platform.select({ web: { boxShadow: '0px 6px 18px rgba(0,0,0,0.18)' }, ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 }, android: { elevation: 6 } })) })}>
        <Ionicons name="scan" size={30} color="#fff" />
      </Pressable>

      {renderTabButton('Pracownicy', 'people')}
      {renderTabButton('Użytkownik', 'person')}

      {isAdmin && (
        <View>
          <Pressable onPress={() => setMenuVisible(true)} style={{ alignItems: 'center', justifyContent: 'center' }}>
            <View style={[{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="settings-sharp" size={25} color={inactiveColor} />
            </View>
          </Pressable>
          <Modal
            visible={menuVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setMenuVisible(false)}
          >
            <Pressable 
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.1)' }} 
              onPress={() => setMenuVisible(false)}
            >
              <View style={{ 
                position: 'absolute', 
                bottom: 80, 
                right: 20, 
                backgroundColor: colors.card, 
                borderRadius: 12, 
                padding: 3,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 5,
                minWidth: 150,
                borderWidth: 1,
                borderColor: colors.border
              }}>
                {[
                  { name: 'Inwentaryzacja', icon: 'list-circle' },
                  { name: 'Powiadomienia', icon: 'notifications', badge: unreadCount },
                  { name: 'Czat', icon: 'chatbubbles', badge: chatUnreadCount },
                  { name: 'Ustawienia', icon: 'settings' }
                ].map((item) => (
                  <Pressable
                    key={item.name}
                    onPress={() => {
                      setMenuVisible(false);
                      navigation.navigate(item.name);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      backgroundColor: pressed ? colors.background : 'transparent',
                      borderRadius: 20,
                    })}
                  >
                    <View style={{ position: 'relative' }}>
                      <Ionicons name={item.icon} size={22} color={colors.text} style={{ marginRight: 12 }} />
                      {item.badge > 0 && (
                        <View style={{ position: 'absolute', right: 4, top: -4, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{item.badge > 99 ? '99+' : String(item.badge)}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.text, fontSize: 15 }}>{item.name}</Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>
        </View>
      )}
    </View>
  );
}

// Pasek zakładek dla ról: employee, hr, manager – prostszy układ 5 ikon
function CustomNavOthers({ state, navigation, unreadCount = 0, toolsIssuedCount = 0, bhpIssuedCount = 0, isEmployee = false }) {
  const { colors } = useTheme();
  const activeColor = '#fff';
  const bubbleBg = colors.primary;
  const inactiveColor = colors.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
      <View style={{ flexDirection: 'row', gap: 28, flex: 1, justifyContent: 'space-between' }}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          let iconName = 'ellipse-outline';
          switch (route.name) {
            case 'Dashboard': iconName = isFocused ? 'home' : 'home-outline'; break;
            case 'Narzędzia': iconName = isFocused ? 'hammer' : 'hammer-outline'; break;
            case 'BHP': iconName = isFocused ? 'medkit' : 'medkit-outline'; break;
            case 'Skanuj': iconName = 'scan'; break;
            case 'Powiadomienia': iconName = isFocused ? 'notifications' : 'notifications-outline'; break;
            case 'Pracownicy': iconName = isFocused ? 'people' : 'people-outline'; break;
            case 'Czat': iconName = isFocused ? 'chatbubbles' : 'chatbubbles-outline'; break;
            case 'Użytkownik': iconName = isFocused ? 'person' : 'person-outline'; break;
            default: iconName = isFocused ? 'ellipse' : 'ellipse-outline';
          }
          const bubbleStyle = isFocused ? { backgroundColor: bubbleBg } : { backgroundColor: colors.card };
          const iconColor = isFocused ? activeColor : inactiveColor;
          return (
            <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} style={{ alignItems: 'center' }}>
              <View style={{ position: 'relative' }}>
                <View style={[{ width: 30, height: 30, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, bubbleStyle]}>
                  <Ionicons name={iconName} size={25} color={iconColor} />
                </View>
                {route.name === 'Powiadomienia' && unreadCount > 0 ? (
                  <View style={{ position: 'absolute', right: -6, top: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                  </View>
                ) : null}
                {route.name === 'Narzędzia' && isEmployee && toolsIssuedCount > 0 ? (
                  <View style={{ position: 'absolute', right: -6, top: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{toolsIssuedCount > 99 ? '99+' : String(toolsIssuedCount)}</Text>
                  </View>
                ) : null}
                {route.name === 'BHP' && isEmployee && bhpIssuedCount > 0 ? (
                  <View style={{ position: 'absolute', right: -6, top: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{bhpIssuedCount > 99 ? '99+' : String(bhpIssuedCount)}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MainTabs({ openActionSheet, canSeeInventory, canSeeEmployees, isChatEnabled, isAdmin, unreadCount, chatUnreadCount }) {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} onPressScan={openActionSheet} isAdmin={isAdmin} unreadCount={unreadCount} chatUnreadCount={chatUnreadCount} />}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Narzędzia" component={ToolsScreen} />
      <Tab.Screen name="BHP" component={BhpScreen} />
      {canSeeInventory ? (
        <Tab.Screen name="Inwentaryzacja" component={InventoryScreen} />
      ) : null}
      {canSeeEmployees ? (
        <Tab.Screen name="Pracownicy" component={EmployeesScreen} />
      ) : null}
      <Tab.Screen name="Powiadomienia" component={NotificationsScreen} />
      {isChatEnabled ? (
        <Tab.Screen name="Czat" component={ChatScreen} />
      ) : null}
      <Tab.Screen name="Ustawienia" component={SettingsStack} options={{ headerShown: false }} />
      <Tab.Screen name="Użytkownik" component={UserSettingsScreen} />
    </Tab.Navigator>
  );
}

// Zakładki dla ról: employee, hr, manager – prosty układ 5 zakładek
function OtherTabs({ unreadCount = 0, toolsIssuedCount = 0, bhpIssuedCount = 0, isEmployee = false, isChatEnabled = false }) {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomNavOthers {...props} unreadCount={unreadCount} toolsIssuedCount={toolsIssuedCount} bhpIssuedCount={bhpIssuedCount} isEmployee={isEmployee} />}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Narzędzia" component={ToolsScreen} />
      <Tab.Screen name="BHP" component={BhpScreen} />
      <Tab.Screen name="Powiadomienia" component={NotificationsScreen} />
      {isChatEnabled ? (
        <Tab.Screen name="Czat" component={ChatScreen} />
      ) : null}
      <Tab.Screen name="Użytkownik" component={UserSettingsScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { navTheme, isDark, colors } = useTheme();
  const [hasToken, setHasToken] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [me, setMe] = useState(null);
  const [notifUnreadCount, setNotifUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [toolsIssuedCount, setToolsIssuedCount] = useState(0);
  const [bhpIssuedCount, setBhpIssuedCount] = useState(0);
  const [isChatEnabled, setIsChatEnabled] = useState(false);

  // Stubs to keep Modal code inert; action sheet removed
  const actionSheetVisible = false;
  const sheetAnim = new Animated.Value(0);
  const openActionSheet = () => {
    try { navigationRef?.navigate?.('Scanner'); } catch {}
  };
  const closeActionSheet = () => {};

  useEffect(() => {
    const loadMe = async () => {
      try { await api.init(); } catch {}
      try {
        const saved = await AsyncStorage.getItem('@current_user');
        const me = saved ? JSON.parse(saved) : null;
        setIsAdminUser(isAdmin(me));
        setMe(me);
      } catch {
        setIsAdminUser(false);
        setMe(null);
      }
    };
    loadMe();
  }, []);

  // Pobierz konfigurację aplikacji (czy czat jest włączony)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        await api.init();
        // Próba pobrania konfiguracji z endpointu /api/config/general
        // Spodziewana struktura: { features: { enableRealtimeChat: true/false } }
        // lub { enable_realtime_chat: 1 } lub podobne.
        const res = await api.get('/api/config/general');
        if (res) {
            let enabled = false;
            // Sprawdź różne możliwe klucze (backend zwraca enableRealtimeChat)
            if (res.enableRealtimeChat !== undefined) {
                enabled = !!res.enableRealtimeChat;
            } else if (res.features && res.features.enableRealtimeChat !== undefined) {
                enabled = !!res.features.enableRealtimeChat;
            } else if (res.enable_realtime_chat !== undefined) {
                // Fallback dla snake_case
                enabled = Number(res.enable_realtime_chat) === 1 || res.enable_realtime_chat === true;
            }
            setIsChatEnabled(enabled);
        }
      } catch (e) {
        // Jeśli błąd lub brak configu, domyślnie false
        console.log('Error fetching app config', e);
      }
    };
    fetchConfig();
  }, []);

  // Inicjalizacja mapy uprawnień z AsyncStorage (override z backendu)
  useEffect(() => {
    const initRolePerms = async () => {
      try {
        const raw = await AsyncStorage.getItem('@role_permissions_map_v1');
        const map = raw ? JSON.parse(raw) : null;
        if (map && typeof map === 'object') {
          try { setDynamicRolePermissions(map); } catch {}
        }
      } catch {}
    };
    initRolePerms();
  }, []);

  // Pobierz dynamiczne uprawnienia ról z backendu na starcie aplikacji
  useEffect(() => {
    const fetchRolePerms = async () => {
      try {
        await api.init();
        const perms = await api.get('/api/role-permissions');
        if (perms && typeof perms === 'object') {
          try { setDynamicRolePermissions(perms); } catch {}
          try { await AsyncStorage.setItem('@role_permissions_map_v1', JSON.stringify(perms)); } catch {}
        }
      } catch {}
    };
    fetchRolePerms();
  }, []);

  // Bootstrap token init + notifications with cleanup in effect
  useEffect(() => {
    let unsubscribe = () => {};
    let refreshListener = null;
    const bootstrap = async () => {
      await api.init();
      setHasToken(!!api.token);
      try {
        unsubscribe = api.onTokenChange((t) => setHasToken(!!t));
      } catch {}
      // Odtwórz harmonogram powiadomień z zapisanych ustawień
      try {
        await initializeAndRestore();
      } catch {}
      // Zarejestruj token push (Expo) i nasłuchuj sygnałów odświeżenia
      try {
        await registerDevicePushToken();
      } catch {}
      try {
        refreshListener = DeviceEventEmitter.addListener('notifications:refresh', async () => {
          // Po otrzymaniu pusha odśwież licznik nieprzeczytanych
          try {
            await api.init();
            const list = await api.get('/api/notifications');
            const cnt = Array.isArray(list) ? list.filter((n) => !n?.read).length : 0;
            setNotifUnreadCount(cnt);
          } catch {
            // ignoruj błędy
          }
        });
      } catch {}
    };
    bootstrap();
    return () => { try { unsubscribe(); } catch {}; try { refreshListener && refreshListener.remove && refreshListener.remove(); } catch {} };
  }, []);

  // Globalny listener: nawigacja po kliknięciu powiadomienia push (data.url)
  useEffect(() => {
    const norm = (s) => {
      try { return String(s || '').trim(); } catch { return ''; }
    };
    const parseQuery = (u) => {
      const out = {};
      try {
        const qIndex = u.indexOf('?');
        if (qIndex >= 0) {
          const qs = u.slice(qIndex + 1);
          for (const part of qs.split('&')) {
            const [k, v] = part.split('=');
            if (!k) continue;
            out[decodeURIComponent(k)] = decodeURIComponent(v || '');
          }
        }
      } catch {}
      return out;
    };
    const onNav = async ({ url, data }) => {
      try {
        const u = norm(url);
        const lower = u.toLowerCase();
        const isExternal = lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:');
        // Schematy wewnętrzne app://bhp?..., app://narzedzia?...
        if (lower.startsWith('app://')) {
          try {
            const parsed = new URL(u);
            const host = String(parsed.hostname || '').toLowerCase();
            const q = Object.fromEntries(parsed.searchParams.entries());
            const filterCandidates = [q.filter, q.q, q.inventory_number, q.inv, q.model, data?.filter, data?.q, data?.inventory_number, data?.model].filter(Boolean);
            const filter = filterCandidates.length ? String(filterCandidates[0]) : '';
            if (host.includes('bhp')) {
              navigationRef?.navigate?.('BHP', filter ? { filter } : undefined);
              return;
            }
            if (host.includes('narzedzia') || host.includes('narzędzia') || host.includes('tools')) {
              navigationRef?.navigate?.('Narzędzia', filter ? { filter } : undefined);
              return;
            }
          } catch {}
        }
        if (isExternal) {
          try { await Linking.openURL(u); } catch {}
          return;
        }
        // Względne ścieżki: narzędzia/BHP, z filtrem z query lub z danych push
        const q = parseQuery(u);
        const filterCandidates = [q.filter, q.q, q.inventory_number, q.inv, q.model, data?.filter, data?.q, data?.inventory_number, data?.model].filter(Boolean);
        const filter = filterCandidates.length ? String(filterCandidates[0]) : '';
        const path = lower.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '');
        const looksBhp = path.includes('bhp');
        const looksTools = path.includes('narz') || path.includes('tool');
        if (looksBhp) {
          navigationRef?.navigate?.('BHP', filter ? { filter } : undefined);
        } else if (looksTools) {
          navigationRef?.navigate?.('Narzędzia', filter ? { filter } : undefined);
        } else {
          // Domyślne: jeśli mamy filter, spróbuj Narzędzia, w przeciwnym razie otwórz powiadomienia
          if (filter) {
            navigationRef?.navigate?.('Narzędzia', { filter });
          } else {
            navigationRef?.navigate?.('Powiadomienia');
          }
        }
      } catch {}
    };
    const sub = DeviceEventEmitter.addListener('push:navigate', onNav);
    return () => { try { sub.remove(); } catch {} };
  }, []);

  // Liczba nieprzeczytanych powiadomień i wiadomości czatu – odświeżanie w tle
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const loadUnread = async () => {
      try {
        await api.init();
        
        // Powiadomienia
        try {
          const list = await api.get('/api/notifications');
          const cnt = Array.isArray(list) ? list.filter((n) => !n?.read).length : 0;
          if (!cancelled) setNotifUnreadCount(cnt);
        } catch {}

        // Czat (jeśli włączony)
        if (isChatEnabled) {
          try {
            const chats = await api.get('/api/chat/conversations');
            const chatList = Array.isArray(chats) ? chats : [];
            const chatCnt = chatList.reduce((sum, c) => sum + (Number(c.unread_count) || 0), 0);
            if (!cancelled) setChatUnreadCount(chatCnt);
          } catch {}
        }
      } catch {
        if (!cancelled) {
          setNotifUnreadCount(0);
          setChatUnreadCount(0);
        }
      }
    };
    loadUnread();
    timer = setInterval(loadUnread, 30000);
    return () => { cancelled = true; try { clearInterval(timer); } catch {} };
  }, [isChatEnabled]);

  // Liczba wydanych narzędzi/BHP dla zalogowanego pracownika – odświeżanie w tle (bazuje na /api/*-issues)
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const loadCounts = async () => {
      try { await api.init(); } catch {}
      const isEmp = hasRole(me, ROLES.EMPLOYEE) || String(me?.role_name || '').toLowerCase() === 'pracownik' || String(me?.role || '').toLowerCase() === 'employee';
      if (!isEmp) { if (!cancelled) { setToolsIssuedCount(0); setBhpIssuedCount(0); } return; }
      try {
        const [toolIssuesResp, bhpIssuesResp] = await Promise.all([
          api.get('/api/tool-issues?status=wydane&limit=1000'),
          api.get('/api/bhp-issues?status=wydane&limit=1000'),
        ]);
        const toArray = (resp) => {
          if (Array.isArray(resp)) return resp;
          if (Array.isArray(resp?.data)) return resp.data;
          return [];
        };
        const toolIssues = toArray(toolIssuesResp);
        const bhpIssues = toArray(bhpIssuesResp);
        const toolCount = toolIssues.reduce((sum, it) => {
          const q = typeof it?.quantity === 'number' ? it.quantity : 1;
          const st = String(it?.status || '').toLowerCase();
          return st.includes('wyd') ? sum + q : sum;
        }, 0);
        const bhpCount = bhpIssues.reduce((sum, it) => {
          const q = typeof it?.quantity === 'number' ? it.quantity : 1;
          const st = String(it?.status || '').toLowerCase();
          return st.includes('wyd') ? sum + q : sum;
        }, 0);
        if (!cancelled) { setToolsIssuedCount(toolCount); setBhpIssuedCount(bhpCount); }
      } catch {
        if (!cancelled) { setToolsIssuedCount(0); setBhpIssuedCount(0); }
      }
    };
    loadCounts();
    timer = setInterval(loadCounts, 30000);
    return () => { cancelled = true; try { clearInterval(timer); } catch {} };
  }, [me]);

  // Android: ukryj pasek systemowy i pozwól przywracać gestem (sticky immersive)
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let navModule = null;
    const applyImmersive = async () => {
      const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
      const isNewArch = !!(Constants?.expoConfig?.newArchEnabled);
      const preferExpoNav = isExpoGo || isNewArch;
      // Preferuj expo-navigation-bar w Expo Go i przy New Architecture
      if (preferExpoNav) {
        try {
          const expoNav = await import('expo-navigation-bar');
          const edgeToEdge = !!(Constants?.expoConfig?.android?.edgeToEdgeEnabled);
          if (!edgeToEdge) {
            try { await expoNav?.setBackgroundColorAsync?.(colors.card); } catch {}
            if (expoNav?.setBehaviorAsync) {
              try { await expoNav.setBehaviorAsync('overlay-swipe'); } catch {}
            }
          }
          try { await expoNav?.setButtonStyleAsync?.(isDark ? 'light' : 'dark'); } catch {}
          try { await expoNav?.setVisibilityAsync?.('hidden'); } catch {}
          return;
        } catch {}
      }
      // W pozostałych przypadkach spróbuj natywny moduł, w razie błędu spadnij do expo-navigation-bar
      try {
        const mod = await import('react-native-system-navigation-bar');
        navModule = mod?.default || mod;
        if (navModule?.stickyImmersive) {
          await navModule.stickyImmersive(true);
        } else if (navModule?.immersive) {
          await navModule.immersive(true);
        }
        if (navModule?.setNavigationColor) {
          try { await navModule.setNavigationColor(colors.card, isDark ? 'light' : 'dark', 'navigation'); } catch {}
        }
      } catch (e) {
        try {
          const expoNav = await import('expo-navigation-bar');
          const edgeToEdge = !!(Constants?.expoConfig?.android?.edgeToEdgeEnabled);
          if (!edgeToEdge) {
            try { await expoNav?.setBackgroundColorAsync?.(colors.card); } catch {}
            if (expoNav?.setBehaviorAsync) {
              try { await expoNav.setBehaviorAsync('overlay-swipe'); } catch {}
            }
          }
          try { await expoNav?.setButtonStyleAsync?.(isDark ? 'light' : 'dark'); } catch {}
          try { await expoNav?.setVisibilityAsync?.('hidden'); } catch {}
        } catch {}
      }
    };
    applyImmersive();
    return () => {
      (async () => {
        try {
          if (navModule?.navigationShow) { await navModule.navigationShow(); return; }
          const expoNav = await import('expo-navigation-bar');
          await expoNav?.setVisibilityAsync?.('visible');
        } catch {}
      })();
    };
  }, [isDark, colors.card]);

  // API health check + baner
  const [apiStatus, setApiStatus] = useState({ ok: true, auth: true, message: '' });
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api.init();
        try {
          await api.get('/api/health');
          if (!cancelled) setApiStatus({ ok: true, auth: true, message: '' });
        } catch (e1) {
          try {
            await api.get('/api/employees');
            if (!cancelled) setApiStatus({ ok: true, auth: true, message: '' });
          } catch (e2) {
            if (!cancelled) {
              if (e2.status === 401 || e2.status === 403) {
                setApiStatus({ ok: true, auth: false, message: 'Połączono z API, zaloguj się.' });
              } else {
                setApiStatus({ ok: false, auth: false, message: 'Brak połączenia z API: sprawdź IP i port' });
              }
            }
          }
        }
      } catch {
        if (!cancelled) setApiStatus({ ok: false, auth: false, message: 'Brak połączenia z API: sprawdź IP i port' });
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {hasToken ? (
          <>
            <RootStack.Screen name="MainTabs">{() => (
              (isAdmin(me) || hasRole(me, ROLES.TOOLSMASTER)) ? (
                <MainTabs
                  openActionSheet={openActionSheet}
                  canSeeInventory={hasPermission(me, PERMISSIONS.VIEW_INVENTORY)}
                  canSeeEmployees={hasPermission(me, PERMISSIONS.VIEW_EMPLOYEES)}
                  isChatEnabled={isChatEnabled}
                  isAdmin={isAdminUser}
                  unreadCount={notifUnreadCount}
                  chatUnreadCount={chatUnreadCount}
                />
              ) : (
                <OtherTabs 
                  unreadCount={notifUnreadCount} 
                  toolsIssuedCount={toolsIssuedCount} 
                  bhpIssuedCount={bhpIssuedCount} 
                  isEmployee={hasRole(me, ROLES.EMPLOYEE) || String(me?.role_name || '').toLowerCase() === 'pracownik' || String(me?.role || '').toLowerCase() === 'employee'}
                  isChatEnabled={isChatEnabled}
                />
              )
            )}</RootStack.Screen>
            <RootStack.Screen name="Scanner" component={ScanScreen} />
            <RootStack.Screen name="Powiadomienia" component={NotificationsScreen} />
            <RootStack.Screen name="ChatDetails" component={ChatDetailsScreen} />
          </>
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Dolny panel akcji */}
      <Modal visible={actionSheetVisible} transparent animationType="none" onRequestClose={closeActionSheet}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={closeActionSheet}>
          <Animated.View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: useTheme().colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0,1], outputRange: [320,0] }) }] }}>
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: useTheme().colors.border }} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 4, color: useTheme().colors.text }}>Wybierz akcję</Text>
            <Text style={{ color: useTheme().colors.muted, marginBottom: 12 }}>Co chcesz zrobić po zeskanowaniu narzędzia?</Text>
            <View style={{ gap: 12 }}>
              <Pressable onPress={() => { closeActionSheet(); try { navigationRef?.navigate?.('Scanner', { action: 'issue' }); } catch {} }} style={({ pressed }) => ({ backgroundColor: useTheme().colors.primary, opacity: pressed ? 0.9 : 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' })}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Wydaj →</Text>
              </Pressable>
              <Pressable onPress={() => { closeActionSheet(); try { navigationRef?.navigate?.('Scanner', { action: 'return' }); } catch {} }} style={({ pressed }) => ({ backgroundColor: useTheme().colors.primary, opacity: pressed ? 0.9 : 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' })}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Przyjmij →</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
      <SnackbarHost />
      <OfflineBanner />
      <ApiStatusBanner status={apiStatus} isAdmin={isAdminUser} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <AppContent />
          </SafeAreaView>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  
});

// Ref do nawigacji, aby wywołać przejścia z panelu
export const navigationRef = createNavigationContainerRef();

function SnackbarHost() {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('success');
  const [duration, setDuration] = useState(2500);
  const animRef = useState(() => new Animated.Value(0))[0];
  const insets = useSafeAreaInsets();
  const tabBarReserve = 90; // Przybliżona wysokość dolnego paska zakładek
  const bottomOffset = Math.max(24, (insets?.bottom || 0) + tabBarReserve);

  useEffect(() => {
    const unsub = subscribeSnackbar(({ message, type: t, duration: d }) => {
      setMsg(message);
      setType(t || 'success');
      setDuration(Math.max(1000, d || 2500));
      setVisible(true);
      Animated.timing(animRef, { toValue: 1, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.ease) }).start();
      setTimeout(() => {
        Animated.timing(animRef, { toValue: 0, duration: 160, useNativeDriver: true, easing: Easing.in(Easing.ease) }).start(({ finished }) => {
          if (finished) setVisible(false);
        });
      }, Math.max(1000, d || 2500));
    });
    return () => { try { unsub(); } catch {} };
  }, [animRef]);

  if (!visible) return null;
  const bg = type === 'error' ? '#ef4444' : type === 'warn' ? '#f59e0b' : colors.primary;
  return (
    <View style={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, bottom: bottomOffset, alignItems: 'center' }}>
      <Animated.View style={{
        transform: [{ translateY: animRef.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        opacity: animRef,
        backgroundColor: bg,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        maxWidth: '90%'
      }}>
        <Text style={{ color: '#fff' }}>{msg}</Text>
      </Animated.View>
    </View>
  );
}

function ApiStatusBanner({ status, isAdmin }) {
  const { colors } = useTheme();
  if (!isAdmin || status?.ok) return null;
  return (
    <View style={{ position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, zIndex: 9999 }}>
      <Text style={{ color: '#991b1b', textAlign: 'center' }}>{status?.message || 'Brak połączenia z API'}</Text>
    </View>
  );
}

function OfflineBanner() {
  const { colors } = useTheme();
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    const off = onConnectivityChange((state) => setOnline(!!state));
    return () => { try { off(); } catch {} };
  }, []);

  if (online) return null;
  return (
    <View style={{ position: 'absolute', top: 40, left: 8, right: 8, backgroundColor: '#fff7ed', borderColor: '#f59e0b', borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, zIndex: 10000 }}>
      <Text style={{ color: '#92400e', textAlign: 'center' }}>Offline: próba wznowienia połączenia…</Text>
    </View>
  );
}
