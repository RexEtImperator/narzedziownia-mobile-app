// Custom Expo Webpack config to alias problematic modules for web resolution
const path = require('path');

module.exports = function (env, config) {
  if (!config.resolve) config.resolve = {};
  // Ensure .mjs is resolvable
  config.resolve.extensions = Array.from(new Set([...(config.resolve.extensions || []), '.mjs']));
  // Prefer relative resolution within packages
  config.resolve.preferRelative = true;
  // Prioritize ESM fields for modern packages
  config.resolve.mainFields = ['module', 'import', 'browser', 'main'];

  config.resolve.alias = {
    ...(config.resolve.alias || {}),
    'expo-barcode-scanner': path.resolve(__dirname, 'shims/expo-barcode-scanner-web.js')
  };

  // Help Webpack handle ESM .mjs packages with complex exports
  config.module = config.module || {};
  config.module.rules = [
    ...(config.module.rules || []),
    {
      test: /\.mjs$/,
      include: /node_modules/,
      type: 'javascript/auto',
      resolve: { fullySpecified: false },
    },
  ];
  return config;
};
