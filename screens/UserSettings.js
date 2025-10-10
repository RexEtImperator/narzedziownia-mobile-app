import { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import api from '../lib/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function UserSettingsScreen() {
  const [hasToken, setHasToken] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    const check = async () => {
      const token = await AsyncStorage.getItem('token');
      setHasToken(!!token);
      setBaseUrl(api.baseURL || '');
    };
    check();
  }, []);

  const logout = async () => {
    await AsyncStorage.removeItem('token');
    setHasToken(false);
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
    <View style={styles.wrapper}>
      <Text style={styles.title}>Ustawienia użytkownika</Text>
      <Text style={styles.status}>{hasToken ? 'Zalogowano' : 'Niezalogowany'}</Text>
      {baseUrl ? <Text style={styles.small}>API: {baseUrl}</Text> : null}
      <Button title="Wyloguj" onPress={logout} />
      <View style={{ height: 8 }} />
      <Button title="Sprawdź połączenie z API" onPress={testConnection} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  status: { marginBottom: 12 }
  ,small: { marginBottom: 12, color: '#666' }
});