import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Pressable, ScrollView, Platform, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import ThemedButton from '../components/ThemedButton';
import AddEmployeeModal from './AddEmployeeModal';
import AddToolModal from './AddToolModal';
import AddBHPModal from './AddBHPModal';
import Constants from 'expo-constants';
import { PERMISSIONS } from '../lib/constants';
import { usePermissions } from '../lib/PermissionsContext';

export default function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ employees: 0, departments: 0, positions: 0, tools: 0, bhp: 0 });
  const [tools, setTools] = useState([]);
  const [history, setHistory] = useState([]);
  const [toolHistory, setToolHistory] = useState([]);
  const [bhpHistory, setBhpHistory] = useState([]);
  const [addEmpVisible, setAddEmpVisible] = useState(false);
  const [addToolVisible, setAddToolVisible] = useState(false);
  const [addBHPVisible, setAddBHPVisible] = useState(false);
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [overdueTipOpen, setOverdueTipOpen] = useState(false);
  // Paginacja historii
  const [toolHistoryLimit, setToolHistoryLimit] = useState(6);
  const [bhpHistoryLimit, setBhpHistoryLimit] = useState(6);
  const [toolHistoryLoadingMore, setToolHistoryLoadingMore] = useState(false);
  const [bhpHistoryLoadingMore, setBhpHistoryLoadingMore] = useState(false);
  const [toolHistoryHasMore, setToolHistoryHasMore] = useState(false);
  const [bhpHistoryHasMore, setBhpHistoryHasMore] = useState(false);
  
  // Uprawnienia z kontekstu
  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const canViewQuickActions = hasPermission(PERMISSIONS.VIEW_QUICK_ACTIONS);

  // Funkcja ładowania danych dashboardu (wywoływana na starcie i przy powrocie na ekran)
  const loadDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      await api.init();
      const [deps, poss, emps, tls, bhp] = await Promise.all([
        api.get('/api/departments'),
        api.get('/api/positions'),
        api.get('/api/employees'),
        api.get('/api/tools'),
        api.get('/api/bhp'),
      ]);
      setStats({
        employees: Array.isArray(emps) ? emps.length : 0,
        departments: Array.isArray(deps) ? deps.length : 0,
        positions: Array.isArray(poss) ? poss.length : 0,
        tools: Array.isArray(tls) ? tls.length : (Array.isArray(tls?.data) ? tls.data.length : 0),
        bhp: Array.isArray(bhp) ? bhp.length : (Array.isArray(bhp?.data) ? bhp.data.length : 0),
      });
      const list = Array.isArray(tls) ? tls : (Array.isArray(tls?.data) ? tls.data : []);
      const bhpList = Array.isArray(bhp) ? bhp : (Array.isArray(bhp?.data) ? bhp.data : []);
      setTools(list.slice(0, 20));
      const overdueToolsCount = computeOverdueCount(list);
      const overdueBhpCount = computeOverdueCount(bhpList);
      setStats(s => ({ ...s, overdueInspections: (overdueToolsCount + overdueBhpCount), overdueToolsCount, overdueBhpCount }));

      // Build issue/return history
      const employees = Array.isArray(emps) ? emps : (Array.isArray(emps?.data) ? emps.data : []);
      const empMap = new Map();
      for (const e of employees) {
        const name = [e?.first_name, e?.last_name].filter(Boolean).join(' ') || e?.name || '—';
        empMap.set(e?.id, name);
      }
      const toolMap = new Map();
      for (const t of list) {
        toolMap.set(t?.id, t);
      }
      const bhpMap = new Map();
      for (const b of bhpList) {
        bhpMap.set(b?.id, b);
      }

      // Helper to robustly extract arrays from various response shapes
      const toArray = (resp) => {
        try {
          if (Array.isArray(resp)) return resp;
          const candidates = ['data', 'rows', 'items', 'list', 'result', 'content'];
          for (const key of candidates) {
            const val = resp?.[key];
            if (Array.isArray(val)) return val;
            if (val && typeof val === 'object') {
              const nestedCandidates = ['data', 'rows', 'items', 'list', 'content'];
              for (const n of nestedCandidates) {
                const nested = val?.[n];
                if (Array.isArray(nested)) return nested;
              }
            }
          }
        } catch {}
        return [];
      };

      // Normalize fields from issue event
      const mapToolIssue = (ev) => {
        const toolId = ev?.tool_id ?? ev?.toolId ?? ev?.tool?.id ?? ev?.item_id ?? ev?.itemId;
        const tool = toolMap.get(toolId);
        const toolName = tool?.name || tool?.tool_name || ev?.tool_name || ev?.name || 'Narzędzie';
        const employeeIdVal = ev?.employee_id ?? ev?.employeeId ?? ev?.employee?.id;
        const employeeName = empMap.get(employeeIdVal) || `${ev?.employee_first_name || ''} ${ev?.employee_last_name || ''}`.trim() || ev?.employee_name || '—';
        const issued = ev?.issued_at ?? ev?.issuedAt ?? ev?.issued_on ?? ev?.issue_date ?? ev?.date ?? ev?.timestamp ?? ev?.created_at;
        const returned = ev?.returned_at ?? ev?.returnedAt ?? ev?.returned_on ?? ev?.return_date ?? ev?.completed_at;
        const ts = parseDate(returned) || parseDate(issued);
        const type = returned ? 'return' : 'issue';
        const filterValue = tool?.inventory_number || tool?.serial_number || tool?.qr_code || tool?.barcode || tool?.code || tool?.sku || ev?.tool_code || toolName;
        return { id: ev?.id ?? ev?.issue_id ?? ev?.log_id ?? `${toolId || 'tool'}-${issued || returned || ''}`, type, toolName, employeeName, quantity: ev?.quantity || 1, timestamp: ts, filterValue, source: 'tools' };
      };

      // BHP normalizer
      const mapBhpIssue = (ev) => {
        const bhpId = ev?.bhp_id ?? ev?.bhpId ?? ev?.item_id ?? ev?.itemId ?? ev?.bhp?.id;
        const bhpItem = bhpMap.get(bhpId);
        const baseName = bhpItem?.manufacturer && bhpItem?.model ? `${bhpItem.manufacturer} ${bhpItem.model}` : (bhpItem?.name || ev?.bhp_name || 'Sprzęt BHP');
        const displayName = baseName || bhpItem?.inventory_number || ev?.bhp_code || 'Sprzęt BHP';
        const employeeIdVal = ev?.employee_id ?? ev?.employeeId ?? ev?.employee?.id;
        const employeeName = empMap.get(employeeIdVal) || `${ev?.employee_first_name || ''} ${ev?.employee_last_name || ''}`.trim() || ev?.employee_name || '—';
        const issued = ev?.issued_at ?? ev?.issuedAt ?? ev?.issued_on ?? ev?.issue_date ?? ev?.date ?? ev?.timestamp ?? ev?.created_at;
        const returned = ev?.returned_at ?? ev?.returnedAt ?? ev?.returned_on ?? ev?.return_date ?? ev?.completed_at;
        const ts = parseDate(returned) || parseDate(issued);
        const type = returned ? 'return' : 'issue';
        const filterValue = bhpItem?.inventory_number || bhpItem?.serial_number || ev?.bhp_code || String(bhpId || '');
        return { id: `bhp-${ev?.id ?? ev?.issue_id ?? ev?.log_id ?? `${bhpId || 'bhp'}-${issued || returned || ''}`}`, type, toolName: displayName, employeeName, quantity: ev?.quantity || 1, timestamp: ts, filterValue, source: 'bhp' };
      };

      const disableFlagVal = (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_DISABLE_HISTORY_FETCH != null) ? process.env.EXPO_PUBLIC_DISABLE_HISTORY_FETCH : (Constants?.expoConfig?.extra?.EXPO_PUBLIC_DISABLE_HISTORY_FETCH);
      const historyDisabled = ['true','1','yes','on'].includes(String(disableFlagVal ?? '').toLowerCase());
      let issues = [];
      // 1) Primary endpoint
      if (!historyDisabled) {
        try {
          const ti = await api.get('/api/tool-issues');
          const arr = toArray(ti);
          issues = arr.map(mapToolIssue);
        } catch {}
      }

      // Fallback: derive issues from /api/tools (current issued tools)
      if (!issues || issues.length === 0) {
        issues = list
          .filter(t => !!(t?.issued_at || t?.issuedAt || t?.issued_on || t?.issue_date || t?.last_issue_at))
          .map(t => ({
            id: t?.id,
            type: 'issue',
            toolName: t?.name || t?.tool_name || 'Narzędzie',
            employeeName: empMap.get(t?.issued_to_employee_id ?? t?.issuedToEmployeeId) || '—',
            quantity: 1,
            timestamp: parseDate(t?.issued_at ?? t?.issuedAt ?? t?.issued_on ?? t?.issue_date ?? t?.last_issue_at),
            filterValue: t?.inventory_number || t?.serial_number || t?.qr_code || t?.barcode || t?.code || t?.sku || (t?.name || t?.tool_name),
            source: 'tools',
          }));
      }

      // BHP issues/returns
      if (!historyDisabled) {
        try {
          const bi1 = await api.get('/api/bhp-issues');
          const bhpArr = toArray(bi1);
          if (bhpArr && bhpArr.length) {
            const mapped = bhpArr.map(mapBhpIssue);
            issues = [...issues, ...mapped];
          }
        } catch {}
      }
      // 3) Optional audit logs fallback (if backend records actions there)
      if (!historyDisabled) {
        try {
          if (!issues || issues.length === 0) {
            const logs = await api.get('/api/audit-logs');
            const arr = toArray(logs);
            const mapped = arr
              .filter(l => {
                const act = String(l?.action || '').toLowerCase();
                return act.includes('issue') || act.includes('return');
              })
              .map(l => {
                let detailsObj = null;
                if (typeof l?.details === 'string') {
                  try { detailsObj = JSON.parse(l.details); } catch {}
                } else if (typeof l?.details === 'object' && l?.details) {
                  detailsObj = l.details;
                }
                const toolId = detailsObj?.tool_id ?? detailsObj?.toolId ?? null;
                const bhpId = detailsObj?.bhp_id ?? detailsObj?.bhpId ?? null;
                const tool = toolMap.get(toolId);
                const bhpItem = bhpMap.get(bhpId);
                const isReturn = String(l?.action || '').toLowerCase().includes('return');
                const ts = parseDate(l?.timestamp) || parseDate(detailsObj?.time) || parseDate(detailsObj?.issued_at) || parseDate(detailsObj?.returned_at);
                const employeeIdVal = detailsObj?.employee_id ?? detailsObj?.employeeId;
                const employeeName = empMap.get(employeeIdVal) || detailsObj?.employee_name || '—';
                const name = tool?.name || bhpItem?.name || detailsObj?.tool_name || detailsObj?.bhp_name || 'Zdarzenie';
                const filterValue = tool?.inventory_number || bhpItem?.inventory_number || detailsObj?.code || name;
                return { id: l?.id ?? `${name}-${l?.timestamp || ''}`, type: isReturn ? 'return' : 'issue', toolName: name, employeeName, quantity: detailsObj?.quantity || 1, timestamp: ts, filterValue, source: 'audit' };
              });
            if (mapped.length) {
              issues = [...issues, ...mapped];
            }
          }
        } catch {}
      }
      // Deduplicate by id+type+timestamp
      const seen = new Set();
      const unique = [];
      for (const it of issues) {
        const key = `${String(it.id)}|${it.type}|${String(it.timestamp || '')}`;
        if (!seen.has(key)) { seen.add(key); unique.push(it); }
      }
      unique.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setHistory(unique.slice(0, 50));
      const top = unique.slice(0, 50);
      setHistory(top);
      // Zasil sekcje historii narzędzi i BHP na podstawie znormalizowanej listy
      const toolsHistAll = top.filter(it => it.source === 'tools');
      setToolHistory(toolsHistAll.slice(0, toolHistoryLimit));
      setToolHistoryHasMore(toolsHistAll.length > toolHistoryLimit);
      const bhpHistAll = top.filter(it => it.source === 'bhp');
      setBhpHistory(bhpHistAll.slice(0, bhpHistoryLimit));
      setBhpHistoryHasMore(bhpHistAll.length > bhpHistoryLimit);
    } catch (e) {
      setError(e.message || 'Błąd pobierania danych');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // Odśwież przy ponownym wejściu na ekran
    const unsubscribe = navigation.addListener('focus', () => {
      loadDashboard();
    });
    return unsubscribe;
  }, [navigation]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]} className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted }]} className="mt-2">Ładowanie…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.wrapper, { backgroundColor: colors.bg }]} className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      {error ? <Text style={[styles.error, { color: colors.danger }]} className="mb-2">{error}</Text> : null}
      {overdueTipOpen && (
        <Pressable
          onPress={() => setOverdueTipOpen(false)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }}
          accessibilityLabel="Zamknij tooltip przeterminowań"
        />
      )}

      {/* KPI cards */}
      {(() => {
        const roleVal = String(currentUser?.role || currentUser?.role_name || '').toLowerCase();
        const isEmployeeRole = roleVal === 'employee' || roleVal === 'pracownik';
        if (isEmployeeRole) return null;
        return (
      <View style={styles.kpiRow} className="flex-row flex-wrap gap-3">
        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.kpiHeader} className="items-center">
            <Ionicons name="construct" size={22} color="#fb923c" />
            <Text style={[styles.kpiValue, { color: colors.orange }]} className="text-2xl font-bold">{stats.tools}</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.kpiHeader} className="items-center">
            <Ionicons name="medkit" size={22} color="#4ade80" />
            <Text style={[styles.kpiValue, { color: colors.green }]} className="text-2xl font-bold">{stats.bhp}</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.kpiHeader} className="items-center">
            <Ionicons name="people" size={22} color="#c084fc" />
            <Text style={[styles.kpiValue, { color: colors.purple }]} className="text-2xl font-bold">{stats.employees}</Text>
          </View>
        </View>

        <View style={[styles.kpiCard, { backgroundColor: colors.card, borderColor: colors.border }]} className="content-center">
          <View style={styles.kpiHeader} className="items-center">
            <Ionicons name="time" size={22} color="#f87171" />
            <Pressable onPress={() => setOverdueTipOpen(v => !v)} style={({ pressed }) => [{ marginLeft: 6, opacity: pressed ? 0.8 : 1 }]}>
              <Text style={[styles.kpiValue, { color: colors.red }]} className="text-2xl font-bold">{stats.overdueInspections ?? computeOverdueCount(tools)}</Text>
            </Pressable>
          </View>
          {overdueTipOpen && (
            <View style={[{ position: 'absolute', top: 6, right: 6, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, zIndex: 10, minWidth: 150 }, Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.15)' }, ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 4 } }) ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '600', color: colors.text, fontSize: 14 }}>Narzędzia:</Text>
                <Text style={{ color: colors.text, fontSize: 14 }}>{stats.overdueToolsCount ?? 0}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Text style={{ fontWeight: '600', color: colors.text, fontSize: 14 }}>BHP:</Text>
                <Text style={{ color: colors.text, fontSize: 14 }}>{stats.overdueBhpCount ?? 0}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
        );
      })()}

      {/* Quick actions – widoczne tylko z uprawnieniem VIEW_QUICK_ACTIONS */}
      {permsReady && canViewQuickActions ? (
        <View style={styles.section} className="mb-6">
          <View style={styles.sectionHeaderRow} className="flex-row items-center gap-2 mb-3">
            <View style={[styles.flashIcon, { backgroundColor: colors.card }]} className="w-8 h-8 rounded-xl items-center justify-center">
              <Ionicons name="flash" size={18} color="#10b981" />
            </View>
            <Text style={[styles.sectionTitle, { color: colors.text }]} className="text-xl font-semibold">Szybkie akcje</Text>
          </View>
          <View style={styles.quickRow} className="flex-row flex-wrap gap-3">
            <Pressable style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }]} onPress={() => setAddEmpVisible(true)}>
              <Image source={require('../assets/dashboard/employee.png')} style={{ width: '80%', height: '80%', resizeMode: 'contain' }} />
            </Pressable>
            <Pressable style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }]} onPress={() => setAddToolVisible(true)}>
              <Image source={require('../assets/dashboard/tools.png')} style={{ width: '80%', height: '80%', resizeMode: 'contain' }} />
            </Pressable>
            <Pressable style={[styles.quickCard, { backgroundColor: colors.card, borderColor: colors.border, padding: 0, flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }]} onPress={() => setAddBHPVisible(true)}>
              <Image source={require('../assets/dashboard/bhp.png')} style={{ width: '80%', height: '80%', resizeMode: 'contain' }} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Historia wydań/zwrotów narzędzi */}
      <View style={[styles.section, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 12 }]}> 
        <View style={styles.historyHeader} className="flex-row items-center justify-between mb-3">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.clockIcon, { backgroundColor: '#4338ca' }]} className="w-8 h-8 rounded-xl items-center justify-center"><Ionicons name="time" size={18} color="#fff" /></View>
            <Text style={[styles.sectionTitle, { color: colors.text }]} className="text-xl font-semibold">Historia narzędzi</Text>
            <View style={[styles.pill, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]} className="px-3 py-1 rounded-full"><Text style={[styles.pillText, { color: colors.muted }]}>Ostatnie 6</Text></View>
          </View>
        </View>
        {toolHistory && toolHistory.length > 0 ? (
          <FlatList
            data={toolHistory}
            scrollEnabled={false}
            keyExtractor={(item) => String(item.id || Math.random())}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: item.type === 'issue' ? '#ef4444' : '#10b981' }}>
                  <Ionicons name={item.type === 'issue' ? 'add' : 'arrow-undo'} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {item.type === 'issue' ? 'Wydano narzędzie: ' : 'Zwrócono narzędzie: '}
                    <Pressable onPress={() => navigation.navigate('Narzędzia', { filter: item?.filterValue || item?.toolName })}>
                      <Text style={{ color: colors.primary }}>{item.toolName}</Text>
                    </Pressable>
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="person" size={14} color={colors.muted} />
                      <Text style={{ color: colors.muted }}>{item.employeeName}</Text>
                    </View>
                    <Text style={{ color: colors.muted }}>Ilość: {item.quantity}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted }}>{item.agoText ?? formatAgo(item.timestamp)}</Text>
              </View>
            )}
          />
        ) : (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>Brak wydań/zwrotów</Text>
          </View>
        )}
        {toolHistoryHasMore && (
          <View style={{ alignSelf: 'center', marginTop: 8 }}>
            <ThemedButton
              title="Zobacz więcej"
              variant="outline"
              loading={toolHistoryLoadingMore}
              disabled={toolHistoryLoadingMore}
              onPress={async () => {
                try {
                  setToolHistoryLoadingMore(true);
                  const next = toolHistoryLimit + 6;
                  setToolHistoryLimit(next);
                  const toolsAll = history.filter(h => h.source === 'tools');
                  setToolHistory(toolsAll.slice(0, next));
                  setToolHistoryHasMore(toolsAll.length > next);
                } finally {
                  setToolHistoryLoadingMore(false);
                }
              }}
              style={{ paddingVertical: 6, paddingHorizontal: 12, minWidth: 120, height: 36 }}
            />
          </View>
        )}
      </View>

      {/* Historia wydań/zwrotów BHP */}
      <View style={[styles.section, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 12, padding: 12 }]}> 
        <View style={styles.historyHeader} className="flex-row items-center justify-between mb-3">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[styles.clockIcon, { backgroundColor: '#16a34a' }]} className="w-8 h-8 rounded-xl items-center justify-center"><Ionicons name="time" size={18} color="#fff" /></View>
            <Text style={[styles.sectionTitle, { color: colors.text }]} className="text-xl">Historia BHP</Text>
            <View style={[styles.pill, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]} className="px-3 py-1 rounded-full"><Text style={[styles.pillText, { color: colors.muted }]}>Ostatnie 6</Text></View>
          </View>
        </View>
        {bhpHistory && bhpHistory.length > 0 ? (
          <FlatList
            data={bhpHistory}
            scrollEnabled={false}
            keyExtractor={(item) => String(item.id || Math.random())}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12, backgroundColor: item.type === 'issue' ? '#ef4444' : '#10b981' }}>
                  <Ionicons name={item.type === 'issue' ? 'add' : 'arrow-undo'} size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    {item.type === 'issue' ? 'Wydano sprzęt BHP: ' : 'Zwrócono sprzęt BHP: '}
                    <Pressable onPress={() => navigation.navigate('BHP', { filter: item?.filterValue || item?.bhpLabel })}>
                      <Text style={{ color: colors.primary }}>{item.bhpLabel || item.toolName}</Text>
                    </Pressable>
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="person" size={14} color={colors.muted} />
                      <Text style={{ color: colors.muted }}>{item.employeeName}</Text>
                    </View>
                  </View>
                </View>
                <Text style={{ color: colors.muted }}>{item.agoText ?? formatAgo(item.timestamp)}</Text>
              </View>
            )}
          />
        ) : (
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: colors.muted }}>Brak wydań/zwrotów</Text>
          </View>
        )}
        {bhpHistoryHasMore && (
          <View style={{ alignSelf: 'center', marginTop: 8 }}>
            <ThemedButton
              title="Zobacz więcej"
              variant="outline"
              loading={bhpHistoryLoadingMore}
              disabled={bhpHistoryLoadingMore}
              onPress={async () => {
                try {
                  setBhpHistoryLoadingMore(true);
                  const next = bhpHistoryLimit + 6;
                  setBhpHistoryLimit(next);
                  const bhpAll = history.filter(h => h.source === 'bhp');
                  setBhpHistory(bhpAll.slice(0, next));
                  setBhpHistoryHasMore(bhpAll.length > next);
                } finally {
                  setBhpHistoryLoadingMore(false);
                }
              }}
              style={{ paddingVertical: 6, paddingHorizontal: 12, minWidth: 120, height: 36 }}
            />
          </View>
        )}
      </View>
      <AddEmployeeModal visible={addEmpVisible} onClose={() => setAddEmpVisible(false)} onCreated={() => { try { setStats(s => ({ ...s, employees: (s.employees || 0) + 1 })); } catch {} }} />
      <AddToolModal visible={addToolVisible} onClose={() => setAddToolVisible(false)} onCreated={() => { try { setStats(s => ({ ...s, tools: (s.tools || 0) + 1 })); } catch {} }} />
      <AddBHPModal visible={addBHPVisible} onClose={() => setAddBHPVisible(false)} onCreated={async () => { try { await api.init(); const list = await api.get('/api/bhp'); const count = Array.isArray(list) ? list.length : (Array.isArray(list?.data) ? list.data.length : 0); setStats(s => ({ ...s, bhp: count })); } catch {} }} />
    </ScrollView>
  );
}
 
 const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#0b1220', padding: 16 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
  loadingText: { marginTop: 8, color: '#cbd5e1' },
  error: { color: '#ef4444' },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: { flexGrow: 1, flexBasis: 'auto', padding: 10, borderRadius: 16, backgroundColor: '#111827', borderWidth: 1, borderColor: '#1f2937' },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kpiValue: { color: '#34d399', fontSize: 30, fontWeight: '700'},
  section: { marginBottom: 16 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  flashIcon: { backgroundColor: '#0f172a', borderRadius: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#e5e7eb' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: { flexGrow: 1, flexBasis: 'auto', backgroundColor: '#111827', borderColor: '#1f2937', borderWidth: 1, borderRadius: 16, padding: 16 },
  quickIcon: { backgroundColor: '#0f172a', borderRadius: 12 },
  quickTitle: { fontSize: 16, fontWeight: '600', color: '#e5e7eb'},
  quickDesc: { color: '#9ca3af' },
  historyHeader: {},
  clockIcon: { backgroundColor: '#0f172a', borderRadius: 12 },
  pill: { backgroundColor: '#0f172a', borderRadius: 999, paddingHorizontal: 8 },
  pillText: { color: '#e5e7eb', fontWeight: '600' }
});

function computeOverdueCount(list) {
  try {
    const arr = Array.isArray(list) ? list : [];
    const now = Date.now();
    return arr.filter(t => {
      if (t?.overdue === true || t?.is_overdue === true) return true;
      const dt = t?.inspection_date || t?.inspectionDate || t?.nextReviewAt || t?.next_review_at || t?.next_check_at;
      if (!dt) return false;
      const time = Date.parse(dt);
      return Number.isFinite(time) && time < now;
    }).length;
  } catch {
    return 0;
  }
}

function parseDate(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') {
    const ms = s < 100000000000 ? s * 1000 : s; // seconds vs ms
    return ms;
  }
  const str = String(s).trim();
  if (!str) return null;
  // pure digits string
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    const ms = num < 100000000000 ? num * 1000 : num;
    return ms;
  }
  // Normalize common SQL format "YYYY-MM-DD HH:mm:ss"
  let iso = str.replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso)) {
    const tZ = Date.parse(iso + 'Z');
    if (Number.isFinite(tZ)) return tZ;
  }
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function formatAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return 'Przed chwilą';
  if (sec < 60) return `${sec} sek temu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min temu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} godz temu`;
  const d = Math.floor(hr / 24);
  if (d === 1) return 'Wczoraj';
  return `${d} dni temu`;
}
