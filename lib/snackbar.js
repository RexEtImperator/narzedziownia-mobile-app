import { Animated, Easing } from 'react-native';

const listeners = new Set();

export function subscribe(listener) {
  if (typeof listener === 'function') {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return () => {};
}

export function showSnackbar(message, options = {}) {
  const { type = 'success', duration = 2500 } = options || {};
  for (const fn of listeners) {
    try { fn({ message: String(message || ''), type, duration }); } catch {}
  }
}

export default { subscribe, showSnackbar };