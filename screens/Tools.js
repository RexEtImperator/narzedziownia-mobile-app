import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList, ScrollView, TouchableOpacity, Pressable, Alert, Modal } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import api from '../lib/api.js';
import { Ionicons } from '@expo/vector-icons';
import AddToolModal from './AddToolModal';
import { showSnackbar } from '../lib/snackbar';

export default function ToolsScreen() {
  const { colors } = useTheme();
  const route = useRoute();
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
  const [editingTool, setEditingTool] = useState(null);
  const [editFields, setEditFields] = useState({ name: '', sku: '', inventory_number: '', serial_number: '', category: '', status: '', location: '' });
  const [focusedField, setFocusedField] = useState(null);
  const [focusedFilterInput, setFocusedFilterInput] = useState(false);
  const [focusedCodeInput, setFocusedCodeInput] = useState(false);
  const [detailTool, setDetailTool] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [addToolVisible, setAddToolVisible] = useState(false);

  // Pomocnicze: wykryj i ukryj wartości typu data:image (zakodowane obrazy QR/kreskowe)
  const isDataUri = (val) => {
    try {
      return typeof val === 'string' && String(val).trim().toLowerCase().startsWith('data:');
    } catch {
      return false;
    }
  };

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

  // Ustaw filtr z parametrów nawigacji (np. nr ewidencyjny lub ID)
  useEffect(() => {
    const f = route?.params?.filter;
    if (typeof f === 'string' && f.trim().length > 0) {
      setSearchTerm(String(f).trim());
    }
  }, [route?.params?.filter]);

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

  const openDetails = async (tool) => {
    const t = tool || {};
    setDetailTool(t);
    setDetailData(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      await api.init();
      const id = t?.id || t?.tool_id;
      if (id) {
        const det = await api.get(`/api/tools/${id}/details`);
        setDetailData(det);
      }
    } catch (e) {
      setDetailError(e?.message || 'Błąd pobierania szczegółów narzędzia');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailTool(null);
    setDetailData(null);
    setDetailError('');
    setDetailLoading(false);
  };

  const openEdit = (tool) => {
    const t = tool || {};
    setEditingTool(t);
    setEditFields({
      name: t?.name || t?.tool_name || '',
      sku: t?.sku || '',
      inventory_number: t?.inventory_number || t?.code || t?.barcode || t?.qr_code || '',
      serial_number: t?.serial_number || '',
      category: t?.category || t?.category_name || '',
      status: (t?.quantity === 1 && (t?.service_quantity || 0) > 0) ? 'serwis' : (t?.status || ''),
      location: t?.location || ''
    });
  };

  const closeEdit = () => { setEditingTool(null); };

  // Upewnij się, że pola edycji są wypełnione danymi bieżącego narzędzia po otwarciu modalu
  useEffect(() => {
    if (!editingTool) return;
    setEditFields({
      name: editingTool?.name || editingTool?.tool_name || '',
      sku: editingTool?.sku || '',
      inventory_number: editingTool?.inventory_number || editingTool?.code || editingTool?.barcode || editingTool?.qr_code || '',
      serial_number: editingTool?.serial_number || '',
      category: editingTool?.category || editingTool?.category_name || '',
      status: (editingTool?.quantity === 1 && (editingTool?.service_quantity || 0) > 0) ? 'serwis' : (editingTool?.status || ''),
      location: editingTool?.location || ''
    });
  }, [editingTool]);
  const saveEdit = async () => {
    if (!editingTool) return;
    setLoading(true); setError('');
    const id = editingTool?.id || editingTool?.tool_id;
    if (!id) { setError('Brak identyfikatora narzędzia'); setLoading(false); return; }
    const payload = {
      name: editFields.name,
      sku: editFields.sku,
      inventory_number: editFields.inventory_number,
      serial_number: editFields.serial_number,
      category: editFields.category,
      status: editFields.status,
      location: editFields.location
    };
    try {
      await api.init();
      try {
        await api.put(`/api/tools/${id}`, payload);
      } catch (e1) {
        // Fallback do POST jeśli backend nie obsługuje PUT
        try { await api.post(`/api/tools/${id}`, payload); } catch (e2) { throw e2; }
      }
      setTools(prev => prev.map(t => {
        const tid = t?.id || t?.tool_id;
        if (String(tid) === String(id)) {
          return { ...t, ...payload };
        }
        return t;
      }));
      closeEdit();
    } catch (e) {
      setError(e?.message || 'Błąd zapisu edycji');
    } finally {
      setLoading(false);
    }
  };

  const deleteTool = async (tool) => {
    const id = tool?.id || tool?.tool_id;
    if (!id) { showSnackbar({ type: 'error', text: 'Brak identyfikatora narzędzia' }); return; }
    Alert.alert('Usunąć narzędzie?', 'Operacja jest nieodwracalna.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: async () => {
        setLoading(true); setError('');
        try {
          await api.init();
          await api.delete(`/api/tools/${id}`);
          setTools(prev => prev.filter(t => String(t?.id || t?.tool_id) !== String(id)));
        } catch (e) {
          setError(e?.message || 'Błąd usuwania');
          showSnackbar({ type: 'error', text: e?.message || 'Błąd usuwania narzędzia' });
        } finally {
          setLoading(false);
        }
      } }
    ]);
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold">Narzędzia</Text>
        <Pressable
          onPress={() => setAddToolVisible(true)}
          accessibilityLabel="Dodaj narzędzie"
          style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="add" size={22} color={colors.primary || colors.text} />
        </Pressable>
      </View>
      {/* Sekcja wyszukiwarki i filtrów */}
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TextInput
          style={[styles.filterInput, { borderColor: focusedFilterInput ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]}
          className="flex-1 border border-slate-300 rounded-md px-2 h-10"
          placeholder="Szukaj: nazwa, SKU, kategoria, nr ew."
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholderTextColor={colors.muted}
          onFocus={() => setFocusedFilterInput(true)}
          onBlur={() => setFocusedFilterInput(false)}
        />
      </View>
      <View style={styles.filterRow} className="flex-row items-center gap-2 mb-2">
        <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowCategoryDropdown(v => !v)}>
          <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{selectedCategory || 'Wszystkie kategorie'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.dropdownToggle, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md px-2 h-9 justify-center" onPress={() => setShowStatusDropdown(v => !v)}>
          <Text style={[styles.dropdownToggleText, { color: colors.text }]}>{selectedStatus || 'Wszystkie statusy'}</Text>
        </TouchableOpacity>
      </View>
      {showCategoryDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedCategory(''); setShowCategoryDropdown(false); }}>
            <Text style={{ color: colors.text }}>Wszystkie kategorie</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity key={String(cat)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedCategory(cat); setShowCategoryDropdown(false); }}>
              <Text style={{ color: colors.text }}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {showStatusDropdown && (
        <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]} className="border rounded-md mb-2">
          <TouchableOpacity style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedStatus(''); setShowStatusDropdown(false); }}>
            <Text style={{ color: colors.text }}>Wszystkie statusy</Text>
          </TouchableOpacity>
          {statuses.map(st => (
            <TouchableOpacity key={String(st)} style={[styles.dropdownItem, { borderBottomColor: colors.border }]} className="py-2 px-2" onPress={() => { setSelectedStatus(st); setShowStatusDropdown(false); }}>
              <Text style={{ color: colors.text }}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.row} className="flex-row items-center gap-2 mb-3">
        <TextInput style={[styles.input, { borderColor: focusedCodeInput ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} className="flex-1 border rounded-md px-2 h-10" placeholder="Kod/QR/SKU" value={code} onChangeText={setCode} placeholderTextColor={colors.muted} onFocus={() => setFocusedCodeInput(true)} onBlur={() => setFocusedCodeInput(false)} />
        <Button title="Szukaj" onPress={searchByCode} />
      </View>
      {foundTool && (
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]} className="p-3 rounded-lg mb-3">
          <Text style={[styles.toolName, { color: colors.text }]} className="text-lg font-semibold">{foundTool.name || foundTool.tool_name || '—'}</Text>
          <Text style={[styles.toolMeta, { color: colors.muted }]}>SKU: {isDataUri(foundTool?.sku) ? '—' : (foundTool?.sku || '—')} | Nr. ew.: {foundTool?.inventory_number || (isDataUri(foundTool?.code) ? '' : foundTool?.code) || (isDataUri(foundTool?.barcode) ? '' : foundTool?.barcode) || (isDataUri(foundTool?.qr_code) ? '' : foundTool?.qr_code) || '—'}</Text>
          <Text style={[styles.toolMeta, { color: colors.muted }]}>Numer fabryczny: {foundTool.serial_number || '—'} | Kategoria: {foundTool.category || '—'}</Text>
          <Text style={[styles.toolMeta, { color: colors.muted }]}>Status: {foundTool.status || '—'} | Lokalizacja: {foundTool.location || '—'}</Text>
        </View>
      )}

      {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
      {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
        <FlatList
          data={filteredTools}
          keyExtractor={(item) => String(item.id || item.tool_id || Math.random())}
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const computedStatus = (item?.quantity === 1 && (item?.service_quantity || 0) > 0) ? 'serwis' : (item?.status || '—');
            const id = item?.id || item?.tool_id;
            const s = String(computedStatus || '').toLowerCase();
            const statusColor = s.includes('serwis')
              ? (colors.danger || '#ef4444')
              : (s.includes('wyd')
                ? (colors.warning || '#f59e0b')
                : ((s.includes('dost') || s.includes('avail'))
                  ? (colors.success || '#10b981')
                  : colors.border));
            return (
              <Pressable
                onPress={() => openDetails(item)}
                style={({ pressed }) => [
                  styles.tile,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderRightWidth: 4,
                    borderRightColor: statusColor,
                    opacity: pressed ? 0.97 : 1,
                    paddingRight: 12,
                  },
                ]}
                className="rounded-lg mb-3 p-3"
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toolName, { color: colors.text }]} className="text-lg font-semibold">{item.name || item.tool_name || '—'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable accessibilityLabel={`Edytuj narzędzie ${id}`} onPress={() => openEdit(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}> 
                      <Ionicons name="create-outline" size={20} color={colors.text} />
                    </Pressable>
                    <Pressable accessibilityLabel={`Usuń narzędzie ${id}`} onPress={() => deleteTool(item)} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}> 
                      <Ionicons name="trash-outline" size={20} color={colors.danger || '#e11d48'} />
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Nr ew.: {item?.inventory_number || (isDataUri(item?.code) ? '' : item?.code) || (isDataUri(item?.barcode) ? '' : item?.barcode) || (isDataUri(item?.qr_code) ? '' : item?.qr_code) || '—'}</Text>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>SKU: {isDataUri(item?.sku) ? '—' : (item?.sku || '—')} • Kategoria: {item.category || item.category_name || '—'}</Text>
                <Text style={[styles.toolMeta, { color: colors.muted }]}>Nr fabryczny: {item.serial_number || '—'} • Lokalizacja: {item.location || '—'}</Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* Modal edycji */}
      <Modal visible={!!editingTool} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edytuj narzędzie</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted }}>Nazwa</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'name' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwa" value={editFields.name} onChangeText={(v) => setEditFields(s => ({ ...s, name: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>SKU</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'sku' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="SKU" value={editFields.sku} onChangeText={(v) => setEditFields(s => ({ ...s, sku: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('sku')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Nr ewidencyjny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'inventory_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr ewidencyjny" value={editFields.inventory_number} onChangeText={(v) => setEditFields(s => ({ ...s, inventory_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('inventory_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Numer fabryczny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'serial_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer fabryczny" value={editFields.serial_number} onChangeText={(v) => setEditFields(s => ({ ...s, serial_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('serial_number')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Kategoria</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'category' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Kategoria" value={editFields.category} onChangeText={(v) => setEditFields(s => ({ ...s, category: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('category')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Status</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'status' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Status" value={editFields.status} onChangeText={(v) => setEditFields(s => ({ ...s, status: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('status')} onBlur={() => setFocusedField(null)} />

              <Text style={{ color: colors.muted }}>Lokalizacja</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'location' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Lokalizacja" value={editFields.location} onChangeText={(v) => setEditFields(s => ({ ...s, location: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('location')} onBlur={() => setFocusedField(null)} />
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

      {/* Modal szczegółów */}
      <Modal visible={!!detailTool} animationType="slide" transparent onRequestClose={closeDetails}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.modalTitle, { color: colors.text }]}>Szczegóły narzędzia</Text>
            {detailLoading ? <Text style={{ color: colors.muted }}>Ładowanie…</Text> : null}
            {detailError ? <Text style={{ color: colors.danger }}>{detailError}</Text> : null}
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6, paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>{detailTool?.name || detailTool?.tool_name || '—'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Nr ew.: {detailTool?.inventory_number || (isDataUri(detailTool?.code) ? '' : detailTool?.code) || (isDataUri(detailTool?.barcode) ? '' : detailTool?.barcode) || (isDataUri(detailTool?.qr_code) ? '' : detailTool?.qr_code) || '—'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>SKU: {isDataUri(detailTool?.sku) ? '—' : (detailTool?.sku || '—')}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Kategoria: {detailTool?.category || detailTool?.category_name || '—'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Nr fabryczny: {detailTool?.serial_number || '—'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Lokalizacja: {detailTool?.location || '—'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Ilość: {detailTool?.quantity ?? '—'}</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>Status: {(detailTool?.quantity === 1 && (detailTool?.service_quantity || 0) > 0) ? 'serwis' : (detailTool?.status || '—')}</Text>

              {detailData?.issues ? (
                <>
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 6 }}>Aktywne wydania</Text>
                  {detailData.issues.length > 0 ? detailData.issues.map((iss) => (
                    <View key={String(iss.id)} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.text }}>#{iss.id} • {iss.employee_first_name} {iss.employee_last_name}</Text>
                      <Text style={{ color: colors.muted }}>Ilość: {iss.quantity} • Wydano: {iss.issued_at}</Text>
                    </View>
                  )) : (
                    <Text style={{ color: colors.muted }}>Brak aktywnych wydań</Text>
                  )}
                </>
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

      <AddToolModal
        visible={addToolVisible}
        onClose={() => setAddToolVisible(false)}
        onCreated={(created) => {
          try {
            setTools(prev => created ? [created, ...prev] : prev);
          } catch {}
          setAddToolVisible(false);
        }}
      />
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