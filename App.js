import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import api from './lib/api';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, Modal, Animated, Easing, Platform } from 'react-native';
import SettingsScreen from './screens/SettingsScreen';
import SecuritySettings from './screens/SecuritySettings';
import UsersSettings from './screens/UsersSettings';
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
import UserSettingsScreen from './screens/UserSettings';
import InventoryScreen from './screens/Inventory';
import { ThemeProvider, useTheme } from './lib/theme';
import { initializeAndRestore } from './lib/notifications';
import Constants from 'expo-constants';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { subscribe as subscribeSnackbar } from './lib/snackbar';
import { isAdmin } from './lib/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Tab = createBottomTabNavigator();
const SettingsStackNav = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const IssueStackNav = createNativeStackNavigator();

// Ekran skanowania QR/kodu kreskowego
import ScanScreen from './screens/ScanScreen';

function SettingsStack() {
  return (
    <SettingsStackNav.Navigator>
      <SettingsStackNav.Screen name="⚙️Ogólne" component={SettingsScreen} />
      <SettingsStackNav.Screen name="🔒Bezpieczeństwo" component={SecuritySettings} />
      <SettingsStackNav.Screen name="👥Użytkownicy" component={UsersSettings} />
      <SettingsStackNav.Screen name="🎛️Funkcje" component={FeaturesSettings} />
      <SettingsStackNav.Screen name="🏢Działy" component={DepartmentsScreen} />
      <SettingsStackNav.Screen name="👔Stanowiska" component={PositionsScreen} />
      <SettingsStackNav.Screen name="🏷️Kategorie" component={CategoriesScreen} />
      <SettingsStackNav.Screen name="💾Backup" component={BackupSettings} />
    </SettingsStackNav.Navigator>
  );
}

function IssueStack() {
  return (
    <IssueStackNav.Navigator screenOptions={{ headerShown: false }}>
      <IssueStackNav.Screen name="IssueScreen" component={IssueScreen} />
      <IssueStackNav.Screen name="ReturnScreen" component={ReturnScreen} />
    </IssueStackNav.Navigator>
  );
}

function CustomTabBar({ state, descriptors, navigation, onPressScan }) {
  const { colors, isDark } = useTheme();
  const activeColor = colors.primary;
  const inactiveColor = colors.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card }}>
      {/* Lewa strona: pierwsze cztery zakładki */}
      <View style={{ flexDirection: 'row', gap: 24 }}>
        {state.routes.slice(0, 4).map((route, index) => {
          const isFocused = state.index === index;
          const options = descriptors[route.key].options;
          const label = options.tabBarLabel !== undefined ? options.tabBarLabel : options.title !== undefined ? options.title : route.name;
          let iconName = 'ellipse-outline';
          switch (route.name) {
            case 'Dashboard': iconName = isFocused ? 'home' : 'home-outline'; break;
            case 'Narzędzia': iconName = isFocused ? 'construct' : 'construct-outline'; break;
            case 'BHP': iconName = isFocused ? 'medkit' : 'medkit-outline'; break;
            case 'Inwentaryzacja': iconName = isFocused ? 'list-circle' : 'list-circle-outline'; break;
            default: iconName = isFocused ? 'ellipse' : 'ellipse-outline';
          }
          return (
            <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} style={{ alignItems: 'center' }}>
              <Ionicons name={iconName} size={22} color={isFocused ? activeColor : inactiveColor} />
            </Pressable>
          );
        })}
      </View>

      {/* Środkowy przycisk skanowania */}
      <Pressable onPress={onPressScan} style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1, alignItems: 'center', justifyContent: 'center', ...(Platform.select({ web: { boxShadow: '0px 6px 18px rgba(0,0,0,0.18)' }, ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 }, android: { elevation: 6 } })) })}>
        <Ionicons name="scan" size={24} color="#fff" />
      </Pressable>

      {/* Prawa strona: cztery kolejne zakładki */}
      <View style={{ flexDirection: 'row', gap: 24 }}>
        {state.routes.slice(4, 8).map((route, indexOffset) => {
          const idx = indexOffset + 4;
          const isFocused = state.index === idx;
          const options = descriptors[route.key].options;
          let iconName = 'ellipse-outline';
          switch (route.name) {
            case 'Pracownicy': iconName = isFocused ? 'people' : 'people-outline'; break;
            case 'Ustawienia': iconName = isFocused ? 'settings' : 'settings-outline'; break;
            case 'Użytkownik': iconName = isFocused ? 'person-circle' : 'person-circle-outline'; break;
            default: iconName = isFocused ? 'ellipse' : 'ellipse-outline';
          }
          return (
            <Pressable key={route.key} onPress={() => navigation.navigate(route.name)} style={{ alignItems: 'center' }}>
              <Ionicons name={iconName} size={22} color={isFocused ? activeColor : inactiveColor} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MainTabs({ openActionSheet }) {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} onPressScan={openActionSheet} />}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Narzędzia" component={ToolsScreen} />
      <Tab.Screen name="BHP" component={BhpScreen} />
      <Tab.Screen name="Inwentaryzacja" component={InventoryScreen} />
      <Tab.Screen name="Pracownicy" component={EmployeesScreen} />
      <Tab.Screen name="Ustawienia" component={SettingsStack} options={{ headerShown: false }} />
      <Tab.Screen name="Użytkownik" component={UserSettingsScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { navTheme, isDark, colors } = useTheme();
  const [hasToken, setHasToken] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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
        setIsAdmin(isAdmin(me));
      } catch {
        setIsAdmin(false);
      }
    };
    loadMe();
  }, []);

  // Inicjalizacja mapy uprawnień z AsyncStorage (override z backendu)
  useEffect(() => {
    const initRolePerms = async () => {
      try {
        const raw = await AsyncStorage.getItem('@role_permissions_map_v1');
        const map = raw ? JSON.parse(raw) : null;
        if (map && typeof map === 'object') {
          try { const { setRolePermissionsOverride } = await import('./lib/constants'); setRolePermissionsOverride(map); } catch {}
        }
      } catch {}
    };
    initRolePerms();
  }, []);

  // Bootstrap token init + notifications with cleanup in effect
  useEffect(() => {
    let unsubscribe = () => {};
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
    };
    bootstrap();
    return () => { try { unsubscribe(); } catch {} };
  }, []);

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
            <RootStack.Screen name="MainTabs">{() => <MainTabs openActionSheet={openActionSheet} />}</RootStack.Screen>
            <RootStack.Screen name="Scanner" component={ScanScreen} />
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
              <Pressable onPress={() => { closeActionSheet(); try { /* Otwórz skaner z akcją wydaj */ navigationRef?.navigate?.('Scanner', { action: 'issue' }); } catch {} }} style={({ pressed }) => ({ backgroundColor: useTheme().colors.primary, opacity: pressed ? 0.9 : 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' })}>
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
      {/* Usunięto niegated baner */}
      <ApiStatusBanner status={apiStatus} isAdmin={isAdmin} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <AppContent />
        </SafeAreaView>
      </ThemeProvider>
    </SafeAreaProvider>
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
    <View style={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' }}>
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
