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
  const [camPermGranted, setCamPermGranted] = useState(null);
  const [CameraViewComp, setCameraViewComp] = useState(null);

  useEffect(() => { api.init(); }, []);

  const openScanner = async () => {
    if (Platform.OS === 'web') {
      // Fallback dla web: wybór obrazu i dekodowanie QR z użyciem jsQR wczytanego z CDN
      return openWebImageScanner();
    }
    try {
      const mod = await import('expo-camera');
      const { CameraView, requestCameraPermissionsAsync } = mod || {};
      if (!CameraView || !requestCameraPermissionsAsync) {
        setError('Moduł kamery nie jest dostępny. Zaktualizuj Expo/eksporty.');
        return;
      }
      setCameraViewComp(() => CameraView);
      const res = await requestCameraPermissionsAsync();
      const granted = res?.granted || res?.status === 'granted';
      setCamPermGranted(granted);
      if (granted) {
        setError('');
        setScanning(true);
      } else {
        setError('Brak zgody na dostęp do kamery');
      }
    } catch (e) {
      setError(`Błąd uzyskiwania uprawnień kamery: ${e?.message || 'nieznany'}`);
    }
  };

  // Wczytanie biblioteki jsQR z CDN jeśli nie jest dostępna
  const ensureJsQrLoaded = () => new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.jsQR) { resolve(window.jsQR); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
    script.async = true;
    script.onload = () => {
      if (window.jsQR) { resolve(window.jsQR); } else { reject(new Error('jsQR nie został załadowany')); }
    };
    script.onerror = () => reject(new Error('Nie można załadować jsQR z CDN'));
    document.head.appendChild(script);
  });

  const openWebImageScanner = async () => {
    try {
      if (Platform.OS !== 'web') return;
      await ensureJsQrLoaded();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';
      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = window.jsQR(imageData.data, canvas.width, canvas.height);
            if (result && result.data) {
              setCode(String(result.data));
              setMessage('Zeskanowano QR z obrazu');
              setTimeout(() => { searchTool(); }, 50);
            } else {
              setError('Nie udało się odczytać QR z obrazu');
            }
          };
          img.onerror = () => setError('Nie można wczytać obrazu');
          img.src = reader.result;
        };
        reader.onerror = () => setError('Nie można odczytać pliku obrazu');
        reader.readAsDataURL(file);
      };
      input.click();
    } catch (e) {
      setError(`Błąd skanowania obrazu: ${e?.message || 'nieznany'}`);
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
    <View style={styles.wrapper} className="flex-1 bg-white p-4">
      <Text style={styles.title} className="text-2xl font-bold mb-3">Wydanie / Zwrot</Text>
      <View style={styles.row} className="flex-row items-center gap-2 mb-2">
        <TextInput style={styles.input} className="flex-1 border border-slate-300 rounded-md px-2 h-10" placeholder="Kod narzędzia" value={code} onChangeText={setCode} />
        <Button title="Szukaj" onPress={searchTool} />
        <View style={{ width: 8 }} />
        <Button title={Platform.OS === 'web' ? 'Skanuj obraz (web)' : 'Skanuj'} onPress={openScanner} />
      </View>
      {Platform.OS === 'web' && (
        <Text style={styles.muted} className="text-slate-600">Na web możesz zeskanować z obrazu (upload). Dla pełnego skanera użyj aplikacji mobilnej.</Text>
      )}
      {loading ? <Text style={styles.muted} className="text-slate-600">Ładowanie…</Text> : null}
      {message ? <Text style={styles.ok} className="text-green-600">{message}</Text> : null}
      {error ? <Text style={styles.error} className="text-red-500">{error}</Text> : null}

      {foundTool && (
        <View style={styles.card} className="border border-slate-200 rounded-md p-3 mb-3 bg-white">
          <Text style={styles.toolName} className="font-semibold text-gray-900">{foundTool.name}</Text>
          <Text style={styles.toolMeta} className="text-slate-700">Ilość: {foundTool.quantity} | Status: {foundTool.status || '—'}</Text>
        </View>
      )}

      {details && (
        <View style={styles.card} className="border border-slate-200 rounded-md p-3 mb-3 bg-white">
          <Text style={styles.sectionTitle} className="text-lg font-bold mb-2">Aktywne wydania</Text>
          {details.issues && details.issues.length > 0 ? (
            <FlatList
              data={details.issues}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={styles.separator} className="h-px bg-slate-200" />}
              renderItem={({ item }) => (
                <View style={styles.item} className="py-2">
                  <Text style={styles.itemName} className="text-gray-800">#{item.id} • {item.employee_first_name} {item.employee_last_name}</Text>
                  <Text style={styles.itemCode} className="text-slate-700">Ilość: {item.quantity} • Wydano: {item.issued_at}</Text>
                </View>
              )}
            />
          ) : <Text style={styles.muted}>Brak aktywnych wydań</Text>}
        </View>
      )}

      <View style={styles.row} className="flex-row items-center gap-2 mb-2">
        <TextInput style={styles.input} className="flex-1 border border-slate-300 rounded-md px-2 h-10" placeholder="ID pracownika" value={employeeId} onChangeText={setEmployeeId} keyboardType="numeric" />
        <Button title="Wydaj 1 szt." onPress={issueTool} />
      </View>
      <View style={styles.row} className="flex-row items-center gap-2 mb-2">
        <TextInput style={styles.input} className="flex-1 border border-slate-300 rounded-md px-2 h-10" placeholder="ID wydania" value={issueId} onChangeText={setIssueId} keyboardType="numeric" />
        <Button title="Zwróć" onPress={returnTool} />
      </View>

      <Modal visible={scanning} animationType="slide">
        <View style={{ flex: 1 }} className="bg-white">
          {camPermGranted === false ? (
            <View style={styles.center} className="items-center justify-center p-4"><Text>Brak uprawnień do kamery.</Text><Button title="Zamknij" onPress={() => setScanning(false)} /></View>
          ) : camPermGranted === true && CameraViewComp ? (
            <CameraViewComp
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e']
              }}
              onBarcodeScanned={({ data, type }) => onBarCodeScanned({ type, data })}
            />
          ) : (
            <View style={styles.center} className="items-center justify-center p-4"><Text>Ładowanie skanera…</Text><Button title="Anuluj" onPress={() => setScanning(false)} /></View>
          )}
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }} className="items-center">
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