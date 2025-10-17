import React from 'react';
import { View, Text } from 'react-native';

export default function BarCodeScannerWeb({ style }) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' }, style]}>
      <Text style={{ color: '#fff' }}>Skaner dostępny tylko na urządzeniach mobilnych</Text>
    </View>
  );
}