// Custom Expo Webpack config to alias expo-barcode-scanner to a web shim
const path = require('path');

module.exports = function (env, config) {
  if (!config.resolve) config.resolve = {};
  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    'expo-barcode-scanner': path.resolve(__dirname, 'shims/expo-barcode-scanner-web.js'),
  };
  return config;
};