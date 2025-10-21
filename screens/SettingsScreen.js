import { useEffect, useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../lib/api';
import { useTheme } from '../lib/theme';
import { showSnackbar } from '../lib/snackbar';

const TZ_OPTIONS = [
  { label: 'Europa/Warszawa', value: 'Europe/Warsaw' },
  { label: 'Europa/Londyn', value: 'Europe/London' },
  { label: 'Ameryka/Nowy Jork', value: 'America/New_York' },
  { label: 'Azja/Tokio', value: 'Asia/Tokyo' }
];

const LANG_OPTIONS = [
  { label: 'Polski', value: 'pl' },
  { label: 'English', value: 'en' }
];

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { isDark, toggleDark, colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [general, setGeneral] = useState({
    appName: 'System Zarządzania',
    companyName: 'Moja Firma',
    timezone: 'Europe/Warsaw',
    language: 'pl',
    dateFormat: 'DD/MM/YYYY'
  });

  // Sekcje i przewijanie do nich
  const scrollRef = useRef(null);
  const [sectionY, setSectionY] = useState({});
  const registerSection = (key) => (e) => {
    const y = e?.nativeEvent?.layout?.y ?? 0;
    setSectionY(prev => ({ ...prev, [key]: y }));
  };
  const scrollTo = (key) => {
    if (scrollRef.current && sectionY[key] != null) {
      scrollRef.current.scrollTo({ y: sectionY[key], animated: true });
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Pobierz ustawienia ogólne
        try {
          const g = await api.get('/api/config/general');
          setGeneral(prev => ({
            appName: g?.appName ?? prev.appName,
            companyName: g?.companyName ?? prev.companyName,
            timezone: g?.timezone ?? prev.timezone,
            language: g?.language ?? prev.language,
            dateFormat: g?.dateFormat ?? prev.dateFormat,
          }));
          // backupFrequency przeniesione do ekranu 💾 Backup
        } catch (e) { /* brak endpointu lub błąd – użyj domyślnych */ }

        // Powiadomienia — sekcja nieużywana; Funkcje — obsługa w dedykowanym ekranie
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveGeneral = async () => {
    try {
      setSavingGeneral(true);
      await api.put('/api/config/general', general);
      showSnackbar({ type: 'success', text: 'Ustawienia ogólne zapisane.' });
    } catch (e) {
      showSnackbar({ type: 'error', text: e?.message || 'Nie udało się zapisać ustawień ogólnych' });
    } finally {
      setSavingGeneral(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.muted }]}>Ładowanie ustawień…</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={[styles.scrollContainer, { backgroundColor: colors.bg }]}>
      <View style={styles.pageWrapper}>
      <Text style={[styles.pageTitle, { color: colors.text }]}>Ustawienia</Text>

      {/* Sekcje (lista nawigacyjna) */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }] }>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sekcje</Text>
        <View>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🔒Bezpieczeństwo')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🔒 Bezpieczeństwo</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('👥Użytkownicy')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>👥 Użytkownicy</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🎛️Funkcje')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🎛️ Funkcje</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🏢Działy')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🏢 Działy</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('👔Stanowiska')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>👔 Stanowiska</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('🏷️Kategorie')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>🏷️ Kategorie</Text>
          </Pressable>
          <Pressable style={[styles.navItem, { borderBottomColor: colors.border }]} onPress={() => navigation.navigate('💾Backup')}>
            <Text style={[styles.navItemText, { color: colors.text }]}>💾 Backup</Text>
          </Pressable>
        </View>
      </View>

      {/* Wygląd */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('wyglad')}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Wygląd</Text>
        <View style={styles.row}>
          <Text style={[styles.rowText, { color: colors.text }]}>Tryb ciemny</Text>
          <Switch value={isDark} onValueChange={toggleDark} />
        </View>
      </View>

      {/* Ogólne */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onLayout={registerSection('ogolne')}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Ustawienia ogólne</Text>
        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Nazwa aplikacji</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.appName}
              onChangeText={(v) => setGeneral({ ...general, appName: v })}
              placeholder="System Zarządzania"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Nazwa firmy</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.companyName}
              onChangeText={(v) => setGeneral({ ...general, companyName: v })}
              placeholder="Moja Firma"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Strefa czasowa</Text>
            <View className="flex-row flex-wrap gap-2">
              {TZ_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    general.timezone === opt.value && [{ borderColor: colors.primary }, { backgroundColor: isDark ? '#1f2937' : '#eef2ff' }],
                  ]}
                  onPress={() => setGeneral({ ...general, timezone: opt.value })}
                >
                 <Text
                   style={[
                     styles.optionChipText,
                     { color: colors.text },
                     general.timezone === opt.value && [{ color: colors.primary, fontWeight: '600' }],
                   ]}
                 >
                   {opt.label}
                 </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Język</Text>
            <View className="flex-row flex-wrap gap-2">
              {LANG_OPTIONS.map(opt => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.optionChip,
                    { backgroundColor: colors.card, borderColor: colors.border },
                    general.language === opt.value && [{ borderColor: colors.primary }, { backgroundColor: isDark ? '#1f2937' : '#eef2ff' }],
                  ]}
                  onPress={() => setGeneral({ ...general, language: opt.value })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: colors.text },
                      general.language === opt.value && [{ color: colors.primary, fontWeight: '600' }],
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-1 mb-3"> 
            <Text style={[styles.label, { color: colors.muted }]}>Format daty</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
              value={general.dateFormat}
              onChangeText={(v) => setGeneral({ ...general, dateFormat: v })}
              placeholder="DD/MM/YYYY"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            savingGeneral && styles.buttonDisabled,
            pressed && { opacity: 0.9 },
          ]}
          onPress={saveGeneral}
          disabled={savingGeneral}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600' }}>
            {savingGeneral ? 'Zapisywanie…' : 'Zapisz ustawienia ogólne'}
          </Text>
        </Pressable>
      </View>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
scrollContainer:{backgroundColor:'#f8fafc',},pageWrapper:{padding:16,},
pageTitle:{fontSize:24,fontWeight:'700',color:'#0f172a',marginBottom:16,},
sectionTitle:{fontSize:18,fontWeight:'600',color:'#0f172a',marginBottom:12,},
card:{backgroundColor:'#ffffff',borderRadius:12,borderWidth:1,borderColor:'#e5e7eb',padding:16,marginBottom:16,},
label:{fontSize:14,color:'#334155',marginBottom:6,},
row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:12,},
rowText:{fontSize:16,color:'#0f172a',},
input:{borderWidth:1,borderColor:'#cbd5e1',backgroundColor:'#ffffff',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:16,color:'#0f172a',},
optionChip:{paddingVertical:8,paddingHorizontal:12,borderWidth:1,borderColor:'#cbd5e1',borderRadius:999,backgroundColor:'#ffffff',},
optionChipSelected:{backgroundColor:'#eef2ff',borderColor:'#6366f1',},
optionChipText:{color:'#0f172a',},
optionChipTextSelected:{color:'#3730a3',fontWeight:'600',},
button:{marginTop:8,backgroundColor:'#4f46e5',paddingVertical:12,borderRadius:10,alignItems:'center',},
buttonDisabled:{opacity:.7,},
buttonPressed:{backgroundColor:'#4338ca',},
navItem:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#e5e7eb',},
navItemText:{fontSize:16,color:'#0f172a',},
loadingContainer:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#f8fafc',},
loadingText:{marginTop:8,color:'#475569',}
});
// StyleSheet usunięty — ekrany korzystają z klas Nativewind/Tailwind