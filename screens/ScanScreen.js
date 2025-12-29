import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking, Vibration, Modal, ScrollView, TextInput, ActivityIndicator, Switch, Keyboard, TouchableWithoutFeedback } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import * as Haptics from 'expo-haptics'
import { showSnackbar } from '../lib/snackbar';
import { useTheme } from '../lib/theme';
import ThemedButton from '../components/ThemedButton';
import DateField from '../components/DateField';

export default function ScanScreen() {
  const { colors } = useTheme();
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
  const [scanFrameColor, setScanFrameColor] = useState(colors.muted); // default gray
  const [toolDetails, setToolDetails] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
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

  // Modal „Dodaj” z zakładkami
  const [addVisible, setAddVisible] = useState(false);
  const [addTab, setAddTab] = useState('tool'); // 'tool' | 'bhp'
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [addToolFields, setAddToolFields] = useState({
    name: '',
    sku: '',
    inventory_number: '',
    serial_number: '',
    serial_unreadable: false,
    category: '',
    status: 'dostępne',
    location: '',
    quantity: '1'
  });
  // Prefix dla SKU z konfiguracji + walidacje konfliktów
  const [toolsCodePrefix, setToolsCodePrefix] = useState('');
  const [skuConflict, setSkuConflict] = useState('');
  const [invConflict, setInvConflict] = useState('');
  const prevSkuConflictRef = useRef('');
  const prevInvConflictRef = useRef('');
  const [skuDirty, setSkuDirty] = useState(false);
  const [invDirty, setInvDirty] = useState(false);
  // Przełącznik: zastosuj globalny prefix do SKU (widocznie w polu)
  const [applySkuPrefix, setApplySkuPrefix] = useState(false);
  // Kategorie z bazy dla selektora
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [showCatSelect, setShowCatSelect] = useState(false);
  const [addBhpFields, setAddBhpFields] = useState({
    manufacturer: '',
    model: '',
    serial_number: '',
    catalog_number: '',
    inventory_number: '',
    production_date: '',
    inspection_date: '',
    harness_start_date: '',
    status: 'dostępne',
    location: '',
    assigned_employee: '',
    shock_absorber: false,
    srd_device: false,
  });

  const setAddToolField = (key, val) => setAddToolFields(prev => ({ ...prev, [key]: val }));
  const setAddBhpField = (key, val) => setAddBhpFields(prev => ({ ...prev, [key]: val }));

  // SKU bez globalnego prefixu: użyj wartości wpisanej lub wygeneruj losową
  const normalizeSkuWithPrefix = (baseSku, prefix) => {
    const base = String(baseSku || '').trim();
    const p = String(prefix || '').trim();
    if (!base) return '';
    if (!p) return base;
    if (base.startsWith(`${p}-`)) return base;
    if (base.startsWith(p)) return `${p}-${base.slice(p.length)}`;
    return `${p}-${base}`;
  };
  const stripSkuPrefix = (value, prefix) => {
    const v = String(value || '').trim();
    const p = String(prefix || '').trim();
    if (!p) return v;
    if (v.startsWith(`${p}-`)) return v.slice(p.length + 1);
    if (v.startsWith(p)) return v.slice(p.length);
    return v;
  };
  const generateSkuWithPrefix = () => {
    const current = String(addToolFields.sku || '').trim();
    const randomPart = Date.now().toString(36).toUpperCase().slice(-6);
    let next = current || randomPart;
    if (applySkuPrefix) {
      next = normalizeSkuWithPrefix(next, toolsCodePrefix);
    }
    setAddToolField('sku', next);
  };

  const normalizeDate = (value) => {
    try {
      if (!value) return '';
      const str = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      const m = str.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
      if (m) { const [, dd, mm, yyyy] = m; return `${yyyy}-${mm}-${dd}`; }
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m2 = String(d.getMonth() + 1).padStart(2, '0');
        const d2 = String(d.getDate()).padStart(2, '0');
        return `${y}-${m2}-${d2}`;
      }
      return str;
    } catch (_) { return String(value || ''); }
  };

  // Tłumaczenie znanych komunikatów błędów z backendu na polski
  const translateErrorMessage = (msg) => {
    const raw = String(msg || '').trim();
    if (!raw) return raw;
    // "Insufficient quantity available. Available: X, requested: Y"
    const r = raw.match(/^Insufficient quantity available\. Available:\s*(\d+),\s*requested:\s*(\d+)/i);
    if (r) {
      const [, available, requested] = r;
      return `Niewystarczająca ilość dostępna. Dostępne: ${available}, żądane: ${requested}`;
    }
    if (/^Insufficient quantity available/i.test(raw)) {
      return 'Niewystarczająca ilość dostępna';
    }
    return raw;
  };

  // Bottom sheet dla kafelka „Do zwrotu” (Android: otwarty domyślnie)
  const [showReturnSheet, setShowReturnSheet] = useState(Platform.OS === 'android');
  const openReturnSheet = () => { setShowReturnSheet(true); };
  const closeReturnSheet = () => { setShowReturnSheet(false); };
  const [returnSheetIndex, setReturnSheetIndex] = useState(Platform.OS === 'android' ? 0 : 1);

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
        const endpointOrder = [
          '/api/tool-issues',
          '/api/tool_issues',
          '/api/tool-issues?limit=100',
          '/api/tool_issues?limit=100',
        ];
        for (const path of endpointOrder) {
          try {
            const resp = await api.get(path);
            const arr = toArray(resp);
            if (arr && arr.length) { rawIssues = arr; break; }
          } catch {}
        }
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
  const preAddByCode = async (code, empId, empName) => {
    const val = String(code || '').trim();
    if (!val) return;
    const isDup = scannedItems.some((it) => String(it.code) === val);
    if (isDup) { showDupNotice(); return; }
    try {
      const raw = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
      const res = Array.isArray(raw) ? raw[0] : (raw?.data?.[0] || raw?.items?.[0] || raw);
      if (res && res.id) {
        let det = null; try { det = await api.get(`/api/tools/${res.id}/details`); } catch {}
        setScannedItems((prev) => [...prev, { code: val, tool: res || null, details: det || null }]);
        setMultiScan(true);
        if (empId) {
          const found = employees.find((e) => String(e.id) === String(empId));
          if (found) {
            setSelectedEmployee(found);
          } else {
            const nm = String(empName || '').trim();
            const parts = nm ? nm.split(' ') : [];
            const first = parts[0] || '';
            const last = parts.slice(1).join(' ') || '';
            setSelectedEmployee({ id: empId, first_name: first, last_name: last });
            try {
              setEmployeesLoading(true);
              const list = await api.get('/api/employees');
              const items = list?.items || list || [];
              setEmployees(Array.isArray(items) ? items : []);
            } catch {} finally { setEmployeesLoading(false); }
          }
        }
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
      showSnackbar(msg, { type: 'warn', duration: 1500 });
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
        const raw = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
        const res = Array.isArray(raw) ? raw[0] : (raw?.data?.[0] || raw?.items?.[0] || raw);
        if (res && res.id) {
          setScanFrameColor(colors.success);
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
          setScanFrameColor(colors.danger);
          setError(`Nie ma takiego narzędzia w systemie o numerze: ${val}`);
        }
      } catch (e) {
        setScanFrameColor(colors.danger);
        setError(`Nie ma takiego narzędzia w systemie o numerze: ${val}`);
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
        const raw = await api.get(`/api/tools/search?code=${encodeURIComponent(val)}`);
        const res = Array.isArray(raw) ? raw[0] : (raw?.data?.[0] || raw?.items?.[0] || raw);
        setTool(res || null);
        if (res && res.id) {
          setScanFrameColor(colors.success);
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
          setScanFrameColor(colors.danger);
          setError(`Nie ma takiego narzędzia w systemie o numerze: ${val}`);
        }
      } catch (e) {
        setTool(null);
        setScanFrameColor(colors.danger);
        setError(`Nie ma takiego narzędzia w systemie o numerze: ${val}`);
      }
    }
  };

  // Funkcja resetująca skaner po udanej akcji
  const resetScanner = () => {
    handlerRef.current = false;
    setScanned(false);
    setScanFrameColor(colors.muted);
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
      try { showSnackbar(`Pomyślnie wydano ${ok} z ${sumTotal} narzędzi`, { type: 'success', duration: 1800 }); } catch {}
    } catch (e) {
      setError(translateErrorMessage(e?.message) || 'Nie udało się wykonać zbiorczej operacji');
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
      try {
        showSnackbar(`Pomyślnie przyjęto ${ok} z ${sumTotal} narzędzi`, { type: 'success', duration: 1800 });
      } catch {}
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
      try { showSnackbar('Pomyślnie wydano narzędzie', { type: 'success', duration: 1800 }); } catch {}
      try { await loadReturnList(); } catch {}
      setTimeout(resetScanner, 1500);
    } catch (e) {
      setError(translateErrorMessage(e?.message) || 'Nie udało się wydać narzędzia');
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
      try { showSnackbar('Pomyślnie zwrócono narzędzie', { type: 'success', duration: 1800 }); } catch {}
      try { await loadReturnList(); } catch {}
      setTimeout(resetScanner, 1200);
    } catch (e) {
      setError(translateErrorMessage(e?.message) || 'Nie udało się przyjąć narzędzia');
    }
  };

  // Stub, aby uniknąć błędu przy przycisku "Dodaj"
  const goAdd = () => {
    setAddError('');
    // Prefill nr ewidencyjny bieżącym kodem (jeśli dostępny)
    const code = String(codeValue || '').trim();
    // Dla narzędzi: skanowany kod wstaw do SKU, nie do nr ewidencyjnego
    const pfx = String(toolsCodePrefix || '').trim();
    const initialSku = applySkuPrefix ? normalizeSkuWithPrefix(code, pfx) : stripSkuPrefix(code, pfx);
    setAddToolFields(prev => ({ ...prev, sku: prev.sku || initialSku }));
    setAddBhpFields(prev => ({ ...prev, inventory_number: prev.inventory_number || code }));
    // Programatyczna zmiana — nie traktuj jako ręczną edycję
    setSkuDirty(false);
    setInvDirty(false);
    // Pobierz listę kategorii z API do selektora
    (async () => {
      try {
        setCategoriesLoading(true);
        await api.init();
        const list = await api.get('/api/categories');
        const names = Array.isArray(list)
          ? list.map((c) => (c?.name || c?.category_name || (typeof c === 'string' ? c : ''))).filter(Boolean)
          : [];
        setCategoryOptions(names);
        // Pobraj również prefix kodów narzędzi
        try {
          const g = await api.get('/api/config/general');
          const p = g?.toolsCodePrefix || g?.tools_code_prefix || '';
          setToolsCodePrefix(String(p || ''));
        } catch {}
      } catch (e) {
        setCategoryOptions([]);
      } finally {
        setCategoriesLoading(false);
      }
    })();
    setAddVisible(true);
  };

  // Auto-uzupełnienie SKU, gdy puste po otwarciu modala lub zmianie kategorii/prefixu
  useEffect(() => {
    if (!addVisible || addTab !== 'tool') return;
    const current = String(addToolFields.sku || '').trim();
    if (!current) {
      generateSkuWithPrefix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addVisible, addTab, addToolFields.category, toolsCodePrefix]);

  // Walidacja konfliktu SKU podczas wpisywania (debounce)
  useEffect(() => {
    if (!addVisible || addTab !== 'tool') return;
    if (!skuDirty) return; // Waliduj konflikt SKU tylko przy ręcznej edycji
    const timer = setTimeout(async () => {
      try {
        await api.init();
        const raw = String(addToolFields.sku || '').trim();
        const p = String(toolsCodePrefix || '').trim();
        const norm = applySkuPrefix ? normalizeSkuWithPrefix(raw, p) : stripSkuPrefix(raw, p);
        if (!norm) { setSkuConflict(''); prevSkuConflictRef.current = ''; return; }
        const resp = await api.get(`/api/tools?sku=${encodeURIComponent(norm)}`);
        const arr = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : []);
        if (arr && arr.length > 0) {
          const msg = 'Narzędzie o tym SKU już istnieje';
          if (prevSkuConflictRef.current !== msg) {
            try { showSnackbar(msg, { type: 'warn' }); } catch {}
            prevSkuConflictRef.current = msg;
          }
          setSkuConflict(msg);
        } else {
          setSkuConflict('');
          if (prevSkuConflictRef.current) prevSkuConflictRef.current = '';
        }
      } catch { setSkuConflict(''); if (prevSkuConflictRef.current) prevSkuConflictRef.current = ''; }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addVisible, addTab, addToolFields.sku, toolsCodePrefix, applySkuPrefix, skuDirty]);

  // Walidacja konfliktu Nr ewidencyjnego podczas wpisywania (debounce)
  useEffect(() => {
    if (!addVisible || addTab !== 'tool') return;
    if (!invDirty) return; // Waliduj konflikt Nr ewidencyjnego tylko przy ręcznej edycji
    const timer = setTimeout(async () => {
      try {
        await api.init();
        const inv = String(addToolFields.inventory_number || '').trim();
        if (!inv) { setInvConflict(''); prevInvConflictRef.current = ''; return; }
        const resp = await api.get(`/api/tools?inventory_number=${encodeURIComponent(inv)}`);
        const arr = Array.isArray(resp) ? resp : (Array.isArray(resp?.data) ? resp.data : []);
        if (arr && arr.length > 0) {
          const msg = 'Numer ewidencyjny jest już używany';
          if (prevInvConflictRef.current !== msg) {
            try { showSnackbar(msg, { type: 'warn' }); } catch {}
            prevInvConflictRef.current = msg;
          }
          setInvConflict(msg);
        } else {
          setInvConflict('');
          if (prevInvConflictRef.current) prevInvConflictRef.current = '';
        }
      } catch { setInvConflict(''); if (prevInvConflictRef.current) prevInvConflictRef.current = ''; }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addVisible, addTab, addToolFields.inventory_number, invDirty]);

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <Pressable onPress={() => { resetScanner(); try { showSnackbar('Odświeżono skanowanie', { type: 'success' }); } catch {} }} style={styles.reloadBtn}>
          <Ionicons name="reload" size={25} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={25} color={colors.text} />
        </Pressable>
        <ThemedButton onPress={() => setMultiScan((v)=>!v)} title={multiScan ? 'Wielo-skan ON' : 'Wielo-skan OFF'} variant={multiScan ? 'success' : 'secondary'} style={{ position: 'absolute', left: 16, height: 32, minWidth: 120 }} textStyle={{ fontSize: 13 }} />
      </View>

      {/* Podgląd kamery / skanera */}
      {Platform.OS === 'web' ? (
        <View style={styles.scannerBox}>
          <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }]}>
            <Text style={{ color: colors.text }}>Skanowanie dostępne na urządzeniach mobilnych</Text>
          </View>
        </View>
      ) : hasPermission === false ? (
        <View style={styles.centerBox}>
          <Text style={{ color: colors.text }}>Brak uprawnień do kamery</Text>
          <View style={{ height: 8 }} />
          <ThemedButton onPress={requestCamPermission} title="Nadaj dostęp" variant="primary" style={{ minWidth: 150 }} />
          {!canAskAgain && (
            <>
              <View style={{ height: 8 }} />
              <ThemedButton onPress={() => { try { Linking.openSettings(); } catch {} }} title="Otwórz ustawienia" variant="secondary" style={{ minWidth: 150 }} />
            </>
          )}
          {cameraModuleError ? (
            <>
              <View style={{ height: 8 }} />
              <Text style={{ color: colors.danger }}>{cameraModuleError}</Text>
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
          <View style={styles.reticle}></View>
          <View style={styles.scanHint}><Text style={styles.scanHintText}>{scanned ? 'Przetwarzam…' : 'Zeskanuj kod'}</Text></View>
        </View>
      ) : (
        <View style={styles.centerBox}><Text style={{ color: colors.text }}>{cameraModuleError || 'Ładowanie skanera…'}</Text></View>
      )}

      {/* Wynik / akcje */}
      <View style={[styles.resultBox, { backgroundColor: colors.bg }]}>
        {multiScan && scannedItems.length > 0 ? (
          <View style={{ marginBottom: 36 }}>
            {dupInfo ? (<Text style={{ color: colors.muted }}>{dupInfo}</Text>) : null}
            <Text style={{ color: colors.text, fontWeight: '700' }}>Zeskanowane: {scannedItems.length}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {scannedItems.map((it) => (
                <View key={it.code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{it.code}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable onPress={() => decrementQty(it.code)} style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.border, borderRadius: 6 }}>
                      <Text style={{ color: colors.text }}>-</Text>
                    </Pressable>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{it.qty || 1}</Text>
                    <Pressable onPress={() => incrementQty(it.code)} style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.border, borderRadius: 6 }}>
                      <Text style={{ color: colors.text }}>+</Text>
                    </Pressable>
                  </View>
                  <Pressable onPress={() => removeCode(it.code)} style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.danger, borderRadius: 6 }}>
                    <Text style={{ color: '#fff' }}>x</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={clearScannedList} title="Wyczyść listę" variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={issueAll} disabled={!selectedEmployee} title="Wydaj wszystkie" variant="primary" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={returnAll} disabled={!selectedEmployee} title="Zwróć wszystkie" variant="primary" />
              </View>
            </View>
          </View>
        ) : null}
        {tool ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{tool.name || tool.tool_name || '—'}</Text>
              </View>
              <Pressable onPress={resetScanner} hitSlop={10} style={{ padding: 4, marginLeft: 8 }}>
                <Ionicons name="close-outline" size={24} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>Nr ew.: {tool.inventory_number || tool.code || tool.barcode || tool.qr_code || '—'}</Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>SKU: {tool.sku || '—'}</Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>Kategoria: {tool.category || '—'}</Text>
            {toolDetails && toolDetails.issues && (
              <>
                <View style={{ height: 8 }} />
                <Text style={[styles.cardMeta, { color: colors.text }]}>Aktywne wydania: {toolDetails.issues.length}</Text>
              </>
            )}
            <View style={{ height: 8 }} />
            <View style={{ position: 'relative' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card }}>
                <Ionicons name="search" size={20} color={colors.muted} style={{ marginLeft: 10 }} />
                <TextInput
                  style={{ flex: 1, padding: 10, color: colors.text }}
                  placeholder="Szukaj pracownika (imię, nazwisko, nr marki)"
                  placeholderTextColor={colors.muted}
                  value={employeeSearch}
                  onFocus={() => setDropdownOpen(true)}
                  onChangeText={(text) => {
                    setEmployeeSearch(text);
                    setDropdownOpen(true);
                    if (selectedEmployee) setSelectedEmployee(null);
                  }}
                />
                {employeeSearch.length > 0 && (
                  <Pressable onPress={() => { setEmployeeSearch(''); setSelectedEmployee(null); }} style={{ padding: 10 }}>
                    <Ionicons name="close-circle" size={20} color={colors.muted} />
                  </Pressable>
                )}
              </View>
              
              {dropdownOpen && (
                <View style={{ marginTop: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card, maxHeight: 250 }}>
                   {employeesLoading ? (
                     <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Ładowanie pracowników…</Text></View>
                   ) : (
                     <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={{ padding: 4 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                       {(() => {
                         const filtered = employees.filter(e => {
                           const term = employeeSearch.toLowerCase();
                           const full = `${e.first_name} ${e.last_name} ${e.brand_number || ''}`.toLowerCase();
                           return full.includes(term);
                         });
                         
                         if (filtered.length === 0) {
                           return <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Brak wyników</Text></View>;
                         }

                         return filtered.map((emp) => (
                           <Pressable 
                             key={emp.id} 
                             onPress={() => { 
                               setSelectedEmployee(emp); 
                               setEmployeeSearch(`${emp.first_name} ${emp.last_name} ${emp.brand_number ? `(${emp.brand_number})` : ''}`);
                               setDropdownOpen(false); 
                               Keyboard.dismiss();
                             }} 
                             style={({pressed}) => ({ 
                               padding: 10, 
                               backgroundColor: pressed ? colors.border : 'transparent',
                               borderRadius: 4
                             })}
                           > 
                             <Text style={{ color: colors.text }}>{emp.first_name} {emp.last_name} {emp.brand_number ? `(${emp.brand_number})` : ''}</Text>
                           </Pressable>
                         ));
                       })()}
                     </ScrollView>
                   )}
                </View>
              )}
            </View>
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={issueTool} disabled={!selectedEmployee} title="Wydaj" variant="primary" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={returnTool} disabled={!selectedEmployee} title="Zwróć" variant="primary" />
              </View>
            </View>
            {message ? (<Text style={{ color: colors.success, marginTop: 8 }}>{message}</Text>) : null}
            {error ? (<Text style={{ color: colors.danger, marginTop: 8 }}>{error}</Text>) : null}
          </View>
        ) : error ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{error}</Text>
            <ThemedButton onPress={goAdd} title="Dodaj" variant="primary" />
          </View>
        ) : null}
      </View>

      {/* Modal dodawania: zakładki Narzędzie / Sprzęt BHP */}
      <Modal visible={!!addVisible} animationType="slide" transparent onRequestClose={() => setAddVisible(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={[styles.modalCard, { backgroundColor: colors.card || '#fff', borderColor: colors.border || '#eee' }]}> 
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Dodaj</Text>
              <Pressable onPress={() => setAddVisible(false)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}> 
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* Zakładki */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={() => setAddTab('tool')} title="Dodaj narzędzie" variant={addTab === 'tool' ? 'primary' : 'outline'} style={{ height: 40, marginVertical: 0 }} textStyle={{ fontSize: 14 }} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedButton onPress={() => setAddTab('bhp')} title="Dodaj sprzęt BHP" variant={addTab === 'bhp' ? 'primary' : 'outline'} style={{ height: 40, marginVertical: 0 }} textStyle={{ fontSize: 14 }} />
              </View>
            </View>

            {addError ? <Text style={{ color: colors.danger || '#e11d48', marginBottom: 6 }}>{addError}</Text> : null}

            {addTab === 'tool' ? (
              <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>Nazwa *</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={addToolFields.name} onChangeText={(v) => setAddToolField('name', v)} placeholder="np. Wiertarka" placeholderTextColor={colors.muted} />
                </View>
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>SKU</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={addToolFields.sku}
                    onChangeText={(v) => {
                      setSkuDirty(true);
                      const p = String(toolsCodePrefix || '').trim();
                      const next = applySkuPrefix ? normalizeSkuWithPrefix(v, p) : stripSkuPrefix(v, p);
                      setAddToolField('sku', next);
                    }}
                    placeholder="np. D-1234"
                    placeholderTextColor={colors.muted}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Switch
                      value={!!applySkuPrefix}
                      disabled={!String(toolsCodePrefix || '').trim()}
                      onValueChange={(v) => {
                        const p = String(toolsCodePrefix || '').trim();
                        setApplySkuPrefix(!!v);
                        const current = String(addToolFields.sku || '').trim();
                        const next = v ? normalizeSkuWithPrefix(current, p) : stripSkuPrefix(current, p);
                        setAddToolField('sku', next);
                      }}
                    />
                    <Text style={{ color: colors.muted }}>Zastosuj prefix</Text>
                  </View>
                  {skuConflict ? <Text style={{ color: colors.danger || '#e11d48', marginTop: 4 }}>{skuConflict}</Text> : null}
                </View>
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>Nr ewidencyjny</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={addToolFields.inventory_number} onChangeText={(v) => { setInvDirty(true); setAddToolField('inventory_number', v); }} placeholder="np. 2024-0001" placeholderTextColor={colors.muted} />
                  {invConflict ? <Text style={{ color: colors.danger || '#e11d48', marginTop: 4 }}>{invConflict}</Text> : null}
                </View>
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>Numer fabryczny *</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={addToolFields.serial_number}
                    onChangeText={(v) => setAddToolField('serial_number', v)}
                    placeholder="np. SN-987654"
                    placeholderTextColor={colors.muted}
                    editable={!addToolFields.serial_unreadable}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Switch value={!!addToolFields.serial_unreadable} onValueChange={(v) => setAddToolField('serial_unreadable', !!v)} />
                    <Text style={{ color: colors.muted }}>Numer nieczytelny</Text>
                  </View>
                </View>
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>Kategoria *</Text>
                  <Pressable onPress={() => setShowCatSelect((v)=>!v)} style={({ pressed }) => [styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.9 }]}>
                    <Text style={{ color: addToolFields.category ? colors.text : colors.muted }}>
                      {addToolFields.category || (categoriesLoading ? 'Ładowanie kategorii…' : 'Wybierz kategorię')}
                    </Text>
                    <Text style={{ color: colors.muted }}>{showCatSelect ? '▲' : '▼'}</Text>
                  </Pressable>
                  {showCatSelect ? (
                    <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}> 
                      <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        {(categoryOptions || []).map((name) => {
                          const selected = String(name) === String(addToolFields.category);
                          return (
                            <Pressable key={`cat-${String(name)}`} onPress={() => { setAddToolField('category', name); setShowCatSelect(false); }} style={({ pressed }) => [styles.dropdownItem, selected && { backgroundColor: 'rgba(99,102,241,0.12)' }, pressed && { opacity: 0.7 }]}> 
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: colors.text }}>{name}</Text>
                                {selected ? <Text style={{ color: colors.primary }}>✓</Text> : null}
                              </View>
                            </Pressable>
                          );
                        })}
                        {(categoryOptions || []).length === 0 && !categoriesLoading ? (
                          <View style={{ padding: 8 }}><Text style={{ color: colors.muted }}>Brak kategorii</Text></View>
                        ) : null}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
                {/* Status: ukryty w UI, wysyłamy domyślnie "dostępne" */}
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>Lokalizacja</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={addToolFields.location} onChangeText={(v) => setAddToolField('location', v)} placeholder="np. Magazyn A" placeholderTextColor={colors.muted} />
                </View>
                <View style={styles.formRow}>
                  <Text style={[styles.formLabel, { color: colors.muted }]}>Ilość</Text>
                  <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} value={addToolFields.quantity} onChangeText={(v) => setAddToolField('quantity', v)} placeholder="1" keyboardType="numeric" placeholderTextColor={colors.muted} />
                </View>
              </ScrollView>
            ) : (
              <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={{ color: colors.muted }}>Nr ewidencyjny *</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr ewidencyjny" value={addBhpFields.inventory_number} onChangeText={(v) => setAddBhpField('inventory_number', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Producent</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Producent" value={addBhpFields.manufacturer} onChangeText={(v) => setAddBhpField('manufacturer', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Model</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Model" value={addBhpFields.model} onChangeText={(v) => setAddBhpField('model', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Numer seryjny</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer seryjny" value={addBhpFields.serial_number} onChangeText={(v) => setAddBhpField('serial_number', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Numer katalogowy</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer katalogowy" value={addBhpFields.catalog_number} onChangeText={(v) => setAddBhpField('catalog_number', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Data produkcji (szelek)</Text>
                <DateField value={addBhpFields.production_date} onChange={(v) => setAddBhpField('production_date', v)} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

                <Text style={{ color: colors.muted }}>Data przeglądu</Text>
                <DateField value={addBhpFields.inspection_date} onChange={(v) => setAddBhpField('inspection_date', v)} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

                <Text style={{ color: colors.muted }}>Data rozpoczęcia użytkowania</Text>
                <DateField value={addBhpFields.harness_start_date} onChange={(v) => setAddBhpField('harness_start_date', v)} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

                <Text style={{ color: colors.muted }}>Zestaw</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text }}>Amortyzator</Text>
                  <Switch value={addBhpFields.shock_absorber} onValueChange={(v) => setAddBhpField('shock_absorber', v)} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text }}>Urządzenie samohamowne</Text>
                  <Switch value={addBhpFields.srd_device} onValueChange={(v) => setAddBhpField('srd_device', v)} />
                </View>

                <Text style={{ color: colors.muted }}>Status</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Status" value={addBhpFields.status} onChangeText={(v) => setAddBhpField('status', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Lokalizacja</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Lokalizacja" value={addBhpFields.location} onChangeText={(v) => setAddBhpField('location', v)} placeholderTextColor={colors.muted} />

                <Text style={{ color: colors.muted }}>Przypisany pracownik</Text>
                <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Imię i nazwisko" value={addBhpFields.assigned_employee} onChangeText={(v) => setAddBhpField('assigned_employee', v)} placeholderTextColor={colors.muted} />
              </ScrollView>
            )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <View style={{ width: 100 }}>
                    <ThemedButton
                      title="Anuluj"
                      onPress={() => setAddVisible(false)}
                      disabled={addSaving}
                      variant="secondary"
                    />
                  </View>
                  <View style={{ width: 100 }}>
                    <ThemedButton
                      title="Zapisz"
                      onPress={async () => {
                        setAddError('');
                        setAddSaving(true);
                        try {
                          await api.init();
                          if (addTab === 'tool') {
                            const name = String(addToolFields.name || '').trim();
                            if (!name) { setAddError('Podaj nazwę narzędzia'); setAddSaving(false); return; }
                            // SKU zgodnie z przełącznikiem: z prefixem gdy włączony, bez prefixu gdy wyłączony
                            const rawSkuInput = String(addToolFields.sku || '').trim();
                            const pfx = String(toolsCodePrefix || '').trim();
                            const finalSku = applySkuPrefix ? normalizeSkuWithPrefix(rawSkuInput, pfx) : stripSkuPrefix(rawSkuInput, pfx);
                            const payload = {
                              name,
                              sku: finalSku || undefined,
                              inventory_number: String(addToolFields.inventory_number || '').trim() || undefined,
                              serial_number: String(addToolFields.serial_number || '').trim() || undefined,
                              serial_unreadable: !!addToolFields.serial_unreadable,
                              category: String(addToolFields.category || '').trim() || undefined,
                              status: 'dostępne',
                              location: String(addToolFields.location || '').trim() || undefined,
                              quantity: Number(String(addToolFields.quantity || '1').replace(/\D+/g, '')) || 1,
                              barcode: finalSku || undefined,
                              qr_code: finalSku || undefined,
                            };
                            const res = await api.post('/api/tools', payload);
                            const created = Array.isArray(res?.data) ? (res.data[0] || null) : (res?.data || res || null);
                            if (!created) throw new Error('Błąd tworzenia narzędzia');
                            try { showSnackbar('Dodano narzędzie', { type: 'success' }); } catch {}
                            setTool(created);
                            setAddVisible(false);
                          } else {
                        const payload = {
                          ...addBhpFields,
                          production_date: normalizeDate(addBhpFields.production_date),
                          inspection_date: normalizeDate(addBhpFields.inspection_date),
                          harness_start_date: normalizeDate(addBhpFields.harness_start_date),
                          is_set: !!(addBhpFields.shock_absorber || addBhpFields.srd_device),
                          has_shock_absorber: !!addBhpFields.shock_absorber,
                          has_srd: !!addBhpFields.srd_device,
                        };
                        const res = await api.post('/api/bhp', payload);
                        const created = Array.isArray(res?.data) ? res.data[0] : (res?.data || res);
                        if (!created) throw new Error('Błąd dodawania BHP');
                        try { showSnackbar('Dodano sprzęt BHP', { type: 'success' }); } catch {}
                        setAddVisible(false);
                      }
                    } catch (e) {
                      setAddError(e?.message || 'Nie udało się zapisać');
                    } finally {
                      setAddSaving(false);
                    }
                  }}
                  disabled={addSaving}
                  loading={addSaving}
                  variant="primary"
                />
              </View>
            </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

      {Platform.OS !== 'web' && showReturnSheet ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
          <BottomSheet
            style={{ zIndex: 100, elevation: 100 }}
            index={returnSheetIndex}
            snapPoints={Platform.OS === 'android' ? [36, '30%', '70%', '100%'] : ['30%', '70%', '100%']}
            enablePanDownToClose={false}
            enableHandlePanningGesture={true}
            enableContentPanningGesture={true}
            handleStyle={{ paddingVertical: 8 }}
            handleIndicatorStyle={{ backgroundColor: colors.muted, width: 48, height: 6, borderRadius: 999, alignSelf: 'center' }}
            backgroundStyle={{ backgroundColor: colors.card }}
            onClose={closeReturnSheet}
            onChange={(i) => setReturnSheetIndex(i)}
          >
            <BottomSheetScrollView contentContainerStyle={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>Do zwrotu</Text>
              </View>

              {returnListLoading ? (
                <Text style={{ color: colors.muted }}>Ładowanie…</Text>
              ) : returnListError ? (
                <Text style={{ color: colors.danger }}>Błąd: {String(returnListError)}</Text>
              ) : (returnItems && returnItems.length > 0 ? (
                returnItems.map((itm) => (
                  <View key={`ret-native-${itm.id || itm.issue_id || itm.tool_id}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{itm.tool_name || itm.name || 'Narzędzie'}</Text>
                      {itm.employee_name ? (<Text style={{ color: colors.muted }}>{itm.employee_name}</Text>) : null}
                      {itm.tool_code ? (<Text style={{ color: colors.muted }}>Kod: {itm.tool_code}</Text>) : null}
                      <Text style={{ color: colors.muted }}>Ilość: {itm.quantity || 1}</Text>
                    </View>
                    {itm.tool_code ? (
                      <ThemedButton onPress={() => preAddByCode(itm.tool_code, itm.employee_id, itm.employee_name)} title="Szybki zwrot" variant="primary" style={{ height: 36, paddingVertical: 0, paddingHorizontal: 12, minWidth: 100 }} textStyle={{ fontSize: 13 }} />
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={{ color: colors.muted }}>Brak aktywnych wydań do zwrotu.</Text>
              ))}
            </BottomSheetScrollView>
          </BottomSheet>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#000' },
  header: { height: 48, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  reloadBtn: { position: 'absolute', right: 50, top: 12 },
  closeBtn: { position: 'absolute', right: 16, top: 12 },
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
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', backgroundColor: '#f9fafb'},
  returnList: { gap: 8 },
  returnItem: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  returnItemLeft: { flex: 1 },
  returnItemTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  returnItemMeta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  codeChip: { alignSelf: 'flex-start', marginTop: 6, backgroundColor: '#eef2ff', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  codeChipText: { color: '#374151', fontWeight: '600' },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  tabBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: {},
  tabBtnInactive: { borderWidth: 1 },
  formRow: { marginBottom: 0 },
  formLabel: { marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  dropdown: { borderWidth: 1, borderRadius: 8, marginTop: 6 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
 });
