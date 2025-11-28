import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, Pressable, Alert, Modal, ScrollView, Switch } from 'react-native';
import DateField from '../components/DateField';
import { useTheme } from '../lib/theme';
import api from '../lib/api.js';
import { Ionicons } from '@expo/vector-icons';
import { showSnackbar } from '../lib/snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission } from '../lib/utils';
import { PERMISSIONS } from '../lib/constants';

export default function BhpScreen() {
  const { colors } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Uprawnienia
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewBhp, setCanViewBhp] = useState(false);
  const [canManageBhp, setCanManageBhp] = useState(false);
  const [permsReady, setPermsReady] = useState(false);

  // Wyszukiwanie i status
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [focusedFilterInput, setFocusedFilterInput] = useState(false);

  // Sortowanie i tryb przeglądów (zgodnie z webowym BhpScreen.jsx)
  const [sortBy, setSortBy] = useState('inspection');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [reviewsOrder, setReviewsOrder] = useState('desc');
  const [showReviewsDropdown, setShowReviewsDropdown] = useState(false);

  // Stany modali i edycji
  const [editingItem, setEditingItem] = useState(null);
  const [editFields, setEditFields] = useState({
    inventory_number: '',
    manufacturer: '',
    model: '',
    serial_number: '',
    catalog_number: '',
    production_date: '',
    inspection_date: '',
    is_set: false,
    has_shock_absorber: false,
    has_srd: false,
    harness_start_date: '',
    shock_absorber_serial: '',
    shock_absorber_name: '',
    shock_absorber_model: '',
    shock_absorber_catalog_number: '',
    shock_absorber_production_date: '',
    shock_absorber_start_date: '',
    srd_manufacturer: '',
    srd_model: '',
    srd_serial_number: '',
    srd_catalog_number: '',
    srd_production_date: '',
    status: 'dostępne'
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [addFields, setAddFields] = useState({
    manufacturer: '',
    model: '',
    serial_number: '',
    catalog_number: '',
    inventory_number: '',
    production_date: '',
    inspection_date: '',
    harness_start_date: '',
    status: '',
    location: '',
    assigned_employee: '',
    shock_absorber: false,
    srd_device: false
  });

  const [detailItem, setDetailItem] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  const [focusedField, setFocusedField] = useState(null);

  // Stany modali wydania/zwrotu BHP
  const [issueItem, setIssueItem] = useState(null);
  const [issueEmployeeQuery, setIssueEmployeeQuery] = useState('');
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueError, setIssueError] = useState('');

  const [returnItem, setReturnItem] = useState(null);
  const [returnNote, setReturnNote] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnError, setReturnError] = useState('');

  const isDataUri = (val) => {
    try { return typeof val === 'string' && String(val).trim().toLowerCase().startsWith('data:'); } catch { return false; }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const data = await api.get('/api/bhp');
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setItems(list);
    } catch (e) {
      setError(e.message || 'Błąd pobierania BHP');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Uprawnienia: wczytanie użytkownika i obliczenie flag
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        const user = raw ? JSON.parse(raw) : null;
        setCurrentUser(user);
        const canView = hasPermission(user, PERMISSIONS.VIEW_BHP) || hasPermission(user, PERMISSIONS.MANAGE_BHP);
        const canManage = hasPermission(user, PERMISSIONS.MANAGE_BHP);
        setCanViewBhp(!!canView);
        setCanManageBhp(!!canManage);
      } catch (e) {
        // ignore
      } finally {
        if (mounted) setPermsReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Ładowanie danych tylko jeśli użytkownik ma prawo do widoku
  useEffect(() => {
    if (permsReady && canViewBhp) {
      load();
    }
  }, [permsReady, canViewBhp]);

  const statuses = [...new Set((items || []).map(it => it?.status || 'dostępne').filter(Boolean))];
  const selectedStatusLabel = selectedStatus === '__ISSUED__' ? 'Tylko wydane' : selectedStatus === '__AVAILABLE__' ? 'Tylko dostępne' : (selectedStatus || 'Wszystkie statusy');

  // Pomocnicze: parsowanie daty
  const parseDate = (value) => {
    if (!value) return null;
    try {
      const s = String(value).trim();
      const dmy = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
      if (dmy) { const [, dd, mm, yyyy] = dmy; const ts = new Date(`${yyyy}-${mm}-${dd}`).getTime(); return isNaN(ts) ? null : ts; }
      const d = new Date(s); const ts = d.getTime(); return isNaN(ts) ? null : ts;
    } catch { return null; }
  };

  // NOWE: Pobieranie listy pracowników na potrzeby wydania
  const loadEmployees = async () => {
    setEmployeesLoading(true);
    try {
      await api.init();
      let res = null;
      try { res = await api.get('/api/employees'); } catch {}
      if (!res) { try { res = await api.get('/api/employee'); } catch {} }
      if (!res) { try { res = await api.get('/api/users'); } catch {} }
      const arr = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
      const mapped = (arr || []).map(e => ({
        id: e?.id ?? e?.employee_id ?? e?.user_id,
        first_name: e?.first_name ?? e?.name?.split(' ')?.[0] ?? '',
        last_name: e?.last_name ?? e?.surname ?? (e?.name?.split(' ')?.slice(1)?.join(' ') ?? ''),
        name: e?.name ?? `${e?.first_name || ''} ${e?.last_name || ''}`.trim(),
      })).filter(x => x.id);
      setEmployees(mapped);
    } catch (e) {
      // Brak listy pracowników nie blokuje modalu (można wpisać ręcznie)
      setEmployees([]);
    } finally {
      setEmployeesLoading(false);
    }
  };

  // Akcje: otwarcie/wykonanie wydania
  const openIssueModal = async (item) => {
    if (!canManageBhp) { showSnackbar('Brak uprawnień do wydania'); return; }
    setIssueError('');
    setSelectedEmployee(null);
    setIssueEmployeeQuery('');
    setIssueItem(item || null);
    await loadEmployees();
  };
  const closeIssueModal = () => {
    if (issueSaving) return;
    setIssueItem(null);
    setSelectedEmployee(null);
    setIssueEmployeeQuery('');
    setIssueError('');
  };
  const confirmIssue = async () => {
    if (!canManageBhp) { setIssueError('Brak uprawnień'); return; }
    if (!issueItem) return;
    const id = issueItem?.id || issueItem?.bhp_id || issueItem?.item_id;
    if (!id) { setIssueError('Brak identyfikatora BHP'); return; }
    const employeeName = selectedEmployee?.name || issueEmployeeQuery.trim();
    const employeeId = selectedEmployee?.id || undefined;
    if (!employeeName && !employeeId) { setIssueError('Wybierz lub wpisz pracownika'); return; }
    setIssueSaving(true);
    setIssueError('');
    const payload = { employee_id: employeeId, employee_name: employeeName, bhp_id: id };
    try {
      await api.init();
      let ok = false;
      try { await api.post(`/api/bhp/${id}/issue`, payload); ok = true; } catch {}
      if (!ok) { try { await api.post('/api/bhp_issues', payload); ok = true; } catch {} }
      if (!ok) { try { await api.post('/api/issues', { type: 'bhp', item_id: id, employee_id: employeeId, employee_name: employeeName }); ok = true; } catch {} }
      if (!ok) throw new Error('Nie udało się wykonać wydania');
      // Aktualizacja lokalnego stanu
      setItems(prev => prev.map(it => {
        const iid = it?.id || it?.bhp_id || it?.item_id;
        if (String(iid) === String(id)) {
          const [first, last] = String(employeeName || '').split(' ');
          return { ...it, status: 'wydane', assigned_employee_first_name: first || it?.assigned_employee_first_name, assigned_employee_last_name: last || it?.assigned_employee_last_name };
        }
        return it;
      }));
      showSnackbar(`Wydano sprzęt BHP dla ${employeeName || 'pracownika'}`, { type: 'success' });
      closeIssueModal();
    } catch (e) {
      setIssueError(e?.message || 'Błąd wydania');
      showSnackbar(e?.message || 'Błąd wydania BHP', { type: 'error' });
    } finally {
      setIssueSaving(false);
    }
  };

  // Akcje: otwarcie/wykonanie zwrotu
  const openReturnModal = (item) => {
    if (!canManageBhp) { showSnackbar('Brak uprawnień do zwrotu'); return; }
    setReturnError('');
    setReturnNote('');
    setReturnItem(item || null);
  };
  const closeReturnModal = () => {
    if (returnSaving) return;
    setReturnItem(null);
    setReturnNote('');
    setReturnError('');
  };
  const confirmReturn = async () => {
    if (!canManageBhp) { setReturnError('Brak uprawnień'); return; }
    if (!returnItem) return;
    const id = returnItem?.id || returnItem?.bhp_id || returnItem?.item_id;
    if (!id) { setReturnError('Brak identyfikatora BHP'); return; }
    setReturnSaving(true);
    setReturnError('');
    const payload = { bhp_id: id, note: returnNote || undefined };
    try {
      await api.init();
      let ok = false;
      try { await api.post(`/api/bhp/${id}/return`, payload); ok = true; } catch {}
      if (!ok) { try { await api.post('/api/bhp/returns', payload); ok = true; } catch {} }
      if (!ok) { try { await api.post('/api/bhp-returns', payload); ok = true; } catch {} }
      if (!ok) { try { await api.post('/api/returns', { type: 'bhp', item_id: id, note: returnNote || undefined }); ok = true; } catch {} }
      if (!ok) throw new Error('Nie udało się zarejestrować zwrotu');
      // Aktualizacja lokalnego stanu
      setItems(prev => prev.map(it => {
        const iid = it?.id || it?.bhp_id || it?.item_id;
        if (String(iid) === String(id)) {
          return { ...it, status: 'dostępne', assigned_employee_first_name: '', assigned_employee_last_name: '' };
        }
        return it;
      }));
      showSnackbar('Sprzęt BHP zwrócony', { type: 'success' });
      closeReturnModal();
    } catch (e) {
      setReturnError(e?.message || 'Błąd zwrotu');
      showSnackbar(e?.message || 'Błąd zwrotu BHP', { type: 'error' });
    } finally {
      setReturnSaving(false);
    }
  };

  const getInspectionTs = (it) => parseDate(it?.inspection_date || it?.last_inspection_at);
  const getInventoryKey = (it) => {
    const inv = it?.inventory_number
      || (isDataUri(it?.code) ? '' : it?.code)
      || (isDataUri(it?.barcode) ? '' : it?.barcode)
      || (isDataUri(it?.qr_code) ? '' : it?.qr_code)
      || '';
    return String(inv).trim().toLowerCase();
  };

  const openDetails = async (item) => {
    setDetailItem(item || {});
    setDetailData(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      await api.init();
      const id = item?.id || item?.bhp_id || item?.item_id;
      if (id) {
        try {
          const det = await api.get(`/api/bhp/${id}/details`);
          setDetailData(det);
        } catch {
          // Pomijamy błąd jeśli backend nie ma tego endpointu
        }
      }
    } catch (e) {
      setDetailError(e?.message || 'Błąd pobierania szczegółów BHP');
    } finally {
      setDetailLoading(false);
    }
  };
  const closeDetails = () => { setDetailItem(null); setDetailData(null); setDetailError(''); setDetailLoading(false); };

  // Edycja
  const openEdit = (item) => {
    if (!canManageBhp) { showSnackbar('Brak uprawnień do edycji'); return; }
    const it = item || {};
    setEditingItem(it);
    const hasShock = !!(it?.shock_absorber_name || it?.shock_absorber_model || it?.shock_absorber_serial || it?.shock_absorber_catalog_number || it?.shock_absorber_production_date || it?.shock_absorber_start_date || it?.has_shock_absorber);
    const hasSrd = !!(it?.srd_manufacturer || it?.srd_model || it?.srd_serial_number || it?.srd_catalog_number || it?.srd_production_date || it?.has_srd);
    let shock = !!hasShock;
    let srd = !!hasSrd;
    if (shock && srd) { srd = false; }
    setEditFields({
      manufacturer: it?.manufacturer || '',
      model: it?.model || '',
      serial_number: it?.serial_number || '',
      catalog_number: it?.catalog_number || '',
      inventory_number: it?.inventory_number || (isDataUri(it?.code) ? '' : it?.code) || (isDataUri(it?.barcode) ? '' : it?.barcode) || (isDataUri(it?.qr_code) ? '' : it?.qr_code) || '',
      production_date: it?.production_date || '',
      inspection_date: it?.inspection_date || it?.last_inspection_at || '',
      location: it?.location || '',
      shock_absorber: shock,
      srd_device: srd,
      shock_absorber_name: it?.shock_absorber_name || '',
      shock_absorber_model: it?.shock_absorber_model || '',
      shock_absorber_serial: it?.shock_absorber_serial || '',
      shock_absorber_catalog_number: it?.shock_absorber_catalog_number || '',
      shock_absorber_production_date: it?.shock_absorber_production_date || '',
      shock_absorber_start_date: it?.shock_absorber_start_date || '',
      srd_manufacturer: it?.srd_manufacturer || '',
      srd_model: it?.srd_model || '',
      srd_serial_number: it?.srd_serial_number || '',
      srd_catalog_number: it?.srd_catalog_number || '',
      srd_production_date: it?.srd_production_date || ''
    });
  };
  const closeEdit = () => { setEditingItem(null); };
  const saveEdit = async () => {
    if (!canManageBhp) { setError('Brak uprawnień'); return; }
    if (!editingItem) return;
    setLoading(true); setError('');
    const id = editingItem?.id || editingItem?.bhp_id || editingItem?.item_id;
    if (!id) { setError('Brak identyfikatora BHP'); setLoading(false); return; }
    const normalizeDate = (value) => {
      try {
        if (!value) return '';
        const str = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
        const m = str.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
        if (m) { const [, dd, mm, yyyy] = m; return `${yyyy}-${mm}-${dd}`; }
        const d = new Date(str);
        if (!isNaN(d.getTime())) { const y = d.getFullYear(); const m2 = String(d.getMonth()+1).padStart(2,'0'); const d2 = String(d.getDate()).padStart(2,'0'); return `${y}-${m2}-${d2}`; }
        return str;
      } catch { return String(value || ''); }
    };
    const payload = {
      ...editFields,
      production_date: normalizeDate(editFields.production_date),
      inspection_date: normalizeDate(editFields.inspection_date),
      harness_start_date: normalizeDate(editFields.harness_start_date),
      shock_absorber_production_date: normalizeDate(editFields.shock_absorber_production_date),
      shock_absorber_start_date: normalizeDate(editFields.shock_absorber_start_date),
      srd_production_date: normalizeDate(editFields.srd_production_date),
      is_set: !!(editFields.shock_absorber || editFields.srd_device),
      has_shock_absorber: !!editFields.shock_absorber,
      has_srd: !!editFields.srd_device,
    };
    try {
      await api.init();
      try { await api.put(`/api/bhp/${id}`, payload); }
      catch (e1) { try { await api.post(`/api/bhp/${id}`, payload); } catch (e2) { throw e2; } }
      setItems(prev => prev.map(it => {
        const iid = it?.id || it?.bhp_id || it?.item_id;
        if (String(iid) === String(id)) return { ...it, ...payload };
        return it;
      }));
      showSnackbar('Zapisano zmiany sprzętu BHP', { type: 'success' });
      closeEdit();
    } catch (e) {
      setError(e?.message || 'Błąd zapisu edycji');
      showSnackbar(e?.message || 'Błąd zapisu edycji BHP', { type: 'error' });
    } finally { setLoading(false); }
  };

  // Usuwanie
  const deleteItem = async (item) => {
    if (!canManageBhp) { showSnackbar('Brak uprawnień do usuwania'); return; }
    const id = item?.id || item?.bhp_id || item?.item_id;
    if (!id) { showSnackbar({ type: 'warn', text: 'Brak identyfikatora BHP' }); return; }
    Alert.alert('Usunąć sprzęt BHP?', 'Operacja jest nieodwracalna.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        setLoading(true); setError('');
        try { await api.init(); await api.delete(`/api/bhp/${id}`); setItems(prev => prev.filter(it => String(it?.id || it?.bhp_id || it?.item_id) !== String(id))); showSnackbar({ type: 'success', text: 'Usunięto sprzęt BHP' }); }
        catch (e) { setError(e?.message || 'Błąd usuwania'); showSnackbar({ type: 'error', text: e?.message || 'Błąd usuwania BHP' }); }
        finally { setLoading(false); }
      } }
    ]);
  };

  // Dodawanie
  const openAdd = () => { if (!canManageBhp) { showSnackbar('Brak uprawnień do dodawania'); return; } setShowAddModal(true); };
  const closeAdd = () => { setShowAddModal(false); };
  const saveAdd = async () => {
    if (!canManageBhp) { setError('Brak uprawnień'); return; }
    setLoading(true); setError('');
    const payload = ensureYMD({
      ...addFields,
      is_set: !!(addFields.shock_absorber || addFields.srd_device),
      has_shock_absorber: !!addFields.shock_absorber,
      has_srd: !!addFields.srd_device,
    }, ['production_date','inspection_date','harness_start_date','shock_absorber_production_date','shock_absorber_start_date','srd_production_date']);
    try {
      await api.init();
      const res = await api.post('/api/bhp', payload);
      const created = Array.isArray(res?.data) ? res.data[0] : (res?.data || res);
      setItems(prev => created ? [created, ...prev] : prev);
      showSnackbar('Dodano sprzęt BHP', { type: 'success' });
      closeAdd();
    } catch (e) {
      setError(e?.message || 'Błąd dodawania BHP');
      showSnackbar(e?.message || 'Błąd dodawania BHP', { type: 'error' });
    } finally { setLoading(false); }
  };

  // Filtrowanie
  const filteredItems = (items || []).filter(it => {
    const mfr = it?.manufacturer || '';
    const model = it?.model || '';
    const inv = it?.inventory_number || (isDataUri(it?.code) ? '' : it?.code) || (isDataUri(it?.barcode) ? '' : it?.barcode) || (isDataUri(it?.qr_code) ? '' : it?.qr_code) || '';
    const serial = it?.serial_number || '';
    const catalog = it?.catalog_number || '';
    const empName = `${it?.assigned_employee_first_name || it?.employee_first_name || ''} ${it?.assigned_employee_last_name || it?.employee_last_name || ''}`.trim();
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term || [mfr, model, inv, serial, catalog, empName].some(val => String(val).toLowerCase().includes(term));
    const computedStatus = it?.status || 'dostępne';
    const s = String(computedStatus || '').toLowerCase();
    let matchesStatus = true;
    if (selectedStatus === '__ISSUED__') {
      // dokładnie tylko status 'wydane'
      matchesStatus = s === 'wydane';
    } else if (selectedStatus === '__AVAILABLE__') {
      // dokładnie tylko status 'dostępne'
      matchesStatus = s === 'dostępne';
    } else if (selectedStatus) {
      // inne statusy wybierane z listy są porównywane dokładnie po lowercase
      matchesStatus = s === String(selectedStatus).toLowerCase();
    }
    return matchesSearch && matchesStatus;
  });

  // Sortowanie zgodne z wybraną opcją i trybem przeglądów
  const sortedItems = [...filteredItems].sort((a, b) => {
    if (sortBy === 'inspection') {
      const ta = getInspectionTs(a);
      const tb = getInspectionTs(b);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return reviewsOrder === 'asc' ? ta - tb : tb - ta;
    } else if (sortBy === 'inventory') {
      const ka = getInventoryKey(a);
      const kb = getInventoryKey(b);
      if (!ka && !kb) return 0;
      if (!ka) return 1;
      if (!kb) return -1;
      return String(ka).localeCompare(String(kb), undefined, { numeric: true, sensitivity: 'base' });
    }
    return 0;
  });

  if (!permsReady) { return (<View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4"><Text style={{ color: colors.text }}>Ładowanie uprawnień…</Text></View>); }
  if (permsReady && !canViewBhp) { return (<View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4"><Text style={{ color: colors.text }}>Brak uprawnień do widoku BHP</Text></View>); }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={[styles.title, { color: colors.text, flex: 1 }]} className="text-2xl font-bold">BHP</Text>
        {canManageBhp && (
          <Pressable accessibilityLabel="Dodaj BHP" onPress={openAdd} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}> 
            <Ionicons name="add-outline" size={22} color={colors.primary || colors.text} />
          </Pressable>
        )}
      </View>

      {/* Wyszukiwanie */}
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TextInput
          style={[styles.filterInput, { borderColor: focusedFilterInput ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]}
          className="flex-1 border border-slate-300 rounded-md px-2 h-10"
          placeholder="Szukaj: nr ewid., producent, model, seryjny..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholderTextColor={colors.muted}
          onFocus={() => setFocusedFilterInput(true)}
          onBlur={() => setFocusedFilterInput(false)}
        />
        {searchTerm ? (
          <Pressable accessibilityLabel="Wyczyść wyszukiwanie" onPress={() => setSearchTerm('')} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }] }>
            <Ionicons name="close-circle-outline" size={25} color={colors.muted || colors.text} />
          </Pressable>
        ) : null}
      </View>

      {/* Status / Sortowanie / Przeglądy */}
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => { setShowStatusDropdown(v => !v); setShowSortDropdown(false); setShowReviewsDropdown(false); }}>
          <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{selectedStatusLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => { setShowSortDropdown(v => !v); setShowStatusDropdown(false); setShowReviewsDropdown(false); }}>
          <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{sortBy === 'inspection' ? 'Data przeglądu' : 'Nr ewidencyjny'}</Text>
        </TouchableOpacity>
        {sortBy === 'inspection' && (
          <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => { setShowReviewsDropdown(v => !v); setShowStatusDropdown(false); setShowSortDropdown(false); }}>
            <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{reviewsOrder === 'desc' ? 'Najdalszy przegląd' : 'Najbliższy przegląd'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {showStatusDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedStatus(''); setShowStatusDropdown(false); }}>
            <Text style={{ color: colors.text }}>Wszystkie statusy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedStatus('__ISSUED__'); setShowStatusDropdown(false); }}>
            <Text style={{ color: colors.text }}>Tylko wydane</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedStatus('__AVAILABLE__'); setShowStatusDropdown(false); }}>
            <Text style={{ color: colors.text }}>Tylko dostępne</Text>
          </TouchableOpacity>
          {(statuses || []).map((st) => (
            <TouchableOpacity key={String(st)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedStatus(st); setShowStatusDropdown(false); }}>
              <Text style={{ color: colors.text }}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showSortDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSortBy('inspection'); setShowSortDropdown(false); }}>
            <Text style={{ color: colors.text }}>Data przeglądu</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSortBy('inventory'); setShowSortDropdown(false); setShowReviewsDropdown(false); }}>
            <Text style={{ color: colors.text }}>Nr ewidencyjny</Text>
          </TouchableOpacity>
        </View>
      )}
      {sortBy === 'inspection' && showReviewsDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setReviewsOrder('asc'); setShowReviewsDropdown(false); }}>
            <Text style={{ color: colors.text }}>Najbliższy przegląd</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setReviewsOrder('desc'); setShowReviewsDropdown(false); }}>
            <Text style={{ color: colors.text }}>Najdalszy przegląd</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Lista */}
      {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
      {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
        <FlatList
          data={sortedItems}
          keyExtractor={(item) => String(item.id || item.bhp_id || Math.random())}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const name = (item?.manufacturer && item?.model) ? `${item.manufacturer} ${item.model}` : (item?.name || 'Sprzęt BHP');
            const computedStatus = item?.status || 'dostępne';
            const s = String(computedStatus || '').toLowerCase();
            const statusColor = s.includes('serwis') || s.includes('przegl') || s.includes('awaria') || s.includes('uszk')
              ? (colors.danger || '#ef4444')
              : (s.includes('wyd') || s.includes('issue')
                ? (colors.warning || '#f59e0b')
                : ((s.includes('dost') || s.includes('avail') || s.includes('magaz'))
                  ? (colors.success || '#10b981')
                  : colors.border));
            const inv = item?.inventory_number || (isDataUri(item?.code) ? '' : item?.code) || (isDataUri(item?.barcode) ? '' : item?.barcode) || (isDataUri(item?.qr_code) ? '' : item?.qr_code) || '—';
            const empName = `${item?.assigned_employee_first_name || item?.employee_first_name || ''} ${item?.assigned_employee_last_name || item?.employee_last_name || ''}`.trim() || '—';
            const id = item?.id || item?.bhp_id || item?.item_id;
            return (
              <Pressable onPress={() => openDetails(item)} style={({ pressed }) => [styles.tile, { backgroundColor: colors.card, borderColor: colors.border, borderRightWidth: 4, borderRightColor: statusColor, opacity: pressed ? 0.97 : 1, paddingRight: 12 }]} className="rounded-lg mb-3 p-3">
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toolName, { color: colors.text }]} className="text-lg font-semibold">{name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {canManageBhp && (
                      <>
                        <Pressable accessibilityLabel={`Edytuj ${id}`} onPress={() => openEdit(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
                          <Ionicons name="create-outline" size={20} color={colors.text} />
                        </Pressable>
                        <Pressable accessibilityLabel={`Usuń ${id}`} onPress={() => deleteItem(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
                          <Ionicons name="trash-outline" size={20} color={colors.danger || '#e11d48'} />
                        </Pressable>
                        {(() => { const isIssued = s.includes('wyd') || !!(item?.assigned_employee_first_name || item?.issued_to_employee_id); return (
                          isIssued ? (
                            <Pressable accessibilityLabel={`Zwróć ${id}`} onPress={() => openReturnModal(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
                              <Ionicons name="return-down-back" size={20} color={colors.text} />
                            </Pressable>
                          ) : (
                            <Pressable accessibilityLabel={`Wydaj ${id}`} onPress={() => openIssueModal(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }] }>
                              <Ionicons name="arrow-forward-circle-outline" size={20} color={colors.text} />
                            </Pressable>
                          ) ); })()}
                      </>
                    )}
                  </View>
                </View>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Nr ew.: {inv}</Text>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Producent/Model: {item?.manufacturer || '—'} / {item?.model || '—'}</Text>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Nr fabryczny: {item?.serial_number || '—'}</Text>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Przypisany: {empName}</Text>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Data przeglądu: {item?.inspection_date || item?.last_inspection_at || '—'}</Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* Modal edycji */}
      <Modal visible={!!editingItem} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edytuj sprzęt BHP</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted }}>Producent</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'manufacturer' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Producent" value={editFields.manufacturer} onChangeText={(v) => setEditFields(s => ({ ...s, manufacturer: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('manufacturer')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Model</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'model' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Model" value={editFields.model} onChangeText={(v) => setEditFields(s => ({ ...s, model: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('model')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Nr ewidencyjny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'inventory_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr ewidencyjny" value={editFields.inventory_number} onChangeText={(v) => setEditFields(s => ({ ...s, inventory_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('inventory_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Numer fabryczny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'serial_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer fabryczny" value={editFields.serial_number} onChangeText={(v) => setEditFields(s => ({ ...s, serial_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('serial_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Nr katalogowy</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'catalog_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr katalogowy" value={editFields.catalog_number} onChangeText={(v) => setEditFields(s => ({ ...s, catalog_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('catalog_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Data produkcji</Text>
              <DateField value={editFields.production_date} onChange={(v) => setEditFields(s => ({ ...s, production_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

              <Text style={{ color: colors.muted }}>Data przeglądu</Text>
              <DateField value={editFields.inspection_date} onChange={(v) => setEditFields(s => ({ ...s, inspection_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

              <Text style={{ color: colors.muted }}>Data rozpoczęcia użytkowania</Text>
              <DateField value={editFields.harness_start_date} onChange={(v) => setEditFields(s => ({ ...s, harness_start_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

              <Text style={{ color: colors.muted }}>Lokalizacja</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'location' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Lokalizacja" value={editFields.location} onChangeText={(v) => setEditFields(s => ({ ...s, location: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('location')} onBlur={() => setFocusedField(null)} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>Amortyzator</Text>
                <Switch value={editFields.shock_absorber} onValueChange={(v) => setEditFields(s => ({ ...s, shock_absorber: v, srd_device: v ? false : s.srd_device }))} />
              </View>
              {editFields.shock_absorber ? (
                <>
                  <Text style={{ color: colors.muted }}>Nazwa amortyzatora</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'shock_absorber_name' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwa amortyzatora" value={editFields.shock_absorber_name} onChangeText={(v) => setEditFields(s => ({ ...s, shock_absorber_name: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('shock_absorber_name')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Model amortyzatora</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'shock_absorber_model' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Model amortyzatora" value={editFields.shock_absorber_model} onChangeText={(v) => setEditFields(s => ({ ...s, shock_absorber_model: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('shock_absorber_model')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Nr fabryczny amortyzatora</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'shock_absorber_serial' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr fabryczny amortyzatora" value={editFields.shock_absorber_serial} onChangeText={(v) => setEditFields(s => ({ ...s, shock_absorber_serial: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('shock_absorber_serial')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Nr katalogowy amortyzatora</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'shock_absorber_catalog_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr katalogowy amortyzatora" value={editFields.shock_absorber_catalog_number} onChangeText={(v) => setEditFields(s => ({ ...s, shock_absorber_catalog_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('shock_absorber_catalog_number')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Data produkcji amortyzatora</Text>
                  <DateField value={editFields.shock_absorber_production_date} onChange={(v) => setEditFields(s => ({ ...s, shock_absorber_production_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

                  <Text style={{ color: colors.muted }}>Data rozpoczęcia amortyzatora</Text>
                  <DateField value={editFields.shock_absorber_start_date} onChange={(v) => setEditFields(s => ({ ...s, shock_absorber_start_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />
                </>
              ) : null}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>Urządzenie samohamowne</Text>
                <Switch value={editFields.srd_device} onValueChange={(v) => setEditFields(s => ({ ...s, srd_device: v, shock_absorber: v ? false : s.shock_absorber }))} />
              </View>
              {editFields.srd_device ? (
                <>
                  <Text style={{ color: colors.muted }}>Producent SRD</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'srd_manufacturer' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Producent SRD" value={editFields.srd_manufacturer} onChangeText={(v) => setEditFields(s => ({ ...s, srd_manufacturer: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('srd_manufacturer')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Model SRD</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'srd_model' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Model SRD" value={editFields.srd_model} onChangeText={(v) => setEditFields(s => ({ ...s, srd_model: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('srd_model')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Nr fabryczny SRD</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'srd_serial_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr fabryczny SRD" value={editFields.srd_serial_number} onChangeText={(v) => setEditFields(s => ({ ...s, srd_serial_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('srd_serial_number')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Nr katalogowy SRD</Text>
                  <TextInput style={[styles.input, { borderColor: focusedField === 'srd_catalog_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr katalogowy SRD" value={editFields.srd_catalog_number} onChangeText={(v) => setEditFields(s => ({ ...s, srd_catalog_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('srd_catalog_number')} onBlur={() => setFocusedField(null)} />

                  <Text style={{ color: colors.muted }}>Data produkcji SRD</Text>
                  <DateField value={editFields.srd_production_date} onChange={(v) => setEditFields(s => ({ ...s, srd_production_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />
                </>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Pressable onPress={closeEdit} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: colors.text }}>Anuluj</Text>
              </Pressable>
              <Pressable onPress={saveEdit} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}>
                <Text style={{ color: '#fff' }}>Zapisz</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal dodawania BHP */}
      <Modal visible={!!showAddModal} animationType="slide" transparent onRequestClose={closeAdd}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Dodaj sprzęt BHP</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted }}>Producent</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_manufacturer' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Producent" value={addFields.manufacturer} onChangeText={(v) => setAddFields(s => ({ ...s, manufacturer: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_manufacturer')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Model</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_model' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Model" value={addFields.model} onChangeText={(v) => setAddFields(s => ({ ...s, model: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_model')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Nr ewidencyjny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_inventory_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr ewidencyjny" value={addFields.inventory_number} onChangeText={(v) => setAddFields(s => ({ ...s, inventory_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_inventory_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Numer fabryczny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_serial_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer fabryczny" value={addFields.serial_number} onChangeText={(v) => setAddFields(s => ({ ...s, serial_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_serial_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Nr katalogowy</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_catalog_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr katalogowy" value={addFields.catalog_number} onChangeText={(v) => setAddFields(s => ({ ...s, catalog_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_catalog_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Data produkcji</Text>
              <DateField value={addFields.production_date} onChange={(v) => setAddFields(s => ({ ...s, production_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

              <Text style={{ color: colors.muted }}>Data przeglądu</Text>
              <DateField value={addFields.inspection_date} onChange={(v) => setAddFields(s => ({ ...s, inspection_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

              <Text style={{ color: colors.muted }}>Data rozpoczęcia użytkowania</Text>
              <DateField value={addFields.harness_start_date} onChange={(v) => setAddFields(s => ({ ...s, harness_start_date: v }))} placeholder="YYYY-MM-DD" style={styles.input} colors={colors} />

              <Text style={{ color: colors.muted }}>Status</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_status' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Status" value={addFields.status} onChangeText={(v) => setAddFields(s => ({ ...s, status: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_status')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Lokalizacja</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_location' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Lokalizacja" value={addFields.location} onChangeText={(v) => setAddFields(s => ({ ...s, location: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_location')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Przypisany pracownik</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'add_assigned_employee' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Imię i nazwisko" value={addFields.assigned_employee} onChangeText={(v) => setAddFields(s => ({ ...s, assigned_employee: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('add_assigned_employee')} onBlur={() => setFocusedField(null)} />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>Amortyzator</Text>
                <Switch value={addFields.shock_absorber} onValueChange={(v) => setAddFields(s => ({ ...s, shock_absorber: v, srd_device: v ? false : s.srd_device }))} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text }}>Urządzenie samohamowne</Text>
                <Switch value={addFields.srd_device} onValueChange={(v) => setAddFields(s => ({ ...s, srd_device: v, shock_absorber: v ? false : s.shock_absorber }))} />
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Pressable onPress={closeAdd} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: colors.text }}>Anuluj</Text>
              </Pressable>
              <Pressable onPress={saveAdd} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}>
                <Text style={{ color: '#fff' }}>Dodaj</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal wydania BHP */}
      <Modal visible={!!issueItem} animationType="slide" transparent onRequestClose={closeIssueModal}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Wydaj BHP</Text>
            {issueError ? <Text style={{ color: colors.danger || '#ef4444' }}>{issueError}</Text> : null}
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted }}>Wyszukaj pracownika</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                placeholder="Imię i nazwisko"
                value={issueEmployeeQuery}
                onChangeText={(v) => setIssueEmployeeQuery(v)}
                placeholderTextColor={colors.muted}
              />
              {employeesLoading ? <Text style={{ color: colors.muted }}>Ładowanie pracowników…</Text> : null}
              {!employeesLoading ? (
                <View style={{ gap: 6 }}>
                  {(employees || [])
                    .filter(e => {
                      const q = issueEmployeeQuery.trim().toLowerCase();
                      if (!q) return true;
                      const full = `${e.first_name || ''} ${e.last_name || ''}`.trim().toLowerCase();
                      return full.includes(q);
                    })
                    .slice(0, 20)
                    .map((emp) => (
                      <Pressable key={String(emp.id)} onPress={() => setSelectedEmployee(emp)} style={({ pressed }) => [{ padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, opacity: pressed ? 0.9 : 1 }]}> 
                        <Text style={{ color: colors.text }}>{emp.first_name} {emp.last_name}</Text>
                      </Pressable>
                    ))
                  }
                </View>
              ) : null}
              {selectedEmployee ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.muted }}>Wybrany pracownik:</Text>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{selectedEmployee.first_name} {selectedEmployee.last_name}</Text>
                </View>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Pressable onPress={closeIssueModal} disabled={issueSaving} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}> 
                <Text style={{ color: colors.text }}>Anuluj</Text>
              </Pressable>
              <Pressable onPress={confirmIssue} disabled={issueSaving || (!selectedEmployee && !issueEmployeeQuery.trim())} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 }]}> 
                <Text style={{ color: '#fff' }}>{issueSaving ? 'Wydawanie…' : 'Wydaj'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal szczegółów BHP */}
      <Modal visible={!!detailItem} animationType="slide" transparent onRequestClose={closeDetails}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Szczegóły BHP</Text>
            {detailLoading ? <Text style={{ color: colors.muted }}>Ładowanie…</Text> : null}
            {detailError ? <Text style={{ color: colors.danger }}>{detailError}</Text> : null}
            <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ gap: 8, paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
              {/* Nagłówek */}
              <Text style={{ color: colors.text, fontWeight: '700' }}>{(detailItem?.manufacturer && detailItem?.model) ? `${detailItem.manufacturer} ${detailItem.model}` : (detailItem?.name || 'Sprzęt BHP')}</Text>

              {/* Dwukolumnowe wiersze danych */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Producent:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.manufacturer || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Model:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.model || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Seryjny:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.serial_number || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Katalogowy:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.catalog_number || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Data produkcji:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.production_date || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Rozpoczęcie użytkowania:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.harness_start_date || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Przegląd:</Text>
                  <Text style={{ color: colors.text }}>{detailItem?.inspection_date || detailItem?.last_inspection_at || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Przypisany:</Text>
                  <Text style={{ color: colors.text }}>{`${detailItem?.assigned_employee_first_name || detailItem?.employee_first_name || ''} ${detailItem?.assigned_employee_last_name || detailItem?.employee_last_name || ''}`.trim() || '—'}</Text>
                </View>
                {(() => {
                  const activeIssue = (detailData?.issues || []).find(i => String(i?.status || '').toLowerCase() === 'wydane');
                  const bn = activeIssue?.employee_brand_number
                    || detailItem?.employee_brand_number
                    || detailItem?.assigned_employee_brand_number
                    || detailItem?.brand_number
                    || '';
                  if (!bn) return null;
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Numer służbowy:</Text>
                      <Text style={{ color: colors.text }}>{bn}</Text>
                    </View>
                  );
                })()}
              </View>

              {/* Sekcja Amortyzator, tylko jeśli są dane */}
              {([detailItem?.shock_absorber_name, detailItem?.shock_absorber_model, detailItem?.shock_absorber_serial, detailItem?.shock_absorber_catalog_number, detailItem?.shock_absorber_production_date, detailItem?.shock_absorber_start_date].some(v => !!v)) ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Amortyzator</Text>
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Nazwa:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.shock_absorber_name || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Model:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.shock_absorber_model || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Nr seryjny:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.shock_absorber_serial || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Nr katalogowy:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.shock_absorber_catalog_number || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Data produkcji:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.shock_absorber_production_date || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Rozpoczęcie użytkowania:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.shock_absorber_start_date || '—'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Sekcja SRD, tylko jeśli są dane */}
              {([detailItem?.srd_manufacturer, detailItem?.srd_model, detailItem?.srd_serial_number, detailItem?.srd_catalog_number, detailItem?.srd_production_date].some(v => !!v)) ? (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Urządzenie samohamowne</Text>
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Producent:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.srd_manufacturer || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Model:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.srd_model || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Nr seryjny:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.srd_serial_number || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Nr katalogowy:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.srd_catalog_number || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Data produkcji:</Text>
                      <Text style={{ color: colors.text }}>{detailItem?.srd_production_date || '—'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Przegląd za X dni */}
              {(() => {
                const ts = getInspectionTs(detailItem);
                if (ts == null) return null;
                const days = Math.ceil((ts - Date.now()) / (1000 * 60 * 60 * 24));
                const label = days >= 0 ? `Przegląd za ${days} dni` : `Przegląd ${Math.abs(days)} dni temu`;
                const bg = days >= 0 ? (colors.success || '#10b981') : (colors.danger || '#ef4444');
                return (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999 }}>
                      <Text style={{ color: '#fff' }}>{label}</Text>
                    </View>
                  </View>
                );
              })()}

              {/* Historia wydań/zwrotów */}
              {detailData?.issues ? (
                <>
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 10 }}>Historia wydań/zwrotów</Text>
                  {detailData.issues.length > 0 ? detailData.issues.map((iss) => (
                    <View key={String(iss.id)} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.text }}>Wydano — {iss.employee_first_name} {iss.employee_last_name} [{iss.employee_brand_number}]</Text>
                      <Text style={{ color: colors.muted }}>{iss.issued_at}</Text>
                    </View>
                  )) : (
                    <Text style={{ color: colors.muted }}>Brak aktywnych wydań</Text>
                  )}
                </>
              ) : null}

              {detailData?.returns ? (
                <>
                  {detailData.returns.length > 0 ? detailData.returns.map((ret) => (
                    <View key={String(ret.id)} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.text }}>Zwrot: {ret.returned_at}</Text>
                      <Text style={{ color: colors.muted }}>Zwrócono — {ret.employee_first_name} {ret.employee_last_name} [{ret.employee_brand_number}]</Text>
                    </View>
                  )) : null}
                </>
              ) : null}

              {!detailData?.issues && !detailData?.returns ? (
                <Text style={{ color: colors.muted, marginTop: 6 }}>Brak dodatkowych szczegółów</Text>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Pressable onPress={closeDetails} style={({ pressed }) => [{ paddingHorizontal: 14, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, opacity: pressed ? 0.85 : 1 }]}> 
                <Text style={{ color: colors.text }}>Zamknij</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  filterRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  filterInput: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  dropdownToggle: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 36, justifyContent: 'center' },
  dropdownToggleText: { color: '#111827' },
  dropdown: { borderWidth: 1, borderColor: '#eee', borderRadius: 6, marginBottom: 8, backgroundColor: '#fff' },
  dropdownItem: { paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 12, backgroundColor: '#fafafa' },
  toolName: { fontSize: 18, fontWeight: '600', marginBottom: 6 },
  toolMeta: { color: '#666', marginTop: 4 },
  separator: { height: 1, backgroundColor: '#eee' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' },
  tile: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, marginBottom: 12 },
  statusChip: { borderWidth: 1, borderColor: '#eee', borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 480, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 }
});
