import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api.js';
import { showSnackbar } from '../lib/snackbar';
import { Ionicons } from '@expo/vector-icons';

export default function AddToolModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [toolsCodePrefix, setToolsCodePrefix] = useState('');
  const [toolCategoryPrefixes, setToolCategoryPrefixes] = useState({});
  const [skuConflict, setSkuConflict] = useState('');
  const [invConflict, setInvConflict] = useState('');
  const prevSkuConflictRef = useRef('');
  const prevInvConflictRef = useRef('');
  const [skuDirty, setSkuDirty] = useState(false);
  const [invDirty, setInvDirty] = useState(false);

  const [fields, setFields] = useState({
    name: '',
    sku: '',
    inventory_number: '',
    serial_number: '',
    serial_unreadable: false,
    category: '',
    status: 'dostępne',
    location: '',
    quantity: '1',
    description: ''
  });

  useEffect(() => {
    if (visible) {
      setError('');
      setSaving(false);
      setSkuConflict('');
      setInvConflict('');
      prevSkuConflictRef.current = '';
      prevInvConflictRef.current = '';
      setSkuDirty(false);
      setInvDirty(false);
      setCategoryOpen(false);
      // Załaduj kategorie i prefiks kodów; auto-uzupełnij SKU jeśli puste
      (async () => {
        try {
          setCategoriesLoading(true);
          await api.init();
          try {
            const list = await api.get('/api/categories');
            const names = Array.isArray(list)
              ? list.map((c) => (c?.name || c?.category_name || (typeof c === 'string' ? c : ''))).filter(Boolean)
              : [];
            setCategoryOptions(names);
          } catch { setCategoryOptions([]); }
          try {
            const g = await api.get('/api/config/general');
            const p = g?.toolsCodePrefix || g?.tools_code_prefix || '';
            setToolsCodePrefix(String(p || ''));
            const cps = g?.toolCategoryPrefixes || g?.tool_category_prefixes || {};
            if (cps && typeof cps === 'object') {
              setToolCategoryPrefixes(cps);
            } else {
              setToolCategoryPrefixes({});
            }
          } catch {}
        } finally {
          setCategoriesLoading(false);
        }
        // Wygeneruj SKU jeśli puste
        const current = String(fields.sku || '').trim();
        if (!current) {
          generateSkuWithPrefix();
        }
      })();
    }
  }, [visible]);

  const close = () => {
    if (saving) return;
    onClose && onClose();
  };

  const setField = (key, val) => {
    setFields(prev => ({ ...prev, [key]: val }));
  };

  const getEffectivePrefix = (category) => {
    try {
      const cat = String(category || '').trim();
      const map = toolCategoryPrefixes || {};
      if (cat && map && Object.prototype.hasOwnProperty.call(map, cat)) {
        return String(map[cat] || '').trim();
      }
      return String(toolsCodePrefix || '').trim();
    } catch {
      return String(toolsCodePrefix || '').trim();
    }
  };

  const normalizeSkuWithPrefix = (raw, prefix) => {
    try {
      const base = String(raw || '').trim();
      const p = String(prefix || '').trim();
      if (!base) return '';
      if (!p) return base;
      if (base.startsWith(`${p}-`)) return base;
      if (base.startsWith(p)) return `${p}-${base.slice(p.length)}`;
      return `${p}-${base}`;
    } catch { return String(raw || ''); }
  };

  const generateSkuWithPrefix = () => {
    try {
      const namePrefix = String(fields.name || '').trim().slice(0, 3).toUpperCase();
      const timestamp = Date.now().toString().slice(-6);
      const raw = `${namePrefix}${timestamp}`;
      const eff = getEffectivePrefix(fields.category);
      const norm = normalizeSkuWithPrefix(raw, eff);
      setFields(prev => ({ ...prev, sku: norm }));
      setSkuDirty(false);
    } catch {}
  };

  // Przebudowa SKU przy zmianie kategorii, jeśli użytkownik nie edytował ręcznie
  useEffect(() => {
    if (!visible) return;
    const eff = getEffectivePrefix(fields.category);
    if (!skuDirty) {
      const rawSku = String(fields.sku || '').trim();
      const namePrefix = String(fields.name || '').trim().slice(0, 3).toUpperCase();
      if (!rawSku) {
        const timestamp = Date.now().toString().slice(-6);
        const raw = `${namePrefix}${timestamp}`;
        const norm = normalizeSkuWithPrefix(raw, eff);
        setFields(prev => ({ ...prev, sku: norm }));
      } else {
        const norm = normalizeSkuWithPrefix(rawSku, eff);
        setFields(prev => ({ ...prev, sku: norm }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields.category]);

  const save = async () => {
    if (saving) return;
    setError('');
    const name = String(fields.name || '').trim();
    if (!name) {
      setError('Podaj nazwę narzędzia');
      try { showSnackbar('Podaj nazwę narzędzia', { type: 'warn' }); } catch {}
      return;
    }

    // Normalizuj SKU z prefiksem
    const normalizedSku = normalizeSkuWithPrefix(fields.sku, getEffectivePrefix(fields.category));

    // Twarde walidacje
    const category = String(fields.category || '').trim();
    if (!category) {
      setError('Wybierz kategorię');
      try { showSnackbar('Wybierz kategorię', { type: 'warn' }); } catch {}
      return;
    }
    const quantityParsed = Number(String(fields.quantity || '1').replace(/\D+/g, '')) || 0;
    if (quantityParsed < 1) {
      setError('Ilość musi być co najmniej 1');
      try { showSnackbar('Ilość musi być co najmniej 1', { type: 'warn' }); } catch {}
      return;
    }
    if (skuConflict || invConflict) {
      setError('Usuń konflikty SKU/Nr ewidencyjnego przed zapisem');
      try { showSnackbar('Usuń konflikty SKU/Nr ewidencyjnego przed zapisem', { type: 'warn' }); } catch {}
      return;
    }

    // Sprawdzenia duplikatów na submit (API)
    try {
      await api.init();
      if (normalizedSku) {
        const respSku = await api.get(`/api/tools?sku=${encodeURIComponent(normalizedSku)}`);
        const arrSku = Array.isArray(respSku) ? respSku : (Array.isArray(respSku?.data) ? respSku.data : []);
        if (arrSku && arrSku.length > 0) {
          setError('Narzędzie o tym SKU już istnieje');
          try { showSnackbar('Narzędzie o tym SKU już istnieje', { type: 'error' }); } catch {}
          return;
        }
      }
      const inv = String(fields.inventory_number || '').trim();
      if (inv) {
        const respInv = await api.get(`/api/tools?inventory_number=${encodeURIComponent(inv)}`);
        const arrInv = Array.isArray(respInv) ? respInv : (Array.isArray(respInv?.data) ? respInv.data : []);
        if (arrInv && arrInv.length > 0) {
          setError('Numer ewidencyjny jest już używany');
          try { showSnackbar('Numer ewidencyjny jest już używany', { type: 'error' }); } catch {}
          return;
        }
      }
    } catch { /* Ignoruj problemy z API i polegaj na walidacji backendu */ }

    const payload = {
      name: name,
      sku: String(normalizedSku || '').trim() || undefined,
      inventory_number: String(fields.inventory_number || '').trim() || undefined,
      serial_number: String(fields.serial_number || '').trim() || undefined,
      serial_unreadable: !!fields.serial_unreadable || false,
      category: String(fields.category || '').trim() || undefined,
      status: String(fields.status || 'dostępne').trim() || 'dostępne',
      location: String(fields.location || '').trim() || undefined,
      quantity: Number(String(fields.quantity || '1').replace(/\D+/g, '')) || 1,
      description: String(fields.description || '').trim() || undefined
    };

    // Ustaw barcode/qr_code zgodnie z normą SKU
    if (payload.sku) {
      payload.barcode = payload.sku;
      payload.qr_code = payload.sku;
    }

    try {
      setSaving(true);
      await api.init();
      const res = await api.post('/api/tools', payload);
      const created = Array.isArray(res?.data) ? (res.data[0] || null) : (res?.data || res || null);
      if (!created) {
        throw new Error('Błąd tworzenia narzędzia');
      }
      onCreated && onCreated(created);
      try { showSnackbar('Dodano narzędzie', { type: 'success' }); } catch {}
      onClose && onClose();
    } catch (e) {
      setError(e?.message || 'Nie udało się dodać narzędzia');
      try { showSnackbar(e?.message || 'Nie udało się dodać narzędzia', { type: 'error' }); } catch {}
    } finally {
      setSaving(false);
    }
  };

  // Walidacja konfliktu SKU podczas wpisywania (debounce); tylko gdy ręczna edycja
  useEffect(() => {
    if (!visible) return;
    if (!skuDirty) return;
    const timer = setTimeout(async () => {
      try {
        await api.init();
        const raw = String(fields.sku || '').trim();
        const eff = getEffectivePrefix(fields.category);
        const norm = normalizeSkuWithPrefix(raw, eff);
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
  }, [visible, fields.sku, toolsCodePrefix, skuDirty]);

  // Walidacja konfliktu Nr ewidencyjnego podczas wpisywania (debounce); tylko gdy ręczna edycja
  useEffect(() => {
    if (!visible) return;
    if (!invDirty) return;
    const timer = setTimeout(async () => {
      try {
        await api.init();
        const inv = String(fields.inventory_number || '').trim();
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
  }, [visible, fields.inventory_number, invDirty]);

  const quantityParsed = Number(String(fields.quantity || '').replace(/\D+/g, '')) || 0;
  const saveDisabled = saving || !!skuConflict || !!invConflict || !String(fields.name || '').trim() || !String(fields.category || '').trim() || quantityParsed < 1;

  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
        <View style={[styles.card, { backgroundColor: colors.card || '#fff', borderColor: colors.border || '#eee' }]}> 
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[styles.title, { color: colors.text }]}>Dodaj narzędzie</Text>
            <Pressable onPress={close} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}> 
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          {!!error && <Text style={{ color: colors.danger || '#e11d48', marginBottom: 6 }}>{error}</Text>}

          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Nazwa *</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.name}
                onChangeText={(v) => setField('name', v)}
                placeholder="np. Wiertarka"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>SKU</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.sku}
                onChangeText={(v) => { setSkuDirty(true); setField('sku', v); }}
                placeholder="np. D-1234"
                placeholderTextColor={colors.muted}
              />
              {!!skuConflict && <Text style={{ color: colors.warn || '#eab308', marginTop: 4 }}>{skuConflict}</Text>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable onPress={generateSkuWithPrefix} style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}> 
                  <Text style={{ color: colors.text }}>Generuj SKU</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Nr ewidencyjny</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.inventory_number}
                onChangeText={(v) => { setInvDirty(true); setField('inventory_number', v); }}
                placeholder="np. 001"
                placeholderTextColor={colors.muted}
              />
              {!!invConflict && <Text style={{ color: colors.warn || '#eab308', marginTop: 4 }}>{invConflict}</Text>}
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Nr seryjny</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: fields.serial_unreadable ? colors.muted + '20' : colors.card, color: colors.text }]}
                value={fields.serial_number}
                editable={!fields.serial_unreadable}
                onChangeText={(v) => setField('serial_number', v)}
                placeholder="np. SN-987654"
                placeholderTextColor={colors.muted}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Pressable onPress={() => setField('serial_unreadable', !fields.serial_unreadable)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}> 
                  <Ionicons name={fields.serial_unreadable ? 'checkbox' : 'square-outline'} size={18} color={colors.text} />
                  <Text style={{ color: colors.text }}>Numer nieczytelny</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Kategoria</Text>
              <Pressable
                onPress={() => setCategoryOpen((v) => !v)}
                style={({ pressed }) => [
                  styles.input,
                  { borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
                  pressed && { opacity: 0.9 }
                ]}
              >
                <Text style={{ color: fields.category ? colors.text : colors.muted }}>
                  {fields.category || (categoriesLoading ? 'Ładowanie kategorii…' : (categoryOptions.length ? 'Wybierz kategorię' : 'Brak kategorii'))}
                </Text>
                <Ionicons name={categoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Pressable>
              {categoryOpen && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 6, backgroundColor: colors.card, maxHeight: 200 }}>
                  {categoriesLoading ? (
                    <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Ładowanie kategorii…</Text></View>
                  ) : (categoryOptions && categoryOptions.length > 0) ? (
                    <ScrollView style={{ maxHeight: 200 }}>
                      {categoryOptions.map((opt) => (
                        <Pressable
                          key={String(opt)}
                          onPress={() => { setField('category', opt); setCategoryOpen(false); }}
                          style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? (colors.overlay || '#00000010') : colors.card }]}
                        >
                          <Text style={{ color: colors.text }}>{opt}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Brak kategorii</Text></View>
                  )}
                </View>
              )}
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Lokalizacja</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.location}
                onChangeText={(v) => setField('location', v)}
                placeholder="np. Magazyn A"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Opis</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text, height: 80 }]}
                value={fields.description}
                onChangeText={(v) => setField('description', v)}
                placeholder="opcjonalnie: dodatkowe informacje"
                placeholderTextColor={colors.muted}
                multiline
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Ilość</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.quantity}
                onChangeText={(v) => setField('quantity', v)}
                placeholder="1"
                keyboardType="numeric"
                placeholderTextColor={colors.muted}
              />
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <Pressable
              onPress={close}
              disabled={saving}
              style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: colors.text }}>Anuluj</Text>
            </Pressable>

            <Pressable
              onPress={save}
              disabled={saveDisabled}
              style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary || '#4f46e5', opacity: pressed ? 0.9 : 1, alignItems: 'center', justifyContent: 'center' }]}
            >
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Zapisz</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 520, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  row: { marginBottom: 0 },
  label: { marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  button: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  primaryButton: { flex: 1, borderRadius: 6, paddingVertical: 10, alignItems: 'center' }
});
