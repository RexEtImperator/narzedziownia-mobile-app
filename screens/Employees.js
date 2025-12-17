import { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, ScrollView, TouchableOpacity, Pressable, Alert, Modal, Platform, RefreshControl } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import AddEmployeeModal from './AddEmployeeModal';
import { showSnackbar } from '../lib/snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasPermission } from '../lib/utils';

export default function EmployeesScreen() {
  const { colors } = useTheme();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterPosition, setFilterPosition] = useState('all');
  const [showDeptDropdown, setShowDeptDropdown] = useState(false);
  const [showPosDropdown, setShowPosDropdown] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editEmpFields, setEditEmpFields] = useState({ first_name: '', last_name: '', brand_number: '', phone: '', email: '', rfid_uid: '', status: 'active', department: '', position: '', department_id: null, position_id: null });
  const [editEmpLoading, setEditEmpLoading] = useState(false);
  const [editEmpError, setEditEmpError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [showDeptSelect, setShowDeptSelect] = useState(false);
  const [showPosSelect, setShowPosSelect] = useState(false);
  const [showStatusSelect, setShowStatusSelect] = useState(false);
  const [searchRaw, setSearchRaw] = useState('');
  const [focusedSearchInput, setFocusedSearchInput] = useState(false);
  const [addEmpVisible, setAddEmpVisible] = useState(false);

  // Permission-related state
  const [currentUser, setCurrentUser] = useState(null);
  const [canViewEmployees, setCanViewEmployees] = useState(false);
  const [canManageEmployees, setCanManageEmployees] = useState(false);
  const [permsReady, setPermsReady] = useState(false);
  const [viewLogged, setViewLogged] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@current_user');
        const user = raw ? JSON.parse(raw) : null;
        setCurrentUser(user);
        setCanViewEmployees(hasPermission(user, 'view_employees'));
        setCanManageEmployees(hasPermission(user, 'manage_employees'));
      } catch {}
      setPermsReady(true);
    })();
  }, []);

  // Szybkie odświeżenie listy po dodaniu/zmianie pracownika
  const refreshEmployees = async () => {
    try {
      if (!canViewEmployees) return;
      await api.init();
      const emps = await api.get('/api/employees');
      const empsList = Array.isArray(emps) ? emps : (Array.isArray(emps?.data) ? emps.data : []);
      setEmployees(empsList);
    } catch {}
  };

  // Helper: zapis audytu (akcja + szczegóły)
  const logAudit = async (action, details = {}) => {
    try {
      await api.init();
      const payload = {
        action: String(action || 'view').toLowerCase(),
        entity: 'employee',
        details: details || {},
        timestamp: new Date().toISOString(),
      };
      try { await api.post('/api/audit', payload); } catch {}
    } catch {}
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      if (!canViewEmployees) {
        setEmployees([]);
        return;
      }
      await api.init();
      const [emps, deps, poss] = await Promise.all([
        api.get('/api/employees'),
        api.get('/api/departments'),
        api.get('/api/positions'),
      ]);
      const empsList = Array.isArray(emps) ? emps : (Array.isArray(emps?.data) ? emps.data : []);
      const depsList = Array.isArray(deps) ? deps : (Array.isArray(deps?.data) ? deps.data : []);
      const possList = Array.isArray(poss) ? poss : (Array.isArray(poss?.data) ? poss.data : []);
      setEmployees(empsList);
      setDepartments(depsList);
      setPositions(possList);
    } catch (e) {
      setError(e.message || 'Błąd pobierania pracowników');
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!permsReady) return;
    load();
  }, [permsReady, canViewEmployees]);

  // Audyt: podgląd listy pracowników przy wejściu na ekran
  useEffect(() => {
    if (permsReady && canViewEmployees && !viewLogged) {
      setViewLogged(true);
      logAudit('view', { section: 'employees' });
    }
  }, [permsReady, canViewEmployees, viewLogged]);

  // Debounce wyszukiwania
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchRaw), 300);
    return () => clearTimeout(id);
  }, [searchRaw]);

  // Synchronizuj surowe pole z parametrami filtra, jeśli ustawione gdzie indziej
  useEffect(() => { setSearchRaw(searchTerm || ''); }, [searchTerm]);

  // Zbiór nazw działów i stanowisk do filtrowania (jak w web)
  const departmentNames = Array.from(new Set((employees || []).map(e => e?.department || e?.department_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const positionNames = Array.from(new Set((employees || []).map(e => e?.position || e?.position_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  // Filtrowanie + sortowanie po numerze służbowym rosnąco (jak w web)
  const filteredEmployees = (employees || []).filter(employee => {
    const matchesSearch = !searchTerm || [employee?.first_name, employee?.last_name, employee?.phone, employee?.brand_number]
      .filter(Boolean)
      .some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
    const dept = employee?.department || employee?.department_name || '';
    const pos = employee?.position || employee?.position_name || '';
    const matchesDepartment = filterDepartment === 'all' || (dept && filterDepartment && dept.toLowerCase() === filterDepartment.toLowerCase());
    const matchesPosition = filterPosition === 'all' || (pos && filterPosition && pos.toLowerCase() === filterPosition.toLowerCase());
    return matchesSearch && matchesDepartment && matchesPosition;
  }).sort((a, b) => {
    const brandA = parseInt(a?.brand_number) || 999999;
    const brandB = parseInt(b?.brand_number) || 999999;
    return brandA - brandB;
  });

  const openEdit = (employee) => {
    if (!canManageEmployees) {
      showSnackbar({ type: 'warn', text: 'Brak uprawnień do edycji pracowników' });
      return;
    }
    const e = employee || {};
    setEditingEmployee(e);
    setEditEmpError('');
    setEditEmpLoading(false);
    setEditEmpFields({
      first_name: e?.first_name || '',
      last_name: e?.last_name || '',
      brand_number: e?.brand_number || '',
      phone: e?.phone || '',
      email: e?.email || '',
      rfid_uid: e?.rfid_uid ?? e?.rfidUid ?? '',
      status: e?.status || 'active',
      department: e?.department || e?.department_name || '',
      position: e?.position || e?.position_name || '',
      department_id: e?.department_id ?? e?.departmentId ?? e?.department?.id ?? null,
      position_id: e?.position_id ?? e?.positionId ?? e?.position?.id ?? null,
    });
  };

  const closeEdit = () => {
    setEditingEmployee(null);
    setEditEmpError('');
    setEditEmpLoading(false);
  };

  const saveEmployee = async () => {
    if (!editingEmployee) return;
    if (!canManageEmployees) {
      setEditEmpError('Brak uprawnień do zapisu pracownika');
      return;
    }
    setEditEmpError('');
    try {
      setEditEmpLoading(true);
      await api.init();
      const id = editingEmployee?.id;
      const payload = {
        first_name: editEmpFields.first_name,
        last_name: editEmpFields.last_name,
        brand_number: editEmpFields.brand_number,
        phone: editEmpFields.phone,
        email: editEmpFields.email,
        rfid_uid: editEmpFields.rfid_uid,
        status: editEmpFields.status,
        department_id: editEmpFields.department_id,
        position_id: editEmpFields.position_id,
      };
      const updated = await api.put(`/api/employees/${id}`, payload);
      const dep = departments.find(d => String(d?.id) === String(payload.department_id));
      const pos = positions.find(p => String(p?.id) === String(payload.position_id));
      const depName = dep?.name ?? dep?.department_name;
      const posName = pos?.name ?? pos?.position_name;
      setEmployees(prev => prev.map(e => e.id === id ? {
        ...e,
        ...payload,
        department: depName ?? e.department,
        department_name: depName ?? e.department_name,
        position: posName ?? e.position,
        position_name: posName ?? e.position_name,
        ...(typeof updated === 'object' ? updated : {}),
      } : e));
      // Audyt: edycja pracownika
      logAudit('update', { employee_id: id, fields: Object.keys(payload) });
      closeEdit();
    } catch (e) {
      setEditEmpError(e?.message || 'Błąd zapisu pracownika');
    } finally {
      setEditEmpLoading(false);
    }
  };

  const deleteEmployee = (employee) => {
    if (!canManageEmployees) {
      showSnackbar({ type: 'warn', text: 'Brak uprawnień do usuwania pracowników' });
      return;
    }
    const id = employee?.id;
    if (!id) { showSnackbar({ type: 'warn', text: 'Brak identyfikatora pracownika' }); return; }
    Alert.alert('Usuń pracownika', `Czy na pewno usunąć ${employee?.first_name || ''} ${employee?.last_name || ''}?`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        try {
          await api.init();
          await api.delete(`/api/employees/${id}`);
          setEmployees(prev => prev.filter(e => e.id !== id));
          showSnackbar({ type: 'success', text: 'Usunięto pracownika' });
          // Audyt: usunięcie pracownika
          logAudit('delete', { employee_id: id });
        } catch (e) {
          setError(e?.message || 'Błąd usuwania pracownika');
          showSnackbar({ type: 'error', text: e?.message || 'Błąd usuwania pracownika' });
        }
      }},
    ]);
  };

  // Akcja: regeneracja loginu pracownika
  const regenerateLogin = async (employee) => {
    if (!canManageEmployees) { showSnackbar({ type: 'warn', text: 'Brak uprawnień' }); return; }
    const id = employee?.id;
    if (!id) { showSnackbar({ type: 'warn', text: 'Brak identyfikatora pracownika' }); return; }
    try {
      await api.init();
      let resp = null;
      const payload = {
        first_name: String(employee?.first_name || '').trim(),
        last_name: String(employee?.last_name || '').trim()
      };
      const tries = [
        `/api/employees/${id}/regenerate-login`,
        `/api/employees/${id}/regenerate_login`,
        `/api/employees/${id}/actions/regenerate-login`,
      ];
      for (const path of tries) {
        try { resp = await api.post(path, payload); if (resp) break; } catch {}
      }
      if (!resp) {
        try { resp = await api.post('/api/employees/regenerate-login', { id, ...payload }); } catch {}
      }
      if (!resp) throw new Error('Nie udało się zregenerować loginu');

      const updated = resp?.employee;
      const createdLogin = resp?.createdLogin || resp?.login || updated?.login || null;
      if (updated && updated?.id) {
        setEmployees(prev => prev.map(e => (String(e.id) === String(updated.id)) ? { ...e, ...updated } : e));
      } else {
        setEmployees(prev => prev.map(e => (String(e.id) === String(id)) ? { ...e, login: createdLogin ?? e.login } : e));
      }
      showSnackbar({ type: 'success', text: createdLogin ? `Zregenerowano login: ${createdLogin}` : 'Zregenerowano login' });
      // Audyt: specjalna akcja
      logAudit('regenerate_login', { employee_id: id, createdLogin, login: createdLogin || updated?.login || employee?.login || null });
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Błąd regeneracji loginu' });
    }
  };

  // Akcja: wysyłka danych logowania na e-mail
  const sendCredentials = async (employee) => {
    if (!canManageEmployees) { showSnackbar({ type: 'warn', text: 'Brak uprawnień' }); return; }
    const id = employee?.id;
    if (!id) { showSnackbar({ type: 'warn', text: 'Brak identyfikatora pracownika' }); return; }
    if (!employee?.email) { showSnackbar({ type: 'warn', text: 'Brak e-maila pracownika' }); return; }
    try {
      await api.init();
      let resp = null;
      const tries = [
        `/api/employees/${id}/send-credentials`,
        `/api/employees/${id}/send_credentials`,
        `/api/employees/${id}/actions/send-credentials`,
      ];
      for (const path of tries) {
        try { resp = await api.post(path, {}); if (resp) break; } catch {}
      }
      if (!resp) {
        try { resp = await api.post('/api/employees/send-credentials', { id }); } catch {}
      }
      if (!resp) throw new Error('Nie udało się wysłać danych logowania');

      const updatedEmployee = resp?.employee;
      const createdLogin = resp?.createdLogin;
      const emailSent = !!(resp?.emailSent);
      if (updatedEmployee && updatedEmployee?.id) {
        setEmployees(prev => prev.map(e => (String(e.id) === String(updatedEmployee.id)) ? { ...e, ...updatedEmployee } : e));
      }
      if (emailSent) {
        showSnackbar({ type: 'success', text: createdLogin ? 'Utworzono login i wysłano e-mail z danymi' : 'Wysłano e-mail z danymi logowania' });
      } else {
        showSnackbar({ type: 'info', text: createdLogin ? 'Utworzono login, ale e-mail nie został wysłany' : 'E-mail nie został wysłany' });
      }
      // Audyt: specjalna akcja
      const loginVal = updatedEmployee?.login || employee?.login || createdLogin || null;
      logAudit('send_credentials', { employee_id: id, emailSent, createdLogin, login: loginVal });
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Błąd wysyłki danych logowania' });
    }
  };

  if (permsReady && !canViewEmployees) {
    return (
      <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
        <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold">Pracownicy</Text>
        <Text style={[styles.muted, { color: colors.muted }]}>Brak uprawnień do przeglądania pracowników.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold">Pracownicy</Text>
        {canManageEmployees ? (
          <Pressable accessibilityLabel="Dodaj nowego pracownika" onPress={() => setAddEmpVisible(true)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, pressed && { opacity: 0.8 }]}>
            <Ionicons name="add" size={22} color={colors.primary || colors.text} />
          </Pressable>
        ) : null}
      </View>
      {/* Sekcja wyszukiwarki i filtrów */}
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TextInput
          style={[styles.filterInput, { borderColor: focusedSearchInput ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]}
          className="flex-1 border border-slate-300 rounded-md px-2 h-10"
          placeholder="Szukaj: imię, nazwisko, telefon, nr służbowy"
          value={searchRaw}
          onChangeText={setSearchRaw}
          placeholderTextColor={colors.muted}
          onFocus={() => setFocusedSearchInput(true)}
          onBlur={() => setFocusedSearchInput(false)}
        />
        {searchRaw ? (
          <Pressable accessibilityLabel="Wyczyść wyszukiwanie" onPress={() => { setSearchRaw(''); setSearchTerm(''); }} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }] }>
            <Ionicons name="close-circle-outline" size={25} color={colors.muted || colors.text} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowDeptDropdown(v => !v)}>
          <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{filterDepartment === 'all' ? 'Wszystkie działy' : filterDepartment}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowPosDropdown(v => !v)}>
          <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{filterPosition === 'all' ? 'Wszystkie stanowiska' : filterPosition}</Text>
        </TouchableOpacity>
      </View>
      {showDeptDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterDepartment('all'); setShowDeptDropdown(false); }}>
            <Text style={{ color: colors.text }}>Wszystkie działy</Text>
          </TouchableOpacity>
          {departmentNames.map(dep => (
            <TouchableOpacity key={String(dep)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterDepartment(dep); setShowDeptDropdown(false); }}>
              <Text style={{ color: colors.text }}>{dep}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showPosDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterPosition('all'); setShowPosDropdown(false); }}>
            <Text style={{ color: colors.text }}>Wszystkie stanowiska</Text>
          </TouchableOpacity>
          {positionNames.map(pos => (
            <TouchableOpacity key={String(pos)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterPosition(pos); setShowPosDropdown(false); }}>
              <Text style={{ color: colors.text }}>{pos}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
      {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
        <FlatList
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} tintColor={colors.primary} />}
          data={filteredEmployees}
          keyExtractor={(item) => String(item.id)}
          ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]} className="rounded-lg p-3 mb-3">
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {item?.brand_number ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.primary }]}> 
                        <Text style={{ color: '#fff' }}>{item.brand_number}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.toolName, { color: colors.text, marginBottom: 0 }]} className="text-lg font-semibold">{item.first_name} {item.last_name}</Text>
                  </View>
                  <Text style={[styles.toolMeta, { color: colors.muted }]}>Login: {item.login || '—'}</Text>
                  <Text style={[styles.toolMeta, { color: colors.muted }]}>Telefon: {item.phone || '—'}</Text>
                  <Text style={[styles.toolMeta, { color: colors.muted }]}>Email: {item.email || '—'}</Text>
                  <Text style={[styles.toolMeta, { color: colors.muted }]}>Dział: {item.department || item.department_name || '—'}</Text>
                  <Text style={[styles.toolMeta, { color: colors.muted }]}>Stanowisko: {item.position || item.position_name || item.position_id || '—'}</Text>
                </View>
                {canManageEmployees ? (
                  <View style={{ flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable accessibilityLabel={`Regeneruj login pracownika ${item?.id}`} onPress={() => regenerateLogin(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}> 
                        <Ionicons name="refresh-circle-outline" size={20} color={colors.text} />
                      </Pressable>
                      <Pressable accessibilityLabel={`Wyślij dane logowania ${item?.id}`} onPress={() => sendCredentials(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}> 
                        <Ionicons name="mail-outline" size={20} color={colors.text} />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <Pressable accessibilityLabel={`Edytuj pracownika ${item?.id}`} onPress={() => openEdit(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}> 
                        <Ionicons name="create-outline" size={20} color={colors.text} />
                      </Pressable>
                      <Pressable accessibilityLabel={`Usuń pracownika ${item?.id}`} onPress={() => deleteEmployee(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}> 
                        <Ionicons name="trash-outline" size={20} color={colors.danger || '#e11d48'} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      {/* Modal edycji pracownika */}
      <Modal visible={!!editingEmployee} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edytuj pracownika</Text>
            {editEmpError ? <Text style={{ color: colors.danger }}>{editEmpError}</Text> : null}
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
              <Text style={{ color: colors.muted }}>Imię</Text>
              <TextInput style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Imię" placeholderTextColor={colors.muted} value={editEmpFields.first_name} onChangeText={v => setEditEmpFields(f => ({ ...f, first_name: v }))} />

              <Text style={{ color: colors.muted }}>Nazwisko</Text>
              <TextInput style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwisko" placeholderTextColor={colors.muted} value={editEmpFields.last_name} onChangeText={v => setEditEmpFields(f => ({ ...f, last_name: v }))} />

              <Text style={{ color: colors.muted }}>Numer służbowy</Text>
              <TextInput style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer służbowy" placeholderTextColor={colors.muted} value={editEmpFields.brand_number} onChangeText={v => setEditEmpFields(f => ({ ...f, brand_number: v }))} keyboardType="numeric" />

              <Text style={{ color: colors.muted }}>Telefon</Text>
              <TextInput style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Telefon" placeholderTextColor={colors.muted} value={editEmpFields.phone} onChangeText={v => setEditEmpFields(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />

              <Text style={{ color: colors.muted }}>E-mail</Text>
              <TextInput style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="E-mail" placeholderTextColor={colors.muted} value={editEmpFields.email} onChangeText={v => setEditEmpFields(f => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />

              <Text style={{ color: colors.muted }}>UID karty RFID</Text>
              <TextInput style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="UID karty RFID" placeholderTextColor={colors.muted} value={editEmpFields.rfid_uid} onChangeText={v => setEditEmpFields(f => ({ ...f, rfid_uid: v }))} autoCapitalize="none" />
              <Pressable style={[{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, height: 36, justifyContent: 'center', marginBottom: 8 }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowDeptSelect(v => !v)}>
                <Text style={{ color: colors.text }}>{
                  (departments.find(d => String(d?.id) === String(editEmpFields?.department_id))?.name
                    || departments.find(d => String(d?.department_id) === String(editEmpFields?.department_id))?.name
                    || editEmpFields.department
                    || 'Wybierz dział')
                }</Text>
              </Pressable>
              {showDeptSelect && (
                <View style={[{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 6, marginBottom: 8 }]} className="border rounded-md mb-2">
                  <ScrollView style={{ maxHeight: 240 }}>
                    {departments.map(dep => (
                      <Pressable
                        key={String(dep?.id ?? dep?.department_id)}
                        style={({ pressed }) => {
                          const selected = editEmpFields?.department_id === (dep?.id ?? dep?.department_id);
                          return [
                            {
                              borderBottomColor: colors.border,
                              borderBottomWidth: 1,
                              paddingVertical: 8,
                              paddingHorizontal: 8,
                              backgroundColor: (pressed || selected) ? colors.primary : 'transparent'
                            }
                          ];
                        }}
                        className="py-2 px-2"
                        onPress={() => {
                          setEditEmpFields(f => ({ ...f, department_id: dep?.id ?? dep?.department_id }));
                          setShowDeptSelect(false);
                        }}
                      >
                        {({ pressed }) => {
                          const selected = editEmpFields?.department_id === (dep?.id ?? dep?.department_id);
                          const tint = (pressed || selected) ? '#fff' : colors.text;
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ color: tint }}>
                                {dep?.name || dep?.department_name || String(dep?.id ?? dep?.department_id)}
                              </Text>
                              {selected && (
                                <Ionicons name="checkmark" size={18} color={tint} />
                              )}
                            </View>
                          );
                        }}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              <Pressable style={[{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, height: 36, justifyContent: 'center', marginBottom: 8 }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowPosSelect(v => !v)}>
                <Text style={{ color: colors.text }}>{
                  (positions.find(p => String(p?.id) === String(editEmpFields?.position_id))?.name
                    || positions.find(p => String(p?.position_id) === String(editEmpFields?.position_id))?.name
                    || editEmpFields.position
                    || 'Wybierz stanowisko')
                }</Text>
              </Pressable>
              {showPosSelect && (
                <View style={[{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 6, marginBottom: 8 }]} className="border rounded-md mb-2">
                  <ScrollView style={{ maxHeight: 240 }}>
                    {positions.map(pos => (
                      <Pressable
                        key={String(pos?.id ?? pos?.position_id)}
                        style={({ pressed }) => {
                          const selected = editEmpFields?.position_id === (pos?.id ?? pos?.position_id);
                          return [
                            {
                              borderBottomColor: colors.border,
                              borderBottomWidth: 1,
                              paddingVertical: 8,
                              paddingHorizontal: 8,
                              backgroundColor: (pressed || selected) ? colors.primary : 'transparent'
                            }
                          ];
                        }}
                        className="py-2 px-2"
                        onPress={() => {
                          setEditEmpFields(f => ({ ...f, position_id: pos?.id ?? pos?.position_id }));
                          setShowPosSelect(false);
                        }}
                      >
                        {({ pressed }) => {
                          const selected = editEmpFields?.position_id === (pos?.id ?? pos?.position_id);
                          const tint = (pressed || selected) ? '#fff' : colors.text;
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ color: tint }}>
                                {pos?.name || pos?.position_name || String(pos?.id ?? pos?.position_id)}
                              </Text>
                              {selected && (
                                <Ionicons name="checkmark" size={18} color={tint} />
                              )}
                            </View>
                          );
                        }}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <Text style={{ color: colors.muted }}>Status</Text>
              <Pressable style={[{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, height: 36, justifyContent: 'center', marginBottom: 8 }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowStatusSelect(v => !v)}>
                <Text style={{ color: colors.text }}>
                  {editEmpFields.status === 'active' ? 'Aktywny' : editEmpFields.status === 'inactive' ? 'Nieaktywny' : editEmpFields.status === 'suspended' ? 'Zawieszony' : (editEmpFields.status || 'Wybierz status')}
                </Text>
              </Pressable>
              {showStatusSelect && (
                <View style={[{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 6, marginBottom: 8 }]} className="border rounded-md mb-2">
                  <ScrollView style={{ maxHeight: 240 }}>
                    {[
                      { key: 'active', label: 'Aktywny' },
                      { key: 'inactive', label: 'Nieaktywny' },
                      { key: 'suspended', label: 'Zawieszony' }
                    ].map(s => (
                      <Pressable
                        key={s.key}
                        style={({ pressed }) => {
                          const selected = editEmpFields?.status === s.key;
                          return [
                            {
                              borderBottomColor: colors.border,
                              borderBottomWidth: 1,
                              paddingVertical: 8,
                              paddingHorizontal: 8,
                              backgroundColor: (pressed || selected) ? colors.primary : 'transparent'
                            }
                          ];
                        }}
                        className="py-2 px-2"
                        onPress={() => {
                          setEditEmpFields(f => ({ ...f, status: s.key }));
                          setShowStatusSelect(false);
                        }}
                      >
                        {({ pressed }) => {
                          const selected = editEmpFields?.status === s.key;
                          const tint = (pressed || selected) ? '#fff' : colors.text;
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ color: tint }}>{s.label}</Text>
                              {selected && (
                                <Ionicons name="checkmark" size={18} color={tint} />
                              )}
                            </View>
                          );
                        }}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <Pressable onPress={closeEdit} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: colors.text }}>Anuluj</Text>
              </Pressable>
              <Pressable disabled={editEmpLoading} onPress={saveEmployee} style={({ pressed }) => [{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
                <Text style={{ color: '#fff' }}>{editEmpLoading ? 'Zapisywanie…' : 'Zapisz'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <AddEmployeeModal
        visible={addEmpVisible}
        onClose={() => setAddEmpVisible(false)}
        onCreated={(created) => {
          setAddEmpVisible(false);
          refreshEmployees();
          const cid = created?.id ?? created?.employee_id ?? null;
          logAudit('create', { employee_id: cid });
        }}
      />
      {/* Audyt: utworzenie pracownika (hook w onCreated) */}
      {/* Alternatywnie można przechwycić zwracanego pracownika i logować jego ID */}
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
  separator: { height: 1, backgroundColor: '#eee' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' },
  tile: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, marginBottom: 12, ...(Platform.select({ web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.06)' }, ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 } })) },
  toolName: { fontSize: 18, fontWeight: '600', marginBottom: 6 },
  toolMeta: { color: '#666', marginTop: 4 },
  badge: { backgroundColor: '#eee', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 480, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 }
});
