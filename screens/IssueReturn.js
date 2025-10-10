import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList, Modal, Platform } from 'react-native';
import api from '../lib/api';

export default function IssueReturnScreen() {
  const [code, setCode] = useState('');
  const [foundTool, setFoundTool] = useState(null);
  const [details, setDetails] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [issueId, setIssueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [ScannerComponent, setScannerComponent] = useState(null);

  useEffect(() => { api.init(); }, []);

  const openScanner = async () => {
    if (Platform.OS === 'web') {
      setError('Skaner nie jest wspierany w web — użyj telefonu.');
      return;
    }
    try {
      const mod = await import('expo-barcode-scanner');
      const { BarCodeScanner } = mod || {};
      if (!BarCodeScanner) {
        setError('Moduł skanera nie jest dostępny. Zainstaluj: expo install expo-barcode-scanner');
        return;
      }
      setScannerComponent(() => BarCodeScanner);
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted') {
        setError('');
        setScanning(true);
      } else {
        setError('Brak zgody na dostęp do kamery');
      }
    } catch (e) {
      setError(`Błąd ładowania skanera: ${e?.message || 'nieznany'}`);
    }
  };

  const onBarCodeScanned = ({ type, data }) => {
    setScanning(false);
    setCode(String(data || ''));
    // Automatyczne wyszukiwanie po zeskanowaniu
    setTimeout(() => { searchTool(); }, 50);
  };

  const searchTool = async () => {
    setError('');
    setMessage('');
    setFoundTool(null);
    setDetails(null);
    try {
      setLoading(true);
      const result = await api.get(`/api/tools/search?code=${encodeURIComponent(code)}`);
      setFoundTool(result);
      const det = await api.get(`/api/tools/${result.id}/details`);
      setDetails(det);
    } catch (e) {
      setError(e.message || 'Nie znaleziono narzędzia');
    } finally {
      setLoading(false);
    }
  };

  const issueTool = async () => {
    setError('');
    setMessage('');
    if (!foundTool || !employeeId) { setError('Wybierz narzędzie i podaj ID pracownika'); return; }
    try {
      setLoading(true);
      await api.post(`/api/tools/${foundTool.id}/issue`, { employee_id: parseInt(employeeId, 10), quantity: 1 });
      setMessage('Wydano narzędzie');
      const det = await api.get(`/api/tools/${foundTool.id}/details`);
      setDetails(det);
    } catch (e) {
      setError(e.message || 'Błąd wydania');
    } finally {
      setLoading(false);
    }
  };

  const returnTool = async () => {
    setError('');
    setMessage('');
    if (!foundTool || !issueId) { setError('Podaj ID wydania'); return; }
    try {
      setLoading(true);
      await api.post(`/api/tools/${foundTool.id}/return`, { issue_id: parseInt(issueId, 10) });
      setMessage('Zwrócono narzędzie');
      const det = await api.get(`/api/tools/${foundTool.id}/details`);
      setDetails(det);
    } catch (e) {
      setError(e.message || 'Błąd zwrotu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Wydanie / Zwrot</Text>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="Kod narzędzia" value={code} onChangeText={setCode} />
        <Button title="Szukaj" onPress={searchTool} />
        <View style={{ width: 8 }} />
        <Button title="Skanuj" onPress={openScanner} />
      </View>
      {loading ? <Text style={styles.muted}>Ładowanie…</Text> : null}
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {foundTool && (
        <View style={styles.card}>
          <Text style={styles.toolName}>{foundTool.name}</Text>
          <Text style={styles.toolMeta}>Ilość: {foundTool.quantity} | Status: {foundTool.status || '—'}</Text>
        </View>
      )}

      {details && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Aktywne wydania</Text>
          {details.issues && details.issues.length > 0 ? (
            <FlatList
              data={details.issues}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  <Text style={styles.itemName}>#{item.id} • {item.employee_first_name} {item.employee_last_name}</Text>
                  <Text style={styles.itemCode}>Ilość: {item.quantity} • Wydano: {item.issued_at}</Text>
                </View>
              )}
            />
          ) : <Text style={styles.muted}>Brak aktywnych wydań</Text>}
        </View>
      )}

      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="ID pracownika" value={employeeId} onChangeText={setEmployeeId} keyboardType="numeric" />
        <Button title="Wydaj 1 szt." onPress={issueTool} />
      </View>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="ID wydania" value={issueId} onChangeText={setIssueId} keyboardType="numeric" />
        <Button title="Zwróć" onPress={returnTool} />
      </View>

      <Modal visible={scanning} animationType="slide">
        <View style={{ flex: 1 }}>
          {hasPermission === false ? (
            <View style={styles.center}><Text>Brak uprawnień do kamery.</Text><Button title="Zamknij" onPress={() => setScanning(false)} /></View>
          ) : ScannerComponent ? (
            <ScannerComponent
              onBarCodeScanned={onBarCodeScanned}
              style={{ flex: 1 }}
            />
          ) : (
            <View style={styles.center}><Text>Ładowanie skanera…</Text><Button title="Anuluj" onPress={() => setScanning(false)} /></View>
          )}
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }}>
            <Button title="Anuluj" onPress={() => setScanning(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 12 },
  toolName: { fontSize: 18, fontWeight: '600' },
  toolMeta: { color: '#666' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  error: { color: 'red', marginBottom: 8 },
  ok: { color: 'green', marginBottom: 8 },
  muted: { color: '#666' }
});