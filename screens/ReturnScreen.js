import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Modal, Platform, Pressable, Linking } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api';

export default function ReturnScreen() {
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [foundTool, setFoundTool] = useState(null);
  const [details, setDetails] = useState(null);
  const [issueId, setIssueId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [camPermGranted, setCamPermGranted] = useState(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [cameraModuleError, setCameraModuleError] = useState('');
  const [CameraViewComp, setCameraViewComp] = useState(null);

  useEffect(() => { api.init(); }, []);

  const openScanner = async () => {
    if (Platform.OS === 'web') { return openWebImageScanner(); }
    // Tylko expo-camera (bez fallbacku)
    try {
      const mod = await import('expo-camera');
      const { CameraView, Camera } = mod || {};
      if (CameraView && Camera && Camera.requestCameraPermissionsAsync) {
        setCameraViewComp(() => CameraView);
        const res = await Camera.requestCameraPermissionsAsync();
        const granted = res?.granted || res?.status === 'granted';
        setCanAskAgain(res?.canAskAgain !== false);
        setCamPermGranted(granted);
        if (granted) { setScanning(true); setError(''); return; }
        else { setError('Brak zgody na dostęp do kamery'); return; }
      } else {
        setCameraModuleError('Moduł kamery niedostępny: expo-camera bez CameraView');
        setCamPermGranted(false);
      }
    } catch (e2) {
      const msg = `Moduł kamery niedostępny: ${e2?.message || 'expo-camera'}`;
      setError(msg);
      setCameraModuleError(msg);
      setCamPermGranted(false);
    }
  };

  const requestCamPermission = async () => {
    try {
      const mod = await import('expo-camera');
      const { Camera } = mod || {};
      if (Camera?.requestCameraPermissionsAsync) {
        const res = await Camera.requestCameraPermissionsAsync();
        const granted = res?.granted || res?.status === 'granted';
        setCanAskAgain(res?.canAskAgain !== false);
        setCamPermGranted(granted);
        setError(granted ? '' : 'Brak zgody na dostęp do kamery');
        if (granted) { await openScanner(); }
        return;
      } else {
        setCameraModuleError('Moduł kamery niedostępny: expo-camera bez Camera.requestCameraPermissionsAsync');
        setCamPermGranted(false);
      }
    } catch (e2) {
      const msg = `Moduł kamery niedostępny: ${e2?.message || 'expo-camera'}`;
      setError(msg);
      setCameraModuleError(msg);
      setCamPermGranted(false);
    }
  };

  const ensureJsQrLoaded = () => new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.jsQR) { resolve(window.jsQR); return; }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
    script.async = true;
    script.onload = () => { if (window.jsQR) { resolve(window.jsQR); } else { reject(new Error('jsQR nie został załadowany')); } };
    script.onerror = () => reject(new Error('Nie można załadować jsQR z CDN'));
    document.head.appendChild(script);
  });

  const openWebImageScanner = async () => {
    try {
      if (Platform.OS !== 'web') return;
      await ensureJsQrLoaded();
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
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
            if (result && result.data) { setCode(String(result.data)); setMessage('Zeskanowano QR z obrazu'); setTimeout(() => { searchTool(); }, 50); }
            else { setError('Nie udało się odczytać QR z obrazu'); }
          };
          img.onerror = () => setError('Nie można wczytać obrazu');
          img.src = reader.result;
        };
        reader.onerror = () => setError('Nie można odczytać pliku obrazu');
        reader.readAsDataURL(file);
      };
      input.click();
    } catch (e) { setError(`Błąd skanowania obrazu: ${e?.message || 'nieznany'}`); }
  };

  const onBarCodeScanned = ({ type, data }) => {
    setScanning(false);
    setCode(String(data || ''));
    setTimeout(() => { searchTool(); }, 50);
  };

  const searchTool = async () => {
    setError(''); setMessage(''); setFoundTool(null); setDetails(null);
    try {
      setLoading(true);
      const result = await api.get(`/api/tools/search?code=${encodeURIComponent(code)}`);
      setFoundTool(result);
      const det = await api.get(`/api/tools/${result.id}/details`);
      setDetails(det);
    } catch (e) { setError(e.message || 'Nie znaleziono narzędzia'); }
    finally { setLoading(false); }
  };

  const returnTool = async () => {
    setError(''); setMessage('');
    if (!foundTool || !issueId) { setError('Podaj ID wydania'); return; }
    try {
      setLoading(true);
      await api.post(`/api/tools/${foundTool.id}/return`, { issue_id: parseInt(issueId, 10) });
      setMessage('Zwrócono narzędzie');
      const det = await api.get(`/api/tools/${foundTool.id}/details`);
      setDetails(det);
      // Auto: odśwież skanowanie po sukcesie, aby zeskanować kolejny kod
      setTimeout(() => { try { setIssueId(''); setScanning(true); } catch {} }, 1200);
    } catch (e) { setError(e.message || 'Błąd zwrotu'); }
    finally { setLoading(false); }
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold mb-3">Szybki zwrot</Text>
      <View style={styles.row} className="flex-row items-center gap-2 mb-2">
        <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]} className="flex-1 rounded-md px-2 h-10" placeholder="Kod narzędzia" value={code} onChangeText={setCode} placeholderTextColor={colors.muted} />
        <Pressable onPress={searchTool} style={[styles.smallButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Szukaj</Text>
        </Pressable>
        <Pressable onPress={openScanner} style={[styles.smallButton, { backgroundColor: colors.primary }]}> 
          <Text style={styles.buttonText}>{Platform.OS === 'web' ? 'Skanuj obraz (web)' : 'Skanuj'}</Text>
        </Pressable>
        {Platform.OS !== 'web' && (
          <Pressable onPress={requestCamPermission} style={[styles.smallButton, { backgroundColor: colors.secondary || colors.primary }]}> 
            <Text style={styles.buttonText}>Poproś o dostęp</Text>
          </Pressable>
        )}
      </View>
      {Platform.OS === 'web' && (<Text style={{ color: colors.muted }}>Na web możesz zeskanować z obrazu (upload). Dla pełnego skanera użyj aplikacji mobilnej.</Text>)}
      {camPermGranted === false && (
        <View style={{ backgroundColor: '#fef3c7', borderColor: '#f59e0b', borderWidth: 1, padding: 10, borderRadius: 8, marginTop: 8 }}>
          <Text style={{ color: '#92400e' }}>Aby skanować, nadaj dostęp do kamery.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable onPress={requestCamPermission} style={[styles.smallButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.buttonText}>Nadaj dostęp</Text>
            </Pressable>
            {!canAskAgain && (
              <Pressable onPress={() => { try { Linking.openSettings(); } catch {} }} style={[styles.smallButton, { backgroundColor: colors.muted }]}>
                <Text style={styles.buttonText}>Otwórz ustawienia</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      {cameraModuleError ? (
        <View style={{ backgroundColor: '#fee2e2', borderColor: '#ef4444', borderWidth: 1, padding: 10, borderRadius: 8, marginTop: 8 }}>
          <Text style={{ color: '#7f1d1d' }}>{cameraModuleError}</Text>
          <Pressable onPress={() => Linking.openURL('https://docs.expo.dev/versions/latest/sdk/camera/')} style={[styles.smallButton, { backgroundColor: colors.primary, marginTop: 8 }]}>
            <Text style={styles.buttonText}>Instrukcja (Expo Camera)</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL('https://docs.expo.dev/versions/latest/sdk/bar-code-scanner/')} style={[styles.smallButton, { backgroundColor: colors.primary, marginTop: 8 }]}>
            <Text style={styles.buttonText}>Instrukcja (Barcode Scanner)</Text>
          </Pressable>
        </View>
      ) : null}
      {loading ? <Text style={{ color: colors.muted }}>Ładowanie…</Text> : null}
      {message ? <Text style={{ color: colors.success }}>{message}</Text> : null}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}

      {foundTool && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} className="rounded-md p-3 mb-3">
          <Text style={{ color: colors.text, fontWeight: '600' }}>{foundTool.name}</Text>
          <Text style={{ color: colors.muted }}>Ilość: {foundTool.quantity} | Status: {foundTool.status || '—'}</Text>
        </View>
      )}

      {details && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} className="rounded-md p-3 mb-3">
          <Text style={[styles.sectionTitle, { color: colors.text }]} className="text-lg font-bold mb-2">Aktywne wydania</Text>
          {details.issues && details.issues.length > 0 ? (
            <FlatList
              data={details.issues}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
              renderItem={({ item }) => (
                <View style={{ paddingVertical: 8 }}>
                  <Text style={{ color: colors.text }}>#{item.id} • {item.employee_first_name} {item.employee_last_name}</Text>
                  <Text style={{ color: colors.muted }}>Ilość: {item.quantity} • Wydano: {item.issued_at}</Text>
                </View>
              )}
            />
          ) : <Text style={{ color: colors.muted }}>Brak aktywnych wydań</Text>}
        </View>
      )}

      <View style={styles.row} className="flex-row items-center gap-2 mb-2">
        <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.card }]} className="flex-1 rounded-md px-2 h-10" placeholder="ID wydania" value={issueId} onChangeText={setIssueId} keyboardType="numeric" placeholderTextColor={colors.muted} />
        <Pressable onPress={returnTool} style={[styles.smallButton, { backgroundColor: colors.primary }]}>
          <Text style={styles.buttonText}>Zwróć</Text>
        </Pressable>
      </View>

      <Modal visible={scanning} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.card }}>
          {camPermGranted === false ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <Text style={{ color: colors.text }}>Brak uprawnień do kamery.</Text>
              <Pressable onPress={requestCamPermission} style={[styles.button, { backgroundColor: colors.primary, marginTop: 12 }]}> 
                <Text style={styles.buttonText}>Poproś o dostęp</Text>
              </Pressable>
              {!canAskAgain && (
                <Pressable onPress={() => { try { Linking.openSettings(); } catch {} }} style={[styles.button, { backgroundColor: colors.warning || '#f0ad4e', marginTop: 8 }]}> 
                  <Text style={styles.buttonText}>Otwórz ustawienia</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setScanning(false)} style={[styles.button, { backgroundColor: colors.muted }]}> 
                <Text style={styles.buttonText}>Zamknij</Text>
              </Pressable>
            </View>
          ) : camPermGranted === true && CameraViewComp ? (
            <CameraViewComp
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={({ data, type }) => onBarCodeScanned({ type, data })}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <Text style={{ color: colors.text }}>Ładowanie skanera…</Text>
              <Pressable onPress={() => setScanning(false)} style={[styles.button, { backgroundColor: colors.muted }]}>
                <Text style={styles.buttonText}>Anuluj</Text>
              </Pressable>
            </View>
          )}
          <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }}>
            <Pressable onPress={() => setScanning(false)} style={[styles.button, { backgroundColor: colors.muted }]}> 
              <Text style={styles.buttonText}>Anuluj</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  input: { borderWidth: 1, backgroundColor: '#fff' },
  card: { borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  button: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center' },
  smallButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});