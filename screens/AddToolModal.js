import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useTheme } from '../lib/theme';
import ThemedButton from '../components/ThemedButton';
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
    manufacturer: '',
    model: '',
    production_year: '',
    status: 'dostępne',
    location: '',
    quantity: '1',
    description: ''
  });

  // Sugestie dla kategorii "Elektronarzędzia"
  const [elSuggestionsLoading, setElSuggestionsLoading] = useState(false);
  const [elSuggestions, setElSuggestions] = useState({ manufacturer: [], model: [], production_year: [] });
  const [manufacturerOpen, setManufacturerOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);

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

  // Reaguj na odświeżenie listy kategorii z innych ekranów (np. lista kategorii)
  useEffect(() => {
    if (!visible) return;
    const handler = async () => {
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
      } finally {
        setCategoriesLoading(false);
      }
    };
    try {
      window.addEventListener('tools:categories:refresh', handler);
      window.addEventListener('tools:list:changed', handler);
    } catch (_) { /* noop */ }
    return () => {
      try {
        window.removeEventListener('tools:categories:refresh', handler);
        window.removeEventListener('tools:list:changed', handler);
      } catch (_) { /* noop */ }
    };
  }, [visible]);

  // Ładowanie sugestii dla Elektronarzędzi z backendu; fallback do zebranych z listy narzędzi
  useEffect(() => {
    if (!visible) return;
    const cat = String(fields.category || '').trim().toLowerCase();
    if (cat !== 'elektronarzędzia') return;
    let cancelled = false;
    (async () => {
      try {
        setElSuggestionsLoading(true);
        await api.init();
        try {
          const data = await api.get('/api/tools/suggestions?category=Elektronarzędzia');
          const safe = data && typeof data === 'object' ? data : {};
          if (!cancelled) {
            setElSuggestions({
              manufacturer: Array.isArray(safe.manufacturer) ? safe.manufacturer : [],
              model: Array.isArray(safe.model) ? safe.model : [],
              production_year: Array.isArray(safe.production_year) ? safe.production_year.map(String) : []
            });
          }
        } catch {
          // Fallback: pobierz narzędzia z tej kategorii i zbuduj podpowiedzi
          try {
            const list = await api.get('/api/tools?category=Elektronarzędzia');
            const arr = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : []);
            const mSet = new Set();
            const mdSet = new Set();
            const ySet = new Set();
            (arr || []).forEach(t => {
              const m = String(t?.manufacturer || '').trim();
              if (m) mSet.add(m);
              const md = String(t?.model || '').trim();
              if (md) mdSet.add(md);
              const yRaw = t?.production_year;
              if (typeof yRaw !== 'undefined' && yRaw !== null && String(yRaw).trim() !== '') {
                const y = parseInt(String(yRaw), 10);
                if (!Number.isNaN(y) && y >= 1900 && y <= (new Date().getFullYear() + 1)) {
                  ySet.add(String(y));
                }
              }
            });
            if (!cancelled) {
              setElSuggestions({
                manufacturer: Array.from(mSet).sort((a, b) => a.localeCompare(b)),
                model: Array.from(mdSet).sort((a, b) => a.localeCompare(b)),
                production_year: Array.from(ySet).sort((a, b) => Number(a) - Number(b))
              });
            }
          } catch { /* noop */ }
        }
      } finally {
        if (!cancelled) setElSuggestionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fields.category]);

  // Odśwież sugestie gdy lista narzędzi się zmieni (po dodaniu nowej pozycji)
  useEffect(() => {
    if (!visible) return;
    const onChange = () => {
      const cat = String(fields.category || '').trim().toLowerCase();
      if (cat !== 'elektronarzędzia') return;
      try {
        // Ponownie uruchom ładowanie sugestii
        (async () => {
          try {
            setElSuggestionsLoading(true);
            await api.init();
            const data = await api.get('/api/tools/suggestions?category=Elektronarzędzia');
            const safe = data && typeof data === 'object' ? data : {};
            setElSuggestions({
              manufacturer: Array.isArray(safe.manufacturer) ? safe.manufacturer : [],
              model: Array.isArray(safe.model) ? safe.model : [],
              production_year: Array.isArray(safe.production_year) ? safe.production_year.map(String) : []
            });
          } catch { /* ignoruj */ }
          finally { setElSuggestionsLoading(false); }
        })();
      } catch { /* noop */ }
    };
    try {
      window.addEventListener('tools:list:changed', onChange);
    } catch (_) { /* noop */ }
    return () => {
      try { window.removeEventListener('tools:list:changed', onChange); } catch (_) { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fields.category]);

  // Uzupełnianie pola "Nazwa" na podstawie sugestii z ekranu narzędzi
  useEffect(() => {
    if (!visible) return;
    const handler = (e) => {
      try {
        const detail = e?.detail || {};
        const token = String(detail.token || '').trim();
        const type = String(detail.type || '').trim();
        const cat = String(detail.category || '').trim();
        if (cat) {
          setFields(prev => ({ ...prev, category: cat }));
        }
        if (!token) return;
        setFields(prev => {
          const current = String(prev.name || '').trim();
          const alreadyHas = current.toLowerCase().includes(token.toLowerCase());
          if (alreadyHas) return prev;
          const next = type === 'year'
            ? (current ? `${current} (${token})` : token)
            : (current ? `${current} ${token}` : token);
          return { ...prev, name: next };
        });
      } catch { /* noop */ }
    };
    try {
      window.addEventListener('tools:add:suggest-append', handler);
    } catch (_) { /* noop */ }
    return () => {
      try {
        window.removeEventListener('tools:add:suggest-append', handler);
      } catch (_) { /* noop */ }
    };
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
      manufacturer: String(fields.manufacturer || '').trim() || undefined,
      model: String(fields.model || '').trim() || undefined,
      production_year: (function(){
        const raw = String(fields.production_year || '').trim();
        if (!raw) return undefined;
        const y = parseInt(raw, 10);
        const maxY = new Date().getFullYear() + 1;
        if (!Number.isNaN(y) && y >= 1900 && y <= maxY) return y;
        return undefined;
      })(),
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
            <ThemedButton
              onPress={close}
              variant="outline"
              style={{ width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, marginVertical: 0 }}
              icon={<Ionicons name="close" size={18} color={colors.text} />}
            />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                    value={fields.sku}
                    onChangeText={(v) => { setSkuDirty(true); setField('sku', v); }}
                    placeholder="np. D-1234"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <ThemedButton
                  onPress={generateSkuWithPrefix}
                  variant="secondary"
                  style={{ width: 42, height: 40, paddingHorizontal: 0, justifyContent: 'center', alignItems: 'center', marginVertical: 0 }}
                  icon={<Ionicons name="cog-outline" size={22} color={colors.text} />}
                />
              </View>
              {!!skuConflict && <Text style={{ color: colors.warn || '#eab308', marginTop: 4 }}>{skuConflict}</Text>}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, backgroundColor: fields.serial_unreadable ? colors.muted + '20' : colors.card, color: colors.text }]}
                    value={fields.serial_number}
                    editable={!fields.serial_unreadable}
                    onChangeText={(v) => setField('serial_number', v)}
                    placeholder="np. SN-987654"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <Pressable onPress={() => setField('serial_unreadable', !fields.serial_unreadable)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}> 
                  <Ionicons name={fields.serial_unreadable ? 'checkbox' : 'square-outline'} size={20} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: 13 }}>Numer nieczytelny</Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.row, { zIndex: categoryOpen ? 1000 : 1 }]}>
              <Text style={[styles.label, { color: colors.muted }]}>Kategoria</Text>
              <View style={{ position: 'relative', zIndex: categoryOpen ? 1000 : 1 }}>
                <ThemedButton
                  title={fields.category || (categoriesLoading ? 'Ładowanie kategorii…' : (categoryOptions.length ? 'Wybierz kategorię' : 'Brak kategorii'))}
                  onPress={() => setCategoryOpen((v) => !v)}
                  variant="secondary"
                  style={{ height: 40, justifyContent: 'space-between', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, width: '100%' }}
                  textStyle={{ fontWeight: 'normal', color: fields.category ? colors.text : colors.muted, flex: 1, textAlign: 'left' }}
                  icon={<Ionicons name={categoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />}
                />
                {categoryOpen && (
                  <View style={{ position: 'absolute', top: 45, left: 0, right: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card, maxHeight: 250, zIndex: 2000, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }}>
                    {categoriesLoading ? (
                      <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Ładowanie kategorii…</Text></View>
                    ) : (categoryOptions && categoryOptions.length > 0) ? (
                      <ScrollView style={{ flex: 1 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                        {categoryOptions.map((opt, index) => (
                          <ThemedButton
                            key={String(opt)}
                            title={opt}
                            onPress={() => { setField('category', opt); setCategoryOpen(false); }}
                            variant="secondary"
                            style={{ 
                              borderRadius: 0, 
                              borderBottomWidth: index === categoryOptions.length - 1 ? 0 : 1, 
                              borderBottomColor: colors.border, 
                              justifyContent: 'flex-start', 
                              paddingHorizontal: 12, 
                              height: 40, 
                              borderWidth: 0, 
                              marginVertical: 0 
                            }}
                            textStyle={{ fontWeight: 'normal', textAlign: 'left', flex: 1 }}
                            icon={fields.category === opt ? <Ionicons name="checkmark-outline" size={18} color={colors.primary || '#007aff'} /> : null}
                          />
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={{ padding: 10 }}><Text style={{ color: colors.muted }}>Brak kategorii</Text></View>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Dane techniczne dla Elektronarzędzi */}
            {String(fields.category || '').trim().toLowerCase() === 'elektronarzędzia' ? (
              <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card || '#fff', padding: 10, borderRadius: 8 }]}>
                <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Dane techniczne</Text>
                <View style={{ gap: 10 }}>
                  {/* Producent */}
                  <View style={{ zIndex: manufacturerOpen ? 100 : 1 }}>
                    <Text style={[styles.label, { color: colors.muted }]}>Producent</Text>
                    <View>
                      <TextInput
                        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                        value={fields.manufacturer}
                        onFocus={() => setManufacturerOpen(true)}
                        onBlur={() => setTimeout(() => setManufacturerOpen(false), 150)}
                        onChangeText={(v) => setField('manufacturer', v)}
                        placeholder="Np. Bosch, Makita, DeWalt"
                        placeholderTextColor={colors.muted}
                      />
                      {manufacturerOpen && (elSuggestionsLoading ? (
                        <View style={{ padding: 8 }}><Text style={{ color: colors.muted }}>Ładowanie podpowiedzi…</Text></View>
                      ) : (elSuggestions.manufacturer || []).length > 0 ? (
                        <View style={{ position: 'absolute', top: 44, left: 0, right: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card || '#fff', borderRadius: 8, maxHeight: 200, zIndex: 200, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }}>
                          <ScrollView style={{ flex: 1 }} nestedScrollEnabled={true} keyboardShouldPersistTaps="handled">
                            {(elSuggestions.manufacturer || []).map(opt => (
                              <Pressable key={`mf-${String(opt)}`} onPress={() => { setField('manufacturer', String(opt)); setManufacturerOpen(false); }} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? (colors.overlay || 'rgba(0,0,0,0.05)') : (colors.card || '#fff') }]}> 
                                <Text style={{ color: colors.text }}>{String(opt)}</Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null)}
                    </View>
                  </View>

                  {/* Model */}
                  <View style={{ zIndex: modelOpen ? 100 : 1 }}>
                    <Text style={[styles.label, { color: colors.muted }]}>Model</Text>
                    <View>
                      <TextInput
                        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                        value={fields.model}
                        onFocus={() => setModelOpen(true)}
                        onBlur={() => setTimeout(() => setModelOpen(false), 150)}
                        onChangeText={(v) => setField('model', v)}
                        placeholder="Np. GSR 18V-55"
                        placeholderTextColor={colors.muted}
                      />
                      {modelOpen && (elSuggestionsLoading ? (
                        <View style={{ padding: 8 }}><Text style={{ color: colors.muted }}>Ładowanie podpowiedzi…</Text></View>
                      ) : (elSuggestions.model || []).length > 0 ? (
                        <View style={{ position: 'absolute', top: 44, left: 0, right: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card || '#fff', borderRadius: 8, maxHeight: 160, zIndex: 200, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }}>
                          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled={true}>
                            {(elSuggestions.model || []).map(opt => (
                              <Pressable key={`md-${String(opt)}`} onPress={() => { setField('model', String(opt)); setModelOpen(false); }} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? (colors.overlay || 'rgba(0,0,0,0.05)') : (colors.card || '#fff') }]}> 
                                <Text style={{ color: colors.text }}>{String(opt)}</Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null)}
                    </View>
                  </View>

                  {/* Rok Produkcji */}
                  <View style={{ zIndex: yearOpen ? 100 : 1 }}>
                    <Text style={[styles.label, { color: colors.muted }]}>Rok Produkcji</Text>
                    <View>
                      <TextInput
                        style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                        value={fields.production_year}
                        keyboardType="numeric"
                        onFocus={() => setYearOpen(true)}
                        onBlur={() => setTimeout(() => setYearOpen(false), 150)}
                        onChangeText={(v) => {
                          const n = String(v || '').replace(/[^0-9]/g, '');
                          setField('production_year', n);
                        }}
                        placeholder="Np. 2024"
                        placeholderTextColor={colors.muted}
                      />
                      {yearOpen && (elSuggestionsLoading ? (
                        <View style={{ padding: 8 }}><Text style={{ color: colors.muted }}>Ładowanie podpowiedzi…</Text></View>
                      ) : (elSuggestions.production_year || []).length > 0 ? (
                        <View style={{ position: 'absolute', top: 44, left: 0, right: 0, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card || '#fff', borderRadius: 8, maxHeight: 160, zIndex: 200, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }}>
                          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled={true}>
                            {(elSuggestions.production_year || []).map(opt => (
                              <Pressable key={`yr-${String(opt)}`} onPress={() => { setField('production_year', String(opt)); setYearOpen(false); }} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: pressed ? (colors.overlay || 'rgba(0,0,0,0.05)') : (colors.card || '#fff') }]}> 
                                <Text style={{ color: colors.text }}>{String(opt)}</Text>
                              </Pressable>
                            ))}
                          </ScrollView>
                        </View>
                      ) : null)}
                    </View>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Skorzystaj z podpowiedzi aby szybko wybrać wcześniej użyte wartości.</Text>
              </View>
            ) : null}

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
            <View style={{ width: 100 }}>
              <ThemedButton
                title="Anuluj"
                onPress={close}
                disabled={saving}
                variant="secondary"
              />
            </View>
            <View style={{ width: 100 }}>
              <ThemedButton
                title="Zapisz"
                onPress={save}
                disabled={saveDisabled}
                loading={saving}
                variant="primary"
              />
            </View>
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
