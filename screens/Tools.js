import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, FlatList, ScrollView, Alert, Modal, RefreshControl, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../lib/theme';
import ThemedButton from '../components/ThemedButton';
import api from '../lib/api.js';
import { Ionicons } from '@expo/vector-icons';
import AddToolModal from './AddToolModal';
import { showSnackbar } from '../lib/snackbar';
import { usePermissions } from '../lib/PermissionsContext';
import { PERMISSIONS } from '../lib/constants';

export default function ToolsScreen() {
  const { colors, isDark } = useTheme();
  const route = useRoute();
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [foundTool, setFoundTool] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  // Zakładki kategorii z licznikami
  const [categoryCounts, setCategoryCounts] = useState({});
  const [allCount, setAllCount] = useState(0);
  const [editingTool, setEditingTool] = useState(null);
  const [editFields, setEditFields] = useState({ name: '', sku: '', inventory_number: '', serial_number: '', serial_unreadable: false, category: '', status: '', location: '' });
  const [filterCategoryOptions, setFilterCategoryOptions] = useState([]);
  // Kategorie w modalu edycji jak w „Dodaj narzędzie”
  const [editCategoriesLoading, setEditCategoriesLoading] = useState(false);
  const [editCategoryOptions, setEditCategoryOptions] = useState([]);
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [focusedFilterInput, setFocusedFilterInput] = useState(false);
  const [detailTool, setDetailTool] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [addToolVisible, setAddToolVisible] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [confirmReturnVisible, setConfirmReturnVisible] = useState(false);
  const [confirmReturnTool, setConfirmReturnTool] = useState(null);


  // Serwis – stan modalu i pól
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceTool, setServiceTool] = useState(null);
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [serviceOrderNumber, setServiceOrderNumber] = useState('');

  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const canViewTools = hasPermission(PERMISSIONS.VIEW_TOOLS);
  const canViewAllTools = hasPermission(PERMISSIONS.VIEW_ALL_TOOLS);
  const canManageTools = hasPermission(PERMISSIONS.MANAGE_TOOLS);

  // Rozpoznaj employee_id użytkownika
  const currentEmployeeId = (() => {
    try {
      const u = currentUser || {};
      // Administrator NIE powinien mieć przypisanego employee_id (widzi wszystko, ale nie jest pracownikiem w sensie posiadania)
      // Chyba że ma rolę admina ORAZ przypisanego pracownika? Wg starej logiki admin -> null.
      const isAdminUser = (u?.role === 'administrator' || u?.role === 'admin' || (u?.roles && u.roles.includes('administrator')));
      if (isAdminUser || String(u?.id || '') === '1') {
        return null;
      }
      const candidates = [
        u?.employee_id, u?.employeeId,
        u?.user?.employee_id, u?.user?.employeeId,
        u?.data?.employee_id, u?.data?.employeeId,
        u?.payload?.employee_id, u?.payload?.employeeId,
        u?.profile?.employee_id, u?.profile?.employeeId,
        u?.currentUser?.employee_id, u?.currentUser?.employeeId,
      ];
      const found = candidates.find(v => typeof v === 'number' || typeof v === 'string');
      return found ? String(found) : null;
    } catch { return null; }
  })();

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
      if (!canViewTools) {
        setTools([]);
        return;
      }
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

  useEffect(() => { if (!permsReady) return; load(); }, [permsReady, canViewTools]);

  useEffect(() => {
    if (!permsReady) return;
    (async () => {
      try {
        await api.init();
        const list = await api.get('/api/categories');
        const names = Array.isArray(list)
          ? list.map((c) => (c?.name || c?.category_name || (typeof c === 'string' ? c : ''))).filter(Boolean)
          : [];
        setFilterCategoryOptions(names);
      } catch {
        setFilterCategoryOptions([]);
      }
    })();
  }, [permsReady]);

  // Zestawy unikalnych kategorii i statusów do filtrów
  const categoriesFromTools = (tools || []).map(t => t?.category || t?.category_name).filter(Boolean);
  const categories = [...new Set([...(filterCategoryOptions || []), ...categoriesFromTools])].sort((a, b) => {
    try { return String(a).localeCompare(String(b), 'pl', { sensitivity: 'base' }); } catch { return String(a).toLowerCase() < String(b).toLowerCase() ? -1 : (String(a).toLowerCase() > String(b).toLowerCase() ? 1 : 0); }
  });
  const statuses = [...new Set((tools || []).map(t => {
    const computed = (t?.quantity === 1 && (t?.service_quantity || 0) > 0) ? 'serwis' : (t?.status || 'dostępne');
    return computed;
  }).filter(Boolean))];

  // Filtrowanie jak w web: nazwa/SKU/kategoria/nr ew./nr seryjny/lokalizacja + kategoria + status
  const filteredTools = (tools || []).filter(t => {
    const name = t?.name || t?.tool_name || '';
    const sku = t?.sku || '';
    const cat = t?.category || t?.category_name || '';
    const inv = t?.inventory_number || t?.code || t?.barcode || t?.qr_code || '';
    const serial = t?.serial_number || '';
    const loc = t?.location || '';
    const matchesSearch = !searchTerm || [name, sku, cat, inv, serial, loc].some(val => String(val).toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !selectedCategory || cat === selectedCategory;
    const computedStatus = (t?.quantity === 1 && (t?.service_quantity || 0) > 0) ? 'serwis' : (t?.status || 'dostępne');
    const matchesStatus = !selectedStatus || computedStatus === selectedStatus;
    // Bramka zakresu: jeśli użytkownik nie ma VIEW_ALL_TOOLS, pokazuj tylko narzędzia wydane temu użytkownikowi
    if (!canViewTools && currentEmployeeId) {
      const eid = (
        t?.issued_to_employee_id ?? t?.issuedToEmployeeId ??
        t?.employee_id ?? t?.employeeId ??
        t?.assigned_employee_id ?? t?.assignedEmployeeId ??
        t?.current_employee_id ?? t?.currentEmployeeId
      );
      const matchesScope = typeof eid === 'number' || typeof eid === 'string'
        ? String(eid) === String(currentEmployeeId)
        : false;
      return matchesSearch && matchesCategory && matchesStatus && matchesScope;
    }
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Sortowanie: najpierw 'wydane', następnie rosnąco po numerze ewidencyjnym (puste na końcu)
  const sortedTools = (filteredTools || []).slice().sort((a, b) => {
    const aStatus = (a?.quantity === 1 && (a?.service_quantity || 0) > 0) ? 'serwis' : (a?.status || '');
    const bStatus = (b?.quantity === 1 && (b?.service_quantity || 0) > 0) ? 'serwis' : (b?.status || '');
    const aPri = String(aStatus).trim().toLowerCase() === 'wydane' ? 0 : 1;
    const bPri = String(bStatus).trim().toLowerCase() === 'wydane' ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;

    const aInv = a?.inventory_number || '';
    const bInv = b?.inventory_number || '';
    const aEmpty = !String(aInv).trim();
    const bEmpty = !String(bInv).trim();
    if (aEmpty && !bEmpty) return 1;
    if (!aEmpty && bEmpty) return -1;
    // Lokalizacja porównania – w razie braku Intl.Collator użyj localeCompare
    try {
      return String(aInv).localeCompare(String(bInv), 'pl', { numeric: true, sensitivity: 'base' });
    } catch {
      const aa = String(aInv).toLowerCase();
      const bb = String(bInv).toLowerCase();
      if (aa < bb) return -1;
      if (aa > bb) return 1;
      return 0;
    }
  });

  // Liczniki kategorii na pełnym zbiorze (niezależnie od bramki zakresu)
  useEffect(() => {
    try {
      const counts = {};
      for (const t of (tools || [])) {
        const cat = t?.category || t?.category_name || '';
        const key = String(cat || '').trim();
        if (!key) continue;
        counts[key] = (counts[key] || 0) + 1;
      }
      setCategoryCounts(counts);
      setAllCount((tools || []).length);
    } catch {
      setCategoryCounts({});
      setAllCount((tools || []).length);
    }
  }, [tools]);

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
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do edycji narzędzi', { type: 'warn' });
      return;
    }
    const t = tool || {};
    setEditingTool(t);
    setEditFields({
      name: t?.name || t?.tool_name || '',
      sku: t?.sku || '',
      inventory_number: t?.inventory_number || t?.code || t?.barcode || t?.qr_code || '',
      serial_number: t?.serial_number || '',
      serial_unreadable: !!t?.serial_unreadable || false,
      category: t?.category || t?.category_name || '',
      status: (t?.quantity === 1 && (t?.service_quantity || 0) > 0) ? 'serwis' : (t?.status || ''),
      location: t?.location || ''
    });
    // Załaduj listę kategorii do wyboru
    (async () => {
      try {
        setEditCategoriesLoading(true);
        await api.init();
        const list = await api.get('/api/categories');
        const names = Array.isArray(list)
          ? list.map((c) => (c?.name || c?.category_name || (typeof c === 'string' ? c : ''))).filter(Boolean)
          : [];
        setEditCategoryOptions(names);
      } catch {
        setEditCategoryOptions([]);
      } finally {
        setEditCategoriesLoading(false);
      }
    })();
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
      serial_unreadable: !!editingTool?.serial_unreadable || false,
      category: editingTool?.category || editingTool?.category_name || '',
      status: (editingTool?.quantity === 1 && (editingTool?.service_quantity || 0) > 0) ? 'serwis' : (editingTool?.status || ''),
      location: editingTool?.location || ''
    });
  }, [editingTool]);

  const saveEdit = async () => {
    if (!editingTool) return;
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do zapisu narzędzi', { type: 'warn' });
      return;
    }
    setLoading(true); setError('');
    const id = editingTool?.id || editingTool?.tool_id;
    if (!id) { setError('Brak identyfikatora narzędzia'); setLoading(false); return; }
    const payload = {
      name: editFields.name,
      sku: editFields.sku,
      inventory_number: editFields.inventory_number,
      serial_number: editFields.serial_number,
      serial_unreadable: !!editFields.serial_unreadable,
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
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do usuwania narzędzi', { type: 'warn' });
      return;
    }
    const id = tool?.id || tool?.tool_id;
    if (!id) { showSnackbar('Brak identyfikatora narzędzia', { type: 'error' }); return; }
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
          showSnackbar(e?.message || 'Błąd usuwania narzędzia', { type: 'error' });
        } finally {
          setLoading(false);
        }
      } }
    ]);
  };

  // Otwórz modal „Serwis” dla wybranego narzędzia
  const openServiceModal = (tool) => {
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do operacji serwisowej', { type: 'warn' });
      return;
    }
    const t = tool || null;
    setServiceTool(t);
    setServiceQuantity(1);
    setServiceOrderNumber(t?.service_order_number || '');
    setShowServiceModal(true);
  };

  const closeServiceModal = () => {
    setShowServiceModal(false);
    setServiceTool(null);
    setServiceQuantity(1);
    setServiceOrderNumber('');
  };

  // Potwierdź wysłanie na serwis
  const confirmService = async () => {
    if (!serviceTool) return;
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do operacji serwisowej', { type: 'warn' });
      return;
    }
    try {
      await api.init();
      const id = serviceTool?.id || serviceTool?.tool_id;
      const maxQty = (serviceTool?.quantity || 0) - (serviceTool?.service_quantity || 0);
      if (serviceQuantity < 1 || serviceQuantity > maxQty) {
        showSnackbar(`Wybierz ilość 1–${maxQty}`, { type: 'warn' });
        return;
      }
      await api.post(`/api/tools/${id}/service`, {
        quantity: serviceQuantity,
        service_order_number: (serviceOrderNumber || '').trim() || null,
      });
      showSnackbar('Wysłano na serwis', { type: 'success' });
      closeServiceModal();
      try { await load(); } catch {}
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się wysłać na serwis', { type: 'error' });
    }
  };

  // Odbierz z serwisu dla pozycji z listy
  const serviceReceiveFor = async (tool) => {
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do operacji serwisowej', { type: 'warn' });
      return;
    }
    const id = tool?.id || tool?.tool_id;
    const current = tool?.service_quantity || 0;
    if (!id || current <= 0) {
      showSnackbar('Brak pozycji do odbioru z serwisu', { type: 'warn' });
      return;
    }
    try {
      await api.init();
      await api.post(`/api/tools/${id}/service/receive`, { quantity: current });
      showSnackbar('Odebrano z serwisu', { type: 'success' });
      try { await load(); } catch {}
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się odebrać z serwisu', { type: 'error' });
    }
  };

  // Prośba o zwrot – tworzy powiadomienie dla ostatnio wydanego pracownika
  const notifyReturnFor = async (tool) => {
    if (!canManageTools) {
      showSnackbar('Brak uprawnień do wysyłania próśb o zwrot', { type: 'error' });
      return;
    }
    const id = tool?.id || tool?.tool_id;
    if (!id) { showSnackbar('Brak identyfikatora narzędzia', { type: 'error' }); return; }
    try {
      setNotifySending(true);
      await api.init();
      // Spróbuj wytypować pracownika z issues, jeśli lista dostępna; w przeciwnym razie backend sam zmapuje z tool_issues
      let targetEmployeeId = null;
      let targetBrandNumber = '';
      try {
        const issues = Array.isArray(tool?.issues) ? tool.issues : [];
        const active = issues.find(i => String(i?.status || '').toLowerCase() === 'wydane') || issues[issues.length - 1];
        if (active && (active.employee_id || active.employeeId)) {
          targetEmployeeId = active.employee_id ?? active.employeeId;
          try {
            const emp = await api.get(`/api/employees/${targetEmployeeId}`);
            targetBrandNumber = emp?.brand_number || '';
          } catch {}
        }
      } catch {}
      await api.post(`/api/tools/${id}/notify-return`, {
        message: 'Prośba o zwrot',
        target_employee_id: targetEmployeeId || undefined,
        target_brand_number: targetBrandNumber || undefined,
      });
      showSnackbar('Wysłano prośbę o zwrot', { type: 'success' });
      try { refreshNotifications(); } catch {}
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się wysłać prośby o zwrot', { type: 'error' });
    } finally {
      setNotifySending(false);
    }
  };

  const openConfirmReturnFor = (tool) => {
    setConfirmReturnTool(tool);
    setConfirmReturnVisible(true);
  };

  const closeConfirmReturn = () => {
    setConfirmReturnVisible(false);
    setConfirmReturnTool(null);
  };

  const confirmSendReturn = async () => {
    if (!confirmReturnTool) return;
    await notifyReturnFor(confirmReturnTool);
    closeConfirmReturn();
  };

  // Odbierz z serwisu dla narzędzia w szczegółach
  const serviceReceive = async () => {
    if (!detailTool) return;
    await serviceReceiveFor(detailTool);
  };

  if (permsReady && !canViewTools) {
    return (
      <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
        <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold">Narzędzia</Text>
        <Text style={[styles.subtitle || styles.muted, { color: colors.muted }]}>Brak uprawnień do przeglądania narzędzi.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={[styles.title, { color: colors.text }]} className="text-2xl font-bold">Narzędzia</Text>
        {canManageTools ? (
          <ThemedButton
            onPress={() => setAddToolVisible(true)}
            variant="secondary"
            style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0, borderWidth: 1, borderColor: colors.border }}
            icon={<Ionicons name="add" size={22} color={colors.primary || colors.text} />}
          />
        ) : null}
      </View>
      {/* Zakładki kategorii */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 8 }}>
          <ThemedButton
            onPress={() => setSelectedCategory('')}
            variant="outline"
            style={{ 
              borderRadius: 0, 
              borderWidth: 0, 
              borderBottomWidth: 2, 
              borderBottomColor: selectedCategory ? 'transparent' : (colors.primary || colors.text),
              paddingHorizontal: 6,
              paddingVertical: 10,
              height: 'auto',
              marginVertical: 0
            }}
            accessibilityLabel="Zakładka Wszystkie kategorie"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: selectedCategory ? colors.text : (colors.primary || colors.text), fontSize: 16, fontWeight: selectedCategory ? '500' : '600' }} numberOfLines={1} ellipsizeMode="tail">Wszystkie kategorie</Text>
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: selectedCategory ? colors.card : (colors.primary || '#6366f1') }}>
                <Text style={{ color: selectedCategory ? colors.text : '#ffffff', fontSize: 12, fontWeight: '700' }}>{Number.isFinite(allCount) ? allCount : 0}</Text>
              </View>
            </View>
          </ThemedButton>
          {categories.map((cat) => {
            const cnt = categoryCounts[String(cat)];
            const active = String(selectedCategory || '') === String(cat);
            return (
              <ThemedButton
                key={`cat-tab-${String(cat)}`}
                onPress={() => setSelectedCategory(String(cat))}
                variant="outline"
                style={{ 
                  borderRadius: 0, 
                  borderWidth: 0, 
                  borderBottomWidth: 2, 
                  borderBottomColor: active ? (colors.primary || colors.text) : 'transparent',
                  paddingHorizontal: 6,
                  paddingVertical: 10,
                  height: 'auto',
                  marginVertical: 0
                }}
                accessibilityLabel={`Zakładka kategoria ${String(cat)}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: active ? (colors.primary || colors.text) : colors.text, fontSize: 16, fontWeight: active ? '600' : '500' }} numberOfLines={1} ellipsizeMode="tail">{String(cat)}</Text>
                  <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: active ? (colors.primary || colors.border) : colors.border }}>
                    <Text style={{ color: active ? (colors.primary || colors.text) : colors.muted, fontSize: 12, fontWeight: '700' }}>{Number.isFinite(cnt) ? cnt : 0}</Text>
                  </View>
                </View>
              </ThemedButton>
            );
          })}
        </ScrollView>
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
        {searchTerm ? (
          <ThemedButton
            onPress={() => setSearchTerm('')}
            variant="secondary"
            style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
            icon={<Ionicons name="close-circle-outline" size={25} color={colors.muted || colors.text} />}
          />
        ) : null}
      </View>
      <View style={[styles.filterRow, { zIndex: 100 }]} className="flex-row items-center gap-2 mb-2">
        <View style={{ flex: 1, position: 'relative', zIndex: 101 }}>
          <ThemedButton
            onPress={() => setShowStatusDropdown(v => !v)}
            variant="secondary"
            style={{ height: 40, justifyContent: 'space-between', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, width: '100%' }}
          >
            <Text style={{ color: colors.text, fontSize: 14, flex: 1, textAlign: 'left' }}>
              {selectedStatus || 'Wszystkie statusy'}
            </Text>
            <Ionicons name={showStatusDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.text} />
          </ThemedButton>

          {showStatusDropdown && (
            <View 
              style={{ 
                position: 'absolute',
                top: 45,
                left: 0,
                right: 0,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                zIndex: 9999,
                elevation: 5,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
              }}
            >
              <ThemedButton
                title="Wszystkie statusy"
                onPress={() => { setSelectedStatus(''); setShowStatusDropdown(false); }}
                variant="secondary"
                style={{ height: 40, borderRadius: 0, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'flex-start', paddingHorizontal: 12, borderWidth: 0, width: '100%' }}
                textStyle={{ fontWeight: 'normal', textAlign: 'left', flex: 1 }}
              />
              {statuses.map((st, index) => (
                <ThemedButton
                  key={String(st)}
                  title={st}
                  onPress={() => { setSelectedStatus(st); setShowStatusDropdown(false); }}
                  variant="secondary"
                  style={{ 
                    height: 40, 
                    borderRadius: 0, 
                    borderBottomWidth: index === statuses.length - 1 ? 0 : 1, 
                    borderBottomColor: colors.border, 
                    justifyContent: 'flex-start', 
                    paddingHorizontal: 12, 
                    borderWidth: 0, 
                    width: '100%' 
                  }}
                  textStyle={{ fontWeight: 'normal', textAlign: 'left', flex: 1 }}
                />
              ))}
            </View>
          )}
        </View>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
      {loading ? <Text style={[styles.muted, { color: colors.muted }]}>Ładowanie…</Text> : (
        <FlatList
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[colors.primary]} tintColor={colors.primary} />}
          data={sortedTools}
          keyExtractor={(item) => String(item.id || item.tool_id || Math.random())}
          contentContainerStyle={{ paddingVertical: 1, paddingBottom: 0 }}
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
              <ThemedButton
                onPress={() => openDetails(item)}
                variant="secondary"
                style={{
                  height: 'auto',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  justifyContent: 'flex-start',
                  padding: 12,
                  marginBottom: 12,
                  marginVertical: 0,
                  borderWidth: 1,
                  borderRightWidth: 4,
                  borderRightColor: statusColor,
                  borderRadius: 12,
                  ...Platform.select({
                    web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.06)' },
                    ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
                    android: { elevation: 2 }
                  })
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toolName, { color: colors.text }]} className="text-lg font-semibold">{item.name || item.tool_name || '—'}</Text>
                    <Text style={[styles.toolMeta, { color: colors.muted }]}>Nr ew.: {item?.inventory_number || (isDataUri(item?.code) ? '' : item?.code) || (isDataUri(item?.barcode) ? '' : item?.barcode) || (isDataUri(item?.qr_code) ? '' : item?.qr_code) || '—'}</Text>
                    <Text style={[styles.toolMeta, { color: colors.muted }]}>SKU: {isDataUri(item?.sku) ? '—' : (item?.sku || '—')}</Text>
                    <Text style={[styles.toolMeta, { color: colors.muted }]}>Kategoria: {item.category || item.category_name || '—'}</Text>
                    {item.category === 'Spawalnicze' && (
                       <Text style={[styles.toolMeta, { color: colors.muted }]}>Data przeglądu: {(() => {
                         const val = item.inspection_date;
                         if (!val) return '—';
                         try {
                           const s = String(val).trim();
                           const dmy = s.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
                           if (dmy) return `${dmy[1]}.${dmy[2]}.${dmy[3]}`;
                           const ymd = s.match(/^(\d{4})[.\/-](\d{2})[.\/-](\d{2})/);
                           if (ymd) return `${ymd[3]}.${ymd[2]}.${ymd[1]}`;
                           const d = new Date(s);
                           if (isNaN(d.getTime())) return val;
                           return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
                         } catch { return val; }
                       })()}</Text>
                    )}
                    <Text style={[styles.toolMeta, { color: colors.muted }]}>Nr fabryczny: {item.serial_number || '—'}</Text>
                    <Text style={[styles.toolMeta, { color: colors.muted }]}>Lokalizacja: {item.location || '—'}</Text>
                  </View>
                <View style={{ flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {canManageTools && String(computedStatus).toLowerCase() === 'wydane' ? (
                      <ThemedButton
                        onPress={() => openConfirmReturnFor(item)}
                        variant="secondary"
                        style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
                        icon={<Ionicons name="mail-outline" size={20} color={colors.text} />}
                        disabled={notifySending}
                      />
                    ) : null}
                    {canManageTools && (item?.service_quantity || 0) > 0 ? (
                      <ThemedButton
                        onPress={() => serviceReceiveFor(item)}
                        variant="secondary"
                        style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
                        icon={<Ionicons name="download-outline" size={20} color={colors.text} />}
                      />
                    ) : null}
                    {canManageTools ? (
                      <ThemedButton
                        onPress={() => openServiceModal(item)}
                        variant="secondary"
                        style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
                        icon={<Ionicons name="construct-outline" size={20} color={colors.text} />}
                      />
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <ThemedButton
                      onPress={() => openEdit(item)}
                      variant="secondary"
                      style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
                      icon={<Ionicons name="create-outline" size={20} color={colors.text} />}
                    />
                    <ThemedButton
                      onPress={() => deleteTool(item)}
                      variant="secondary"
                      style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
                      icon={<Ionicons name="trash-outline" size={20} color={colors.danger || '#e11d48'} />}
                    />
                  </View>
                </View>
                </View>
              </ThemedButton>
            );
          }}
        />
      )}

      {/* Modal edycji */}
      <Modal visible={!!editingTool} animationType="slide" transparent onRequestClose={closeEdit}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Edytuj narzędzie</Text>
            <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted }}>Nazwa</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'name' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwa" value={editFields.name} onChangeText={(v) => setEditFields(s => ({ ...s, name: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)} />
              <Text style={{ color: colors.muted }}>SKU</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'sku' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="SKU" value={editFields.sku} onChangeText={(v) => setEditFields(s => ({ ...s, sku: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('sku')} onBlur={() => setFocusedField(null)} />
              <Text style={{ color: colors.muted }}>Nr ewidencyjny</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'inventory_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr ewidencyjny" value={editFields.inventory_number} onChangeText={(v) => setEditFields(s => ({ ...s, inventory_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('inventory_number')} onBlur={() => setFocusedField(null)} />
              <Text style={{ color: colors.muted }}>Numer fabryczny</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    borderColor: focusedField === 'serial_number' ? colors.primary : colors.border,
                    backgroundColor: editFields.serial_unreadable ? (String(colors.muted || '#64748b') + '20') : colors.card,
                    color: colors.text,
                  },
                ]}
                placeholder="Numer fabryczny"
                value={editFields.serial_number}
                editable={!editFields.serial_unreadable}
                onChangeText={(v) => setEditFields(s => ({ ...s, serial_number: v }))}
                placeholderTextColor={colors.muted}
                onFocus={() => setFocusedField('serial_number')}
                onBlur={() => setFocusedField(null)}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <ThemedButton
                  onPress={() => setEditFields(s => ({ ...s, serial_unreadable: !s.serial_unreadable }))}
                  variant="secondary"
                  style={{ justifyContent: 'flex-start', paddingHorizontal: 10, height: 40, borderWidth: 1, borderColor: colors.border }}
                  icon={<Ionicons name={editFields.serial_unreadable ? 'checkbox' : 'square-outline'} size={18} color={colors.text} style={{ marginRight: 8 }} />}
                  title="Numer nieczytelny"
                  textStyle={{ fontWeight: 'normal', color: colors.text }}
                />
              </View>

              <Text style={{ color: colors.muted }}>Kategoria</Text>
              <ThemedButton
                title={editFields.category || (editCategoriesLoading ? 'Ładowanie kategorii…' : (editCategoryOptions.length ? 'Wybierz kategorię' : 'Brak kategorii'))}
                onPress={() => setEditCategoryOpen(v => !v)}
                variant="secondary"
                style={{ height: 40, justifyContent: 'space-between', paddingHorizontal: 8, flexDirection: 'row-reverse' }}
                textStyle={{ fontWeight: 'normal', color: editFields.category ? colors.text : colors.muted, flex: 1, textAlign: 'left' }}
                icon={<Ionicons name={editCategoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />}
              />
              {editCategoryOpen && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 6, backgroundColor: colors.card, maxHeight: 160 }}>
                  {editCategoriesLoading ? (
                    <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Ładowanie kategorii…</Text></View>
                  ) : (editCategoryOptions && editCategoryOptions.length > 0) ? (
                    <ScrollView style={{ maxHeight: 160 }}>
                      {editCategoryOptions.map((opt) => (
                        <ThemedButton
                          key={String(opt)}
                          title={opt}
                          onPress={() => { setEditFields(s => ({ ...s, category: opt })); setEditCategoryOpen(false); }}
                          variant="secondary"
                          style={{ borderRadius: 0, borderBottomWidth: 1, borderBottomColor: colors.border, justifyContent: 'flex-start', paddingHorizontal: 12, height: 40, borderWidth: 0, marginVertical: 0 }}
                          textStyle={{ fontWeight: 'normal', textAlign: 'left', flex: 1 }}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Brak kategorii</Text></View>
                  )}
                </View>
              )}
              <Text style={{ color: colors.muted }}>Lokalizacja</Text>
              <TextInput style={[styles.input, { borderColor: focusedField === 'location' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Lokalizacja" value={editFields.location} onChangeText={(v) => setEditFields(s => ({ ...s, location: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('location')} onBlur={() => setFocusedField(null)} />
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <ThemedButton
                title="Anuluj"
                onPress={closeEdit}
                variant="secondary"
                style={{ width: 100 }}
              />
              <ThemedButton
                title="Zapisz"
                onPress={saveEdit}
                variant="primary"
                style={{ width: 100 }}
              />
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
            <ScrollView style={{ maxHeight: 450 }} contentContainerStyle={{ gap: 6, paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
              {/* Układ: etykieta po lewej, wartość po prawej jaśniejszą czcionką */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Nazwa:</Text>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{detailTool?.name || detailTool?.tool_name || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Numer ewidencyjny:</Text>
                  <Text style={{ color: colors.text }}>{detailTool?.inventory_number || (isDataUri(detailTool?.code) ? '' : detailTool?.code) || (isDataUri(detailTool?.barcode) ? '' : detailTool?.barcode) || (isDataUri(detailTool?.qr_code) ? '' : detailTool?.qr_code) || '—'}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Numer fabryczny:</Text>
                  <Text style={{ color: colors.text }}>{detailTool?.serial_unreadable ? 'nieczytelny' : (detailTool?.serial_number || '—')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>SKU:</Text>
                  <Text style={{ color: colors.text }}>{isDataUri(detailTool?.sku) ? '—' : (detailTool?.sku || '—')}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Kategoria:</Text>
                  <Text style={{ color: colors.text }}>{detailTool?.category || detailTool?.category_name || '—'}</Text>
                </View>

                {/* Dodatkowe pola zależne od kategorii */}
                {String(detailTool?.category || detailTool?.category_name || '').trim().toLowerCase() === 'elektronarzędzia' ? (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Producent:</Text>
                      <Text style={{ color: colors.text }}>{detailTool?.manufacturer || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Model:</Text>
                      <Text style={{ color: colors.text }}>{detailTool?.model || '—'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ color: colors.muted }}>Rok produkcji:</Text>
                      <Text style={{ color: colors.text }}>{(typeof detailTool?.production_year !== 'undefined' && detailTool?.production_year !== null) ? String(detailTool?.production_year) : '—'}</Text>
                    </View>
                  </>
                ) : null}
                {String(detailTool?.category || detailTool?.category_name || '').trim().toLowerCase() === 'spawalnicze' ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.muted }}>Data przeglądu:</Text>
                    <Text style={{ color: colors.text }}>{detailTool?.inspection_date ? new Date(detailTool?.inspection_date).toLocaleDateString('pl-PL') : '—'}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Lokalizacja:</Text>
                  <Text style={{ color: colors.text }}>{detailTool?.location || '—'}</Text>
                </View>

                {/* Status jako kolorowy znacznik w układzie lewo-prawo */}
                {(() => {
                  const st = (detailTool?.quantity === 1 && (detailTool?.service_quantity || 0) > 0) ? 'serwis' : (detailTool?.status || '—');
                  const s = String(st || '').toLowerCase();
                  const bg = isDark
                    ? (s === 'dostępne' ? '#14532d' : s === 'wydane' ? '#713f12' : s === 'serwis' ? '#7f1d1d' : '#1f2937')
                    : (s === 'dostępne' ? '#dcfce7' : s === 'wydane' ? '#fef9c3' : s === 'serwis' ? '#fee2e2' : '#e5e7eb');
                  const fg = isDark
                    ? (s === 'dostępne' ? '#86efac' : s === 'wydane' ? '#fde047' : s === 'serwis' ? '#fca5a5' : '#9ca3af')
                    : (s === 'dostępne' ? '#166534' : s === 'wydane' ? '#854d0e' : s === 'serwis' ? '#991b1b' : '#334155');
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.muted }}>Status:</Text>
                      <Text style={{ backgroundColor: bg, color: fg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, fontSize: 12, fontWeight: '900' }}>{st}</Text>
                    </View>
                  );
                })()}

                {/* Wydane dla w układzie lewo-prawo */}
                {(() => {
                  const st = (detailTool?.quantity === 1 && (detailTool?.service_quantity || 0) > 0) ? 'serwis' : (detailTool?.status || '—');
                  if (st === 'wydane' || st === 'częściowo wydane') {
                    const issues = Array.isArray(detailData?.issues) ? detailData.issues : [];
                    const label = issues.length > 0
                      ? issues.map(i => {
                          const fn = i?.employee_first_name || '';
                          const ln = i?.employee_last_name || '';
                          const brand = i?.employee_brand_number || '';
                          const qtyLabel = i?.quantity > 1 ? ` (${i.quantity} szt.)` : '';
                          const name = `${fn} ${ln}`.trim();
                          const brandLabel = brand ? ` [${brand}]` : '';
                          return `${name}${brandLabel}${qtyLabel}`;
                        }).join(', ')
                      : '-';
                    return (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: colors.muted }}>Wydane dla:</Text>
                        <Text style={{ color: colors.text, flex: 1, textAlign: 'right' }}>{label}</Text>
                      </View>
                    );
                  }
                  return null;
                })()}

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.muted }}>Ilość:</Text>
                  <Text style={{ color: colors.text }}>{detailTool?.quantity ?? '—'}</Text>
                </View>

                {detailTool?.description ? (
                  <View style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.muted }}>Opis:</Text>
                    <Text style={{ color: colors.text }}>{detailTool.description}</Text>
                  </View>
                ) : null}
              </View>

              {(detailTool?.service_quantity || 0) > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Serwis</Text>
                  <Text style={{ color: colors.muted }}>W serwisie: {detailTool?.service_quantity} szt.</Text>
                  {detailTool?.service_order_number ? (
                    <Text style={{ color: colors.muted }}>Nr zlecenia: {detailTool?.service_order_number}</Text>
                  ) : null}
                  {detailTool?.status === 'serwis' && detailTool?.service_sent_at ? (
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Data wysłania: {new Date(detailTool.service_sent_at).toLocaleString('pl-PL')}</Text>
                  ) : null}
                  {canManageTools ? (
                    <View style={{ marginTop: 6 }}>
                      <ThemedButton
                        title="Odebrano"
                        onPress={serviceReceive}
                        variant="success"
                        style={{ height: 36, width: 120, marginVertical: 0 }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {detailData?.issues ? (
                <>
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 6 }}>Aktywne wydania</Text>
                  {detailData.issues.length > 0 ? detailData.issues.map((iss) => (
                    <View key={String(iss.id)} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <Text style={{ color: colors.text }}>#{iss.id} • {iss.employee_first_name} {iss.employee_last_name} [{iss.employee_brand_number}]</Text>
                      <Text style={{ color: colors.muted }}>Ilość: {iss.quantity} • Wydano: {iss.issued_at}</Text>
                    </View>
                  )) : (
                    <Text style={{ color: colors.muted }}>Brak aktywnych wydań</Text>
                  )}
                </>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <ThemedButton
                title="Zamknij"
                onPress={closeDetails}
                variant="secondary"
                style={{ height: 40, width: 100 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal serwisu */}
      <Modal visible={showServiceModal && !!serviceTool} animationType="fade" transparent onRequestClose={closeServiceModal}>
        <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Wyślij na serwis</Text>
              <ThemedButton
                onPress={closeServiceModal}
                variant="outline"
                style={{ width: 32, height: 32, borderRadius: 16, paddingHorizontal: 0, borderWidth: 0, marginVertical: 0 }}
                icon={<Ionicons name="close" size={22} color={colors.muted} />}
              />
            </View>
            {serviceTool ? (
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
                <Text style={{ color: colors.muted }}>Narzędzie: {serviceTool?.name || serviceTool?.tool_name || '—'}</Text>
                <Text style={{ color: colors.muted }}>Dostępnych do wysłania: {Math.max(0, (serviceTool?.quantity || 0) - (serviceTool?.service_quantity || 0))} szt.</Text>
                <Text style={{ color: colors.text }}>Ilość do serwisu</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                  placeholder="Ilość"
                  keyboardType="numeric"
                  value={String(serviceQuantity)}
                  onChangeText={(v) => {
                    const n = parseInt(String(v || '').replace(/[^0-9]/g, ''), 10);
                    setServiceQuantity(Number.isFinite(n) ? n : 1);
                  }}
                  placeholderTextColor={colors.muted}
                />
                <Text style={{ color: colors.text }}>Nr zlecenia serwisowego (opcjonalnie)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                  placeholder="Nr zlecenia"
                  value={serviceOrderNumber}
                  onChangeText={setServiceOrderNumber}
                  placeholderTextColor={colors.muted}
                />
              </ScrollView>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <ThemedButton
                  title="Anuluj"
                  onPress={closeServiceModal}
                  variant="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedButton
                  title="Wyślij"
                  onPress={confirmService}
                  variant="primary"
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Potwierdzenie wysyłki prośby o zwrot */}
      <Modal visible={confirmReturnVisible} animationType="fade" transparent onRequestClose={closeConfirmReturn}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: '88%', maxWidth: 420, borderRadius: 12, padding: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 16, color: colors.text, marginBottom: 12 }}>Czy na pewno wysłać prośbę o zwrot?</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <ThemedButton
                title="Anuluj"
                onPress={closeConfirmReturn}
                variant="secondary"
                style={{ width: 100 }}
              />
              <ThemedButton
                title="Wyślij"
                onPress={confirmSendReturn}
                disabled={notifySending}
                variant="primary"
                style={{ width: 100 }}
              />
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
  card: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 10, backgroundColor: '#fafafa' },
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
