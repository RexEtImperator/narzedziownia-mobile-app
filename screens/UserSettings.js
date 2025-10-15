import { useEffect, useState } from 'react';
import { View, Text, Button } from 'react-native';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, CommonActions } from '@react-navigation/native';

export default function UserSettingsScreen() {
  const [hasToken, setHasToken] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const navigation = useNavigation();

  useEffect(() => {
    const check = async () => {
      const token = await AsyncStorage.getItem('token');
      setHasToken(!!token);
      setBaseUrl(api.baseURL || '');
    };
    check();
  }, []);

  const logout = async () => {
    // Wyczyść token w kliencie API i w pamięci trwałej
    await api.setToken(null);
    await AsyncStorage.removeItem('token');
    setHasToken(false);
    // Przenieś użytkownika na ekran logowania, aby nie widział danych ze stanu
    try {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Logowanie' }],
        })
      );
    } catch {}
    alert('Wylogowano');
  };

  const testConnection = async () => {
    try {
      await api.init();
      const res = await api.get('/api/employees');
      if (Array.isArray(res)) {
        alert('Połączono z API (autoryzacja OK).');
      } else {
        alert('Połączono z API.');
      }
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        alert('Połączono z API, ale brak autoryzacji — zaloguj się.');
      } else {
        alert(`Brak połączenia z API: ${e.message || 'nieznany błąd'}`);
      }
    }
  };

  return (
    <View className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold mb-3">Ustawienia użytkownika</Text>
      <Text className="mb-3">{hasToken ? 'Zalogowano' : 'Niezalogowany'}</Text>
      {baseUrl ? <Text className="text-slate-600 mb-3">API: {baseUrl}</Text> : null}
      <Button title="Wyloguj" onPress={logout} />
      <View className="h-2" />
      <Button title="Sprawdź połączenie z API" onPress={testConnection} />
    </View>
  );
}

// StyleSheet usunięty — ekrany korzystają z klas Nativewind/Tailwind