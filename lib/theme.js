import React, { createContext, useContext, useEffect, useState } from 'react';
import { DefaultTheme as NavDefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';
import { KEYS, getStorageItem, setStorageItem } from './storage';
import { useColorScheme } from 'nativewind';

const ThemeContext = createContext({
  isDark: false,
  toggleDark: () => {},
  colors: {
    bg: '#f8fafc', card: '#ffffff', text: '#0f172a', muted: '#475569', border: '#e5e7eb',
    primary: '#4f46e5', success: '#10b981', warning: '#d97706', danger: '#dc2626', orange: '#fb923c', purple: '#c084fc', red: '#f87171', green: '#4ade80'
  },
  navTheme: NavDefaultTheme,
});

export function ThemeProvider({ children }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [isDark, setIsDark] = useState(colorScheme === 'dark');

  useEffect(() => {
    const load = async () => {
      try {
        // Small delay to ensure NativeWind is ready
        await new Promise(r => setTimeout(r, 50));

        const v = await getStorageItem(KEYS.THEME_IS_DARK);
        console.log('[Theme] Loaded preference from storage:', v);
        
        if (v !== null) {
          const dark = v === 'true';
          console.log('[Theme] Applying stored preference:', dark ? 'dark' : 'light');
          setIsDark(dark);
          setColorScheme(dark ? 'dark' : 'light');
        } else {
          console.log('[Theme] No preference found. Using system/default.');
          if (colorScheme) {
            console.log('[Theme] System color scheme is:', colorScheme);
            setIsDark(colorScheme === 'dark');
          }
        }
      } catch (e) {
        console.log('[Theme] Load error:', e);
      }
    };
    load();
  }, []);

  const toggleDark = async (forceValue) => {
    const next = typeof forceValue === 'boolean' ? forceValue : !isDark;
    console.log('[Theme] Toggling to:', next ? 'dark' : 'light');
    setIsDark(next);
    setColorScheme(next ? 'dark' : 'light');
    try { 
      await setStorageItem(KEYS.THEME_IS_DARK, String(next)); 
      console.log('[Theme] Saved preference:', String(next));
    } catch (e) {
      console.log('[Theme] Save error:', e);
    }
  };

  const navTheme = isDark ? NavDarkTheme : NavDefaultTheme;
  const colors = isDark ? {
    bg: '#0b1220', card: '#111827', text: '#e5e7eb', muted: '#9ca3af', border: '#1f2937',
    primary: '#6366f1', success: '#34d399', warning: '#f59e0b', danger: '#ef4444', orange: '#fb923c', purple: '#c084fc', red: '#f87171', green: '#4ade80'
  } : {
    bg: '#f8fafc', card: '#ffffff', text: '#0f172a', muted: '#475569', border: '#e5e7eb',
    primary: '#4f46e5', success: '#10b981', warning: '#d97706', danger: '#dc2626', orange: '#fb923c', purple: '#c084fc', red: '#f87171', green: '#4ade80'
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark, colors, navTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}