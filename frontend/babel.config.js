module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 moved its Babel plugin into react-native-worklets. This MUST be
    // the last plugin. Using the old 'react-native-reanimated/plugin' path leaves the
    // worklets runtime uninitialized -> "Exception in HostFunction" crash at startup.
    plugins: ['react-native-worklets/plugin'],
  };
};
