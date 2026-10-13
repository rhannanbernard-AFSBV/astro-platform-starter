import { View, Text, StyleSheet, Platform } from 'react-native';

const STEPS = [
  { key: 'scan', label: 'Scan' },
  { key: 'bid', label: 'Bid' },
  { key: 'checklist', label: 'Checklist' },
  { key: 'portal', label: 'Portal' },
] as const;

export type FlowStep = (typeof STEPS)[number]['key'];

export function FlowStepper({ active }: { active: FlowStep }) {
  const activeIndex = STEPS.findIndex((s) => s.key === active);
  return (
    <View style={styles.row} accessibilityRole="progressbar">
      {STEPS.map((step, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        return (
          <View key={step.key} style={styles.item}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                current && styles.dotCurrent,
              ]}
            >
              <Text style={[styles.dotText, (done || current) && styles.dotTextOn]}>
                {done ? '✓' : String(i + 1)}
              </Text>
            </View>
            <Text style={[styles.label, current && styles.labelCurrent]}>
              {step.label}
            </Text>
            {i < STEPS.length - 1 ? <View style={styles.connector} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  item: { flex: 1, alignItems: 'center', position: 'relative' },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotDone: { backgroundColor: '#0f766e' },
  dotCurrent: { backgroundColor: '#134e4a', borderWidth: 2, borderColor: '#5eead4' },
  dotText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  dotTextOn: { color: '#ecfdf5' },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  },
  labelCurrent: { color: '#0f766e' },
  connector: {
    position: 'absolute',
    top: 13,
    left: '55%',
    right: '-45%',
    height: 2,
    backgroundColor: '#cbd5e1',
    zIndex: 0,
  },
});
