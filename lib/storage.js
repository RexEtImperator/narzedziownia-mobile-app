import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  TOKEN: 'token',
  CURRENT_USER: '@current_user',
  ROLE_PERMISSIONS: '@role_permissions_map_v1',
  EXPLICIT_LOGOUT: '@explicit_logout_v1',
  BIO_ENABLED: '@bio_enabled_v1',
  PUSH_ENABLED: '@pref_push_enabled_v1',
  INVENTORY_AUTO_ACCEPT: '@inventory_auto_accept_v1',
  NOTIF_SETTINGS: '@notif_settings_v1',
  NOTIF_ACK: '@notif_ack_v1',
  NOTIF_PUSHED_IDS: '@notif_pushed_ids_v1',
  BHP_OVERDUE_ACK: 'bhp_overdue_ack_v2',
  TOOLS_OVERDUE_ACK: 'tools_overdue_ack_v2',
  THEME_IS_DARK: '@theme_is_dark',
  HAS_SEEN_ONBOARDING: 'has_seen_onboarding',
  INVENTORY_SELECTED_SESSION: '@inventory_selected_session_id',
  CUSTOM_ROLES: 'appConfig.customRoles',
  ROLE_META: 'appConfig.roleMeta',
};

export async function getStorageItem(key, defaultValue = null) {
  try {
    const val = await AsyncStorage.getItem(key);
    return val !== null ? val : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setStorageItem(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {}
}

export async function removeStorageItem(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}

export async function getJson(key, defaultValue = null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
