import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DefaultTheme as NavDefaultTheme, DarkTheme as NavDarkTheme } from '@react-navigation/native';

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
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const v = await AsyncStorage.getItem('theme:isDark');
        setIsDark(v === 'true');
      } catch {}
    };
    load();
  }, []);

  const toggleDark = async () => {
    const next = !isDark;
    setIsDark(next);
    try { await AsyncStorage.setItem('theme:isDark', String(next)); } catch {}
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