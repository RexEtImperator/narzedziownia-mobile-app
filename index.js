import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Load CSS only on web to avoid Metro bundling issues on native
if (Platform.OS === 'web') {
  require('./global.css');
  try {
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'wheel') {
        if (options === undefined) {
          options = { passive: true };
        } else if (typeof options === 'object' && options !== null && !('passive' in options)) {
          options = { ...options, passive: true };
        }
      }
      return origAdd.call(this, type, listener, options);
    };
  } catch {}
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
