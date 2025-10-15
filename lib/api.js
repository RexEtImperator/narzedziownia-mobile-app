import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Normalize base URL: trim spaces and remove trailing slashes
function normalizeBaseUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

// Normalize endpoint: ensure single leading slash and trim spaces
function normalizeEndpoint(endpoint) {
  const ep = String(endpoint || '').trim();
  if (!ep) return '';
  return ep.startsWith('/') ? ep : `/${ep}`;
}

function resolveBaseUrl() {
  // Priorytet: WEB → preferuj localhost, MOBILE → preferuj LAN/extra
  if (Platform.OS === 'web') {
    // 1) Honoruj jawny env, jeśli ustawiony
    if (process.env.EXPO_PUBLIC_API_BASE_URL) {
      return normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
    }
    // 2) Jeśli podgląd działa na localhost/127.0.0.1, użyj lokalnego backendu
    const webHost = (typeof window !== 'undefined' && window.location && window.location.hostname) || null;
    if (webHost === 'localhost' || webHost === '127.0.0.1') {
      return normalizeBaseUrl('http://localhost:3000');
    }
    // 3) W innym przypadku spróbuj użyć extra lub wywnioskowanego hosta
    const extra = Constants?.expoConfig?.extra;
    if (extra && extra.apiBaseUrl) {
      return normalizeBaseUrl(extra.apiBaseUrl);
    }
    if (webHost && webHost !== 'localhost' && webHost !== '127.0.0.1') {
      return normalizeBaseUrl(`http://${webHost}:3000`);
    }
    // 4) Fallback
    return normalizeBaseUrl('http://localhost:3000');
  }

  // Native (Android/iOS)
  // 1) Env var
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  }
  // 2) Expo extra from app.json
  const extra = Constants?.expoConfig?.extra;
  if (extra && extra.apiBaseUrl) {
    return normalizeBaseUrl(extra.apiBaseUrl);
  }
  // 3) Derive LAN IP from Expo host when running on device
  let host = null;
  const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest?.debuggerHost || '';
  if (hostUri) {
    host = hostUri.split(':')[0];
  }
  if (host && host !== 'localhost') {
    return normalizeBaseUrl(`http://${host}:3000`);
  }
  // 4) Fallback for local dev on the same machine
  return normalizeBaseUrl('http://localhost:3000');
}

const API_BASE_URL = resolveBaseUrl();

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = normalizeBaseUrl(baseURL);
    this.token = null;
    this._listeners = [];
  }

  async init() {
    const storedToken = await AsyncStorage.getItem('token');
    // Zawsze synchronizuj stan tokena: jeśli brak w AsyncStorage, wyczyść w pamięci
    this.token = storedToken || null;
    // Powiadom subskrybentów o aktualnym stanie tokena
    try { this._listeners.forEach(fn => fn(this.token)); } catch {}
  }

  async setToken(token) {
    this.token = token;
    if (token) {
      await AsyncStorage.setItem('token', token);
    } else {
      await AsyncStorage.removeItem('token');
    }
    // Emituj zmianę tokena do subskrybentów
    try { this._listeners.forEach(fn => fn(this.token)); } catch {}
  }

  getHeaders(extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    return headers;
  }

  async request(endpoint, config = {}) {
    const base = normalizeBaseUrl(this.baseURL);
    const ep = normalizeEndpoint(endpoint);
    const url = `${base}${ep}`;
    const headers = this.getHeaders(config.headers || {});
    const body = config.body && typeof config.body === 'object' ? JSON.stringify(config.body) : config.body;

    const response = await fetch(url, { ...config, headers, body });
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try { const parsed = JSON.parse(text); if (parsed.message) message = parsed.message; } catch {}
      if (response.status === 401 || response.status === 403) await this.setToken(null);
      const err = new Error(message || `HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    try { return await response.json(); } catch { return {}; }
  }

  get(endpoint) { return this.request(endpoint, { method: 'GET' }); }
  post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: data }); }
  put(endpoint, data) { return this.request(endpoint, { method: 'PUT', body: data }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }

  // Subskrypcja zmian tokena
  onTokenChange(listener) {
    if (typeof listener === 'function') {
      this._listeners.push(listener);
      return () => {
        this._listeners = this._listeners.filter(fn => fn !== listener);
      };
    }
    return () => {};
  }
}

const api = new ApiClient();
export default api;