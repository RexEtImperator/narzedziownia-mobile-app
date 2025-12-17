import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import twColors from 'tailwindcss/colors';
import { useTheme } from '../lib/theme';
import api from '../lib/api';
import { showSnackbar } from '../lib/snackbar';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RolesPermissionsScreen() {
  const { colors, isDark } = useTheme();
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rolePermissions, setRolePermissions] = useState({});
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [rolesMap, setRolesMap] = useState({
    administrator: { name: 'Administrator', description: 'Pełne uprawnienia', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300', priority: 100 },
    manager: { name: 'Kierownik', description: 'Zarządzanie, bez admina', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', priority: 90 },
    toolsmaster: { name: 'Narzędziowiec', description: 'Dozór nad wydawaniem/zwrotem narzędzi', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', priority: 80 },
    hr: { name: 'HR', description: 'Zarządzanie pracownikami', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', priority: 70 },
    supervisor: { name: 'Mistrz', description: '8', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', priority: 60 },
    engineer: { name: ' Inżynier', description: 'Wsparcie produkcyjne', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', priority: 50 },
    employee: { name: 'Pracownik', description: 'Pracownik w dziale ze swoim stanowiskiem', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', priority: 10 },
  });
  const [newRoleName, setNewRoleName] = useState('');
  const [rolePickerUser, setRolePickerUser] = useState(null);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [expandedRoles, setExpandedRoles] = useState({});

  // Dobór koloru tekstu na chipie roli w zależności od tła
  const getReadableTextColor = (bg) => {
    const hex = String(bg || '').trim();
    const m = /^#?([a-fA-F0-9]{6})$/.exec(hex) || /^#?([a-fA-F0-9]{3})$/.exec(hex);
    if (!m) return colors.text;
    let h = m[1];
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? '#0f172a' : '#ffffff';
  };

  // Usuwa warianty (np. dark:, hover:) na potrzeby dopasowania
  const stripVariants = (cls) => cls.replace(/^(?:hover:|focus:|active:|disabled:|dark:)/, '');

  // Parsuje token Tailwind (bg-*, text-*) do HEX korzystając z tailwindcss/colors
  const getHexForTailwind = (token) => {
    const t = stripVariants(token);
    const parts = t.split('-');
    const prefix = parts[0];
    if (prefix !== 'bg' && prefix !== 'text') return null;
    if (t.endsWith('transparent')) return 'transparent';
    if (t.endsWith('white')) return '#ffffff';
    if (t.endsWith('black')) return '#000000';
    const name = parts[1];
    const shade = parts[2];
    const palette = twColors?.[name];
    if (!palette) return null;
    if (typeof palette === 'string') return palette;
    if (shade && palette[shade]) return palette[shade];
    const defaultShade = prefix === 'bg' ? (palette['600'] ? '600' : (palette['500'] ? '500' : Object.keys(palette)[0]))
                                        : (palette['800'] ? '800' : (palette['700'] ? '700' : Object.keys(palette).slice(-1)[0]));
    return palette[defaultShade];
  };

  // Pomocnicze: parsowanie /alpha i usunięcie części alpha z tokenu
  const parseAlpha = (token) => {
    const m = /\/(\d{1,3})$/.exec(token);
    return m ? Math.max(0, Math.min(100, parseInt(m[1], 10))) : null;
  };
  const stripAlpha = (token) => token.replace(/\/(\d{1,3})$/, '');

  const hexToRgba = (hex, alphaPct) => {
    if (!hex || hex === 'transparent') return 'transparent';
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const a = typeof alphaPct === 'number' ? Math.max(0, Math.min(1, alphaPct / 100)) : 1;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const resolveRoleColors = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return { bg: '#f3f4f6', fg: '#1f2937' }; // bg-gray-100 text-gray-800
    // HEX bezpośrednio
    if (/^#?[a-fA-F0-9]{3,6}$/.test(raw)) {
      const bg = raw.startsWith('#') ? raw : `#${raw}`;
      return { bg, fg: getReadableTextColor(bg) };
    }
    // Klasy Tailwind, z obsługą dark: i /alpha
    const tokens = raw.split(/\s+/).filter(Boolean);
    let baseBgHex = null, baseBgAlpha = null, baseTextHex = null;
    let darkBgHex = null, darkBgAlpha = null, darkTextHex = null;

    tokens.forEach(token => {
      const isDarkToken = token.startsWith('dark:');
      const alpha = parseAlpha(token);
      const t = stripAlpha(token);
      const tt = stripVariants(t);
      if (tt.startsWith('bg-')) {
        const h = getHexForTailwind(tt);
        if (h) {
          if (isDarkToken) { darkBgHex = h; darkBgAlpha = alpha; }
          else { baseBgHex = h; baseBgAlpha = alpha; }
        }
      } else if (tt.startsWith('text-')) {
        const h = getHexForTailwind(tt);
        if (h) {
          if (isDarkToken) darkTextHex = h; else baseTextHex = h;
        }
      }
    });

    const chosenBgHex = isDark ? (darkBgHex || baseBgHex) : (baseBgHex || darkBgHex || getHexForTailwind('bg-gray-100') || '#f3f4f6');
    const chosenBgAlpha = isDark ? (darkBgAlpha ?? baseBgAlpha) : (baseBgAlpha ?? darkBgAlpha);
    const bg = chosenBgAlpha ? hexToRgba(chosenBgHex, chosenBgAlpha) : (chosenBgHex || '#f3f4f6');

    let fg = isDark ? (darkTextHex || baseTextHex) : (baseTextHex || darkTextHex);
    if (!fg) fg = getReadableTextColor(chosenBgHex || '#f3f4f6');
    return { bg, fg };
  };

  const styles = StyleSheet.create({
    wrapper: { flex: 1 },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 12 },
    headerTabs: { flexDirection: 'row', gap: 8, marginBottom: 12, backgroundColor: colors.bg, borderRadius: 999, padding: 4, borderWidth: 1, borderColor: colors.border },
    tabBtn: { flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    tabActive: { borderColor: colors.primary, backgroundColor: '#eef2ff' },
    tabText: { color: colors.text, fontWeight: '600' },
    tabBadge: { minWidth: 24, height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    tabBadgeText: { fontSize: 12, color: colors.muted },
    listItem: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 6 },
    avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    identityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
    actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', marginTop: 8 },
    roleChip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
    smallButton: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    permChip: { paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 999, marginRight: 6, marginBottom: 6 },
    button: { paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  });

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      await api.init();
      const data = await api.get('/api/users');
      const list = Array.isArray(data) ? data : [];
      setUsers(list);
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się pobrać użytkowników', { type: 'error' });
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchRolePermissions = useCallback(async () => {
    setLoadingPermissions(true);
    try {
      await api.init();
      const data = await api.get('/api/role-permissions');
      const normalized = {};
      if (data && typeof data === 'object') {
        for (const [rk, perms] of Object.entries(data)) {
          const list = Array.isArray(perms) ? perms : [];
          normalized[rk] = Array.from(new Set(list));
        }
      }
      setRolePermissions(normalized);
      const keys = Object.keys(normalized || {});
      if (keys.length) {
        setRolesMap(prev => {
          const next = { ...prev };
          keys.forEach(k => {
            if (!next[k]) next[k] = { name: k, description: '', color: colors.muted, priority: 0 };
          });
          return next;
        });
      }
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się pobrać uprawnień ról', { type: 'error' });
    } finally {
      setLoadingPermissions(false);
    }
  }, [colors.muted]);

  const fetchRoleMeta = useCallback(async () => {
    try {
      await api.init();
      const data = await api.get('/api/roles-meta');
      const meta = (data && data.meta && typeof data.meta === 'object') ? data.meta : {};
      setRolesMap(prev => {
        const next = { ...prev };
        Object.entries(meta).forEach(([key, v]) => {
          const k = String(key || '').toLowerCase();
          const current = next[k] || { name: k, description: '', color: colors.muted, priority: 0 };
          next[k] = {
            ...current,
            name: v?.name || current.name,
            description: v?.description || current.description,
            color: v?.color || current.color,
            priority: typeof v?.priority === 'number' ? v.priority : current.priority
          };
        });
        return next;
      });
    } catch {
      // meta opcjonalna
    }
  }, [colors.muted]);

  const fetchAvailablePermissions = useCallback(async () => {
    try {
      await api.init();
      const data = await api.get('/api/permissions');
      const list = Array.isArray(data) ? data : [];
      setAvailablePermissions(Array.from(new Set(list)));
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się pobrać listy uprawnień', { type: 'error' });
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    if (activeSubTab === 'roles') {
      fetchRolePermissions();
      fetchAvailablePermissions();
      fetchRoleMeta();
    }
  }, [activeSubTab, fetchRolePermissions, fetchAvailablePermissions, fetchRoleMeta]);

  const handlePermissionToggle = (role, permission) => {
    setRolePermissions(prev => {
      const current = prev[role] || [];
      const has = current.includes(permission);
      const next = has ? current.filter(p => p !== permission) : [...current, permission];
      return { ...prev, [role]: next };
    });
  };

  const saveRolePermissions = async (role) => {
    try {
      setSaving(true);
      const permissions = rolePermissions[role] || [];
      await api.put(`/api/role-permissions/${role}`, { permissions });
      showSnackbar(`Uprawnienia dla roli ${rolesMap[role]?.name || role} zapisane.`, { type: 'success' });
      await fetchRolePermissions();
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zapisać uprawnień', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const addCustomRole = async () => {
    const nameRaw = String(newRoleName || '').trim();
    if (!nameRaw) { showSnackbar('Podaj nazwę roli', { type: 'warn' }); return; }
    const base = nameRaw.toLowerCase()
      .normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const key = base || nameRaw.toLowerCase();
    if (rolesMap[key]) { showSnackbar('Taka rola już istnieje', { type: 'warn' }); return; }
    const entry = { name: nameRaw, description: '', color: colors.muted, priority: 0 };
    setRolesMap(prev => ({ ...prev, [key]: entry }));
    try {
      const raw = await AsyncStorage.getItem('appConfig.customRoles');
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? [...list, { key, name: nameRaw }] : [{ key, name: nameRaw }];
      await AsyncStorage.setItem('appConfig.customRoles', JSON.stringify(next));
    } catch {}
    setNewRoleName('');
    setActiveSubTab('roles');
  };

  const handleRoleMetaChange = (roleKey, field, value) => {
    setRolesMap(prev => ({ ...prev, [roleKey]: { ...prev[roleKey], [field]: value } }));
  };

  const saveRoleMeta = async (roleKey) => {
    const role = rolesMap[roleKey];
    try {
      await api.put(`/api/roles-meta/${roleKey}`, {
        name: role?.name,
        description: role?.description,
        color: role?.color,
        priority: role?.priority
      });
      try {
        const raw = await AsyncStorage.getItem('appConfig.roleMeta');
        const meta = raw ? JSON.parse(raw) : {};
        const nextMeta = { ...meta, [roleKey]: { name: role?.name, color: role?.color, priority: role?.priority, description: role?.description } };
        await AsyncStorage.setItem('appConfig.roleMeta', JSON.stringify(nextMeta));
      } catch {}
      showSnackbar('Zapisano metadane roli', { type: 'success' });
    } catch (e) {
      showSnackbar('Błąd zapisu metadanych roli', { type: 'error' });
    }
  };

  const openRolePicker = (user) => { setRolePickerUser(user || null); setRolePickerOpen(true); };
  const closeRolePicker = () => { setRolePickerOpen(false); setRolePickerUser(null); };
  const changeRoleForUser = async (roleKey) => {
    const u = rolePickerUser;
    if (!u) return;
    try {
      setSaving(true);
      const payload = { username: u.username, full_name: u.full_name, role: roleKey };
      await api.put(`/api/users/${u.id}`, payload);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: roleKey } : x));
      showSnackbar('Zmieniono rolę użytkownika.', { type: 'success' });
      closeRolePicker();
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zmienić roli', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (roleKey) => {
    if (!roleKey || roleKey === 'administrator') return;
    try {
      setSaving(true);
      setRolesMap(prev => { const next = { ...prev }; delete next[roleKey]; return next; });
      setRolePermissions(prev => { const next = { ...prev }; delete next[roleKey]; return next; });
      try { await api.put(`/api/role-permissions/${roleKey}`, { permissions: [] }); } catch {}
      showSnackbar('Usunięto rolę.', { type: 'success' });
    } catch {
      showSnackbar('Błąd usuwania roli', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const sortedRoles = Object.entries(rolesMap)
    .sort(([, a], [, b]) => {
      const pa = typeof a?.priority === 'number' ? a.priority : 0;
      const pb = typeof b?.priority === 'number' ? b.priority : 0;
      if (pb !== pa) return pb - pa;
      const na = String(a?.name || '').toLowerCase();
      const nb = String(b?.name || '').toLowerCase();
      return na.localeCompare(nb);
    });

  const sortedUsers = users.slice().sort((a, b) => {
    const pa = (() => { const r = String(a.role || '').toLowerCase(); const p = rolesMap[r]?.priority; return typeof p === 'number' ? p : 0; })();
    const pb = (() => { const r = String(b.role || '').toLowerCase(); const p = rolesMap[r]?.priority; return typeof p === 'number' ? p : 0; })();
    if (pb !== pa) return pb - pa;
    const na = String(a.full_name || a.username || '').toLowerCase();
    const nb = String(b.full_name || b.username || '').toLowerCase();
    return na.localeCompare(nb);
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={styles.headerTabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zakładka Użytkownicy"
            onPress={() => setActiveSubTab('users')}
            style={[styles.tabBtn, activeSubTab === 'users' ? styles.tabActive : null]}
          >
            <Ionicons name="people" size={18} color={activeSubTab === 'users' ? colors.primary : colors.muted} />
            <Text style={[styles.tabText, { color: activeSubTab === 'users' ? colors.primary : colors.text }]}>Użytkownicy</Text>
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{Array.isArray(users) ? users.length : 0}</Text></View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zakładka Role"
            onPress={() => setActiveSubTab('roles')}
            style={[styles.tabBtn, activeSubTab === 'roles' ? styles.tabActive : null]}
          >
            <Ionicons name="shield-checkmark" size={18} color={activeSubTab === 'roles' ? colors.primary : colors.muted} />
            <Text style={[styles.tabText, { color: activeSubTab === 'roles' ? colors.primary : colors.text }]}>Role</Text>
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{Object.keys(rolesMap || {}).length}</Text></View>
          </Pressable>
        </View>

        {activeSubTab === 'users' ? (
          <View>
            {loadingUsers ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}><ActivityIndicator size="small" color={colors.primary} /></View>
            ) : (
              <View style={{ gap: 8 }}>
                {sortedUsers.map(u => (
                  <View key={u.id} style={styles.listItem}>
                    <View style={styles.identityRow}>
                      <View style={styles.avatar}><Text style={{ color: '#fff', fontWeight: '700' }}>{(u.full_name || u.username || 'U').charAt(0).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '600' }}>{u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}</Text>
                        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>@{u.username}</Text>
                      </View>
                    </View>
                    <View style={styles.actionRow}>
                      {(() => {
                        const roleColorVal = rolesMap[u.role]?.color || 'bg-gray-100 text-gray-800';
                        const { bg, fg } = resolveRoleColors(roleColorVal);
                        return (
                          <View style={[styles.roleChip, { backgroundColor: bg, borderColor: bg }]}>
                            <Text style={{ color: fg, fontSize: 13, fontWeight: '600' }}>{rolesMap[u.role]?.name || u.role}</Text>
                          </View>
                        );
                      })()}
                      <Pressable accessibilityLabel="Zmień rolę" onPress={() => openRolePicker(u)} style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.95 }]}> 
                        <Text style={{ color: colors.text, fontWeight: '500' }}>Zmień rolę</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View>
            {/* Dodawanie roli */}
            <View style={{ gap: 6, marginBottom: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Dodaj nową rolę</Text>
              <TextInput value={newRoleName} onChangeText={setNewRoleName} placeholder="Nazwa roli" placeholderTextColor={colors.muted} style={styles.input} />
              <Pressable onPress={addCustomRole} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Dodaj rolę</Text></Pressable>
            </View>

            {loadingPermissions ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}><ActivityIndicator size="small" color={colors.primary} /></View>
            ) : (
              <View style={{ gap: 10 }}>
                {sortedRoles.map(([roleKey, roleData]) => (
                  <View key={roleKey} style={styles.listItem}>
                    <View style={[styles.row, { marginBottom: 8 }]}> 
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                          {(() => {
                            const roleColorVal = roleData.color || 'bg-gray-100 text-gray-800';
                            const { bg, fg } = resolveRoleColors(roleColorVal);
                            return (
                              <View style={[styles.roleChip, { backgroundColor: bg, borderColor: bg }]}> 
                                <Text style={{ color: fg, fontSize: 13, fontWeight: '600' }}>{roleData.name}</Text>
                              </View>
                            );
                          })()}
                        </View>
                        <Text style={{ color: colors.muted, marginTop: 6 }}>{roleData.description}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={() => saveRolePermissions(roleKey)} disabled={saving} style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}>
                          <Text style={{ color: '#fff', fontWeight: '600' }}>{saving ? 'Zapisywanie…' : 'Zapisz uprawnienia'}</Text>
                        </Pressable>
                        <Pressable onPress={() => deleteRole(roleKey)} disabled={saving || roleKey === 'administrator'} style={[styles.button, { backgroundColor: colors.danger, opacity: (saving || roleKey === 'administrator') ? 0.5 : 1 }]}> 
                          <Text style={{ color: '#fff', fontWeight: '600' }}>Usuń</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Meta */}
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                      <View style={{ width: 120 }}>
                        <Text style={{ color: colors.muted }}>Priorytet</Text>
                        <TextInput value={String(roleData.priority ?? 0)} onChangeText={(v) => handleRoleMetaChange(roleKey, 'priority', parseInt(v || '0', 10) || 0)} keyboardType="numeric" style={styles.input} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.muted }}>Nazwa</Text>
                        <TextInput value={roleData.name ?? ''} onChangeText={(v) => handleRoleMetaChange(roleKey, 'name', v)} style={styles.input} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.muted }}>Kolor</Text>
                        <TextInput value={roleData.color ?? ''} onChangeText={(v) => handleRoleMetaChange(roleKey, 'color', v)} style={styles.input} />
                      </View>
                    </View>
                    <View style={{ marginBottom: 8 }}>
                      <Text style={{ color: colors.muted }}>Opis</Text>
                      <TextInput value={roleData.description ?? ''} onChangeText={(v) => handleRoleMetaChange(roleKey, 'description', v)} style={styles.input} />
                    </View>
                    <Pressable onPress={() => saveRoleMeta(roleKey)} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '600' }}>Zapisz metadane roli</Text></Pressable>

                    {/* Przyciski akcji pod polami edycji po prawej */}
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Pokaż uprawnienia"
                        onPress={() => setExpandedRoles(prev => ({ ...prev, [roleKey]: !(prev[roleKey] !== false) }))}
                        style={[styles.button, { paddingHorizontal: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                      >
                        <Text style={{ color: colors.text, fontWeight: '600' }}>{(expandedRoles[roleKey] !== false) ? 'Ukryj uprawnienia' : 'Pokaż uprawnienia'}</Text>
                      </Pressable>
                    </View>

                    {/* Uprawnienia */}
                    {(expandedRoles[roleKey] !== false) && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6 }}>Uprawnienia</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        {(availablePermissions || []).map((perm) => {
                          const assigned = (rolePermissions[roleKey] || []).includes(perm);
                          return (
                            <Pressable key={`${roleKey}-${perm}`} onPress={() => handlePermissionToggle(roleKey, perm)} style={[styles.permChip, { borderColor: assigned ? colors.primary : colors.border, backgroundColor: assigned ? '#eef2ff' : colors.card }]}>
                              <Text style={{ color: assigned ? colors.primary : colors.text }}>{perm}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Modal wyboru roli */}
      <Modal visible={rolePickerOpen} transparent animationType="fade" onRequestClose={closeRolePicker}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' }} onPress={closeRolePicker}>
          <View style={{ width: '90%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Wybierz rolę</Text>
            <View style={{ gap: 6 }}>
              {sortedRoles.map(([roleKey, roleData]) => (
                <Pressable key={`picker-${roleKey}`} onPress={() => changeRoleForUser(roleKey)} style={({ pressed }) => [{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, opacity: pressed ? 0.9 : 1 }]}>
                  <Text style={{ color: colors.text }}>{roleData.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
