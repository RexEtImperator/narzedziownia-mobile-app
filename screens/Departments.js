import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { usePermissions } from '../lib/PermissionsContext';

export default function DepartmentsScreen() {
  const { colors } = useTheme();
  const [departments, setDepartments] = useState([]);
  const [dbDepartments, setDbDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Uprawnienia z kontekstu
  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const canManageDepartments = hasPermission('manage_departments');
  const canViewDepartments = canManageDepartments || hasPermission('view_admin') || hasPermission('system_settings');

  const [showModal, setShowModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '', managerId: '', status: 'active' });
  const [formErrors, setFormErrors] = useState({});
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    (async () => {
       try { await api.init(); } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!permsReady || !canViewDepartments) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const [deptData, empData] = await Promise.all([
          api.get('/api/departments'),
          api.get('/api/employees')
        ]);
        setDbDepartments(Array.isArray(deptData) ? deptData : []);
        const normalizedEmp = (Array.isArray(empData) ? empData : []).map(e => ({
          id: e.id || e.employee_id || e.brand_number,
          name: `${e.first_name} ${e.last_name}`,
          department: e.department || e.department_name || ''
        }));
        setEmployees(normalizedEmp);
      } catch (e) {
        setError(e.message || 'Błąd pobierania działów');
        setDbDepartments([]);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [permsReady, canViewDepartments]);

  const employeeCountFor = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => {
      const n = (e.department || '').trim().toLowerCase();
      if (!n) return;
      map.set(n, (map.get(n) || 0) + 1);
    });
    return map;
  }, [employees]);

  useEffect(() => {
    const dbList = Array.isArray(dbDepartments) ? dbDepartments : [];
    const dbNames = new Set(dbList.map(d => (d.name || '').trim()).filter(Boolean));
    const employeeDeptNames = new Set((Array.isArray(employees) ? employees : [])
      .map(e => (e.department || '').trim())
      .filter(Boolean));

    const merged = dbList.map(d => {
      const managerIdRaw = d.managerId ?? d.manager_id ?? '';
      const managerId = managerIdRaw ? String(managerIdRaw) : '';
      const managerName = (Array.isArray(employees) ? employees : []).find(e => String(e.id) === managerId)?.name || 'Nie przypisano';
      return {
        id: d.id,
        name: d.name,
        description: d.description || '',
        managerId,
        managerName,
        employeeCount: employeeCountFor.get((d.name || '').trim().toLowerCase()) || 0,
        status: d.status || 'active',
        isMissing: false
      };
    });

    employeeDeptNames.forEach(name => {
      if (!dbNames.has(name)) {
        merged.push({
          id: null,
          name,
          description: '',
          managerId: '',
          managerName: 'Nie przypisano',
          employeeCount: employeeCountFor.get((name || '').trim().toLowerCase()) || 0,
          status: 'active',
          isMissing: true
        });
      }
    });

    setDepartments(merged);
  }, [dbDepartments, employees, employeeCountFor]);

  const openAdd = () => {
    setEditingDepartment(null);
    setFormData({ name: '', description: '', managerId: '', status: 'active' });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (dept) => {
    setEditingDepartment(dept);
    setFormData({ name: dept.name, description: dept.description || '', managerId: String(dept.managerId || ''), status: dept.status || 'active' });
    setFormErrors({});
    setShowModal(true);
  };

  const validateAndSubmit = async () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Nazwa jest wymagana';
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const isExisting = !!(editingDepartment && editingDepartment.id != null);
      if (isExisting) {
        const updated = await api.put(`/api/departments/${editingDepartment.id}`, {
          name: formData.name,
          description: formData.description,
          manager_id: formData.managerId || null,
          status: formData.status
        });
        const managerName = (employees || []).find(e => String(e.id) === String(updated.manager_id ?? formData.managerId))?.name || 'Nie przypisano';
        setDbDepartments(prev => prev.map(d => d.id === editingDepartment.id ? { ...d, ...updated } : d));
        setDepartments(prev => prev.map(d => d.id === editingDepartment.id ? { ...d, ...formData, managerName, isMissing: false } : d));
      } else {
        const created = await api.post('/api/departments', {
          name: formData.name,
          description: formData.description,
          manager_id: formData.managerId || null,
          status: formData.status
        });
        const managerName = (employees || []).find(e => String(e.id) === String(created.manager_id ?? formData.managerId))?.name || 'Nie przypisano';
        const newDepartment = {
          id: created.id,
          name: created.name,
          description: created.description || formData.description,
          managerId: created.manager_id ?? formData.managerId,
          managerName,
          employeeCount: 0,
          status: created.status || formData.status,
          isMissing: false
        };
        setDbDepartments(prev => [...prev, created]);
        setDepartments(prev => {
          if (editingDepartment && editingDepartment.isMissing) {
            const nameKey = (editingDepartment.name || '').trim().toLowerCase();
            return prev.map(d => (d.id == null && (d.name || '').trim().toLowerCase() === nameKey) ? { ...newDepartment } : d);
          }
          return [...prev, newDepartment];
        });
      }
      try { const refreshed = await api.get('/api/departments'); setDbDepartments(Array.isArray(refreshed) ? refreshed : []); } catch {}
      setShowModal(false);
    } catch (e) {
      setFormErrors(prev => ({ ...prev, submit: e.message || 'Nie udało się zapisać działu' }));
    }
  };

  const confirmDelete = async (dept) => {
    setDeleteLoading(true);
    try {
      if (dept.id) {
        await api.delete(`/api/departments/${dept.id}`);
        setDbDepartments(prev => prev.filter(d => d.id !== dept.id));
        setDepartments(prev => prev.filter(d => d.id !== dept.id));
      } else {
        const name = (dept.name || '').trim();
        if (name) {
          await api.delete(`/api/departments/by-name/${encodeURIComponent(name)}`);
        }
        setDepartments(prev => prev.filter(d => (d.name || '').trim() !== name));
      }
      try { const refreshed = await api.get('/api/departments'); setDbDepartments(Array.isArray(refreshed) ? refreshed : []); } catch {}
    } catch (e) {
      setError(e.message || 'Nie udało się usunąć działu');
    } finally {
      setDeleteLoading(false);
    }
  };

  const ManagerSelector = ({ value, onChange }) => (
    <View>
      <Text style={[styles.label, { color: colors.muted }]}>Kierownik</Text>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
        <FlatList
          data={employees}
          keyExtractor={(item) => String(item.id)}
          style={{ maxHeight: 160 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onChange(String(item.id))} style={{ padding: 8 }}>
              <Text style={{ color: String(value) === String(item.id) ? colors.primary : colors.text }}>
                {item.name} {String(value) === String(item.id) ? '✓' : ''}
              </Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      {!permsReady ? (
        <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie uprawnień…</Text>
      ) : !canViewDepartments ? (
        <Text style={[styles.error, { color: colors.danger }]}>Brak uprawnień do przeglądania działów</Text>
      ) : (
        <>
          {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {canManageDepartments ? (
              <Pressable onPress={openAdd} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 8, marginLeft: 'auto' }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Dodaj</Text>
              </Pressable>
            ) : null}
          </View>
          {loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={departments}
              keyExtractor={(item) => item.id != null ? String(item.id) : `missing-${(item.name || '').trim().toLowerCase()}`}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} className="h-px" />}
              renderItem={({ item }) => (
                <View style={styles.item} className="py-2">
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.itemName, { color: item.isMissing ? colors.warning : colors.text }]} className="font-semibold">
                      {item.name}{typeof item.employeeCount === 'number' ? ` (${item.employeeCount})` : ''}
                    </Text>
                    {canManageDepartments ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginLeft: 'auto' }}>
                        <Pressable onPress={() => openEdit(item)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
                          <Text style={{ color: colors.primary }}>Edytuj</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmDelete(item)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
                          <Text style={{ color: colors.danger }}>Usuń</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.itemCode, { color: colors.muted }]}>{item.description}</Text>
                  <Text style={[styles.itemCode, { color: colors.muted }]}>Kierownik: {item.managerName || 'Nie przypisano'}</Text>
                </View>
              )}
            />
          )}

          <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
            <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
              <Text style={[styles.title, { color: colors.text }]}>{editingDepartment ? 'Edytuj dział' : 'Dodaj dział'}</Text>
              {formErrors.submit ? <Text style={[styles.error, { color: colors.danger }]}>{formErrors.submit}</Text> : null}
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={[styles.label, { color: colors.muted }]}>Nazwa</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={formData.name}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, name: v }))}
                    placeholder="np. Narzędziownia"
                    placeholderTextColor={colors.muted}
                  />
                  {formErrors.name ? <Text style={[styles.error, { color: colors.danger }]}>{formErrors.name}</Text> : null}
                </View>
                <View>
                  <Text style={[styles.label, { color: colors.muted }]}>Opis</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text, height: 80 }]}
                    value={formData.description}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, description: v }))}
                    placeholder="Opis działu"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                </View>
                <ManagerSelector value={formData.managerId} onChange={(v) => setFormData(prev => ({ ...prev, managerId: v }))} />
                <View>
                  <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={formData.status}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, status: v }))}
                    placeholder="active/inactive"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                <Pressable onPress={() => setShowModal(false)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
                  <Text style={{ color: colors.text }}>Anuluj</Text>
                </Pressable>
                <Pressable onPress={validateAndSubmit} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.primary, borderRadius: 8 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Zapisz</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          {deleteLoading ? <Text style={[styles.muted, { color: colors.muted, marginTop: 8 }]}>Usuwanie…</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: '#0f172a' },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  label: { fontSize: 12, marginBottom: 4 }
});
