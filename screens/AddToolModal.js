import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../lib/theme';
import api from '../lib/api.js';
import { showSnackbar } from '../lib/snackbar';
import { Ionicons } from '@expo/vector-icons';

export default function AddToolModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fields, setFields] = useState({
    name: '',
    sku: '',
    inventory_number: '',
    serial_number: '',
    category: '',
    status: '',
    location: '',
    quantity: '1'
  });

  useEffect(() => {
    if (visible) {
      setError('');
      setSaving(false);
    }
  }, [visible]);

  const close = () => {
    if (saving) return;
    onClose && onClose();
  };

  const setField = (key, val) => {
    setFields(prev => ({ ...prev, [key]: val }));
  };

  const save = async () => {
    if (saving) return;
    setError('');
    const name = String(fields.name || '').trim();
    if (!name) {
      setError('Podaj nazwę narzędzia');
      showSnackbar({ type: 'warn', text: 'Podaj nazwę narzędzia' });
      return;
    }

    const payload = {
      name: name,
      sku: String(fields.sku || '').trim() || undefined,
      inventory_number: String(fields.inventory_number || '').trim() || undefined,
      serial_number: String(fields.serial_number || '').trim() || undefined,
      category: String(fields.category || '').trim() || undefined,
      status: String(fields.status || '').trim() || undefined,
      location: String(fields.location || '').trim() || undefined,
      quantity: Number(String(fields.quantity || '1').replace(/\D+/g, '')) || 1
    };

    try {
      setSaving(true);
      await api.init();
      const res = await api.post('/api/tools', payload);
      const created = Array.isArray(res?.data) ? (res.data[0] || null) : (res?.data || res || null);
      if (!created) {
        throw new Error('Błąd tworzenia narzędzia');
      }
      onCreated && onCreated(created);
      onClose && onClose();
    } catch (e) {
      setError(e?.message || 'Nie udało się dodać narzędzia');
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się dodać narzędzia' });
    } finally {
      setSaving(false);
    }
  };

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
                onChangeText={(v) => setField('sku', v)}
                placeholder="np. D-1234"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Nr ewidencyjny</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.inventory_number}
                onChangeText={(v) => setField('inventory_number', v)}
                placeholder="np. 2024-0001"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Nr seryjny</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.serial_number}
                onChangeText={(v) => setField('serial_number', v)}
                placeholder="np. SN-987654"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Kategoria</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.category}
                onChangeText={(v) => setField('category', v)}
                placeholder="np. Elektryczne"
                placeholderTextColor={colors.muted}
              />
            </View>

            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={fields.status}
                onChangeText={(v) => setField('status', v)}
                placeholder="np. dostępne / serwis"
                placeholderTextColor={colors.muted}
              />
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
              disabled={saving}
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