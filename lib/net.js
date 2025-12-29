// Lightweight network connectivity utilities for auto-reconnect behavior
// Works on web and native. On native, tries expo-network; falls back to polling.

let online = true;
let listeners = new Set();

function setOnlineState(value) {
  const prev = online;
  online = !!value;
  if (prev !== online) {
    try { listeners.forEach(fn => { try { fn(online); } catch {} }); } catch {}
  }
}

// Web: subscribe to online/offline events
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  try {
    setOnlineState(navigator.onLine !== false);
    window.addEventListener('online', () => setOnlineState(true));
    window.addEventListener('offline', () => setOnlineState(false));
  } catch {}
}

// Native: use expo-network listener for precise connectivity (Android/iOS)
async function startNativeMonitoring() {
  try {
    const mod = await import('expo-network');
    const Network = mod?.default || mod;
    const toOnline = (state) => {
      try {
        const isConn = !!state?.isConnected;
        const hasInternet = state?.isInternetReachable;
        const value = isConn && (hasInternet !== false);
        setOnlineState(value);
      } catch { setOnlineState(!!state?.isConnected); }
    };
    const initial = await Network.getNetworkStateAsync();
    toOnline(initial);
    if (Network && typeof Network.addNetworkStateListener === 'function') {
      Network.addNetworkStateListener((s) => toOnline(s));
    }
  } catch {
    // If expo-network not available, rely on web events or default
  }
}

// Kick off native monitoring lazily (no-op on web)
try { startNativeMonitoring(); } catch {}

export function isOnline() { return online; }

export function reportConnectivity(status) {
  setOnlineState(!!status);
}

export function onConnectivityChange(listener) {
  if (typeof listener === 'function') {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  return () => {};
}

export async function waitForOnline(timeoutMs = 30000) {
  if (online) return true;
  return new Promise((resolve) => {
    let settled = false;
    const off = onConnectivityChange((state) => {
      if (!settled && state) { settled = true; try { off(); } catch {}; resolve(true); }
    });
    if (timeoutMs > 0) {
      setTimeout(() => { if (!settled) { settled = true; try { off(); } catch {}; resolve(false); } }, timeoutMs);
    }
  });
}

export default { isOnline, onConnectivityChange, waitForOnline };
