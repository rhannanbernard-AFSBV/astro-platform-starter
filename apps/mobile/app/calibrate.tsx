import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { FlowStepper } from '../src/components/FlowStepper';
import { calibrateBid, type FixtureRow } from '../src/api/client';
import { useBid } from '../src/state/BidContext';

export default function CalibrateScreen() {
  const { scan, setScan } = useBid();
  const router = useRouter();
  const [sqFt, setSqFt] = useState('');
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scan) return;
    setSqFt(String(scan.spatial_summary.total_cleanable_sq_ft || ''));
    setFixtures(
      (scan.spatial_summary.detected_fixtures || []).map((f) => ({
        fixture_type: f.fixture_type,
        count: Number(f.count) || 0,
        labor_intensity: f.labor_intensity || 'medium',
      }))
    );
  }, [scan]);

  if (!scan) return <Redirect href="/" />;
  if (scan.pricing_committed) return <Redirect href="/ledger" />;

  function updateFixture(i: number, patch: Partial<FixtureRow>) {
    setFixtures((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  async function commit() {
    if (!scan) return;
    const current = scan;
    const n = Number(sqFt);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Sq ft required', 'Enter a cleanable square footage greater than zero.');
      return;
    }
    setBusy(true);
    try {
      const next = await calibrateBid(current.bid_id, {
        total_cleanable_sq_ft: n,
        detected_fixtures: fixtures,
        substrate_breakdown: current.spatial_summary.substrate_breakdown,
      });
      setScan({
        ...current,
        ...next,
        bid_id: current.bid_id,
        proposal_id: next.proposal_id || current.proposal_id,
        pricing_committed: true,
        crew_checklist: current.crew_checklist,
        proposal: { ...current.proposal, ...(next.proposal || {}) },
        meta: { ...current.meta, ...(next.meta || {}), pricing_committed: true },
      });
      router.push('/ledger');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Calibrate failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Calibrate failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlowStepper active="calibrate" />
      <Text style={styles.h1}>Calibrate before pricing</Text>
      <Text style={styles.sub}>
        Adjust sq ft and fixture counts / labor intensity. Decimal pricing commits only when
        you confirm — not on the raw vision extract.
      </Text>
      {scan.meta.frame_count ? (
        <Text style={styles.metaLine}>
          Walkthrough frames: {scan.meta.frame_count}
          {scan.meta.video_received ? ' · video attached' : ''}
        </Text>
      ) : null}

      <Text style={styles.label}>Cleanable sq ft</Text>
      <TextInput
        style={styles.input}
        value={sqFt}
        onChangeText={setSqFt}
        keyboardType="numeric"
      />

      <Text style={styles.section}>Fixtures (labor intensity feeds ISSA density)</Text>
      {fixtures.map((f, i) => (
        <View key={`${f.fixture_type}-${i}`} style={styles.fixRow}>
          <Text style={styles.fixType}>{f.fixture_type}</Text>
          <View style={styles.fixControls}>
            <TextInput
              style={styles.smallInput}
              value={String(f.count)}
              keyboardType="numeric"
              onChangeText={(v) => updateFixture(i, { count: Number(v) || 0 })}
            />
            <View style={styles.intensityRow}>
              {(['low', 'medium', 'high'] as const).map((level) => (
                <Pressable
                  key={level}
                  style={[
                    styles.intensityChip,
                    f.labor_intensity === level && styles.intensityChipOn,
                  ]}
                  onPress={() => updateFixture(i, { labor_intensity: level })}
                >
                  <Text
                    style={[
                      styles.intensityText,
                      f.labor_intensity === level && styles.intensityTextOn,
                    ]}
                  >
                    {level}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ))}

      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        disabled={busy}
        onPress={commit}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Commit pricing → Ledger</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  h1: {
    fontSize: 26,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    color: '#0f172a',
  },
  sub: { marginTop: 8, marginBottom: 12, color: '#64748b', lineHeight: 20 },
  metaLine: { color: '#0f766e', fontSize: 12, marginBottom: 8, fontWeight: '600' },
  label: { marginTop: 8, fontSize: 13, color: '#475569', fontWeight: '600' },
  section: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  fixRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  fixType: { fontWeight: '600', color: '#0f172a', marginBottom: 8 },
  fixControls: { gap: 8 },
  smallInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 80,
    fontSize: 16,
  },
  intensityRow: { flexDirection: 'row', gap: 6 },
  intensityChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
  },
  intensityChipOn: { backgroundColor: '#0f766e' },
  intensityText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  intensityTextOn: { color: '#ecfdf5' },
  btn: {
    marginTop: 20,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
