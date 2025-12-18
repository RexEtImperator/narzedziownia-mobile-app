module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
    // Reanimated plugin MUST be listed last
    plugins: ['react-native-reanimated/plugin'],
  };
};
