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
  // 1) Env var for explicit config
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
  if (Platform.OS === 'web') {
    host = (typeof window !== 'undefined' && window.location && window.location.hostname) || null;
  } else {
    const hostUri = Constants?.expoConfig?.hostUri || Constants?.manifest?.debuggerHost || '';
    if (hostUri) {
      host = hostUri.split(':')[0];
    }
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
  }

  async init() {
    const storedToken = await AsyncStorage.getItem('token');
    if (storedToken) this.token = storedToken;
  }

  async setToken(token) {
    this.token = token;
    if (token) {
      await AsyncStorage.setItem('token', token);
    } else {
      await AsyncStorage.removeItem('token');
    }
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
}

const api = new ApiClient();
export default api;