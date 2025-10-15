import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList, ScrollView, TouchableOpacity } from 'react-native';
import api from '../lib/api.js';

export default function ToolsScreen() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [foundTool, setFoundTool] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const data = await api.get('/api/tools');
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setTools(list);
    } catch (e) {
      setError(e.message || 'Błąd pobierania narzędzi');
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const searchByCode = async () => {
    setError('');
    setFoundTool(null);
    try {
      await api.init();
      const result = await api.get(`/api/tools/search?code=${encodeURIComponent(code)}`);
      setFoundTool(result);
    } catch (e) {
      setError(e.message || 'Nie znaleziono narzędzia');
    }
  };

  // Zestawy unikalnych kategorii i statusów do filtrów
  const categories = [...new Set((tools || []).map(t => t?.category || t?.category_name).filter(Boolean))];
  const statuses = [...new Set((tools || []).map(t => {
    const computed = (t?.quantity === 1 && (t?.service_quantity || 0) > 0) ? 'serwis' : (t?.status || 'dostępne');
    return computed;
  }).filter(Boolean))];

  // Filtrowanie jak w web: nazwa/SKU/kategoria/nr ew. + kategoria + status (z uwzględnieniem serwisu)
  const filteredTools = (tools || []).filter(t => {
    const name = t?.name || t?.tool_name || '';
    const sku = t?.sku || '';
    const cat = t?.category || t?.category_name || '';
    const inv = t?.inventory_number || t?.code || t?.barcode || t?.qr_code || '';
    const matchesSearch = !searchTerm || [name, sku, cat, inv].some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !selectedCategory || cat === selectedCategory;
    const computedStatus = (t?.quantity === 1 && (t?.service_quantity || 0) > 0) ? 'serwis' : (t?.status || 'dostępne');
    const matchesStatus = !selectedStatus || computedStatus === selectedStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <View style={styles.wrapper} className="flex-1 bg-slate-50 p-4">
      <Text style={styles.title} className="text-2xl font-bold text-slate-900 mb-3">Narzędzia</Text>
      {/* Sekcja wyszukiwarki i filtrów */}
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TextInput
          style={styles.filterInput}
          className="flex-1 border border-slate-300 rounded-md px-2 h-10"
          placeholder="Szukaj: nazwa, SKU, kategoria, nr ew."
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TouchableOpacity style={styles.dropdownToggle} className="border border-slate-300 rounded-md px-2 h-9 justify-center" onPress={() => setShowCategoryDropdown(v => !v)}>
          <Text style={styles.dropdownToggleText} className="text-gray-900">{selectedCategory || 'Wszystkie kategorie'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dropdownToggle} className="border border-slate-300 rounded-md px-2 h-9 justify-center" onPress={() => setShowStatusDropdown(v => !v)}>
          <Text style={styles.dropdownToggleText} className="text-gray-900">{selectedStatus || 'Wszystkie statusy'}</Text>
        </TouchableOpacity>
      </View>
      {showCategoryDropdown && (
        <View style={styles.dropdown} className="border border-slate-200 rounded-md mb-2 bg-white">
          <TouchableOpacity style={styles.dropdownItem} className="py-2 px-2 border-b border-slate-100" onPress={() => { setSelectedCategory(''); setShowCategoryDropdown(false); }}>
            <Text>Wszystkie kategorie</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity key={String(cat)} style={styles.dropdownItem} className="py-2 px-2 border-b border-slate-100" onPress={() => { setSelectedCategory(cat); setShowCategoryDropdown(false); }}>
              <Text>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showStatusDropdown && (
        <View style={styles.dropdown} className="border border-slate-200 rounded-md mb-2 bg-white">
          <TouchableOpacity style={styles.dropdownItem} className="py-2 px-2 border-b border-slate-100" onPress={() => { setSelectedStatus(''); setShowStatusDropdown(false); }}>
            <Text>Wszystkie statusy</Text>
          </TouchableOpacity>
          {statuses.map(st => (
            <TouchableOpacity key={String(st)} style={styles.dropdownItem} className="py-2 px-2 border-b border-slate-100" onPress={() => { setSelectedStatus(st); setShowStatusDropdown(false); }}>
              <Text>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.row} className="flex-row items-center gap-2 mb-3">
        <TextInput style={styles.input} className="flex-1 border border-slate-300 rounded-md px-2 h-10" placeholder="Kod/QR/SKU" value={code} onChangeText={setCode} />
        <Button title="Szukaj" onPress={searchByCode} />
      </View>
      {foundTool && (
        <View style={styles.card} className="p-3 border border-slate-200 rounded-lg mb-3 bg-slate-50">
          <Text style={styles.toolName} className="text-lg font-semibold">{foundTool.name || foundTool.tool_name || '—'}</Text>
          <Text style={styles.toolMeta} className="text-slate-600">SKU: {foundTool.sku || '—'} | Nr. ew.: {foundTool.inventory_number || foundTool.code || foundTool.barcode || foundTool.qr_code || '—'}</Text>
          <Text style={styles.toolMeta} className="text-slate-600">Numer fabryczny: {foundTool.serial_number || '—'} | Kategoria: {foundTool.category || '—'}</Text>
          <Text style={styles.toolMeta} className="text-slate-600">Status: {foundTool.status || '—'} | Lokalizacja: {foundTool.location || '—'}</Text>
        </View>
      )}

      {error ? <Text style={styles.error} className="text-red-500 mb-2">{error}</Text> : null}
      {loading ? <Text style={styles.muted} className="text-slate-600">Ładowanie…</Text> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 900 }}>
            <View style={[styles.tableHeader, styles.tableRow]} className="bg-slate-50 rounded-t-md flex-row py-2 px-2">
              <Text style={[styles.th, styles.colInv]}>Nr. ew.</Text>
              <Text style={[styles.th, styles.colName]}>Nazwa</Text>
              <Text style={[styles.th, styles.colSerial]}>Numer fabryczny</Text>
              <Text style={[styles.th, styles.colCategory]}>Kategoria</Text>
              <Text style={[styles.th, styles.colStatus]}>Status</Text>
              <Text style={[styles.th, styles.colLocation]}>Lokalizacja</Text>
              <Text style={[styles.th, styles.colSku]}>SKU</Text>
            </View>
            <FlatList
              data={filteredTools}
              keyExtractor={(item) => String(item.id || item.tool_id || Math.random())}
              ItemSeparatorComponent={() => <View style={styles.separator} className="h-px bg-slate-200" />}
              renderItem={({ item }) => (
                <View style={styles.tableRow} className="flex-row py-2 px-2">
                  <Text style={[styles.td, styles.colInv]} className="text-gray-700">{item.inventory_number || item.code || '—'}</Text>
                  <Text style={[styles.td, styles.colName]} className="text-gray-700">{item.name || item.tool_name || '—'}</Text>
                  <Text style={[styles.td, styles.colSerial]} className="text-gray-700">{item.serial_number || '—'}</Text>
                  <Text style={[styles.td, styles.colCategory]} className="text-gray-700">{item.category || item.category_name || '—'}</Text>
                  <Text style={[styles.td, styles.colStatus]} className="text-gray-700"> {(item?.quantity === 1 && (item?.service_quantity || 0) > 0) ? 'serwis' : (item?.status || '—')} </Text>
                  <Text style={[styles.td, styles.colLocation]} className="text-gray-700">{item.location || '—'}</Text>
                  <Text style={[styles.td, styles.colSku]} className="text-gray-700">{item.sku || '—'}</Text>
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
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 12, backgroundColor: '#fafafa' },
  toolName: { fontSize: 18, fontWeight: '600' },
  toolMeta: { color: '#666' },
  separator: { height: 1, backgroundColor: '#eee' },
  error: { color: 'red', marginBottom: 8 },
  muted: { color: '#666' },
  tableHeader: { backgroundColor: '#f8fafc', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 8 },
  th: { fontWeight: '700', color: '#111827' },
  td: { color: '#374151' },
  colInv: { width: 120 },
  colName: { width: 200 },
  colSerial: { width: 160 },
  colCategory: { width: 140 },
  colStatus: { width: 120 },
  colLocation: { width: 160 },
  colSku: { width: 120 }
});