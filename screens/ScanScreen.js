import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking, ToastAndroid, Vibration } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import * as Haptics from 'expo-haptics'
import { showSnackbar } from '../lib/snackbar';
import Constants from 'expo-constants';

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
  const [cameraModuleError, setCameraModuleError] = useState('');
  // NEW: Reticle color + details/employees UI state
  const [scanFrameColor, setScanFrameColor] = useState('#9ca3af'); // default gray
  const [toolDetails, setToolDetails] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [message, setMessage] = useState('');
  const [dupInfo, setDupInfo] = useState('');
  // Multi-skan: stan i pamięć ostatniego skanu
  const [multiScan, setMultiScan] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const lastScanRef = useRef({ code: null, at: 0 });
  // Lista aktywnych wydań do zwrotu
  const [returnItems, setReturnItems] = useState([]);
  const [returnListLoading, setReturnListLoading] = useState(false);
  const [returnListError, setReturnListError] = useState('');
  const [singleQty, setSingleQty] = useState(1);

  // Pomocnicza: wydobądź tablicę z różnych kształtów odpowiedzi
  const toArray = (resp) => {
    try {
      if (Array.isArray(resp)) return resp;
      const candidates = ['data', 'rows', 'items', 'list', 'result', 'content'];
      for (const key of candidates) {
        const val = resp?.[key];
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object') {
          const nestedCandidates = ['data', 'rows', 'items', 'list', 'content'];
          for (const n of nestedCandidates) {
            const nested = val?.[n];
            if (Array.isArray(nested)) return nested;
          }
        }
      }
    } catch {}
    return [];
  };

  // Pobierz listę wydań do zwrotu
  const loadReturnList = async () => {
    setReturnListLoading(true);
    setReturnListError('');
    try {
      await api.init();
      const historyDisabled = String(process.env.EXPO_PUBLIC_DISABLE_HISTORY_FETCH || '').toLowerCase() === 'true';
      // Równolegle pobierz pracowników i narzędzia (do mapowania nazw)
      let employeesResp = null, toolsResp = null;
      try { employeesResp = await api.get('/api/employees'); } catch {}
      try { toolsResp = await api.get('/api/tools'); } catch {}
      const emps = Array.isArray(employeesResp) ? employeesResp : (Array.isArray(employeesResp?.data) ? employeesResp.data : []);
      const empMap = new Map();
      for (const e of emps) {
        const name = [e?.first_name, e?.last_name].filter(Boolean).join(' ') || e?.name || '—';
        empMap.set(e?.id, name);
      }
      const toolsList = Array.isArray(toolsResp) ? toolsResp : (Array.isArray(toolsResp?.data) ? toolsResp.data : []);
      const toolMap = new Map();
      for (const t of toolsList) {
        toolMap.set(t?.id, t);
      }

      let rawIssues = [];
      if (!historyDisabled) {
        try { const ti = await api.get('/api/tool_issues'); rawIssues = toArray(ti); } catch {}
      }

      let mapped = rawIssues.map(ev => {
        const returned = ev?.returned_at ?? ev?.returnedAt ?? ev?.returned_on ?? ev?.return_date ?? ev?.completed_at;
        const toolId = ev?.tool_id ?? ev?.toolId ?? ev?.tool?.id ?? ev?.item_id ?? ev?.itemId;
        const t = toolMap.get(toolId);
        const toolName = t?.name || t?.tool_name || ev?.tool_name || ev?.name || 'Narzędzie';
        const code = t?.inventory_number || t?.serial_number || t?.qr_code || t?.barcode || t?.code || t?.sku || ev?.tool_code || '';
        const empId = ev?.employee_id ?? ev?.employeeId ?? ev?.employee?.id;
        const empName = empMap.get(empId) || `${ev?.employee_first_name || ''} ${ev?.employee_last_name || ''}`.trim() || ev?.employee_name || '—';
        return { id: ev?.id ?? ev?.issue_id ?? ev?.log_id ?? `${toolId || 'tool'}-issue`, returned, tool_name: toolName, employee_name: empName, tool_code: code, tool_id: toolId, employee_id: empId };
      }).filter(x => !x.returned);

      if (!mapped.length && toolsList.length) {
        const derived = toolsList
          .filter(t => !!(t?.issued_to_employee_id ?? t?.issuedToEmployeeId))
          .map(t => ({
            id: t?.id,
            tool_name: t?.name || t?.tool_name || 'Narzędzie',
            employee_id: t?.issued_to_employee_id ?? t?.issuedToEmployeeId,
            employee_name: empMap.get(t?.issued_to_employee_id ?? t?.issuedToEmployeeId) || '—',
            tool_code: t?.inventory_number || t?.serial_number || t?.qr_code || t?.barcode || t?.code || t?.sku || '',
            tool_id: t?.id,
          }));
        mapped = derived;
      }

      setReturnItems(mapped);
    } catch (e) {
      setReturnListError(e?.message || 'Błąd ładowania listy zwrotów');
      setReturnItems([]);
    } finally {
      setReturnListLoading(false);
    }
  };

  useEffect(() => { loadReturnList(); }, []);

  // Dodaj wybrany kod z listy „Do zwrotu” do wielo-skanu
  const preAddByCode = async (code) => {
    const val = String(code || '').trim();
    if (!val) return;
    const isDup = scannedItems.some((it) => String(it.code) === val);
    if (isDup) { showDupNotice(); return; }
    try {
      const res = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
      if (res && res.id) {
        let det = null; try { det = await api.get(`/api/tools/${res.id}/details`); } catch {}
        setScannedItems((prev) => [...prev, { code: val, tool: res || null, details: det || null }]);
        setMultiScan(true);
      } else {
        setError('Nie znaleziono narzędzia');
      }
    } catch (e) {
      setError(e?.message || 'Błąd pobierania narzędzia');
    }
  };

  useEffect(() => {
    const openScanner = async () => {
      if (Platform.OS === 'web') {
        setHasPermission(true);
        setScanning(false);
        return;
      }
      // Tylko expo-camera (bez fallbacku expo-barcode-scanner)
      try {
        const mod = await import('expo-camera');
        const { CameraView, Camera } = mod || {};
        if (CameraView && Camera && Camera.requestCameraPermissionsAsync) {
          setCameraViewComp(() => CameraView);
          const res = await Camera.requestCameraPermissionsAsync();
          const granted = res?.granted || res?.status === 'granted';
          setCanAskAgain(res?.canAskAgain !== false);
          setHasPermission(granted);
          if (granted) { setScanning(true); setError(''); return; }
          else { setError('Brak zgody na dostęp do kamery'); return; }
        } else {
          setCameraModuleError('Moduł kamery niedostępny: expo-camera bez CameraView');
          setHasPermission(false);
        }
      } catch (e2) {
        const msg = `Moduł kamery niedostępny: ${e2?.message || 'expo-camera'}`;
        setError(msg);
        setCameraModuleError(msg);
        setHasPermission(false);
      }
    };
    openScanner();
  }, []);

  // Poproś o uprawnienia kamery ponownie
  const requestCamPermission = async () => {
    try {
      const mod = await import('expo-camera');
      const { Camera } = mod || {};
      if (Camera?.requestCameraPermissionsAsync) {
        const res = await Camera.requestCameraPermissionsAsync();
        const granted = res?.granted || res?.status === 'granted';
        setCanAskAgain(res?.canAskAgain !== false);
        setHasPermission(granted);
        setError(granted ? '' : 'Brak zgody na dostęp do kamery');
        if (granted) { setScanning(true); setCameraModuleError(''); }
      } else {
        setCameraModuleError('Moduł kamery niedostępny: expo-camera bez Camera.requestCameraPermissionsAsync');
        setHasPermission(false);
      }
    } catch (e2) {
      const msg = `Moduł kamery niedostępny: ${e2?.message || 'expo-camera'}`;
      setError(msg);
      setCameraModuleError(msg);
      setHasPermission(false);
    }
  };

  const showDupNotice = () => {
    const msg = 'Kod już dodany';
    try {
      showSnackbar({ type: 'warn', text: msg, duration: 1500 });
    } catch {}
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      try { if (Platform.OS !== 'web') Vibration.vibrate(20); } catch {}
    }
    setDupInfo(msg);
    setTimeout(() => setDupInfo(''), 1000);
  };

  const handleBarCodeScanned = async ({ type, data }) => {
    const val = String(data || '').trim();
    if (multiScan) {
      const now = Date.now();
      if (lastScanRef.current.code === val && (now - (lastScanRef.current.at || 0)) < 250) return;
      lastScanRef.current = { code: val, at: now };
      setError('');
      setMessage('');
      try {
        const res = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
        if (res && res.id) {
          setScanFrameColor('#22c55e');
          // Jeśli kod już jest na liście — pokaż toast i kontynuuj skanowanie
          const isDup = scannedItems.some((it) => String(it.code) === val);
          if (isDup) {
            showDupNotice();
            setScanned(false);
            handlerRef.current = false;
            setScanning(true);
            return;
          }
          let det = null;
          try { det = await api.get(`/api/tools/${res.id}/details`); } catch {}
          setTool(res || null);
          setToolDetails(det || null);
          setScannedItems((prev) => [...prev, { code: val, tool: res || null, details: det || null }]);
          try {
            setEmployeesLoading(true);
            const list = await api.get('/api/employees');
            const items = list?.items || list || [];
            setEmployees(Array.isArray(items) ? items : []);
          } catch {} finally { setEmployeesLoading(false); }
        } else {
          setScanFrameColor('#ef4444');
        }
      } catch (e) {
        setScanFrameColor('#ef4444');
        setError('Nie ma takiego narzędzia w systemie');
      }
      setScanned(false);
      handlerRef.current = false;
      setScanning(true);
    } else {
      if (handlerRef.current) return;
      handlerRef.current = true;
      setScanned(true);
      setError('');
      setMessage('');
      setToolDetails(null);
      setSelectedEmployee(null);
      try {
        setCodeValue(val);
        const res = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
        setTool(res || null);
        if (res && res.id) {
          setScanFrameColor('#22c55e');
          try {
            const det = await api.get(`/api/tools/${res.id}/details`);
            setToolDetails(det || null);
          } catch {}
          try {
            setEmployeesLoading(true);
            const list = await api.get('/api/employees');
            const items = list?.items || list || [];
            setEmployees(Array.isArray(items) ? items : []);
          } catch {} finally { setEmployeesLoading(false); }
        } else {
          setScanFrameColor('#ef4444');
        }
      } catch (e) {
        setTool(null);
        setScanFrameColor('#ef4444');
        setError('Nie ma takiego narzędzia w systemie');
      }
    }
  };

  // Funkcja resetująca skaner po udanej akcji
  const resetScanner = () => {
    handlerRef.current = false;
    setScanned(false);
    setScanFrameColor('#9ca3af');
    setTool(null);
    setToolDetails(null);
    setSelectedEmployee(null);
    setMessage('');
    setError('');
    setCodeValue('');
    setScanning(true);
    setScannedItems([]);
    setSingleQty(1);
  };
  // Multi-skan: operacje zbiorcze + sterowanie ilością
  const clearScannedList = () => { setScannedItems([]); setMessage(''); setError(''); };
  const removeCode = (code) => {
    setScannedItems((prev) => prev.filter((it) => String(it.code) !== String(code)));
  };
  const incrementQty = (code) => {
    setScannedItems((prev) => prev.map((it) => String(it.code) === String(code) ? { ...it, qty: (it.qty || 1) + 1 } : it));
  };
  const decrementQty = (code) => {
    setScannedItems((prev) => prev.map((it) => {
      if (String(it.code) === String(code)) {
        const nextQty = (it.qty || 1) - 1;
        return nextQty <= 0 ? it : { ...it, qty: nextQty };
      }
      return it;
    }).filter((it) => (it.qty || 1) > 0));
  };

  const issueAll = async () => {
    if (!selectedEmployee) return;
    setMessage(''); setError('');
    try {
      let ok = 0, fail = 0;
      const sumTotal = scannedItems.length;
      for (const it of scannedItems) {
        const t = it.tool;
        if (t?.id) {
          try {
            await api.post(`/api/tools/${t.id}/issue`, { employee_id: selectedEmployee.id, quantity: 1 });
            ok++;
          } catch { fail++; }
        } else { fail++; }
      }
      setMessage(`Wydano ${ok} z ${sumTotal} narzędzi`);
    } catch (e) {
      setError(e?.message || 'Nie udało się wykonać zbiorczej operacji');
    } finally {
      try { await loadReturnList(); } catch {}
      setTimeout(() => { resetScanner(); }, 1200);
    }
  };

  const returnAll = async () => {
    if (!selectedEmployee) return;
    setMessage(''); setError('');
    try {
      let ok = 0, fail = 0;
      const sumTotal = scannedItems.length;
      for (const it of scannedItems) {
        const t = it.tool;
        if (t?.id) {
          let det = it.details;
          if (!det) {
            try { det = await api.get(`/api/tools/${t.id}/details`); } catch { det = null; }
          }
          const issue = (det?.issues || []).find((itm) => {
            if (typeof itm?.employee_id === 'number' || typeof itm?.employee_id === 'string') {
              return String(itm.employee_id) === String(selectedEmployee.id);
            }
            const fn = (itm?.employee_first_name || '').trim();
            const ln = (itm?.employee_last_name || '').trim();
            return fn && ln && fn === (selectedEmployee.first_name || '').trim() && ln === (selectedEmployee.last_name || '').trim();
          });
          if (!issue) { fail++; continue; }
          try {
            const q = (it.qty || 1);
            await api.post(`/api/tools/${t.id}/return`, { issue_id: issue.id, quantity: q, qty: q });
            ok++;
          } catch { fail++; }
        } else { fail++; }
      }
      setMessage(`Przyjęto ${ok} z ${sumTotal} narzędzi`);
    } catch (e) {
      setError(e?.message || 'Nie udało się wykonać zbiorczej operacji');
    } finally {
      try { await loadReturnList(); } catch {}
      setTimeout(() => { resetScanner(); }, 1200);
    }
  };

  // Remove intermediate actions: replace goIssue/goReturn with direct issue/return handlers
  const issueTool = async () => {
    if (!tool?.id || !selectedEmployee?.id) return;
    setMessage(''); setError('');
    try {
      const q = singleQty || 1;
      await api.post(`/api/tools/${tool.id}/issue`, { employee_id: selectedEmployee.id, quantity: q, qty: q });
      const det = await api.get(`/api/tools/${tool.id}/details`);
      setToolDetails(det || null);
      setMessage('Wydano narzędzie');
      try { await loadReturnList(); } catch {}
      setTimeout(resetScanner, 1200);
    } catch (e) {
      setError(e?.message || 'Nie udało się wydać narzędzia');
    }
  };

  const returnTool = async () => {
    if (!tool?.id || !selectedEmployee) return;
    setMessage(''); setError('');
    try {
      const issue = (toolDetails?.issues || []).find((it) => {
        if (typeof it?.employee_id === 'number' || typeof it?.employee_id === 'string') {
          return String(it.employee_id) === String(selectedEmployee.id);
        }
        const fn = (it?.employee_first_name || '').trim();
        const ln = (it?.employee_last_name || '').trim();
        return fn && ln && fn === (selectedEmployee.first_name || '').trim() && ln === (selectedEmployee.last_name || '').trim();
      });
      if (!issue) { setError('Brak aktywnego wydania dla wybranego pracownika'); return; }
      const q = singleQty || 1;
      await api.post(`/api/tools/${tool.id}/return`, { issue_id: issue.id, quantity: q, qty: q });
      const det = await api.get(`/api/tools/${tool.id}/details`);
      setToolDetails(det || null);
      setMessage('Przyjęto narzędzie');
      try { await loadReturnList(); } catch {}
      setTimeout(resetScanner, 1200);
    } catch (e) {
      setError(e?.message || 'Nie udało się przyjąć narzędzia');
    }
  };

  // Stub, aby uniknąć błędu przy przycisku "Dodaj"
  const goAdd = () => {};

  return (
    <View style={styles.wrapper}>
      {/* Pasek górny */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Skanuj</Text>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color="#374151" />
        </Pressable>
        <Pressable onPress={() => setMultiScan((v)=>!v)} style={{ position: 'absolute', left: 16, top: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: multiScan ? '#16a34a' : '#6b7280' }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{multiScan ? 'Wielo-skan ON' : 'Wielo-skan OFF'}</Text>
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
        <View style={styles.centerBox}>
          <Text>Brak uprawnień do kamery</Text>
          <View style={{ height: 8 }} />
          <Pressable onPress={requestCamPermission} style={styles.primaryBtn}>
            <Text style={styles.btnText}>Nadaj dostęp</Text>
          </Pressable>
          {!canAskAgain && (
            <>
              <View style={{ height: 8 }} />
              <Pressable onPress={() => { try { Linking.openSettings(); } catch {} }} style={[styles.primaryBtn, styles.btnMuted]}>
                <Text style={styles.btnText}>Otwórz ustawienia</Text>
              </Pressable>
            </>
          )}
          {cameraModuleError ? (
            <>
              <View style={{ height: 8 }} />
              <Text style={{ color: '#b91c1c' }}>{cameraModuleError}</Text>
            </>
          ) : null}
        </View>
      ) : scanning && CameraViewComp ? (
        <View style={styles.scannerBox}>
          {CameraViewComp ? (
            <CameraViewComp
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={({ data, type }) => handleBarCodeScanned({ type, data })}
            />
          ) : null}
          {/* Nakładka reticle + ramka koloru */}
          <View style={[styles.reticleBox, { borderColor: scanFrameColor }]} />
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
        {multiScan && scannedItems.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            {dupInfo ? (<Text style={{ color: '#6b7280' }}>{dupInfo}</Text>) : null}
            <Text style={{ color: '#111827', fontWeight: '700' }}>Zeskanowane: {scannedItems.length}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {scannedItems.map((it) => (
                <View key={it.code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#eef2ff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <Text style={{ color: '#374151', fontWeight: '600' }}>{it.code}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable onPress={() => decrementQty(it.code)} style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#e5e7eb', borderRadius: 6 }}>
                      <Text style={{ color: '#111827' }}>-</Text>
                    </Pressable>
                    <Text style={{ color: '#374151', fontWeight: '600' }}>{it.qty || 1}</Text>
                    <Pressable onPress={() => incrementQty(it.code)} style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#e5e7eb', borderRadius: 6 }}>
                      <Text style={{ color: '#111827' }}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => removeCode(it.code)} style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#fca5a5', borderRadius: 6 }}>
                    <Text style={{ color: '#111827' }}>x</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <Pressable onPress={clearScannedList} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, styles.btnMuted]}>
                <Text style={styles.btnText}>Wyczyść listę</Text>
              </Pressable>
              <Pressable onPress={issueAll} disabled={!selectedEmployee} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, !selectedEmployee && styles.btnDisabled]}>
                <Text style={styles.btnText}>Wydaj wszystkie</Text>
              </Pressable>
              <Pressable onPress={returnAll} disabled={!selectedEmployee} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, !selectedEmployee && styles.btnDisabled]}>
                <Text style={styles.btnText}>Zwróć wszystkie</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {tool ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tool.name || tool.tool_name || '—'}</Text>
            <Text style={styles.cardMeta}>Nr ew.: {tool.inventory_number || tool.code || tool.barcode || tool.qr_code || '—'}</Text>
            <Text style={styles.cardMeta}>SKU: {tool.sku || '—'} • Kategoria: {tool.category || '—'}</Text>
            {toolDetails && toolDetails.issues && (
              <>
                <View style={{ height: 8 }} />
                <Text style={[styles.cardMeta, { color: '#111827' }]}>Aktywne wydania: {toolDetails.issues.length}</Text>
              </>
            )}
            <View style={{ height: 8 }} />
            <Pressable onPress={() => setDropdownOpen((v)=>!v)} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}>
              <Text style={styles.btnText}>{selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : 'Wybierz pracownika'}</Text>
            </Pressable>
            {dropdownOpen && (
              <View style={{ marginTop: 8 }}>
                {employeesLoading ? <Text style={{ color: '#6b7280' }}>Ładowanie pracowników…</Text> : null}
                {employees && employees.length > 0 ? (
                  employees.slice(0, 50).map((emp) => (
                    <Pressable key={emp.id} onPress={() => { setSelectedEmployee(emp); setDropdownOpen(false); }} style={[styles.card, { padding: 8 }]}> 
                      <Text style={{ color: '#111827' }}>{emp.first_name} {emp.last_name} {emp.brand_number ? `(${emp.brand_number})` : ''}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ color: '#6b7280' }}>Brak pracowników</Text>
                )}
              </View>
            )}
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable onPress={issueTool} disabled={!selectedEmployee} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, !selectedEmployee && styles.btnDisabled]}>
                <Text style={styles.btnText}>Wydaj</Text>
              </Pressable>
              <Pressable onPress={returnTool} disabled={!selectedEmployee} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed, !selectedEmployee && styles.btnDisabled]}>
                <Text style={styles.btnText}>Zwróć</Text>
              </Pressable>
            </View>
            {message ? (<Text style={{ color: '#16a34a', marginTop: 8 }}>{message}</Text>) : null}
            {error ? (<Text style={{ color: '#b91c1c', marginTop: 8 }}>{error}</Text>) : null}
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{error}</Text>
            <Pressable onPress={goAdd} style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}>
              <Text style={styles.btnText}>Dodaj</Text>
            </Pressable>
          </View>
        ) : null}


      </View>
      {/* Sekcja: lista aktywnych wydań do zwrotu */}
      <View style={styles.sectionBox}>
        <Text style={styles.sectionTitle}>Do zwrotu</Text>
        {returnListLoading ? (
          <Text style={{ color: '#6b7280' }}>Ładowanie…</Text>
        ) : returnListError ? (
          <Text style={{ color: '#b91c1c' }}>Błąd: {String(returnListError)}</Text>
        ) : (returnItems && returnItems.length > 0 ? (
          <View style={styles.returnList}>
            {returnItems.map((itm) => (
              <View 
                key={`${itm.id || itm.issue_id || itm.tool_id}-${itm.employee_id || 'emp'}`} 
                style={styles.returnItem}
              >
                <View style={styles.returnItemLeft}>
                  <Text style={styles.returnItemTitle}>{itm.tool_name || 'Narzędzie'}</Text>
                  <Text style={styles.returnItemMeta}>{itm.employee_name || '—'}</Text>
                  {itm.tool_code ? (
                    <View style={styles.codeChip}>
                      <Text style={styles.codeChipText}>{itm.tool_code}</Text>
                    </View>
                  ) : null}
                </View>
                {itm.tool_code ? (
                  <Pressable 
                    onPress={() => preAddByCode(itm.tool_code)} 
                    style={({ pressed }) => [
                      styles.primaryBtn, 
                      styles.smallBtn, 
                      pressed && styles.btnPressed
                    ]}
                  >
                    <View style={styles.btnRow}>
                      <Ionicons name="return-down-back" size={16} color="#fff" />
                      <Text style={styles.btnText}>Zwróć</Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#6b7280' }}>Brak aktywnych wydań do zwrotu.</Text>
        ))}
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
  reticleBox: { position: 'absolute', top: '28%', left: '12%', right: '12%', height: 180, borderWidth: 3, borderRadius: 12 },
  reticle: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
  scanHint: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
  scanHintText: { color: '#fff' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resultBox: { backgroundColor: '#fff', padding: 16 },
  card: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 10, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 6 },
  cardMeta: { color: '#6b7280' },
  primaryBtn: { backgroundColor: '#4f46e5', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  btnPressed: { backgroundColor: '#4338ca' },
  btnDisabled: { opacity: 0.5 },
  btnMuted: { backgroundColor: '#6b7280' },
  sectionBox: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 8 },
  returnList: { gap: 8 },
  returnItem: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  returnItemLeft: { flex: 1 },
  returnItemTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  returnItemMeta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  codeChip: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#eef2ff', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  codeChipText: { color: '#374151', fontWeight: '600' },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
 });