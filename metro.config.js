const { getDefaultConfig } = require('expo/metro-config');
const metroNativewind = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
const withNativeWind = metroNativewind.withNativeWind || metroNativewind.default;

module.exports = withNativeWind(config, { output: 'css' });