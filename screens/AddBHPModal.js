import { useState } from 'react';
import { View, Text, TextInput, Modal, Pressable, ScrollView, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function AddBHPModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme();
  const [focusedField, setFocusedField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({
    manufacturer: '',
    model: '',
    serial_number: '',
    catalog_number: '',
    inventory_number: '',
    production_date: '',
    inspection_date: '',
    harness_start_date: '',
    status: 'dostępne',
    location: '',
    assigned_employee: '',
    shock_absorber: false,
    srd_device: false,
  });

  const reset = () => {
    setFocusedField(null);
    setError('');
    setFields({
      manufacturer: '',
      model: '',
      serial_number: '',
      catalog_number: '',
      inventory_number: '',
      production_date: '',
      inspection_date: '',
      harness_start_date: '',
      status: 'dostępne',
      location: '',
      assigned_employee: '',
      shock_absorber: false,
      srd_device: false,
    });
  };

  // Konwersja daty z dd.mm.rrrr / dd-mm-rrrr / dd/mm/rrrr na YYYY-MM-DD
  const normalizeDate = (value) => {
    try {
      if (!value) return '';
      const str = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      const m = str.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
      if (m) {
        const [, dd, mm, yyyy] = m;
        return `${yyyy}-${mm}-${dd}`;
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m2 = String(d.getMonth() + 1).padStart(2, '0');
        const d2 = String(d.getDate()).padStart(2, '0');
        return `${y}-${m2}-${d2}`;
      }
      return str;
    } catch (_) {
      return String(value || '');
    }
  };

  const close = () => {
    if (saving) return;
    reset();
    try { onClose && onClose(); } catch {}
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.init();
      const payload = {
        ...fields,
        production_date: normalizeDate(fields.production_date),
        inspection_date: normalizeDate(fields.inspection_date),
        harness_start_date: normalizeDate(fields.harness_start_date),
        // Zgodność z webowym źródłem
        is_set: !!(fields.shock_absorber || fields.srd_device),
        has_shock_absorber: !!fields.shock_absorber,
        has_srd: !!fields.srd_device,
      };
      const res = await api.post('/api/bhp', payload);
      const created = Array.isArray(res?.data) ? res.data[0] : (res?.data || res);
      try { onCreated && onCreated(created); } catch {}
      close();
    } catch (e) {
      setError(e?.message || 'Błąd dodawania BHP');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={close}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Dodaj sprzęt BHP</Text>
            <Pressable onPress={close} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}> 
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>
          {error ? <Text style={{ color: colors.danger || '#e11d48', marginBottom: 6 }}>{error}</Text> : null}
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: colors.muted }}>Nr ewidencyjny *</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'inventory_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nr ewidencyjny" value={fields.inventory_number} onChangeText={(v) => setFields(s => ({ ...s, inventory_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('inventory_number')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Producent</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'manufacturer' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Producent" value={fields.manufacturer} onChangeText={(v) => setFields(s => ({ ...s, manufacturer: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('manufacturer')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Model</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'model' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Model" value={fields.model} onChangeText={(v) => setFields(s => ({ ...s, model: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('model')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Numer seryjny</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'serial_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer seryjny" value={fields.serial_number} onChangeText={(v) => setFields(s => ({ ...s, serial_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('serial_number')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Numer katalogowy</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'catalog_number' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer katalogowy" value={fields.catalog_number} onChangeText={(v) => setFields(s => ({ ...s, catalog_number: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('catalog_number')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Data produkcji (szelek)</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'production_date' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="dd.mm.rrrr" value={fields.production_date} onChangeText={(v) => setFields(s => ({ ...s, production_date: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('production_date')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Data przeglądu</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'inspection_date' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="dd.mm.rrrr" value={fields.inspection_date} onChangeText={(v) => setFields(s => ({ ...s, inspection_date: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('inspection_date')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Data rozpoczęcia użytkowania</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'harness_start_date' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="dd.mm.rrrr" value={fields.harness_start_date} onChangeText={(v) => setFields(s => ({ ...s, harness_start_date: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('harness_start_date')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Zestaw</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text }}>Amortyzator</Text>
              <Switch value={fields.shock_absorber} onValueChange={(v) => setFields(s => ({ ...s, shock_absorber: v, srd_device: v ? false : s.srd_device }))} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: colors.text }}>Urządzenie samohamowne</Text>
              <Switch value={fields.srd_device} onValueChange={(v) => setFields(s => ({ ...s, srd_device: v, shock_absorber: v ? false : s.shock_absorber }))} />
            </View>

            <Text style={{ color: colors.muted }}>Status</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'status' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Status" value={fields.status} onChangeText={(v) => setFields(s => ({ ...s, status: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('status')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Lokalizacja</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'location' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Lokalizacja" value={fields.location} onChangeText={(v) => setFields(s => ({ ...s, location: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('location')} onBlur={() => setFocusedField(null)} />

            <Text style={{ color: colors.muted }}>Przypisany pracownik</Text>
            <TextInput style={[styles.input, { borderColor: focusedField === 'assigned_employee' ? colors.primary : colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Imię i nazwisko" value={fields.assigned_employee} onChangeText={(v) => setFields(s => ({ ...s, assigned_employee: v }))} placeholderTextColor={colors.muted} onFocus={() => setFocusedField('assigned_employee')} onBlur={() => setFocusedField(null)} />
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Pressable onPress={close} disabled={saving} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 }]}> 
              <Text style={{ color: colors.text }}>Anuluj</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: colors.primary || '#4f46e5', opacity: pressed ? 0.9 : 1, alignItems: 'center', justifyContent: 'center' }]}> 
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Zapisz</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
});