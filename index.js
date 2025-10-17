import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// Load CSS only on web to avoid Metro bundling issues on native
if (Platform.OS === 'web') {
  require('./global.css');
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
