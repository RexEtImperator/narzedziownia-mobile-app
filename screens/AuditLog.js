import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, FlatList, Alert } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { usePermissions } from '../lib/PermissionsContext';
import { PERMISSIONS } from '../lib/constants';
import { showSnackbar } from '../lib/snackbar';

const ACTION_LABELS = {
  create: 'Utworzenie',
  update: 'Aktualizacja',
  delete: 'Usunięcie',
  login: 'Logowanie',
  logout: 'Wylogowanie',
  view: 'Podgląd'
};

export default function AuditLogScreen() {
  const { colors } = useTheme();
  const { currentUser, hasPermission } = usePermissions();
  const canViewAudit = hasPermission(PERMISSIONS.VIEW_AUDIT_LOG);
  
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ action: 'all', username: '', startDate: '', endDate: '' });
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try { await api.init(); } catch {}
    })();
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    if (!canViewAudit) return;
    setLoading(true);
    setError('');
    try {
      const resp = await api.getAuditLogs({ page: pagination.page, limit: pagination.limit, ...filters });
      const logs = Array.isArray(resp?.logs) ? resp.logs : (Array.isArray(resp?.data) ? resp.data : []);
      const pag = resp?.pagination || resp?.meta || {};
      setAuditLogs(logs);
      setPagination(prev => ({
        ...prev,
        total: Number(pag.total || logs.length || 0),
        totalPages: Number(pag.totalPages || pag.pages || 1)
      }));
    } catch (e) {
      setError(e?.message || 'Nie udało się pobrać dziennika audytu');
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  }, [canViewAudit, pagination.page, pagination.limit, filters]);

  useEffect(() => { fetchAuditLogs(); }, [filters, pagination.page, fetchAuditLogs]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatDate = (val) => {
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return String(val || '—');
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch { return String(val || '—'); }
  };

  const confirmDeleteLogs = () => {
    if (!hasPermission(PERMISSIONS.ADMIN)) {
      showSnackbar('Brak uprawnień do usuwania dziennika');
      return;
    }
    Alert.alert('Usuń dziennik', 'Czy na pewno chcesz usunąć wszystkie wpisy dziennika audytu?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: deleteLogs }
    ]);
  };

  const deleteLogs = async () => {
    try {
      setDeleteLoading(true);
      await api.delete('/api/audit');
      showSnackbar('Dziennik audytu został wyczyszczony');
      setPagination(prev => ({ ...prev, page: 1 }));
      await fetchAuditLogs();
    } catch (e) {
      showSnackbar(e?.message || 'Błąd podczas czyszczenia dziennika');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!canViewAudit) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}> 
        <Text style={[styles.title, { color: colors.text }]}>Dziennik audytu</Text>
        <Text style={{ color: colors.muted }}>Brak uprawnień do przeglądania dziennika audytu.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}> 
      {/* Nagłówek */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Dziennik audytu</Text>
          <Text style={{ color: colors.muted }}>Lista operacji w systemie z możliwością filtrowania</Text>
        </View>
        {hasPermission(currentUser, PERMISSIONS.ADMIN) ? (
          <Pressable onPress={confirmDeleteLogs} style={({ pressed }) => ({ backgroundColor: colors.danger, opacity: pressed ? 0.9 : 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 })}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{deleteLoading ? 'Usuwanie…' : 'Wyczyść'}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Filtry */}
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, backgroundColor: colors.card, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted }}>Akcja (np. create/update/login)</Text>
            <TextInput value={filters.action} onChangeText={(v) => handleFilterChange('action', v)} placeholder="all" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted }}>Użytkownik</Text>
            <TextInput value={filters.username} onChangeText={(v) => handleFilterChange('username', v)} placeholder="login" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted }}>Od (YYYY-MM-DD)</Text>
            <TextInput value={filters.startDate} onChangeText={(v) => handleFilterChange('startDate', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted }}>Do (YYYY-MM-DD)</Text>
            <TextInput value={filters.endDate} onChangeText={(v) => handleFilterChange('endDate', v)} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, { borderColor: colors.border, backgroundColor: colors.background, color: colors.text }]} />
          </View>
        </View>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={{ alignItems: 'center', padding: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 8 }}>Ładowanie…</Text>
        </View>
      ) : error ? (
        <View style={{ alignItems: 'center', padding: 12 }}>
          <Text style={{ color: colors.danger }}>{error}</Text>
          <Pressable onPress={fetchAuditLogs} style={({ pressed }) => ({ marginTop: 8, backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 })}>
            <Text style={{ color: '#fff' }}>Spróbuj ponownie</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={auditLogs}
          keyExtractor={(item, idx) => String(item?.id || `${item?.timestamp || 'ts'}-${idx}`)}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 10, paddingHorizontal: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{formatDate(item?.timestamp)}</Text>
                <Text style={{ color: colors.primary }}>{ACTION_LABELS[item?.action] || String(item?.action || '').toUpperCase() || '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted }}>Użytkownik:</Text>
                <Text style={{ color: colors.text }}>{item?.username || '—'}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.muted }}>IP:</Text>
                <Text style={{ color: colors.text }}>{item?.ip_address || '—'}</Text>
              </View>
              <View style={{ marginTop: 6 }}>
                <Text style={{ color: colors.muted }}>Szczegóły:</Text>
                <Text style={{ color: colors.text }} numberOfLines={2}>{item?.details || '—'}</Text>
              </View>
            </View>
          )}
          ListFooterComponent={() => (
            pagination.totalPages > 1 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
                <Pressable onPress={() => setPagination(p => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={pagination.page === 1} style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.9 : 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 })}>
                  <Text style={{ color: colors.text }}>Poprzednia</Text>
                </Pressable>
                <Text style={{ color: colors.muted }}>Strona {pagination.page} / {pagination.totalPages}</Text>
                <Pressable onPress={() => setPagination(p => ({ ...p, page: Math.min(p.totalPages || p.page + 1, p.page + 1) }))} disabled={pagination.page === pagination.totalPages} style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.9 : 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 })}>
                  <Text style={{ color: colors.text }}>Następna</Text>
                </Pressable>
              </View>
            ) : null
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }
});
