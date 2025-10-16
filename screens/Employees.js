import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api';

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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        await api.init();
        const data = await api.get('/api/employees');
        setEmployees(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || 'Błąd pobierania pracowników');
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold mb-3">Pracownicy</Text>
      {/* Sekcja wyszukiwarki i filtrów */}
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TextInput
          style={[styles.filterInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
          className="flex-1 border border-slate-300 rounded-md px-2 h-10"
          placeholder="Szukaj: imię, nazwisko, telefon, nr służbowy"
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholderTextColor={colors.muted}
        />
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
            <Text>Wszystkie działy</Text>
          </TouchableOpacity>
          {departmentNames.map(dep => (
            <TouchableOpacity key={String(dep)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterDepartment(dep); setShowDeptDropdown(false); }}>
              <Text>{dep}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showPosDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterPosition('all'); setShowPosDropdown(false); }}>
            <Text>Wszystkie stanowiska</Text>
          </TouchableOpacity>
          {positionNames.map(pos => (
            <TouchableOpacity key={String(pos)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setFilterPosition(pos); setShowPosDropdown(false); }}>
              <Text>{pos}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
      {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 900 }}>
            <View style={[styles.tableHeader, styles.tableRow, { backgroundColor: colors.card }]} className="rounded-t-md flex-row py-2 px-2">
              <Text style={[styles.th, styles.colName, { color: colors.text }]} className="font-bold">Imię i nazwisko</Text>
              <Text style={[styles.th, styles.colBrand, { color: colors.text }]} className="font-bold">Numer służbowy</Text>
              <Text style={[styles.th, styles.colPhone, { color: colors.text }]} className="font-bold">Telefon</Text>
              <Text style={[styles.th, styles.colDept, { color: colors.text }]} className="font-bold">Dział</Text>
              <Text style={[styles.th, styles.colPos, { color: colors.text }]} className="font-bold">Stanowisko</Text>
            </View>
            <FlatList
              data={filteredEmployees}
              keyExtractor={(item) => String(item.id)}
              ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} className="h-px" />}
              renderItem={({ item }) => (
                <View style={styles.tableRow} className="flex-row py-2 px-2">
                  <Text style={[styles.td, styles.colName, { color: colors.text }]}>{item.first_name} {item.last_name}</Text>
                  <Text style={[styles.td, styles.colBrand, { color: colors.text }]}>{item.brand_number || '-'}</Text>
                  <Text style={[styles.td, styles.colPhone, { color: colors.text }]}>{item.phone || '-'}</Text>
                  <Text style={[styles.td, styles.colDept, { color: colors.text }]}>{item.department || item.department_name || '-'}</Text>
                  <Text style={[styles.td, styles.colPos, { color: colors.text }]}>{item.position || item.position_name || item.position_id || '-'}</Text>
                </View>
              )}
            />
          </View>
        </ScrollView>
      )}
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
  tableHeader: { backgroundColor: '#f8fafc', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8 },
  th: { fontWeight: '700', color: '#111827' },
  td: { color: '#374151' },
  colName: { width: 220 },
  colBrand: { width: 160 },
  colPhone: { width: 160 },
  colDept: { width: 180 },
  colPos: { width: 180 }
});