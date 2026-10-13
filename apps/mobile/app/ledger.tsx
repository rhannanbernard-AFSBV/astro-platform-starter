import { Redirect, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { FlowStepper } from '../src/components/FlowStepper';
import { useBid } from '../src/state/BidContext';

export default function LedgerScreen() {
  const { scan } = useBid();
  const router = useRouter();
  if (!scan) return <Redirect href="/" />;

  const L = scan.financial_ledger;
  const S = scan.spatial_summary;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlowStepper active="bid" />
      <Text style={styles.h1}>Bid ledger</Text>
      <Text style={styles.sub}>
        #{scan.bid_id} · {S.total_cleanable_sq_ft.toLocaleString()} sq ft ·{' '}
        {scan.meta.jurisdiction_code} · {scan.meta.extraction_source}
      </Text>

      <View style={styles.kpiRow}>
        <Kpi label="Monthly" value={L.formatted_monthly} />
        <Kpi label="Per shift" value={L.formatted_per_shift} />
      </View>
      {L.dual_currency ? (
        <View style={styles.dual}>
          <Text style={styles.dualTitle}>Dual quote ({L.dual_currency.currency_code})</Text>
          <Text style={styles.dualValue}>{L.dual_currency.formatted_monthly}/mo</Text>
          <Text style={styles.dualNote}>{L.dual_currency.conversion_note}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Spatial summary</Text>
      {(S.substrate_breakdown || []).map((s) => (
        <Text key={s.material} style={styles.line}>
          {s.material}: {s.percentage}%
        </Text>
      ))}
      {(S.detected_fixtures || []).map((f) => (
        <Text key={f.fixture_type} style={styles.line}>
          {f.count}× {f.fixture_type}
        </Text>
      ))}

      <Text style={styles.section}>Calculation steps (Decimal, not LLM)</Text>
      {(L.calculation_steps || []).map((step) => (
        <View key={step.step} style={styles.step}>
          <Text style={styles.stepTitle}>
            {step.step}. {step.label}
          </Text>
          <Text style={styles.stepFormula}>{step.formula}</Text>
          <Text style={styles.stepResult}>→ {step.result}</Text>
        </View>
      ))}

      <Pressable style={styles.btn} onPress={() => router.push('/checklist')}>
        <Text style={styles.btnText}>Next · Crew checklist</Text>
      </Pressable>
      <Pressable style={styles.skipBtn} onPress={() => router.push('/proposal')}>
        <Text style={styles.skipText}>Skip to proposal / portal</Text>
      </Pressable>
    </ScrollView>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  h1: {
    fontSize: 26,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    color: '#0f172a',
  },
  sub: { marginTop: 6, color: '#64748b', marginBottom: 16 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpi: {
    flex: 1,
    backgroundColor: '#134e4a',
    padding: 16,
    borderRadius: 4,
  },
  kpiLabel: { color: '#99f6e4', fontSize: 12 },
  kpiValue: { color: '#ecfdf5', fontSize: 22, marginTop: 4, fontWeight: '600' },
  dual: {
    marginTop: 10,
    padding: 14,
    backgroundColor: '#fff',
    borderLeftWidth: 3,
    borderLeftColor: '#0f766e',
  },
  dualTitle: { fontWeight: '600', color: '#0f172a' },
  dualValue: { fontSize: 18, color: '#0f766e', marginTop: 4 },
  dualNote: { color: '#64748b', fontSize: 12, marginTop: 4 },
  section: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  line: { color: '#334155', marginBottom: 4 },
  step: {
    backgroundColor: '#fff',
    padding: 12,
    marginBottom: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stepTitle: { fontWeight: '600', color: '#0f172a' },
  stepFormula: { color: '#64748b', fontSize: 12, marginTop: 2 },
  stepResult: { color: '#0f766e', marginTop: 4, fontWeight: '600' },
  btn: {
    marginTop: 20,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  skipBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  skipText: { color: '#0f766e', fontWeight: '600', fontSize: 14 },
});
