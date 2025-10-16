import { StatusBar } from 'expo-status-bar';
// Stylowanie Nativewind/Tailwind v3 nie wymaga importu pliku CSS
import { StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import api from './lib/api';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import SettingsScreen from './screens/SettingsScreen';
import SecuritySettings from './screens/SecuritySettings';
import UsersSettings from './screens/UsersSettings';
import FeaturesSettings from './screens/FeaturesSettings';
import CategoriesScreen from './screens/CategoriesScreen';
import BackupSettings from './screens/BackupSettings';
import LoginScreen from './screens/Login';
import DashboardScreen from './screens/Dashboard';
import ToolsScreen from './screens/Tools';
import EmployeesScreen from './screens/Employees';
import DepartmentsScreen from './screens/Departments';
import PositionsScreen from './screens/Positions';
import IssueReturnScreen from './screens/IssueReturn';
import UserSettingsScreen from './screens/UserSettings';
import IssueScreen from './screens/IssueScreen';
import ReturnScreen from './screens/ReturnScreen';
import { ThemeProvider, useTheme } from './lib/theme';
import { initializeAndRestore } from './lib/notifications';

const Tab = createBottomTabNavigator();
const SettingsStackNav = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();
const IssueStackNav = createNativeStackNavigator();

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
      <IssueStackNav.Screen name="IssueReturn" component={IssueReturnScreen} />
      <IssueStackNav.Screen name="IssueScreen" component={IssueScreen} />
      <IssueStackNav.Screen name="ReturnScreen" component={ReturnScreen} />
    </IssueStackNav.Navigator>
  );
}

function MainTabs({ hasToken }) {
  return (
    <Tab.Navigator
      initialRouteName={hasToken ? 'Dashboard' : 'Logowanie'}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName = 'ellipse-outline';
          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Wydaj/Zwrot':
              iconName = focused ? 'swap-horizontal' : 'swap-horizontal';
              break;
            case 'Narzędzia':
              iconName = focused ? 'construct' : 'construct-outline';
              break;
            case 'Pracownicy':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Działy':
              iconName = focused ? 'layers' : 'layers-outline';
              break;
            case 'Stanowiska':
              iconName = focused ? 'briefcase' : 'briefcase-outline';
              break;
            case 'Ustawienia':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            case 'Użytkownik':
              iconName = focused ? 'person-circle' : 'person-circle-outline';
              break;
            case 'Logowanie':
              iconName = focused ? 'log-in' : 'log-in-outline';
              break;
            default:
              iconName = focused ? 'ellipse' : 'ellipse-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#8b8b8b',
      })}
    >
      {hasToken ? (
        <>
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Wydaj/Zwrot" component={IssueStack} options={{ headerShown: false }} />
          <Tab.Screen name="Narzędzia" component={ToolsScreen} />
          <Tab.Screen name="Pracownicy" component={EmployeesScreen} />
          <Tab.Screen name="Ustawienia" component={SettingsStack} options={{ headerShown: false }} />
          <Tab.Screen name="Użytkownik" component={UserSettingsScreen} />
        </>
      ) : (
        <Tab.Screen name="Logowanie" component={LoginScreen} />
      )}
    </Tab.Navigator>
  );
}

function AppContent() {
  const { navTheme, isDark } = useTheme();
  const [hasToken, setHasToken] = useState(false);

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

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="MainTabs">{() => <MainTabs hasToken={hasToken} />}</RootStack.Screen>
      </RootStack.Navigator>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  
});
