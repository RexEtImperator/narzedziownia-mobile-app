import React, { useState } from 'react';
import { View, Pressable, Text, TextInput, NativeModules } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ThemedButton from './ThemedButton';

const toISO = (date) => {
  try {
    if (!date) return '';
    const d = parseDate(date);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  } catch (_) { return ''; }
};

const parseDate = (value) => {
  try {
    if (!value) return new Date();
    const str = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const [y, m, d] = str.slice(0,10).split('-').map((v) => parseInt(v, 10));
      return new Date(y, (m - 1), d);
    }
    const m = str.match(/^(\d{2})[.\/-](\d{2})[.\/-](\d{4})/);
    if (m) { const [, dd, mm, yyyy] = m; return new Date(parseInt(yyyy,10), parseInt(mm,10)-1, parseInt(dd,10)); }
    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch (_) { return new Date(); }
};

const formatDisplay = (value) => {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0,10).split('-');
    return `${d}.${m}.${y}`;
  }
  return str;
};

export default function DateField({ value, onChange, placeholder = 'YYYY-MM-DD', style, colors }) {
  const [show, setShow] = useState(false);
  const currentDate = parseDate(value);
  const textColor = colors?.text || '#111827';
  const borderColor = show ? (colors?.primary || '#4f46e5') : (colors?.border || '#e5e7eb');
  const bgColor = colors?.card || '#fff';

  let PickerComp = null;
  const hasNativeDatePicker = !!(NativeModules && NativeModules.RNCDatePicker);
  if (hasNativeDatePicker) {
    try {
      const mod = require('@react-native-community/datetimepicker');
      PickerComp = mod?.default || mod;
    } catch (_) {
      PickerComp = null;
    }
  }

  if (!PickerComp) {
    // Fallback to TextInput when native picker is unavailable (e.g., Expo Go)
    return (
      <TextInput
        style={[style, { borderColor: colors?.border || '#e5e7eb', backgroundColor: bgColor, color: textColor }]}
        placeholder={placeholder}
        placeholderTextColor={colors?.muted || '#6b7280'}
        value={value || ''}
        onChangeText={(v) => { try { onChange && onChange(toISO(v)); } catch {} }}
      />
    );
  }

  const DateTimePicker = PickerComp;

  return (
    <View>
      <ThemedButton
        title={value || placeholder}
        onPress={() => setShow(true)}
        variant="secondary"
        style={[style, { borderColor: borderColor, backgroundColor: bgColor, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 }]}
        textStyle={{ color: value ? textColor : (colors?.muted || '#6b7280'), fontWeight: 'normal', textAlign: 'left', flex: 1 }}
        icon={<Ionicons name="calendar-outline" size={18} color={textColor} />}
      />
      {show && (
        <DateTimePicker
          value={currentDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            if (event?.type === 'dismissed') { setShow(false); return; }
            const d = selectedDate || currentDate;
            setShow(false);
            try { onChange && onChange(toISO(d)); } catch {}
          }}
        />
      )}
    </View>
  );
}
