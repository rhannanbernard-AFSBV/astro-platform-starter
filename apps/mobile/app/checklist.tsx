import { Redirect, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useBid } from '../src/state/BidContext';

export default function ChecklistScreen() {
  const { scan } = useBid();
  const router = useRouter();
  if (!scan) return <Redirect href="/" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Predictive cleaning blueprint</Text>
      <Text style={styles.sub}>
        Sequenced route (top→bottom / left→right). High-risk zones include AI audit prompts.
      </Text>

      {scan.crew_checklist.map((zone, idx) => (
        <View
          key={`${zone.room_zone}-${idx}`}
          style={[styles.card, zone.is_high_risk && styles.riskCard]}
        >
          <View style={styles.row}>
            <Text style={styles.seq}>{zone.sequence ?? idx + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.zone}>{zone.room_zone}</Text>
              {zone.is_high_risk ? (
                <Text style={styles.badge}>HIGH RISK · AI AUDIT</Text>
              ) : null}
            </View>
          </View>
          {(zone.tasks || []).map((task) => (
            <Text key={task} style={styles.task}>
              • {task}
            </Text>
          ))}
          {zone.ai_audit_prompt ? (
            <View style={styles.audit}>
              <Text style={styles.auditLabel}>AI audit prompt</Text>
              <Text style={styles.auditText}>{zone.ai_audit_prompt}</Text>
            </View>
          ) : null}
        </View>
      ))}

      <Pressable style={styles.btn} onPress={() => router.push('/proposal')}>
        <Text style={styles.btnText}>Open proposal draft</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  h1: {
    fontSize: 26,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    color: '#0f172a',
  },
  sub: { marginTop: 6, marginBottom: 16, color: '#64748b', lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 4,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  riskCard: { borderColor: '#b45309', backgroundColor: '#fffbeb' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  seq: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0f766e',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    fontWeight: '700',
    overflow: 'hidden',
  },
  zone: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  badge: {
    marginTop: 2,
    color: '#b45309',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  task: { color: '#334155', marginBottom: 3, paddingLeft: 4 },
  audit: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#0f172a',
    borderRadius: 4,
  },
  auditLabel: { color: '#5eead4', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  auditText: { color: '#e2e8f0', fontSize: 13, lineHeight: 18 },
  btn: {
    marginTop: 12,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
