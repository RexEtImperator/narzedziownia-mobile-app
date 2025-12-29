import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import api from './api';
import { KEYS, getJson, setJson, removeStorageItem } from './storage';

const SETTINGS_KEY = KEYS.NOTIF_SETTINGS;
const ACK_KEY = KEYS.NOTIF_ACK;
const defaultSettings = {
  reviewsEnabled: false,
  expiredEnabled: false,
  reviewsTime: { hour: 8, minute: 0 }, // poniedziałek 08:00
  expiredTime: { hour: 8, minute: 30 }, // codziennie 08:30
};

export async function initNotifications() {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission !== 'granted') {
          await Notification.requestPermission();
        }
        return { granted: Notification.permission === 'granted' };
      }
      return { granted: false };
    }
    // Expo Go (store client) lacks full support for expo-notifications; avoid import to prevent noisy warnings
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) {
      // In Expo Go, remote push is unsupported and local scheduling is limited.
      // We return granted=true so UI toggles work, and use Alert fallbacks for immediate messages.
      return { granted: true, expoGo: true };
    }
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    // Ustaw handler, aby pokazywać alerty w foreground
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
    } catch {}
    // Android: kanał powiadomień
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 250, 250, 250],
        });
      } catch {}
    }
    const { status, granted } = await Notifications.requestPermissionsAsync();
    return { granted: granted ?? status === 'granted' };
  } catch (e) {
    return { granted: false, error: e };
  }
}

// Ack storage helpers
async function getAckSet() {
  const list = await getJson(ACK_KEY, []);
  return new Set(Array.isArray(list) ? list : []);
}

async function saveAckSet(set) {
  await setJson(ACK_KEY, [...set]);
}

async function hasAck(key) {
  try {
    const s = await getAckSet();
    return s.has(String(key || ''));
  } catch {
    return false;
  }
}

export async function addAck(key) {
  try {
    const s = await getAckSet();
    s.add(String(key || ''));
    await saveAckSet(s);
  } catch {}
}

export async function sendImmediate(title, body, data = null) {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return null;
    }
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) {
      // Fallback in Expo Go: immediate in-app alert with ack
      try {
        const ackKey = data?.ackKey;
        Alert.alert(
          title || 'Powiadomienie',
          body || '',
          ackKey ? [{ text: 'OK', onPress: () => { try { addAck(ackKey); } catch {} } }] : [{ text: 'OK' }],
          { cancelable: true }
        );
      } catch {}
      return null;
    }
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: data || {} },
      trigger: null,
    });
  } catch (e) {
    return null;
  }
}

export async function scheduleDaily(id, hour, minute, title, body) {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return null;
    }
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) {
      // Scheduling not supported in Expo Go; skip
      return null;
    }
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { hour, minute, repeats: true },
    });
  } catch (e) {
    return null;
  }
}

export async function scheduleWeekly(id, weekday, hour, minute, title, body) {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return null;
    }
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) {
      // Scheduling not supported in Expo Go; skip
      return null;
    }
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: { weekday, hour, minute, repeats: true },
    });
  } catch (e) {
    return null;
  }
}

export async function cancelAll() {
  try {
    if (Platform.OS === 'web') { return; }
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) { return; }
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {}
}

async function scheduleAtDate(date, title, body, data = null) {
  try {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    if (Platform.OS === 'web') {
      // Web nie wspiera harmonogramu — fallback: jeśli data już minęła lub jest bardzo blisko, pokaż od razu
      const dt = date.getTime();
      const now = Date.now();
      if (dt <= now + 10_000 && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
      return null;
    }
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    if (isExpoGo) {
      // Scheduling not supported in Expo Go; skip
      return null;
    }
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    // Nowy, zalecany typ triggera: { type: 'date', date }
    return Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: data || {} },
      trigger: { type: 'date', date },
    });
  } catch {
    return null;
  }
}

function parseReviewDate(item) {
  // 1) Najczęstsze, znane pola
  const candidates = [
    item?.inspection_date,
    item?.inspectionDate,
    item?.nextReviewAt,
    item?.next_review_at,
    item?.next_review,
    item?.next_check_at,
    item?.next_check,
    item?.reviewDate,
    item?.review_date,
    item?.next_inspection,
    item?.next_inspection_date,
    item?.due_date,
    item?.expiry_date,
    item?.expiration_date,
    item?.bhp_next_check_at,
    item?.bhp_next_review_at,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const time = Date.parse(String(c));
    if (Number.isFinite(time)) return new Date(time);
  }
  // 2) Heurystyka: wyszukaj po nazwach kluczy, jeśli powyższe nie zadziałały
  try {
    const keys = Object.keys(item || {});
    for (const k of keys) {
      const lower = k.toLowerCase();
      const looksLikeDateKey = (
        (lower.includes('next') && (lower.includes('review') || lower.includes('check') || lower.includes('inspection'))) ||
        (lower.includes('review') && lower.includes('date')) ||
        (lower.includes('due') && lower.includes('date')) ||
        lower.includes('expiry_date') || lower.includes('expiration')
      );
      if (!looksLikeDateKey) continue;
      const val = item[k];
      const time = Date.parse(String(val));
      if (Number.isFinite(time) && time > Date.UTC(2010, 0, 1)) {
        return new Date(time);
      }
    }
  } catch {}
  return null;
}

function getItemKey(item) {
  const parts = [
    item?.id,
    item?.tool_id,
    item?.inventory_number,
    item?.code,
    item?.barcode,
    item?.qr_code,
    item?.sku,
    item?.serial_number,
  ].filter(Boolean).map(String);
  const base = parts.length ? parts.join('|') : String(item?.name || item?.tool_name || 'item');
  return base;
}

async function fetchList(endpoint) {
  try {
    const data = await api.get(endpoint);
    const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    return list.map(it => ({ ...it, __source: endpoint }));
  } catch {
    return [];
  }
}

async function fetchToolsAndBhp() {
  // Zawsze próbuj /api/tools. Opcjonalnie spróbuj /api/bhp jeżeli istnieje.
  const tools = await fetchList('/api/tools');
  const bhp = await fetchList('/api/bhp');
  // Jeżeli brak /api/bhp, spróbuj alternatywy (na wypadek innej konwencji backendu)
  const altBhp1 = bhp.length ? [] : await fetchList('/api/bhp/tools');
  const altBhp2 = (bhp.length || altBhp1.length) ? [] : await fetchList('/api/tools/bhp');
  return [...tools, ...bhp, ...altBhp1, ...altBhp2];
}

export async function scheduleFromApi(settings) {
  try {
    await api.init();
  } catch {}
  const s = settings || (await getSettings());
  const list = await fetchToolsAndBhp();

  const now = Date.now();
  const scheduled = new Set();
  const ackSet = await getAckSet();
  for (const item of list) {
    const reviewDate = parseReviewDate(item);
    const baseKey = getItemKey(item);
    const isBhpCategory = String(item?.category || item?.category_name || '').toLowerCase().includes('bhp');
    const isBhpSource = String(item?.__source || '').toLowerCase().includes('/api/bhp');
    const isBhp = isBhpCategory || isBhpSource;
    const isWelding = String(item?.category || item?.category_name || '').toLowerCase().includes('spawalnicze');
    const titleExpired = isBhp ? 'Po terminie (BHP)' : 'Po terminie (Narzędzia)';
    let titleRem7 = isBhp ? 'Przegląd BHP (za 7 dni)' : 'Przegląd narzędzia (za 7 dni)';
    let titleRem30 = isBhp ? 'Przegląd BHP (za 30 dni)' : 'Przegląd narzędzia (za 30 dni)';
    if (isWelding) {
      titleRem7 = 'Przegląd spawalniczy (za 7 dni)';
      titleRem30 = 'Przegląd spawalniczy (za 30 dni)';
    }
    const name = item?.name || item?.tool_name || item?.sku || 'Narzędzie';

    // Jeśli nie mamy daty, ale jest flaga overdue — zgłoś natychmiast
    if (!reviewDate && (item?.overdue === true || item?.is_overdue === true)) {
      if (s.expiredEnabled) {
        const key = `overdue:${baseKey}:${isBhp ? 'bhp' : 'tools'}`;
        if (!scheduled.has(key) && !ackSet.has(key)) {
          scheduled.add(key);
          await sendImmediate(titleExpired, `${name} — przegląd po terminie`, { ackKey: key, source: item?.__source || null });
        }
      }
      continue; // bez daty nie planujemy przypomnienia 7 dni
    }
    if (!reviewDate) continue;
    const time = reviewDate.getTime();

    // Alert przeterminowany (w dniu przeglądu lub natychmiast jeśli już po terminie)
    if (s.expiredEnabled) {
      const keyExpired = `expired:${baseKey}:${time}:${isBhp ? 'bhp' : 'tools'}`;
      if (!scheduled.has(keyExpired) && !ackSet.has(keyExpired)) {
        scheduled.add(keyExpired);
        if (time <= now) {
          await sendImmediate(titleExpired, `${name} — przegląd był ${new Date(time).toLocaleDateString()}` , { ackKey: keyExpired, source: item?.__source || null, when: time });
        } else {
          await scheduleAtDate(new Date(time), titleExpired, `${name} — termin przeglądu dziś`, { ackKey: keyExpired, source: item?.__source || null, when: time });
        }
      }
    }

    // Przypomnienia: 30 dni oraz 7 dni wcześniej (dla Spawalniczych również 30 dni)
    if (s.reviewsEnabled) {
      // 30 dni wcześniej
      if (isWelding) {
        const remind30Ms = time - 30 * 24 * 60 * 60 * 1000;
        const keyRem30 = `rem30:${baseKey}:${remind30Ms}:${isBhp ? 'bhp' : 'tools'}`;
        if (!scheduled.has(keyRem30) && !ackSet.has(keyRem30)) {
          scheduled.add(keyRem30);
          const remindAt30 = new Date(remind30Ms);
          if (remindAt30.getTime() > now) {
            await scheduleAtDate(remindAt30, titleRem30, `${name} — zaplanuj przegląd`, { ackKey: keyRem30, source: item?.__source || null, when: remind30Ms });
          }
        }
      }
      const remindMs = time - 7 * 24 * 60 * 60 * 1000;
      const keyRem = `rem7:${baseKey}:${remindMs}:${isBhp ? 'bhp' : 'tools'}`;
      if (!scheduled.has(keyRem) && !ackSet.has(keyRem)) {
        scheduled.add(keyRem);
        const remindAt = new Date(remindMs);
        if (remindAt.getTime() > now) {
          await scheduleAtDate(remindAt, titleRem7, `${name} — zaplanuj przegląd`, { ackKey: keyRem, source: item?.__source || null, when: remindMs });
        }
      }
    }
  }
}

export async function getSettings() {
  const parsed = await getJson(SETTINGS_KEY, null);
  if (!parsed) return { ...defaultSettings };
  return { ...defaultSettings, ...parsed };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...(partial || {}) };
  await setJson(SETTINGS_KEY, next);
  return next;
}

export async function rescheduleFromSettings(settings) {
  try {
    await cancelAll();
  } catch {}
  const s = settings || (await getSettings());
  await scheduleFromApi(s);
}

export async function initializeAndRestore() {
  const perm = await initNotifications();
  const settings = await getSettings();
  if (perm?.granted) {
    await rescheduleFromSettings(settings);
  }
  return { granted: !!perm?.granted, settings };
}

export async function disableAllNotifications() {
  try { await cancelAll(); } catch {}
  try { await saveSettings({ reviewsEnabled: false, expiredEnabled: false }); } catch {}
}

// API helpers: oznaczanie jako nieprzeczytane
export async function markAllUnread() {
  try { await api.post('/api/notifications/unread-all', {}); } catch {}
}

export async function markNotificationUnread(id) {
  try {
    if (!id) return;
    await api.post(`/api/notifications/${encodeURIComponent(id)}/unread`, {});
  } catch {}
}

// Dodatkowe endpointy dla powiadomień typu 'return_request'
export async function markReturnUnreadAll() {
  try { await api.post('/api/notify-return/unread-all', {}); } catch {}
}

export async function markReturnUnread(id) {
  try {
    if (!id) return;
    await api.post(`/api/notify-return/${encodeURIComponent(id)}/unread`, {});
  } catch {}
}

// Public API: clear acknowledgements and optionally reschedule
export async function clearAcknowledgements({ reschedule = true } = {}) {
  await removeStorageItem(ACK_KEY);
  // Cofnij przeczytane powiadomienia użytkownika w backendzie
  try {
    // Najpierw cofnij nieprzeczytane dla zwrotów (return_request), następnie globalnie
    await markReturnUnreadAll();
  } catch {}
  try { await markAllUnread(); } catch {}
  if (reschedule) {
    try {
      const s = await getSettings();
      await rescheduleFromSettings(s);
    } catch {}
  }
}

// Helper for NotificationsScreen to mark overdue items as read locally
export async function acknowledgeOverdueItem(type, id, date) {
  const ackKey = type === 'bhp' ? KEYS.BHP_OVERDUE_ACK : KEYS.TOOLS_OVERDUE_ACK;
  const map = await getJson(ackKey, {});
  const key = id.replace(type === 'bhp' ? 'bhp-' : 'tool-', '');
  map[key] = String(date || '');
  await setJson(ackKey, map);
}

// Rejestracja tokena push w backendzie (Expo push)
export async function registerDevicePushToken() {
  try {
    if (Platform.OS === 'web') return null;
    const isExpoGo = Constants?.appOwnership === 'expo' || Constants?.executionEnvironment === 'storeClient';
    // if (isExpoGo) return null; // Allow Expo Go for testing
    const mod = await import('expo-notifications');
    const Notifications = mod?.default || mod;
    // projectId jest wymagany w niektórych konfiguracjach — spróbuj wykryć, inaczej użyj domyślnego
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || undefined;
    const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenResp?.data || tokenResp?.expoPushToken || null;
    if (!token) return null;
    try { await api.init(); } catch {}
    try {
      await api.post('/api/push/register', { token });
    } catch {}
    return token;
  } catch {
    return null;
  }
}
