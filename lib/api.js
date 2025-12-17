import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { waitForOnline } from './net';
import { showSnackbar } from './snackbar';

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
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return normalizeBaseUrl(`http://${host}:3000`);
  }
  // 4) Fallback for local dev
  // Android emulator cannot reach host's localhost; use 10.0.2.2
  if (Platform.OS === 'android') {
    return normalizeBaseUrl('http://192.168.10.99:3000');
  }
  // iOS simulator can use localhost
  return normalizeBaseUrl('http://localhost:3000');
}

const API_BASE_URL = resolveBaseUrl();

class ApiClient {
  constructor(baseURL = API_BASE_URL) {
    this.baseURL = normalizeBaseUrl(baseURL);
    this.token = null;
    this._listeners = [];
    this._refreshing = false;
    this._pendingQueue = [];
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

  emitEvent(name, detail = {}) {
    try {
      // Web: emit CustomEvent for devtools/integracje
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } else {
        // Mobile: mapuj kluczowe zdarzenia na Snackbar/Toast
        if (name === 'auth:refreshed') showSnackbar('Sesja odświeżona', { type: 'success' });
        if (name === 'auth:invalid') showSnackbar('Sesja wygasła, zaloguj się ponownie', { type: 'error' });
      }
    } catch {}
  }

  async refreshToken() {
    if (this._refreshing) return false;
    this._refreshing = true;
    try {
      // Jeśli użytkownik wylogował się explicite, nie odświeżaj sesji
      try {
        const explicit = await AsyncStorage.getItem('@explicit_logout_v1');
        if (explicit === '1') {
          await this.setToken(null);
          this.emitEvent('auth:invalid');
          return false;
        }
      } catch {}
      const base = normalizeBaseUrl(this.baseURL);
      const url = `${base}/api/auth/refresh`;
      const started = Date.now();
      this.emitEvent('api:request-debug', { method: 'POST', url });
      const resp = await fetch(url, {
        method: 'POST',
        credentials: 'include', // dla httpOnly cookie na web
        headers: { 'Accept': 'application/json' }
      });
      const ms = Date.now() - started;
      this.emitEvent('api:response-debug', { status: resp.status, ms, url });
      if (!resp.ok) {
        await this.setToken(null);
        this.emitEvent('auth:invalid');
        return false;
      }
      let data = {};
      try { data = await resp.json(); } catch {}
      const nextToken = data?.token || data?.accessToken || data?.access_token || null;
      if (nextToken) {
        await this.setToken(nextToken);
        this.emitEvent('auth:refreshed', { token: 'updated' });
        return true;
      }
      // Jeśli backend zarządza sesją tylko ciasteczkiem, pozwól kontynuować bez Bearera
      this.emitEvent('auth:refreshed', { token: 'cookie-only' });
      return true;
    } catch {
      await this.setToken(null);
      this.emitEvent('auth:invalid');
      return false;
    } finally {
      this._refreshing = false;
    }
  }

  async request(endpoint, config = {}) {
    const base = normalizeBaseUrl(this.baseURL);
    const ep = normalizeEndpoint(endpoint);
    const url = `${base}${ep}`;
    const headers = this.getHeaders(config.headers || {});
    const body = config.body && typeof config.body === 'object' ? JSON.stringify(config.body) : config.body;

    const exec = async () => {
      const started = Date.now();
      this.emitEvent('api:request-debug', { method: config.method || 'GET', url });
      const response = await fetch(url, { ...config, headers, body });
      const ms = Date.now() - started;
      this.emitEvent('api:response-debug', { status: response.status, ms, url });
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        let parsed = null;
        try { parsed = JSON.parse(text); if (parsed?.message) message = parsed.message; } catch {}
        if (response.status === 401 || response.status === 403) {
          // Spróbuj odświeżyć sesję (cookie httpOnly na web) i ponowić żądanie
          const refreshed = await this.refreshToken();
          if (refreshed) {
            // Po udanym odświeżeniu spróbuj ponownie
            const headersRetry = this.getHeaders(config.headers || {});
            const responseRetry = await fetch(url, { ...config, headers: headersRetry, body });
            const ms2 = Date.now() - started;
            this.emitEvent('api:response-debug', { status: responseRetry.status, ms: ms2, url });
            if (responseRetry.ok) {
              try { return await responseRetry.json(); } catch { return {}; }
            }
          }
          // Nie udało się odświeżyć: wyloguj lokalnie
          await this.setToken(null);
        }
        const err = new Error(message || `HTTP ${response.status}`);
        err.status = response.status;
        if (parsed && typeof parsed === 'object') {
          err.messageKey = parsed.messageKey || parsed.key || parsed.error || undefined;
          err.code = parsed.code || parsed.statusCode || undefined;
          err.payload = parsed;
        }
        throw err;
      }
      try { return await response.json(); } catch { return {}; }
    };

    try {
      return await exec();
    } catch (e) {
      // Auto-retry once if network is offline and comes back within timeout
      const msg = String(e?.message || '').toLowerCase();
      const isNetworkErr = msg.includes('network request failed') || msg.includes('failed to fetch') || e?.status === undefined;
      if (isNetworkErr) {
        const cameBack = await waitForOnline(20000);
        if (cameBack) {
          try { return await exec(); } catch {}
        }
        // Fallback: small delay then retry once more
        await new Promise(res => setTimeout(res, 3000));
        try { return await exec(); } catch {}
      }
      throw e;
    }
  }

  get(endpoint) { return this.request(endpoint, { method: 'GET' }); }
  post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: data }); }
  put(endpoint, data) { return this.request(endpoint, { method: 'PUT', body: data }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }
  del(endpoint) { return this.delete(endpoint); }

  // multipart/form-data wygenerowane przez fetch (bez ręcznego Content-Type)
  postForm(endpoint, formData) {
    const base = normalizeBaseUrl(this.baseURL);
    const ep = normalizeEndpoint(endpoint);
    const url = `${base}${ep}`;
    const headers = this.token ? { Authorization: `Bearer ${this.token}` } : {};
    const started = Date.now();
    this.emitEvent('api:request-debug', { method: 'POST', url });
    return fetch(url, { method: 'POST', headers, body: formData }).then(async (response) => {
      const ms = Date.now() - started;
      this.emitEvent('api:response-debug', { status: response.status, ms, url });
      if (!response.ok) {
        const text = await response.text();
        let message = text; let parsed = null;
        try { parsed = JSON.parse(text); if (parsed?.message) message = parsed.message; } catch {}
        const err = new Error(message || `HTTP ${response.status}`);
        err.status = response.status;
        if (parsed && typeof parsed === 'object') {
          err.messageKey = parsed.messageKey || parsed.key || parsed.error || undefined;
          err.code = parsed.code || parsed.statusCode || undefined;
          err.payload = parsed;
        }
        throw err;
      }
      try { return await response.json(); } catch { return {}; }
    });
  }

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

  // Dziennik audytu: pobieranie z parametrami zapytania
  async getAuditLogs(params = {}) {
    const qs = new URLSearchParams();
    Object.keys(params).forEach((key) => {
      const val = params[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        qs.append(key, val);
      }
    });
    const query = qs.toString();
    return this.get(`/api/audit${query ? `?${query}` : ''}`);
  }
}

const api = new ApiClient();
export default api;
