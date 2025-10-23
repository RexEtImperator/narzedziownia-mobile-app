import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, ScrollView, Alert, Platform, Switch, Share, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';
import * as Haptics from 'expo-haptics'
import { isAdmin } from '../lib/utils';

export default function InventoryScreen() {
  const { colors } = useTheme();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  // Pole notatek dla sesji
  const [newNotes, setNewNotes] = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [scanCode, setScanCode] = useState('');
  const [scanQty, setScanQty] = useState('1');
  const [scanning, setScanning] = useState(false);
  // Status skanowania zliczeń sesji
  const [scanStatus, setScanStatus] = useState('');
  const [scanError, setScanError] = useState('');
  const [lastScanTool, setLastScanTool] = useState(null);
  const [differences, setDifferences] = useState([]);
  const [history, setHistory] = useState({ counts: [], corrections: [] });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  // Filtry różnic + eksport
  const [diffSearch, setDiffSearch] = useState('');
  const [diffMinAbs, setDiffMinAbs] = useState('0');
  const [csvExporting, setCsvExporting] = useState(false);
  // Filtr korekt
  const [corrShowPendingOnly, setCorrShowPendingOnly] = useState(false);
  const [autoAcceptCorrections, setAutoAcceptCorrections] = useState(false);
  // Ostatnie, świeżo zaakceptowane korekty (60s)
  const [recentCorrections, setRecentCorrections] = useState([]);
  const [corrModalVisible, setCorrModalVisible] = useState(false);
  const [corrSubmitting, setCorrSubmitting] = useState(false);
  const [corrReason, setCorrReason] = useState('');
  const [corrTool, setCorrTool] = useState(null);
  const [corrDiffQty, setCorrDiffQty] = useState('');
  const [corrCountedQty, setCorrCountedQty] = useState('');
  
  // Modal usunięcia korekty
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  // Stan magazynu (narzędzia) + filtry
  const [tools, setTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState('');
  const [invSearch, setInvSearch] = useState('');
  const [onlyConsumables, setOnlyConsumables] = useState(true);
  const [onlyBelowMin, setOnlyBelowMin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  // Skaner: stany
  const [showScanner, setShowScanner] = useState(false);
  const [hasCamPermission, setHasCamPermission] = useState(null);
  const [CameraViewComp, setCameraViewComp] = useState(null);
  const [cameraModuleError, setCameraModuleError] = useState('');
  const [scanTarget, setScanTarget] = useState(null);
  const [scanFrameColor, setScanFrameColor] = useState('#9ca3af');
  const [scanHintText, setScanHintText] = useState('Zeskanuj kod');
  const [scannedFlag, setScannedFlag] = useState(false);
  const [webScanInput, setWebScanInput] = useState('');
  
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { fontSize: 22, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.muted, marginTop: 4 },
    card: { margin: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.bg, color: colors.text },
    button: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: '#fff', fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 8 },
    error: { color: colors.danger },
    muted: { color: colors.muted },
    chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
    // Skaner (reticle)
    reticleBox: { position: 'absolute', top: '28%', left: '12%', right: '12%', height: 180, borderWidth: 3, borderRadius: 12 },
    reticle: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
    scanHint: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
    scanHintText: { color: '#fff' },
  });
  
  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const list = await api.get('/api/inventory/sessions');
      setSessions(Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : []));
    } catch (e) {
      setError(e?.message || 'Nie udało się pobrać sesji');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => { loadSessions(); }, []);
  
  // Wczytaj auto-akcept korekt z pamięci
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem('@inventory_auto_accept_v1');
        if (v != null) setAutoAcceptCorrections(String(v) === '1' || String(v).toLowerCase() === 'true');
      } catch {}
    })();
  }, []);
  
  // Przywracanie wyboru sesji z pamięci + auto-wybór aktywnej
  useEffect(() => {
    const restoreSelected = async () => {
      try {
        const sid = await AsyncStorage.getItem('@inventory_selected_session_id');
        if (sid && Array.isArray(sessions) && sessions.length) {
          const found = sessions.find(s => String(s.id) === String(sid));
          if (found) { setSelectedSession(found); return; }
        }
        if (!selectedSession && Array.isArray(sessions) && sessions.length) {
          const active = sessions.find(s => s.status === 'active');
          setSelectedSession(active || sessions[0]);
        }
      } catch {}
    };
    if (!selectedSession && sessions && sessions.length) restoreSelected();
  }, [sessions]);
  
  useEffect(() => {
    const loadMe = async () => {
      try { await api.init(); } catch {}
      try {
        const saved = await AsyncStorage.getItem('@current_user');
        const me = saved ? JSON.parse(saved) : null;
        setCurrentUser(me);
        setIsAdmin(isAdmin(me));
      } catch {
        setIsAdmin(false);
        setCurrentUser(null);
      }
    };
    loadMe();
  }, []);

  const createSession = async () => {
    const name = String(newName || '').trim();
    const notes = String(newNotes || '').trim();
    if (!name) { showSnackbar({ type: 'warn', text: 'Podaj nazwę sesji' }); return; }
    if (!isAdmin) { showSnackbar({ type: 'error', text: 'Wymagane uprawnienia administratora' }); return; }
    setCreating(true);
    try {
      await api.init();
      const res = await api.post(`/api/inventory/sessions`, { name, notes: notes || null });
      showSnackbar({ type: 'success', text: 'Utworzono sesję' });
      setNewName('');
      setNewNotes('');
      setSelectedSession(res || null);
      await loadSessions();
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się utworzyć sesji' });
    } finally {
      setCreating(false);
    }
  };
  
  const updateStatus = async (s, action) => {
    if (!isAdmin) { showSnackbar({ type: 'error', text: 'Wymagane uprawnienia administratora' }); return; }
    try {
      await api.init();
      const res = await api.put(`/api/inventory/sessions/${encodeURIComponent(s?.id)}/status`, { action });
      const text = action === 'pause' ? 'Wstrzymano' : (action === 'resume' ? 'Wznowiono' : 'Zakończono');
      showSnackbar({ type: 'success', text: `${text} sesję` });
      setSelectedSession(res || s);
      await loadSessions();
      await loadDetails(res?.id || s?.id);
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się zmienić statusu' });
    }
  };
  
  const deleteSession = async (s) => {
    if (!isAdmin) { showSnackbar({ type: 'error', text: 'Wymagane uprawnienia administratora' }); return; }
    // Blokada usuwania sesji nie-zakończonej
    if (String(s?.status) !== 'ended') {
      showSnackbar({ type: 'warn', text: 'Można usunąć tylko zakończoną sesję' });
      return;
    }
    Alert.alert('Usunąć sesję?', `${s?.name || ''}`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          await api.init();
          await api.delete(`/api/inventory/sessions/${encodeURIComponent(s?.id)}`);
          showSnackbar({ type: 'success', text: 'Usunięto sesję' });
          if (selectedSession?.id === s?.id) setSelectedSession(null);
          await loadSessions();
        } catch (e) {
          showSnackbar({ type: 'error', text: e?.message || 'Nie udało się usunąć sesji' });
        }
      } }
    ]);
  };
  
  const loadDetails = async (sessionId) => {
    if (!sessionId) return;
    setDetailsLoading(true);
    setDetailsError('');
    try {
      await api.init();
      const [diff, hist] = await Promise.all([
        api.get(`/api/inventory/sessions/${encodeURIComponent(sessionId)}/differences`),
        api.get(`/api/inventory/sessions/${encodeURIComponent(sessionId)}/history`),
      ]);
      setDifferences(Array.isArray(diff) ? diff : (Array.isArray(diff?.data) ? diff.data : []));
      setHistory({
        counts: Array.isArray(hist?.counts) ? hist.counts : [],
        corrections: Array.isArray(hist?.corrections) ? hist.corrections : [],
      });
    } catch (e) {
      setDetailsError(e?.message || 'Nie udało się pobrać szczegółów');
      setDifferences([]);
      setHistory({ counts: [], corrections: [] });
    } finally {
      setDetailsLoading(false);
    }
  };
  
  useEffect(() => { if (selectedSession?.id) loadDetails(selectedSession.id); }, [selectedSession?.id]);

  useEffect(() => {
    (async () => {
      try {
        if (selectedSession?.id) {
          await AsyncStorage.setItem('@inventory_selected_session_id', String(selectedSession.id));
        } else {
          await AsyncStorage.removeItem('@inventory_selected_session_id');
        }
      } catch {}
    })();
  }, [selectedSession?.id]);
  
  const scan = async () => {
    const code = normalizeCode(scanCode);
    const qty = Math.max(1, parseInt(String(scanQty || '1'), 10));
    if (!selectedSession?.id) { showSnackbar({ type: 'warn', text: 'Wybierz sesję' }); return; }
    if (!code) { showSnackbar({ type: 'warn', text: 'Podaj kod narzędzia' }); return; }
    setScanning(true);
    setScanStatus(''); setScanError('');
    try {
      await api.init();
      const res = await api.post(`/api/inventory/sessions/${encodeURIComponent(selectedSession.id)}/scan`, { code, quantity: qty });
      showSnackbar({ type: 'success', text: 'Dodano zliczenie' });
      setScanStatus('Dodano zliczenie');
      try { setLastScanTool(res?.tool || { name: res?.tool_name, code, qty }); } catch {}
      setScanCode('');
      setScanQty('1');
      await loadDetails(selectedSession.id);
      setTimeout(() => { setScanStatus(''); }, 4000);
    } catch (e) {
      setScanError(e?.message || 'Nie udało się dodać zliczenia');
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się dodać zliczenia' });
    } finally {
      setScanning(false);
    }
  };
  
  const setCount = async (toolId, qty) => {
    try {
      await api.init();
      const res = await api.put(`/api/inventory/sessions/${encodeURIComponent(selectedSession.id)}/counts/${encodeURIComponent(toolId)}`, { counted_qty: Math.max(0, parseInt(String(qty || '0'), 10)) });
      showSnackbar({ type: 'success', text: 'Zaktualizowano ilość' });
      await loadDetails(selectedSession.id);
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się ustawić ilości' });
    }
  };
  
  const openScanner = async (target) => {
    setScanTarget(target);
    setScanFrameColor('#9ca3af');
    setScanHintText('Zeskanuj kod');
    if (Platform.OS === 'web') {
      setCameraModuleError('');
      setScanHintText('Wpisz lub wklej kod');
      setWebScanInput('');
      setShowScanner(true);
      return;
    }
    try {
      const mod = await import('expo-camera');
      const { CameraView, Camera } = mod || {};
      if (CameraView && Camera?.requestCameraPermissionsAsync) {
        setCameraViewComp(() => CameraView);
        const res = await Camera.requestCameraPermissionsAsync();
        const granted = res?.granted || res?.status === 'granted';
        setHasCamPermission(granted);
        if (granted) {
          setCameraModuleError('');
          setShowScanner(true);
        } else {
          setCameraModuleError('Brak zgody na dostęp do kamery');
          setScanHintText('Przyznaj dostęp do kamery w ustawieniach');
          setShowScanner(true);
        }
      } else {
        setCameraModuleError('Moduł kamery niedostępny: expo-camera bez CameraView');
        setShowScanner(true);
      }
    } catch (e) {
      setCameraModuleError(`Moduł kamery niedostępny: ${e?.message || 'expo-camera'}`);
      setShowScanner(true);
    }
  };

  const normalizeCode = (s) => String(s || '').trim().replace(/\s+/g, '').toUpperCase();
  const normalizeText = (s) => String(s || '').trim().toLowerCase();

  const handleBarCodeScanned = ({ type, data }) => {
    if (scannedFlag) return;
    const val = normalizeCode(data);
    if (!val) return;
    setScannedFlag(true);
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setScanFrameColor('#22c55e');
    setScanHintText('Przetwarzam…');
    if (scanTarget === 'diff') setDiffSearch(val);
    else if (scanTarget === 'inv') setInvSearch(val);
    else if (scanTarget === 'count') {
      setScanCode(val);
      try { scan(); } catch {}
    }
    setTimeout(() => {
      setShowScanner(false);
      setScanTarget(null);
      setScannedFlag(false);
      setScanFrameColor('#9ca3af');
      setScanHintText('Zeskanuj kod');
    }, 220);
  };
  
  useEffect(() => {
    const id = setInterval(() => {
      setRecentCorrections(prev => prev.filter(rc => (Date.now() - rc.at) < 60000));
    }, 10000);
    return () => clearInterval(id);
  }, []);
  
  const addCorrection = async (toolId, differenceQty, reason = null, toolSkuOrCode = null) => {
    try {
      await api.init();
      const res = await api.post(`/api/inventory/sessions/${encodeURIComponent(selectedSession.id)}/corrections`, { tool_id: toolId, difference_qty: differenceQty, reason });
      showSnackbar({ type: 'success', text: 'Dodano korektę' });
      await loadDetails(selectedSession.id);
      if (autoAcceptCorrections && isAdmin && res?.id) {
        try { await acceptCorrection(res.id); } catch {}
        try { setRecentCorrections(prev => [...prev, { toolId, sku: toolSkuOrCode, at: Date.now(), sessionId: selectedSession?.id }]); } catch {}
      }
      return res;
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się dodać korekty' });
    }
  };
  
  const acceptCorrection = async (corrId) => {
    if (!isAdmin) { showSnackbar({ type: 'error', text: 'Wymagane uprawnienia administratora' }); return; }
    try {
      await api.init();
      await api.post(`/api/inventory/corrections/${encodeURIComponent(corrId)}/accept`, {});
      showSnackbar({ type: 'success', text: 'Zaakceptowano korektę' });
      await loadDetails(selectedSession.id);
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Wymagane uprawnienia administratora lub błąd' });
    }
  };
  
  const deleteCorrection = async (corrId) => {
    if (!isAdmin) { showSnackbar({ type: 'error', text: 'Wymagane uprawnienia administratora' }); return; }
    // Zastąpione przez modal potwierdzenia
    setDeleteTarget({ id: corrId });
    setDeleteModalVisible(true);
  };

  const openCorrectionModal = (diffItem) => {
    let tool = diffItem;
    if (!diffItem?.tool_id) {
      const keySku = diffItem?.code || diffItem?.tool_sku || diffItem?.registration_number || diffItem?.sku || null;
      const bySku = keySku ? tools.find(t => String(t?.sku || t?.code || t?.registration_number) === String(keySku)) : null;
      const byName = !bySku ? tools.find(t => String(t?.name || t?.tool_name) === String(diffItem?.name || diffItem?.tool_name)) : null;
      if (bySku || byName) {
        const match = bySku || byName;
        const foundId = match?.id || match?.tool_id;
        if (foundId) {
          tool = {
            // Preferuj wartości z diffItem (różnice, system_qty itd.)
            ...diffItem,
            tool_id: foundId,
            // Uzupełnij brakujące pola z dopasowanego narzędzia
            name: diffItem?.name || diffItem?.tool_name || match?.name || match?.tool_name,
            sku: diffItem?.sku || diffItem?.tool_sku || diffItem?.registration_number || diffItem?.code || match?.sku || match?.code || match?.registration_number || match?.tool_sku,
            counted_qty: diffItem?.counted_qty ?? match?.counted_qty,
            system_qty: diffItem?.system_qty ?? (typeof match?.quantity === 'number' ? match.quantity : diffItem?.system_qty),
          };
        }
      }
    }
    setCorrTool(tool);
    const initialDiff = String(Math.abs(Number(tool?.difference || 0)));
    const initialCounted = String(tool?.counted_qty ?? '');
    setCorrDiffQty(initialDiff);
    setCorrCountedQty(initialCounted);
    setCorrReason('');
    setCorrModalVisible(true);
  };

  const closeCorrectionModal = () => {
    setCorrModalVisible(false);
    setCorrSubmitting(false);
    setCorrReason('');
    setCorrTool(null);
    setCorrDiffQty('');
  };

  const submitCorrectionModal = async () => {
    const counted = Math.max(0, parseInt(String(corrCountedQty || '0'), 10));
    const system = Number(corrTool?.system_qty ?? 0);
    const diff = counted - system;
    const qtyAbs = Math.abs(diff);
    if (!corrTool?.tool_id) { showSnackbar({ type: 'warn', text: 'Brak narzędzia' }); return; }
    if (qtyAbs === 0) { showSnackbar({ type: 'warn', text: 'Różnica wynosi 0 — brak korekty' }); return; }
    setCorrSubmitting(true);
    try {
      // 1) Zapisz counted_qty (PUT)
      await setCount(corrTool.tool_id, counted);
      // 2) Dodaj korektę (POST)
      await addCorrection(corrTool.tool_id, diff, String(corrReason || '').trim() || null, corrTool?.code || corrTool?.tool_sku || corrTool?.registration_number || corrTool?.sku);
      closeCorrectionModal();
    } finally {
      setCorrSubmitting(false);
    }
  };

  const openDeleteModal = (corr) => {
    setDeleteTarget(corr);
    setDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalVisible(false);
    setDeleteSubmitting(false);
    setDeleteTarget(null);
  };

  const confirmDeleteCorrection = async () => {
    if (!isAdmin) { showSnackbar({ type: 'error', text: 'Wymagane uprawnienia administratora' }); closeDeleteModal(); return; }
    if (!deleteTarget?.id) { closeDeleteModal(); return; }
    setDeleteSubmitting(true);
    try {
      await api.init();
      await api.delete(`/api/inventory/corrections/${encodeURIComponent(deleteTarget.id)}`);
      showSnackbar({ type: 'success', text: 'Usunięto korektę' });
      await loadDetails(selectedSession.id);
      closeDeleteModal();
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Wymagane uprawnienia administratora lub błąd' });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Filtrowanie różnic
  const filteredDifferences = useMemo(() => {
    const termRaw = String(diffSearch || '');
    const termText = normalizeText(termRaw);
    const termCode = normalizeCode(termRaw);
    const minAbs = Math.max(0, parseInt(String(diffMinAbs || '0'), 10));
    return (differences || []).filter(d => {
      const name = normalizeText(d?.name || d?.tool_name || '');
      const codeRaw = d?.sku || d?.inventory_number || d?.registration_number || d?.code || d?.tool_sku || '';
      const codeNorm = normalizeCode(codeRaw);
      const diff = Math.abs(Number(d?.difference || 0));
      const matches = (!termText && !termCode) || name.includes(termText) || codeNorm.includes(termCode);
      const passesMin = diff >= minAbs;
      return matches && passesMin;
    });
  }, [differences, diffSearch, diffMinAbs]);

  // Filtr „Tylko oczekujące”
  const filteredCorrections = useMemo(() => {
    const list = Array.isArray(history?.corrections) ? history.corrections : [];
    return corrShowPendingOnly ? list.filter(c => !c?.accepted_at) : list;
  }, [history, corrShowPendingOnly]);

  // Stan magazynu
  const loadToolsStatus = async () => {
    setToolsLoading(true);
    setToolsError('');
    try {
      await api.init();
      const res = await api.get('/api/tools');
      const arr = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setTools(arr || []);
    } catch (e) {
      setToolsError(e?.message || 'Nie udało się pobrać stanu magazynu');
      setTools([]);
    } finally {
      setToolsLoading(false);
    }
  };

  useEffect(() => { loadToolsStatus(); }, []);

  const filteredTools = useMemo(() => {
    const termRaw = String(invSearch || '');
    const termText = normalizeText(termRaw);
    const termCode = normalizeCode(termRaw);
    const list = (tools || []).filter(t => {
      const name = normalizeText(t?.name || '');
      const codeNorm = normalizeCode(t?.sku || t?.inventory_number || t?.registration_number || t?.code || '');
      const consumable = Boolean(t?.is_consumable) || Boolean(t?.consumable);
      const qty = Number(t?.quantity ?? 0);
      const min = Number(t?.min_stock ?? 0);
      const belowMin = qty < min;
      if (onlyConsumables && !consumable) return false;
      if (onlyBelowMin && !belowMin) return false;
      if (!!termText || !!termCode) {
        if (!(name.includes(termText) || codeNorm.includes(termCode))) return false;
      }
      return true;
    });
    return list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'pl', { sensitivity: 'base' }));
  }, [tools, invSearch, onlyConsumables, onlyBelowMin]);

  const exportDiffsToCSV = async () => {
    try {
      setCsvExporting(true);
      const sessionName = selectedSession?.name || '';
      const exportDate = new Date();
      const exportDateStr = exportDate.toLocaleString('pl-PL');
      const responsible = (currentUser?.full_name) 
        || ([currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' '))
        || currentUser?.name 
        || currentUser?.username 
        || '—';
      const rows = [['Narzędzie', 'Kod', 'System', 'Zliczono', 'Różnica', 'Sesja', 'Data eksportu', 'Odpowiedzialny']];
       for (const d of filteredDifferences) {
         rows.push([
           String(d?.name || d?.tool_name || ''),
           String(d?.code || d?.tool_sku || d?.registration_number || ''),
           String(d?.system_qty ?? 0),
           String(d?.counted_qty ?? 0),
           String(d?.difference ?? 0),
           String(sessionName),
           String(exportDateStr),
           String(responsible),
         ]);
       }
      const sep = ';';
      const csv = rows.map(r => r.map(x => String(x).replace(/\"/g, '\"\"')).map(x => new RegExp(`[\"${sep}\n]`).test(x) ? `\"${x}\"` : x).join(sep)).join('\n');
       if (Platform.OS === 'web') {
         try { await navigator.clipboard.writeText(csv); showSnackbar({ type: 'success', text: 'Skopiowano CSV do schowka' }); }
         catch { showSnackbar({ type: 'warn', text: 'Nie udało się skopiować CSV' }); }
       } else {
         await Share.share({ message: csv });
       }
    } finally {
      setCsvExporting(false);
    }
  };

  const renderSessionItem = ({ item }) => {
    const statusColor = item.status === 'active' ? (colors.success || '#10b981') : (item.status === 'paused' ? (colors.warning || '#f59e0b') : (colors.muted));
    return (
      <Pressable onPress={async () => { setSelectedSession(item); try { await AsyncStorage.setItem('@inventory_selected_session_id', String(item?.id || '')); } catch {} }} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, opacity: pressed ? 0.9 : 1 }]}> 
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name || 'Sesja'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={[styles.chip, { borderColor: statusColor }]}><Text style={{ color: statusColor }}>{item.status}</Text></View>
              <Text style={{ color: colors.muted }}>Zliczone: {item.counted_items ?? 0}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {item.status === 'active' ? (
              <Pressable disabled={!isAdmin} onPress={() => updateStatus(item, 'pause')} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={styles.buttonText}>Wstrzymaj</Text></Pressable>
            ) : null}
            {item.status === 'paused' ? (
              <Pressable disabled={!isAdmin} onPress={() => updateStatus(item, 'resume')} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={styles.buttonText}>Wznów</Text></Pressable>
            ) : null}
            {item.status !== 'ended' ? (
              <Pressable disabled={!isAdmin} onPress={() => updateStatus(item, 'end')} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={styles.buttonText}>Zakończ</Text></Pressable>
            ) : (
              <Pressable disabled={!isAdmin} onPress={() => deleteSession(item)} style={[styles.button, { backgroundColor: colors.danger }]}><Text style={styles.buttonText}>Usuń</Text></Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Inwentaryzacja</Text>
        <Text style={styles.subtitle}>Twórz sesje, skanuj i porównuj stany</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Utwórz nową sesję</Text>
        <View style={styles.row}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Nazwa sesji" placeholderTextColor={colors.muted} value={newName} onChangeText={setNewName} />
          <Pressable disabled={!isAdmin || creating} onPress={createSession} style={({ pressed }) => [styles.button, { backgroundColor: isAdmin ? colors.primary : colors.muted, opacity: (creating || pressed) ? 0.8 : 1 }]}>
            <Text style={styles.buttonText}>{creating ? 'Tworzenie…' : 'Utwórz'}</Text>
          </Pressable>
        </View>
        <TextInput style={[styles.input, { marginTop: 8 }]} placeholder="Notatki (opcjonalnie)" placeholderTextColor={colors.muted} value={newNotes} onChangeText={setNewNotes} />
        {!isAdmin ? <Text style={{ color: colors.muted, marginTop: 8 }}>Ta operacja wymaga uprawnień administratora.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sesje</Text>
        {loading ? <Text style={styles.muted}>Ładowanie…</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && (!sessions || sessions.length === 0) ? <Text style={styles.muted}>Brak sesji</Text> : null}
        {!loading && sessions?.length ? (
          <FlatList
            data={sessions}
            keyExtractor={(item) => String(item.id || Math.random())}
            renderItem={renderSessionItem}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={false}
          />
        ) : null}
      </View>

      {selectedSession ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sesja: {selectedSession?.name}</Text>
          <View style={[styles.row, { marginBottom: 8 }]}> 
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Kod narzędzia" placeholderTextColor={colors.muted} value={scanCode} onChangeText={setScanCode} />
            <TextInput style={[styles.input, { width: 80, textAlign: 'center' }]} placeholder="Ilość" placeholderTextColor={colors.muted} keyboardType="numeric" value={scanQty} onChangeText={setScanQty} />
            <Pressable disabled={scanning} onPress={scan} style={[styles.button, { backgroundColor: colors.primary }]}>
              <Text style={styles.buttonText}>{scanning ? 'Dodawanie…' : 'Skanuj/Zlicz'}</Text>
            </Pressable>
            <Pressable onPress={() => openScanner('count')} style={[styles.button, { backgroundColor: colors.primary }]}>
              <Text style={styles.buttonText}>Skanuj kamerą</Text>
            </Pressable>
          </View>
          {detailsLoading ? <Text style={styles.muted}>Ładowanie szczegółów…</Text> : null}
          {detailsError ? <Text style={styles.error}>{detailsError}</Text> : null}

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Różnice</Text>
          <View style={[styles.row, { marginBottom: 8 }]}> 
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Szukaj (nazwa/kod)" placeholderTextColor={colors.muted} value={diffSearch} onChangeText={setDiffSearch} />
            <Pressable onPress={() => openScanner('diff')} style={[styles.button, { backgroundColor: colors.primary }]}> 
              <Text style={styles.buttonText}>Skanuj (Różnice)</Text>
            </Pressable>
            <Pressable onPress={() => setDiffSearch(scanCode)} style={[styles.button, { backgroundColor: colors.border }]}> 
              <Text style={{ color: colors.text }}>Użyj ostatniego kodu</Text>
            </Pressable>
            <TextInput style={[styles.input, { width: 160 }]} placeholder="Min. wartość bezwzględna" placeholderTextColor={colors.muted} keyboardType="numeric" value={diffMinAbs} onChangeText={setDiffMinAbs} />
            <Pressable onPress={exportDiffsToCSV} disabled={csvExporting} style={[styles.button, { backgroundColor: colors.primary, opacity: csvExporting ? 0.7 : 1 }]}> 
              <Text style={styles.buttonText}>{csvExporting ? 'Eksport…' : 'Eksport CSV'}</Text>
            </Pressable>
          </View>
          {filteredDifferences?.length ? (
            <FlatList
              data={filteredDifferences}
              keyExtractor={(item) => String(item.tool_id || Math.random())}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const diff = Number(item?.difference || 0);
                const diffColor = diff === 0 ? colors.muted : (diff > 0 ? (colors.success || '#10b981') : (colors.danger || '#ef4444'));
                const keySku = item?.code || item?.tool_sku || item?.registration_number || null;
                const recentForSession = recentCorrections.filter(rc => String(rc.sessionId) === String(selectedSession?.id));
                const recently = recentForSession.some(rc => String(rc.toolId) === String(item?.tool_id) || (!!rc.sku && !!keySku && String(rc.sku) === String(keySku)));
                return (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: '600' }}>{item?.name || item?.tool_name || 'Narzędzie'}</Text>
                    <Text style={{ color: colors.muted }}>Kod: {item?.code || item?.tool_sku || item?.registration_number || '—'}</Text>
                    {recently ? (
                      <View style={[styles.chip, { borderColor: colors.success || '#10b981', marginTop: 4 }]}>
                        <Text style={{ color: colors.success || '#10b981' }}>Skorygowano</Text>
                      </View>
                    ) : null}
                    <Text style={{ color: colors.muted }}>System: {item?.system_qty ?? 0} • Zliczono: {item?.counted_qty ?? 0}</Text>
                    <Text style={{ color: diffColor, marginTop: 4 }}>Różnica: {diff}</Text>
                    <View style={[styles.row, { marginTop: 8 }]}>
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ustaw ilość" placeholderTextColor={colors.muted} keyboardType="numeric" defaultValue={String(item?.counted_qty ?? '')} onSubmitEditing={(e) => setCount(item?.tool_id, e?.nativeEvent?.text)} />
                      {diff !== 0 ? (
                        <Pressable onPress={() => openCorrectionModal(item)} style={[styles.button, { backgroundColor: colors.primary }]}> 
                          <Text style={styles.buttonText}>Dodaj korektę</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              }}
            />
          ) : (
            <Text style={styles.muted}>Brak różnic</Text>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Historia</Text>
          {(history?.counts || []).length ? (
            <View style={{ marginBottom: 8 }}>
              {(history.counts || []).map((c) => (
                <View key={String(c?.id || Math.random())} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, marginBottom: 6 }}>
                  <Text style={{ color: colors.text }}>{c?.tool_name || 'Narzędzie'} • {c?.counted_qty ?? 0} szt.</Text>
                  <Text style={{ color: colors.muted }}>Kod: {c?.sku || c?.inventory_number || c?.registration_number || c?.code || c?.tool_sku || '—'} • {c?.updated_at || c?.created_at}</Text>
                </View>
              ))}
            </View>
          ) : <Text style={styles.muted}>Brak zliczeń</Text>}

          <View style={[styles.row, { marginTop: 8, marginBottom: 8 }]}>
            <Text style={{ color: colors.text }}>Tylko oczekujące korekty</Text>
            <Switch value={corrShowPendingOnly} onValueChange={setCorrShowPendingOnly} thumbColor={corrShowPendingOnly ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <View style={[styles.row, { marginTop: 0, marginBottom: 8 }]}> 
            <Text style={{ color: colors.text }}>Auto-akceptuj korekty (admin)</Text>
            <Switch disabled={!isAdmin} value={autoAcceptCorrections} onValueChange={async (v) => { setAutoAcceptCorrections(v); try { await AsyncStorage.setItem('@inventory_auto_accept_v1', v ? '1' : '0'); } catch {} }} thumbColor={autoAcceptCorrections ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
            {!isAdmin ? <Text style={{ color: colors.muted, marginLeft: 8 }}>Opcja dostępna tylko dla administratora.</Text> : null}
          </View> 
          <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Korekty</Text>
          {(filteredCorrections || []).length ? (
            <View>
              {(filteredCorrections || []).map((corr) => (
                <View key={String(corr?.id || Math.random())} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, marginBottom: 6 }}>
                  <Text style={{ color: colors.text }}>{corr?.tool_name || 'Narzędzie'} • różnica: {corr?.difference_qty ?? 0}</Text>
                  <Text style={{ color: colors.muted }}>Powód: {corr?.reason || '—'}</Text>
                  {corr?.accepted_at ? (
                    <Text style={{ color: colors.muted }}>Zaakceptowano przez: {corr?.accepted_by_username || 'admin'} • {corr?.accepted_at}</Text>
                  ) : (
                    <View style={[styles.row, { marginTop: 6 }]}>
                      <Pressable onPress={() => acceptCorrection(corr?.id)} style={[styles.button, { backgroundColor: colors.primary }]} disabled={!isAdmin}>
                        <Text style={styles.buttonText}>Akceptuj</Text>
                      </Pressable>
                      <Pressable onPress={() => deleteCorrection(corr?.id)} style={[styles.button, { backgroundColor: colors.danger }]} disabled={!isAdmin}>
                        <Text style={styles.buttonText}>Usuń</Text>
                      </Pressable>
                      {!isAdmin ? <Text style={{ color: colors.muted, marginLeft: 8 }}>Wymagane uprawnienia admin</Text> : null}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : <Text style={styles.muted}>Brak korekt</Text>}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Stan magazynu</Text>
        <View style={[styles.row, { marginBottom: 8 }]}> 
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Szukaj (nazwa/kod)" placeholderTextColor={colors.muted} value={invSearch} onChangeText={setInvSearch} />
          <Pressable onPress={() => openScanner('inv')} style={[styles.button, { backgroundColor: colors.primary }]}> 
            <Text style={styles.buttonText}>Skanuj (Magazyn)</Text>
          </Pressable>
        </View>
        <View style={[styles.row, { marginBottom: 8, justifyContent: 'space-between' }]}>
          <View style={styles.row}>
            <Switch value={onlyConsumables} onValueChange={setOnlyConsumables} thumbColor={onlyConsumables ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
            <Text style={{ color: colors.text }}>Tylko zużywalne</Text>
          </View>
          <View style={styles.row}>
            <Switch value={onlyBelowMin} onValueChange={setOnlyBelowMin} thumbColor={onlyBelowMin ? colors.primary : colors.border} trackColor={{ true: colors.primary, false: colors.border }} />
            <Text style={{ color: colors.text }}>Tylko poniżej minimum</Text>
          </View>
        </View>
        {toolsLoading ? <Text style={styles.muted}>Ładowanie…</Text> : null}
        {toolsError ? <Text style={styles.error}>{toolsError}</Text> : null}
        {!toolsLoading && (filteredTools || []).length ? (
          <FlatList
            data={filteredTools}
            keyExtractor={(item) => String(item?.id || Math.random())}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const qty = Number(item?.quantity ?? 0);
              const min = Number(item?.min_stock ?? 0);
              const max = Number(item?.max_stock ?? 0);
              const belowMin = qty < min;
              const statusColor = belowMin ? (colors.danger || '#ef4444') : colors.text;
              return (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{item?.name || 'Narzędzie'}</Text>
                  <Text style={{ color: colors.muted }}>Kod: {item?.sku || item?.inventory_number || item?.registration_number || item?.code || item?.tool_sku || '—'}</Text>
                  <Text style={{ color: statusColor }}>Ilość: {qty} • Min: {min} • Max: {max}</Text>
                </View>
              );
            }}
          />
        ) : (!toolsLoading ? <Text style={styles.muted}>Brak danych magazynu</Text> : null)}
      </View>
    </ScrollView>
  );
    {showScanner ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }}>
        {CameraViewComp ? (
          <CameraViewComp
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data, type }) => handleBarCodeScanned({ type, data })}
          />
        ) : (
          Platform.OS === 'web' ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
              <Text style={{ color: '#fff', marginBottom: 8 }}>Wpisz lub wklej kod</Text>
              <TextInput
                style={[styles.input, { width: 360, backgroundColor: '#fff' }]}
                placeholder="Kod narzędzia"
                placeholderTextColor="#6b7280"
                value={webScanInput}
                onChangeText={(value) => { setWebScanInput(value); }}
                onSubmitEditing={({ nativeEvent }) => { const v = String(nativeEvent?.text ?? webScanInput).trim(); if (v) handleBarCodeScanned({ data: v }); }}
                autoFocus
              />
              <View style={{ height: 8 }} />
              <Pressable onPress={() => { const v = String(webScanInput || '').trim(); if (v) handleBarCodeScanned({ data: v }); }} style={[styles.button, { backgroundColor: '#22c55e' }]}>
                <Text style={styles.buttonText}>Potwierdź</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff' }}>{cameraModuleError || 'Ładowanie skanera…'}</Text>
            </View>
          )
        )}
        <View style={[styles.reticleBox, { borderColor: scanFrameColor }]} />
        <View style={styles.reticle}><Ionicons name="qr-code" size={72} color="#fff" /></View>
        <View style={styles.scanHint}><Text style={styles.scanHintText}>{scanHintText}</Text></View>
        <Pressable onPress={() => setShowScanner(false)} style={{ position: 'absolute', top: 16, right: 16, backgroundColor: '#fff', padding: 8, borderRadius: 8 }}>
          <Text style={{ color: '#111827', fontWeight: '600' }}>Zamknij</Text>
        </Pressable>
      </View>
    ) : null}

    {/* Modal korekty */}
    <Modal visible={corrModalVisible} transparent animationType="fade" onRequestClose={closeCorrectionModal}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 480, maxWidth: '100%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Dodaj korektę</Text>
            <Pressable onPress={closeCorrectionModal}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          <Text style={{ color: colors.muted, marginTop: 8 }}>{corrTool?.name || corrTool?.tool_name || 'Narzędzie'}</Text>
          <Text style={{ color: colors.muted }}>Kod: {corrTool?.sku || corrTool?.inventory_number || corrTool?.registration_number || corrTool?.code || corrTool?.tool_sku || '—'}</Text>
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.muted }}>System: {corrTool?.system_qty ?? 0} • Zliczono: {(corrCountedQty || corrTool?.counted_qty) ?? 0}</Text>
            <Text style={{ color: colors.text, marginTop: 4 }}>Różnica: {Math.max(0, parseInt(String(corrCountedQty || corrTool?.counted_qty || '0'), 10)) - Number(corrTool?.system_qty ?? 0)}</Text>
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, marginBottom: 6 }}>Zliczona ilość</Text>
            <TextInput style={[styles.input]} placeholder="Zliczona ilość" placeholderTextColor={colors.muted} keyboardType="numeric" value={String(corrCountedQty)} onChangeText={setCorrCountedQty} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, marginBottom: 6 }}>Powód</Text>
            <TextInput style={[styles.input]} placeholder="Powód korekty" placeholderTextColor={colors.muted} value={corrReason} onChangeText={setCorrReason} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <Pressable onPress={closeCorrectionModal} style={[styles.button, { backgroundColor: colors.border }]}>
              <Text style={{ color: colors.text }}>Anuluj</Text>
            </Pressable>
            <Pressable disabled={corrSubmitting} onPress={submitCorrectionModal} style={[styles.button, { backgroundColor: colors.primary }]}>
              <Text style={styles.buttonText}>{corrSubmitting ? 'Zapisywanie…' : 'Zapisz korektę'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* Modal potwierdzenia usunięcia korekty */}
    <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={closeDeleteModal}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 420, maxWidth: '100%', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Usunąć korektę?</Text>
            <Pressable onPress={closeDeleteModal}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
          </View>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Ta operacja wymaga uprawnień administratora.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <Pressable onPress={closeDeleteModal} style={[styles.button, { backgroundColor: colors.border }]}>
              <Text style={{ color: colors.text }}>Anuluj</Text>
            </Pressable>
            <Pressable disabled={!isAdmin || deleteSubmitting} onPress={confirmDeleteCorrection} style={[styles.button, { backgroundColor: colors.danger }]}>
              <Text style={styles.buttonText}>{deleteSubmitting ? 'Usuwanie…' : 'Usuń'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
}