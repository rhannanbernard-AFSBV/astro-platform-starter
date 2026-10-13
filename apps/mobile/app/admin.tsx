import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/state/AuthContext';
import { fetchAdminSettings, patchAdminSettings } from '../src/api/client';

export default function AdminScreen() {
  const { ready, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dual, setDual] = useState(true);
  const [wage, setWage] = useState('18');
  const [margin, setMargin] = useState('30');
  const [burden, setBurden] = useState('1.12');
  const [density, setDensity] = useState('office_low');
  const [primary, setPrimary] = useState('USD');
  const [secondary, setSecondary] = useState('XCG');
  const [coi, setCoi] = useState('');
  const [liability, setLiability] = useState('');
  const [issaOptions, setIssaOptions] = useState<
    { density_code: string; label: string; sq_ft_per_hour: number }[]
  >([]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const s = await fetchAdminSettings();
        setDual(Boolean(s.currency.enable_dual_quoting));
        setWage(String(s.pricing.base_hourly_wage));
        setMargin(String(s.pricing.target_margin_percentage));
        setBurden(
          String(
            s.pricing.labor_burden_override ??
              s.jurisdiction?.labor_burden_multiplier ??
              1.12
          )
        );
        setDensity(s.pricing.facility_density_code);
        setPrimary(s.currency.primary_currency_code);
        setSecondary(s.currency.secondary_currency_code);
        setCoi(s.tenant.insurance_coi_url || '');
        setLiability(s.tenant.insurance_liability_limit || '');
        setIssaOptions(s.issa_rates || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Load failed';
        if (Platform.OS === 'web') window.alert(message);
        else Alert.alert('Admin', message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (ready && !token) return <Redirect href="/login" />;

  async function save() {
    setSaving(true);
    try {
      await patchAdminSettings({
        currency: {
          primary_currency_code: primary.trim(),
          secondary_currency_code: secondary.trim(),
          enable_dual_quoting: dual,
        },
        pricing: {
          base_hourly_wage: Number(wage),
          target_margin_percentage: Number(margin),
          facility_density_code: density,
          labor_burden_override: Number(burden),
        },
        tenant: {
          insurance_coi_url: coi.trim() || null,
          insurance_liability_limit: liability.trim() || null,
        },
      });
      if (Platform.OS === 'web') window.alert('Settings saved');
      else Alert.alert('Saved', 'Tenant admin settings updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0f766e" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Tenant admin</Text>
      <Text style={styles.sub}>
        Currency, margins, SZV burden, ISSA density, dual-quote — scoped to your tenant.
      </Text>

      <Text style={styles.label}>Primary currency</Text>
      <TextInput style={styles.input} value={primary} onChangeText={setPrimary} autoCapitalize="characters" />
      <Text style={styles.label}>Secondary currency</Text>
      <TextInput style={styles.input} value={secondary} onChangeText={setSecondary} autoCapitalize="characters" />
      <View style={styles.switchRow}>
        <Text style={styles.labelInline}>Enable dual quoting</Text>
        <Switch value={dual} onValueChange={setDual} />
      </View>

      <Text style={styles.label}>Base hourly wage</Text>
      <TextInput style={styles.input} value={wage} onChangeText={setWage} keyboardType="decimal-pad" />
      <Text style={styles.label}>Target margin %</Text>
      <TextInput style={styles.input} value={margin} onChangeText={setMargin} keyboardType="decimal-pad" />
      <Text style={styles.label}>SZV labor burden multiplier (1.09–1.20 typical)</Text>
      <TextInput style={styles.input} value={burden} onChangeText={setBurden} keyboardType="decimal-pad" />

      <Text style={styles.label}>ISSA facility density</Text>
      <View style={styles.chips}>
        {issaOptions.map((o) => (
          <Pressable
            key={o.density_code}
            style={[styles.chip, density === o.density_code && styles.chipOn]}
            onPress={() => setDensity(o.density_code)}
          >
            <Text
              style={[
                styles.chipText,
                density === o.density_code && styles.chipTextOn,
              ]}
            >
              {o.label} ({o.sq_ft_per_hour}/hr)
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Insurance liability limit</Text>
      <TextInput style={styles.input} value={liability} onChangeText={setLiability} />
      <Text style={styles.label}>Insurance COI URL</Text>
      <TextInput style={styles.input} value={coi} onChangeText={setCoi} autoCapitalize="none" />

      <Pressable style={styles.btn} disabled={saving} onPress={save}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Save settings</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 48 },
  h1: {
    fontSize: 26,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    color: '#0f172a',
  },
  sub: { marginTop: 6, marginBottom: 16, color: '#64748b', lineHeight: 20 },
  label: { marginTop: 12, fontSize: 13, color: '#475569', fontWeight: '600' },
  labelInline: { fontSize: 14, color: '#334155', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 4,
  },
  switchRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#134e4a', borderColor: '#134e4a' },
  chipText: { fontSize: 12, color: '#334155' },
  chipTextOn: { color: '#ecfdf5' },
  btn: {
    marginTop: 24,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
