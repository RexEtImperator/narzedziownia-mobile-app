// Web shim for expo-barcode-scanner to avoid native module errors on web
import React from 'react';

export const BarCodeScanner = (props) => null;

BarCodeScanner.requestPermissionsAsync = async () => ({ status: 'denied', granted: false });

export default { BarCodeScanner };