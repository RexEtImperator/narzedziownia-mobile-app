import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, Alert, TextInput } from 'react-native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';
import { usePermissions } from '../lib/PermissionsContext';
import ThemedButton from '../components/ThemedButton';

export default function FeaturesSettings() {
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [features, setFeatures] = useState({
    enableAuditLog: true,
    enableReports: true,
    enableMobileApp: true,
    enableApiAccess: false,
    enableDataExport: true,
    enableRealtimeChat: true,
  });
  const [auditLogRetention, setAuditLogRetention] = useState(90);
  
  // Uprawnienia z kontekstu
  const { currentUser, hasPermission, ready: permsReady } = usePermissions();
  const canViewSettings = hasPermission('system_settings');
  const canManageSettings = canViewSettings;

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        if (!canViewSettings) {
          return;
        }
        try {
          const f = await api.get('/api/config/features');
          setFeatures(prev => ({
            enableAuditLog: f?.enableAuditLog ?? prev.enableAuditLog,
            enableReports: f?.enableReports ?? prev.enableReports,
            enableMobileApp: f?.enableMobileApp ?? prev.enableMobileApp,
            enableApiAccess: f?.enableApiAccess ?? prev.enableApiAccess,
            enableDataExport: f?.enableDataExport ?? prev.enableDataExport,
            enableRealtimeChat: f?.enableRealtimeChat ?? prev.enableRealtimeChat,
          }));
        } catch (e) { /* pomiń */ }
        try {
          const n = await api.get('/api/config/notifications');
          setAuditLogRetention(n?.auditLogRetention ?? 90);
        } catch (e) { /* pomiń */ }
      } finally {
        setLoading(false);
      }
    };
    if (!permsReady) return;
    load();
  }, [permsReady, canViewSettings]);

  const saveFeatures = async () => {
    if (!canManageSettings) {
      showSnackbar('Brak uprawnień do zapisu ustawień funkcji', { type: 'error' });
      return;
    }
    try {
      setSavingFeatures(true);
      await api.put('/api/config/features', features);
      showSnackbar('Ustawienia funkcji zapisane.', { type: 'success' });
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zapisać ustawień funkcji', { type: 'error' });
    } finally {
      setSavingFeatures(false);
    }
  };

  const [savingNotifications, setSavingNotifications] = useState(false);
  const saveNotifications = async () => {
    if (!canManageSettings) {
      showSnackbar('Brak uprawnień do zapisu dodatkowych ustawień', { type: 'error' });
      return;
    }
    // Walidacja retencji (dni >= 0)
    const days = parseInt(auditLogRetention, 10);
    if (isNaN(days) || days < 0) {
      showSnackbar('Retencja audytu musi być liczbą nieujemną', { type: 'warn' });
      return;
    }
    try {
      setSavingNotifications(true);
      await api.put('/api/config/notifications', {
        auditLogRetention: days,
      });
      showSnackbar('Dodatkowe ustawienia zapisane.', { type: 'success' });
    } catch (e) {
      showSnackbar(e?.message || 'Nie udało się zapisać dodatkowych ustawień', { type: 'error' });
    } finally {
      setSavingNotifications(false);
    }
  };

  const deleteAllChats = async () => {
    Alert.alert(
      'Usuń wszystkie czaty',
      'Czy na pewno chcesz usunąć wszystkie czaty? Tej operacji nie można cofnąć.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              const resp = await api.delete('/api/chat/conversations/all');
              const c = resp?.counts || {};
              const msg = `Usunięto: rozmowy ${c.conversations || 0}, wiadomości ${c.messages || 0}`;
              showSnackbar(msg, { type: 'success' });
            } catch (e) {
              showSnackbar(e?.message || 'Nie udało się usunąć czatów', { type: 'error' });
            }
          }
        }
      ]
    );
  };

  if (permsReady && !canViewSettings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={{ color: colors.danger, textAlign: 'center', marginBottom: 8 }}>⚠️ Brak uprawnień</Text>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>Brak uprawnień do przeglądania ustawień funkcji.</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ paddingBottom: 24 }}>
      {loading ? (
        <Text style={[styles.subtitle, { color: colors.muted, textAlign: 'center', marginTop: 20 }]}>Ładowanie…</Text>
      ) : (
        <View style={{ gap: 16 }}>
          {/* Sekcja 1: Funkcje systemu */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Funkcje systemu</Text>
            
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Raporty</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Generowanie raportów PDF/XLSX</Text>
              </View>
              <Switch value={features.enableReports} onValueChange={(v) => setFeatures({ ...features, enableReports: v })} disabled={!canManageSettings} />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Dostęp API</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Zewnętrzny dostęp do API</Text>
              </View>
              <Switch value={features.enableApiAccess} onValueChange={(v) => setFeatures({ ...features, enableApiAccess: v })} disabled={!canManageSettings} />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Eksport danych</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Możliwość eksportu danych</Text>
              </View>
              <Switch value={features.enableDataExport} onValueChange={(v) => setFeatures({ ...features, enableDataExport: v })} disabled={!canManageSettings} />
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Aplikacja mobilna</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Dostęp dla aplikacji mobilnej</Text>
              </View>
              <Switch value={features.enableMobileApp} onValueChange={(v) => setFeatures({ ...features, enableMobileApp: v })} disabled={!canManageSettings} />
            </View>
          </View>

          {/* Sekcja 2: Dziennik audytu */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Dziennik audytu</Text>
            
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Logowanie zdarzeń</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Rejestruj działania użytkowników</Text>
              </View>
              <Switch value={features.enableAuditLog} onValueChange={(v) => setFeatures({ ...features, enableAuditLog: v })} disabled={!canManageSettings} />
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Retencja dziennika audytu (dni)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                value={String(auditLogRetention)}
                onChangeText={(v) => {
                  const num = parseInt(v, 10);
                  setAuditLogRetention(isNaN(num) ? '' : String(Math.max(0, num)));
                }}
                keyboardType="numeric"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
               <ThemedButton
                 title={savingNotifications ? 'Zapisywanie…' : 'Zapisz retencję'}
                 onPress={saveNotifications}
                 disabled={savingNotifications || !canManageSettings}
                 variant="secondary"
                 style={{ height: 36, paddingHorizontal: 12 }}
                 textStyle={{ fontSize: 13 }}
               />
            </View>
          </View>

          {/* Sekcja 3: Czat */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 12 }]}>Czat</Text>
            
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, { color: colors.text }]}>Czat w czasie rzeczywistym</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>Włącz komunikator wewnętrzny</Text>
              </View>
              <Switch value={features.enableRealtimeChat} onValueChange={(v) => setFeatures({ ...features, enableRealtimeChat: v })} disabled={!canManageSettings} />
            </View>

            <View style={{ marginTop: 12 }}>
              <ThemedButton
                title="Usuń wszystkie czaty"
                onPress={deleteAllChats}
                variant="danger"
              />
            </View>
          </View>

          <ThemedButton
            title={savingFeatures ? 'Zapisywanie ustawień…' : 'Zapisz ustawienia funkcji'}
            onPress={saveFeatures}
            disabled={savingFeatures || !canManageSettings}
            variant="primary"
            style={{ marginTop: 8 }}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  subtitle: { color: '#475569', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowText: { fontSize: 16, color: '#0f172a', fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  label: { fontSize: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
});
