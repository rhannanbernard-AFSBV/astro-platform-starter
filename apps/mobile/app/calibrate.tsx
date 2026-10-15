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
  Image,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { FlowStepper } from '../src/components/FlowStepper';
import { calibrateBid, type FixtureRow } from '../src/api/client';
import { useBid } from '../src/state/BidContext';

function pct(n?: number | null) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Math.round(Math.max(0, Math.min(1, Number(n))) * 100);
}

export default function CalibrateScreen() {
  const { scan, setScan, captureUris } = useBid();
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
        confidence: f.confidence,
        notes: f.notes,
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
        room_zones: current.room_zones,
        extraction_confidence: current.extraction_confidence,
        scale_and_legend: current.scale_and_legend,
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

  const S = scan.spatial_summary;
  const scale = scan.scale_and_legend;
  const conf = scan.extraction_confidence;
  const overall = pct(conf?.overall ?? scan.meta.overall_confidence);
  const method =
    S.measurement_method || scan.meta.scale_method || scan.meta.scale_calibration || '—';
  const uncertain = conf?.uncertain_fields || scan.meta.uncertain_fields || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlowStepper active="calibrate" />
      <Text style={styles.h1}>Calibrate · precise review</Text>
      <Text style={styles.sub}>
        Review the fused spatial plan and your frames. Decimal pricing commits only when you
        confirm — LLM never does money math.
      </Text>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Cleanable</Text>
          <Text style={styles.summaryValue}>
            {(S.total_cleanable_sq_ft || 0).toLocaleString()} sq ft
          </Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Excluded</Text>
          <Text style={styles.summaryValue}>
            {(S.excluded_structural_sq_ft || 0).toLocaleString()} sq ft
          </Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>Scale method</Text>
          <Text style={styles.summaryValue}>{String(method)}</Text>
        </View>
        <View style={styles.summaryCell}>
          <Text style={styles.summaryLabel}>AI confidence</Text>
          <Text style={styles.summaryValue}>{overall != null ? `${overall}%` : '—'}</Text>
          {overall != null ? (
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${overall}%` }]} />
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.metaLine}>
        {scale?.scale_detected
          ? `Legend: ${scale.scale_text || 'detected'}`
          : 'No scale legend'}
        {scale?.pixels_per_foot ? ` · ppf ${scale.pixels_per_foot}` : ''}
        {scale?.reference_feature ? ` · ref ${scale.reference_feature}` : ''}
      </Text>
      {scan.meta.fusion_notes ? (
        <Text style={styles.metaLine}>{scan.meta.fusion_notes}</Text>
      ) : null}
      <Text style={styles.metaLine}>
        Source: {scan.meta.extraction_source || '—'}
        {scan.meta.frame_count ? ` · ${scan.meta.frame_count} frame(s)` : ''}
        {scan.meta.video_received ? ' · video' : ''}
      </Text>

      {captureUris.length ? (
        <ScrollView horizontal style={styles.previewRow}>
          {captureUris.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.previewThumb} />
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.calibHint}>No local capture previews (mock or cleared).</Text>
      )}

      {uncertain.length ? (
        <View style={styles.uncertainBox}>
          <Text style={styles.uncertainTitle}>AI is unsure about</Text>
          {uncertain.map((u) => (
            <Text key={u} style={styles.uncertainItem}>
              · {u}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>Cleanable sq ft (editable)</Text>
      <TextInput
        style={styles.input}
        value={sqFt}
        onChangeText={setSqFt}
        keyboardType="numeric"
      />

      <Text style={styles.section}>Room zones</Text>
      {(scan.room_zones || []).map((z, i) => (
        <View key={`${z.room_zone}-${i}`} style={styles.zoneCard}>
          <Text style={styles.zoneTitle}>
            {z.room_zone}
            {z.is_high_risk ? ' · HIGH RISK' : ''}
            {pct(z.confidence) != null ? ` · ${pct(z.confidence)}%` : ''}
          </Text>
          <Text style={styles.zoneMeta}>
            {(z.approx_sq_ft || 0).toLocaleString()} sq ft
            {z.substrate_hint ? ` · ${z.substrate_hint}` : ''}
          </Text>
          {z.risk_reason ? <Text style={styles.calibHint}>{z.risk_reason}</Text> : null}
        </View>
      ))}
      {!scan.room_zones?.length ? (
        <Text style={styles.calibHint}>No zone breakdown on this extract.</Text>
      ) : null}

      <Text style={styles.section}>Substrates %</Text>
      {(S.substrate_breakdown || []).map((s, i) => (
        <Text key={`${s.material}-${i}`} style={styles.line}>
          {s.material}: {s.percentage}%
          {s.approx_sq_ft != null ? ` · ${s.approx_sq_ft} sq ft` : ''}
          {s.texture_notes ? ` · ${s.texture_notes}` : ''}
          {pct(s.confidence) != null ? ` · ${pct(s.confidence)}%` : ''}
        </Text>
      ))}

      <Text style={styles.section}>Fixtures (labor intensity → ISSA density)</Text>
      {fixtures.map((f, i) => (
        <View key={`${f.fixture_type}-${i}`} style={styles.fixRow}>
          <Text style={styles.fixType}>
            {f.fixture_type}
            {pct(f.confidence) != null ? ` · ${pct(f.confidence)}%` : ''}
          </Text>
          {f.notes ? <Text style={styles.calibHint}>{f.notes}</Text> : null}
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
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  summaryCell: {
    width: '47%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 10,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  summaryValue: { marginTop: 4, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  barTrack: {
    marginTop: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: '#0f766e' },
  metaLine: { color: '#0f766e', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  calibHint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 4 },
  previewRow: { marginVertical: 10, maxHeight: 88 },
  previewThumb: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: '#e2e8f0',
  },
  uncertainBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 4,
    padding: 12,
    marginVertical: 8,
  },
  uncertainTitle: { fontWeight: '700', color: '#92400e', marginBottom: 4 },
  uncertainItem: { color: '#92400e', fontSize: 12, lineHeight: 18 },
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
  zoneCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  zoneTitle: { fontWeight: '700', color: '#0f172a' },
  zoneMeta: { marginTop: 4, color: '#475569', fontSize: 13 },
  line: { color: '#334155', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  fixRow: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  fixType: { fontWeight: '600', color: '#0f172a', marginBottom: 4 },
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
