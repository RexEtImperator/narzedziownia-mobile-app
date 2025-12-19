import React, { useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetScrollView } from '@gorhom/bottom-sheet';

export default function ReturnSheet({ visible, onClose, items = [], loading, error, onQuickReturn, snapPoints = ['30%', '70%', '100%'], initialSnap = 1 }) {
  if (Platform.OS === 'web') return null;
  const points = useMemo(() => snapPoints, [snapPoints]);
  const [index, setIndex] = useState(initialSnap);
  if (!visible) return null;
  return (
    <BottomSheet
      index={index}
      snapPoints={points}
      enablePanDownToClose={false}
      enableHandlePanningGesture={true}
      enableContentPanningGesture={true}
      handleStyle={{ paddingVertical: 8 }}
      handleIndicatorStyle={{ backgroundColor: '#9ca3af', width: 48, height: 6, borderRadius: 999, alignSelf: 'center' }}
      onClose={onClose}
      onChange={(i)=>setIndex(i)}
    >
      <BottomSheetScrollView contentContainerStyle={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '700' }}>Do zwrotu</Text>
        </View>

        {loading ? (
          <Text style={{ color: '#6b7280' }}>Ładowanie…</Text>
        ) : error ? (
          <Text style={{ color: '#b91c1c' }}>Błąd: {String(error)}</Text>
        ) : (items && items.length > 0 ? (
          items.map((itm) => (
            <View key={`ret-native-${itm.id || itm.issue_id || itm.tool_id}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e6e6e6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{itm.tool_name || itm.name || 'Narzędzie'}</Text>
                {itm.employee_name ? (<Text style={{ color: '#555' }}>{itm.employee_name}</Text>) : null}
                {itm.tool_code ? (<Text style={{ color: '#555' }}>Kod: {itm.tool_code}</Text>) : null}
                <Text style={{ color: '#555' }}>Ilość: {itm.quantity || 1}</Text>
              </View>
              {itm.tool_code ? (
                <ThemedButton
                  title="Szybki zwrot"
                  onPress={() => onQuickReturn?.(itm.tool_code)}
                  variant="primary"
                  style={{ paddingVertical: 8, paddingHorizontal: 12, height: 'auto', minHeight: 36, marginVertical: 0 }}
                  textStyle={{ fontWeight: '600', fontSize: 14 }}
                />
              ) : null}
            </View>
          ))
        ) : (
          <Text style={{ color: '#6b7280' }}>Brak aktywnych wydań do zwrotu.</Text>
        ))}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

