/**
 * Konfiguracja Vitest dla projektu Expo/React Native.
 * Używa środowiska jsdom dla testów webowych i prostej aliasacji RN->RNW.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    globals: true,
    include: [
      'lib/**/*.spec.{js,jsx,ts,tsx}',
      'lib/**/*.test.{js,jsx,ts,tsx}',
      'screens/**/*.spec.{js,jsx,ts,tsx}',
      'screens/**/*.test.{js,jsx,ts,tsx}'
    ],
    exclude: ['**/node_modules/**', 'dist', 'build', 'source-system-zarzadzania-narzedziownia/**']
  },
  resolve: {
    alias: {
      'react-native': 'react-native-web'
    }
  }
});
