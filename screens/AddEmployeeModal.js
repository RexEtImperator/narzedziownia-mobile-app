import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, ScrollView, ActivityIndicator, Platform, Pressable } from 'react-native';
import { useTheme } from '../lib/theme';
import ThemedButton from '../components/ThemedButton';
import api from '../lib/api';
import { Ionicons } from '@expo/vector-icons';

export default function AddEmployeeModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [showDeptSelect, setShowDeptSelect] = useState(false);
  const [showPosSelect, setShowPosSelect] = useState(false);

  const [fields, setFields] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    brand_number: '',
    department_id: null,
    position_id: null,
    status: 'active',
  });

  useEffect(() => {
    const loadRefs = async () => {
      if (!visible) return;
      setError('');
      try {
        await api.init();
        const [deps, poss] = await Promise.all([
          api.get('/api/departments'),
          api.get('/api/positions'),
        ]);
        const depsList = Array.isArray(deps) ? deps : (Array.isArray(deps?.data) ? deps.data : []);
        const possList = Array.isArray(poss) ? poss : (Array.isArray(poss?.data) ? poss.data : []);
        setDepartments(depsList);
        setPositions(possList);
      } catch (e) {
        setError(e?.message || 'Nie udało się pobrać słowników');
      }
    };
    loadRefs();
  }, [visible]);

  const resetForm = () => {
    setFields({ first_name: '', last_name: '', phone: '', brand_number: '', department_id: null, position_id: null, status: 'active' });
    setShowDeptSelect(false);
    setShowPosSelect(false);
  };

  const close = () => {
    resetForm();
    onClose && onClose();
  };

  const save = async () => {
    setError('');
    try {
      setLoading(true);
      await api.init();
      const payload = {
        first_name: fields.first_name?.trim(),
        last_name: fields.last_name?.trim(),
        phone: fields.phone?.trim(),
        brand_number: fields.brand_number?.trim(),
        department_id: fields.department_id,
        position_id: fields.position_id,
        status: fields.status,
      };
      if (!payload.first_name || !payload.last_name) {
        setError('Imię i nazwisko są wymagane');
        setLoading(false);
        return;
      }
      const created = await api.post('/api/employees', payload);
      // Zwróć utworzonego pracownika do rodzica i zamknij modal
      onCreated && onCreated(created || payload);
      close();
    } catch (e) {
      setError(e?.message || 'Nie udało się dodać pracownika');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={!!visible} animationType="slide" transparent onRequestClose={close}>
      <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay || 'rgba(0,0,0,0.5)' }]}> 
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Dodaj nowego pracownika</Text>
            <Pressable onPress={close} style={({ pressed }) => [{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>
          {error ? <Text style={{ color: colors.danger || '#e11d48', marginBottom: 6 }}>{error}</Text> : null}
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Imię" placeholderTextColor={colors.muted} value={fields.first_name} onChangeText={v => setFields(f => ({ ...f, first_name: v }))} />
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Nazwisko" placeholderTextColor={colors.muted} value={fields.last_name} onChangeText={v => setFields(f => ({ ...f, last_name: v }))} />
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Telefon" placeholderTextColor={colors.muted} value={fields.phone} onChangeText={v => setFields(f => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <TextInput style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]} placeholder="Numer służbowy" placeholderTextColor={colors.muted} value={fields.brand_number} onChangeText={v => setFields(f => ({ ...f, brand_number: v }))} />

            {/* Departament */}
            <View style={styles.selectWrap}>
              <Pressable onPress={() => { setShowDeptSelect(v => !v); setShowPosSelect(false); }} style={({ pressed }) => [styles.selectBtn, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.85 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text }}>{
                    fields.department_id
                      ? (
                          (departments.find(d => String(d?.id ?? d?.department_id) === String(fields.department_id))?.name) ||
                          (departments.find(d => String(d?.id ?? d?.department_id) === String(fields.department_id))?.department_name)
                        )
                      : 'Wybierz dział'
                  }</Text>
                  <Ionicons name={showDeptSelect ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                </View>
              </Pressable>
              {showDeptSelect ? (
                <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}> 
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {departments.map((dep) => {
                      const selected = String(dep?.id ?? dep?.department_id) === String(fields.department_id);
                      return (
                        <ThemedButton
                          key={String(dep?.id ?? dep?.department_id)}
                          title={dep?.name || dep?.department_name || String(dep?.id ?? dep?.department_id)}
                          onPress={() => { setFields(f => ({ ...f, department_id: dep?.id ?? dep?.department_id })); setShowDeptSelect(false); }}
                          variant="secondary"
                          style={{ borderRadius: 0, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', justifyContent: 'flex-start', paddingHorizontal: 12, height: 40, borderWidth: 0, marginVertical: 0, backgroundColor: selected ? 'rgba(99,102,241,0.12)' : 'transparent' }}
                          textStyle={{ fontWeight: 'normal', textAlign: 'left', flex: 1, color: colors.text }}
                        >
                          {selected ? <Ionicons name="checkmark" size={16} color={colors.primary || '#4f46e5'} /> : null}
                        </ThemedButton>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {/* Stanowisko */}
            <View style={styles.selectWrap}>
              <Pressable onPress={() => { setShowPosSelect(v => !v); setShowDeptSelect(false); }} style={({ pressed }) => [styles.selectBtn, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.85 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text }}>{
                    fields.position_id
                      ? (
                          (positions.find(p => String(p?.id ?? p?.position_id) === String(fields.position_id))?.name) ||
                          (positions.find(p => String(p?.id ?? p?.position_id) === String(fields.position_id))?.position_name)
                        )
                      : 'Wybierz stanowisko'
                  }</Text>
                  <Ionicons name={showPosSelect ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                </View>
              </Pressable>
              {showPosSelect ? (
                <View style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.card }]}> 
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {positions.map((pos) => {
                      const selected = String(pos?.id ?? pos?.position_id) === String(fields.position_id);
                      return (
                        <Pressable key={String(pos?.id ?? pos?.position_id)} onPress={() => { setFields(f => ({ ...f, position_id: pos?.id ?? pos?.position_id })); setShowPosSelect(false); }} style={({ pressed }) => [styles.dropdownItem, selected && { backgroundColor: 'rgba(99,102,241,0.12)' }, pressed && { opacity: 0.7 }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ color: colors.text }}>{pos?.name || pos?.position_name || String(pos?.id ?? pos?.position_id)}</Text>
                            {selected ? <Ionicons name="checkmark" size={16} color={colors.primary || '#4f46e5'} /> : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            {/* Status */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['active','inactive','suspended'].map(s => (
                <ThemedButton
                  key={s}
                  title={s === 'active' ? 'Aktywny' : s === 'inactive' ? 'Nieaktywny' : 'Zawieszony'}
                  onPress={() => setFields(f => ({ ...f, status: s }))}
                  variant={fields.status === s ? 'primary' : 'secondary'}
                  style={{ borderRadius: 999, paddingHorizontal: 12, height: 36, marginVertical: 0, borderWidth: 1, borderColor: colors.border, ...(fields.status !== s ? { backgroundColor: colors.card } : {}) }}
                  textStyle={{ fontSize: 13, fontWeight: 'normal', color: fields.status === s ? '#fff' : colors.text }}
                />
              ))}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <View style={{ width: 100 }}>
              <ThemedButton
                title="Anuluj"
                onPress={close}
                variant="secondary"
              />
            </View>
            <View style={{ width: 100 }}>
              <ThemedButton
                title="Zapisz"
                onPress={save}
                loading={loading}
                disabled={loading}
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
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 520, borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, height: 40 },
  selectWrap: { position: 'relative' },
  selectBtn: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, height: 40, justifyContent: 'center' },
  dropdown: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginTop: 6, marginBottom: 8, backgroundColor: '#fff', zIndex: 50, ...(Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.08)' }, ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 8 } })) },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  outsideOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, backgroundColor: 'transparent' },
});