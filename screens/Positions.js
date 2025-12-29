import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { usePermissions } from '../lib/PermissionsContext';

export default function PositionsScreen() {
  const { colors } = useTheme();
  const [positions, setPositions] = useState([]);
  const [dbPositions, setDbPositions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Uprawnienia z kontekstu
  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const canManagePositions = hasPermission('manage_positions');
  const canViewPositions = canManagePositions || hasPermission('view_admin') || hasPermission('system_settings');

  const [showModal, setShowModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    departmentId: '',
    requirements: '',
    status: 'active'
  });
  const [formErrors, setFormErrors] = useState({});
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    (async () => {
       try { await api.init(); } catch {}
    })();
  }, []);

  const fetchPositions = async () => {
    try {
      const data = await api.get('/api/positions');
      const normalized = (Array.isArray(data) ? data : []).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description || '',
        departmentId: p.departmentId || p.department_id || '',
        departmentName: p.departmentName || p.department_name || '',
        requirements: p.requirements || '',
        employeeCount: p.employeeCount || p.employee_count || 0,
        status: p.status || 'active'
      }));
      setDbPositions(normalized);
    } catch (e) {
      setDbPositions([]);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await api.get('/api/departments');
      const normalized = (Array.isArray(data) ? data : []).map(d => ({ id: d.id, name: d.name }));
      setDepartments(normalized);
    } catch (e) {
      setDepartments([]);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await api.get('/api/employees');
      const normalized = (Array.isArray(data) ? data : []).map(e => ({
        id: e.id || e.employee_id || e.brand_number,
        name: `${e.first_name} ${e.last_name}`,
        position: e.position || e.position_name || ''
      }));
      setEmployees(normalized);
    } catch (e) {
      setEmployees([]);
    }
  };

  useEffect(() => {
    if (!permsReady || !canViewPositions) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        await Promise.all([fetchPositions(), fetchDepartments(), fetchEmployees()]);
      } catch (e) {
        setError(e.message || 'Błąd pobierania stanowisk');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [permsReady, canViewPositions]);

  const employeeCountFor = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => {
      const n = (e.position || '').trim().toLowerCase();
      if (!n) return;
      map.set(n, (map.get(n) || 0) + 1);
    });
    return map;
  }, [employees]);

  useEffect(() => {
    const dbList = Array.isArray(dbPositions) ? dbPositions : [];
    const dbNames = new Set(dbList.map(p => (p.name || '').trim()).filter(Boolean));
    const employeePositionNames = new Set((Array.isArray(employees) ? employees : [])
      .map(e => (e.position || '').trim())
      .filter(Boolean));

    const getDepartmentNameById = (deptId) => {
      const idNum = Number(deptId);
      if (!Number.isFinite(idNum) || idNum <= 0) return '';
      const found = (Array.isArray(departments) ? departments : []).find(d => Number(d.id) === idNum);
      return found?.name || '';
    };

    const merged = dbList.map(p => ({
      ...p,
      departmentName: p.departmentName || getDepartmentNameById(p.departmentId || p.department_id),
      employeeCount: employeeCountFor.get((p.name || '').trim().toLowerCase()) || 0,
      isMissing: false
    }));
    employeePositionNames.forEach(name => {
      if (!dbNames.has(name)) {
        const nKey = (name || '').trim();
        merged.push({
          id: null,
          name: nKey,
          description: '',
          departmentId: '',
          departmentName: '',
          requirements: '',
          employeeCount: employeeCountFor.get(nKey.toLowerCase()) || 0,
          status: 'active',
          isMissing: true
        });
      }
    });
    setPositions(merged);
  }, [dbPositions, employees, departments, employeeCountFor]);

  const openAdd = () => {
    setEditingPosition(null);
    setFormData({ name: '', description: '', departmentId: '', requirements: '', status: 'active' });
    setFormErrors({});
    setShowModal(true);
  };

  const openEdit = (pos) => {
    setEditingPosition(pos);
    setFormData({
      name: pos.name,
      description: pos.description || '',
      departmentId: String(pos.departmentId ?? ''),
      requirements: pos.requirements || '',
      status: pos.status || 'active'
    });
    setFormErrors({});
    setShowModal(true);
  };

  const validateAndSubmit = async () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Nazwa jest wymagana';
    if (!String(formData.departmentId || '').trim()) errs.departmentId = 'Departament jest wymagany';
    setFormErrors(errs);
    if (Object.keys(errs).length) return;

    try {
      const departmentIdNum = Number(formData.departmentId);
      if (!Number.isInteger(departmentIdNum) || departmentIdNum <= 0) {
        setFormErrors(prev => ({ ...prev, departmentId: 'Nieprawidłowy departament' }));
        return;
      }
      const departmentName = (departments || []).find(d => Number(d.id) === departmentIdNum)?.name || '';

      if (editingPosition && editingPosition.id != null) {
        const updated = await api.put(`/api/positions/${editingPosition.id}`, {
          name: formData.name,
          description: formData.description,
          department_id: departmentIdNum,
          requirements: formData.requirements,
          status: formData.status
        });
        setDbPositions(prev => prev.map(p => p.id === editingPosition.id ? { ...p, ...updated } : p));
        setPositions(prev => prev.map(p => p.id === editingPosition.id ? { ...p, ...formData, departmentId: departmentIdNum, departmentName, isMissing: false } : p));
      } else {
        const created = await api.post('/api/positions', {
          name: formData.name,
          description: formData.description,
          department_id: departmentIdNum,
          requirements: formData.requirements,
          status: formData.status
        });
        const newPosition = {
          id: created.id,
          name: created.name,
          description: created.description || formData.description,
          departmentId: created.department_id ?? departmentIdNum,
          departmentName,
          requirements: created.requirements || formData.requirements,
          employeeCount: 0,
          status: created.status || formData.status,
          isMissing: false
        };
        setDbPositions(prev => [...prev, { id: created.id, name: created.name, description: created.description || '' }]);
        setPositions(prev => {
          if (editingPosition && editingPosition.isMissing) {
            const nameKey = (editingPosition.name || '').trim().toLowerCase();
            return prev.map(p => (p.id == null && (p.name || '').trim().toLowerCase() === nameKey) ? { ...newPosition } : p);
          }
          return [...prev, newPosition];
        });
      }
      try { await fetchPositions(); } catch {}
      setShowModal(false);
    } catch (e) {
      setFormErrors(prev => ({ ...prev, submit: e.message || 'Nie udało się zapisać stanowiska' }));
    }
  };

  const confirmDelete = async (pos) => {
    setDeleteLoading(true);
    try {
      if (pos.id) {
        await api.delete(`/api/positions/${pos.id}`);
        setDbPositions(prev => prev.filter(p => p.id !== pos.id));
        setPositions(prev => prev.filter(p => p.id !== pos.id));
      } else {
        const name = (pos.name || '').trim();
        if (name) {
          await api.delete(`/api/positions/by-name/${encodeURIComponent(name)}`);
        }
        setPositions(prev => prev.filter(p => (p.name || '').trim() !== name));
      }
      try { await fetchPositions(); } catch {}
    } catch (e) {
      setError(e.message || 'Nie udało się usunąć stanowiska');
    } finally {
      setDeleteLoading(false);
    }
  };

  const DepartmentSelector = ({ value, onChange }) => (
    <View>
      <Text style={[styles.label, { color: colors.muted }]}>Dział</Text>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
        <FlatList
          data={departments}
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
      {formErrors.departmentId ? <Text style={[styles.error, { color: colors.danger }]}>{formErrors.departmentId}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      {!permsReady ? (
        <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie uprawnień…</Text>
      ) : !canViewPositions ? (
        <Text style={[styles.error, { color: colors.danger }]}>Brak uprawnień do przeglądania stanowisk</Text>
      ) : (
        <>
          {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            {canManagePositions ? (
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
              data={positions}
              keyExtractor={(item) => item.id != null ? String(item.id) : `missing-${(item.name || '').trim().toLowerCase()}`}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} className="h-px" />}
              renderItem={({ item }) => (
                <View style={styles.item} className="py-2">
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.itemName, { color: item.isMissing ? colors.warning : colors.text }]} className="font-semibold">
                      {item.name}{typeof item.employeeCount === 'number' ? ` (${item.employeeCount})` : ''}
                    </Text>
                    {canManagePositions ? (
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
                  <Text style={[styles.itemCode, { color: colors.muted }]}>Dział: {item.departmentName || '—'}</Text>
                  <Text style={[styles.itemCode, { color: colors.muted }]}>{item.description}</Text>
                </View>
              )}
            />
          )}

          <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
            <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
              <Text style={[styles.title, { color: colors.text }]}>{editingPosition ? 'Edytuj stanowisko' : 'Dodaj stanowisko'}</Text>
              {formErrors.submit ? <Text style={[styles.error, { color: colors.danger }]}>{formErrors.submit}</Text> : null}
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={[styles.label, { color: colors.muted }]}>Nazwa</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={formData.name}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, name: v }))}
                    placeholder="np. Mechanik"
                    placeholderTextColor={colors.muted}
                  />
                  {formErrors.name ? <Text style={[styles.error, { color: colors.danger }]}>{formErrors.name}</Text> : null}
                </View>

                <DepartmentSelector value={formData.departmentId} onChange={(v) => setFormData(prev => ({ ...prev, departmentId: v }))} />

                <View>
                  <Text style={[styles.label, { color: colors.muted }]}>Opis</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text, height: 80 }]}
                    value={formData.description}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, description: v }))}
                    placeholder="Opis stanowiska"
                    placeholderTextColor={colors.muted}
                    multiline
                  />
                </View>

                <View>
                  <Text style={[styles.label, { color: colors.muted }]}>Wymagania</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={formData.requirements}
                    onChangeText={(v) => setFormData(prev => ({ ...prev, requirements: v }))}
                    placeholder="np. uprawnienia SEP"
                    placeholderTextColor={colors.muted}
                  />
                </View>

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
  wrapper: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  separator: { height: 1, backgroundColor: '#eee' },
  item: { paddingVertical: 8 },
  itemName: { fontWeight: '600' },
  itemCode: { color: '#666' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  label: { fontSize: 12, marginBottom: 4 }
});
