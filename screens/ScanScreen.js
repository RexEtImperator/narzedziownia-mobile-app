import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';

export default function ScanScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [hasPermission, setHasPermission] = useState(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState('');
  const [tool, setTool] = useState(null);
  const [codeValue, setCodeValue] = useState('');
  const action = route?.params?.action || null; // 'issue' | 'return'
  const handlerRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [CameraViewComp, setCameraViewComp] = useState(null);
  const [BarcodeScannerComp, setBarcodeScannerComp] = useState(null);
  const [cameraModuleError, setCameraModuleError] = useState('');

  useEffect(() => {
    const openScanner = async () => {
      if (Platform.OS === 'web') {
        setHasPermission(true);
        setScanning(false);
        return;
      }
      // Spróbuj expo-camera
      try {
        const mod = await import('expo-camera');
        const { CameraView, requestCameraPermissionsAsync } = mod || {};
        if (CameraView && requestCameraPermissionsAsync) {
          setCameraViewComp(() => CameraView);
          const res = await requestCameraPermissionsAsync();
          const granted = res?.granted || res?.status === 'granted';
          setCanAskAgain(res?.canAskAgain !== false);
          setHasPermission(granted);
          if (granted) { setScanning(true); setError(''); return; }
          else { setError('Brak zgody na dostęp do kamery'); return; }
        }
      } catch (e) {
        // pomiń, spróbuj fallback
      }
      // Fallback: expo-barcode-scanner (Expo Go / buildy)
      try {
        const mod2 = await import('expo-barcode-scanner');
        const { BarCodeScanner, requestPermissionsAsync } = mod2 || {};
        if (!BarCodeScanner || !requestPermissionsAsync) { setCameraModuleError('Moduł skanera niedostępny'); setHasPermission(false); return; }
        setBarcodeScannerComp(() => BarCodeScanner);
        const perm = await requestPermissionsAsync();
        const granted = perm?.granted || perm?.status === 'granted';
        setCanAskAgain(perm?.canAskAgain !== false);
        setHasPermission(granted);
        if (!granted) { setError('Brak zgody na dostęp do kamery'); return; }
        setError('');
        setScanning(true);
      } catch (e2) {
        const msg = `Moduł kamery niedostępny: ${e2?.message || 'nieznany'}`;
        setError(msg);
        setCameraModuleError(msg);
        setHasPermission(false);
      }
    };
    openScanner();
  }, []);

  const handleBarCodeScanned = async ({ type, data }) => {
    if (handlerRef.current) return;
    handlerRef.current = true;
    setScanned(true);
    setError('');
    try {
      const val = String(data || '').trim();
      setCodeValue(val);
      const res = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
      setTool(res || null);
    } catch (e) {
      setTool(null);
      setError('Nie ma takiego narzędzia w systemie');
    }
  };

  const goIssue = () => {
    try { navigation.navigate('Wydaj/Zwrot', { screen: 'IssueScreen', params: { code: codeValue, tool } }); } catch {}
  };
  const goReturn = () => {
    try { navigation.navigate('Wydaj/Zwrot', { screen: 'ReturnScreen', params: { code: codeValue, tool } }); } catch {}
  };

  const goAdd = () => {
    try { navigation.navigate('Narzędzia', { filter: codeValue }); } catch {}
  };

  return (
    <View style={styles.wrapper}>
      {/* Pasek górny */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Skanuj</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color="#374151" />
        </Pressable>
      </View>

      {/* Podgląd kamery / skanera */}
      {Platform.OS === 'web' ? (
        <View style={styles.scannerBox}>
          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }]}>
            <Ionicons name="qr-code" size={72} color="#fff" />
            <View style={{ height: 8 }} />
            <Text style={{ color: '#fff' }}>Skanowanie dostępne na urządzeniach mobilnych</Text>
          </View>
        </View>
      ) : hasPermission === false ? (
        <View style={styles.centerBox}><Text>Brak uprawnień do kamery</Text></View>
      ) : scanning && (CameraViewComp || BarcodeScannerComp) ? (
        <View style={styles.scannerBox}>
          {CameraViewComp ? (
            <CameraViewComp
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={({ data, type }) => handleBarCodeScanned({ type, data })}
            />
          ) : (
            <BarcodeScannerComp
              style={StyleSheet.absoluteFillObject}
              barCodeTypes={['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e']}
              onBarCodeScanned={({ data, type }) => handleBarCodeScanned({ type, data })}
            />
          )}
          {/* Nakładka reticle */}
          <View style={styles.reticle}>
            <Ionicons name="qr-code" size={72} color="#fff" />
          </View>
          <View style={styles.scanHint}><Text style={styles.scanHintText}>{scanned ? 'Przetwarzam…' : 'Zeskanuj kod'}</Text></View>
        </View>
      ) : (
        <View style={styles.centerBox}><Text>{cameraModuleError || 'Ładowanie skanera…'}</Text></View>
      )}

      {/* Wynik / akcje */}
      <View style={styles.resultBox}>
        {tool ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tool.name || tool.tool_name || '—'}</Text>
            <Text style={styles.cardMeta}>Nr ew.: {tool.inventory_number || tool.code || tool.barcode || tool.qr_code || '—'}</Text>
            <Text style={styles.cardMeta}>SKU: {tool.sku || '—'} • Kategoria: {tool.category || '—'}</Text>
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{error}</Text>
            <Pressable onPress={goAdd} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}>
              <Text style={styles.btnText}>Dodaj</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Przyciski akcji po skanie */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable onPress={goIssue} disabled={!scanned} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, !scanned && styles.btnDisabled]}>
            <Text style={styles.btnText}>Wydaj →</Text>
          </Pressable>
          <Pressable onPress={goReturn} disabled={!scanned} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, !scanned && styles.btnDisabled]}>
            <Text style={styles.btnText}>Przyjmij →</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#000' },
  header: { height: 48, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  closeBtn: { position: 'absolute', right: 16, top: 14 },
  scannerBox: { flex: 1, position: 'relative' },
  reticle: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
  scanHint: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  scanHintText: { color: '#fff' },
  resultBox: { backgroundColor: '#fff', padding: 16 },
  card: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 10, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 6 },
  cardMeta: { color: '#6b7280' },
  primaryBtn: { backgroundColor: '#4f46e5', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  btnPressed: { backgroundColor: '#4338ca' },
  btnDisabled: { opacity: 0.5 }
});