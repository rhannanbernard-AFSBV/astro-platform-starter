import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/state/AuthContext';
import {
  fetchAnalytics,
  fetchBidHistory,
  setBidOutcome,
} from '../src/api/client';

export default function HistoryScreen() {
  const { ready, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [h, a] = await Promise.all([fetchBidHistory(), fetchAnalytics()]);
      setBids(h.bids || []);
      setAnalytics(a);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Load failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('History', message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (ready && !token) return <Redirect href="/login" />;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.h1}>Bid history & analytics</Text>
      {analytics ? (
        <View style={styles.kpiRow}>
          <Kpi label="Win rate" value={analytics.totals.win_rate != null ? `${Math.round(analytics.totals.win_rate * 100)}%` : '—'} />
          <Kpi label="Won MRR" value={`$${Number(analytics.totals.won_monthly_recurring).toFixed(0)}`} />
          <Kpi label="Pipeline" value={String(analytics.totals.open_pipeline)} />
        </View>
      ) : null}

      {analytics?.revenue_by_month?.length ? (
        <>
          <Text style={styles.section}>Revenue by month (won)</Text>
          {analytics.revenue_by_month.map((m: any) => (
            <Text key={m.month} style={styles.line}>
              {m.month}: ${Number(m.revenue).toFixed(0)} · {m.wins} wins · {m.bids_created} bids
            </Text>
          ))}
        </>
      ) : null}

      <Text style={styles.section}>Past bids</Text>
      {loading && !bids.length ? <ActivityIndicator color="#0f766e" /> : null}
      {bids.map((b) => (
        <View key={b.bid_id} style={styles.card}>
          <Text style={styles.client}>{b.client_name}</Text>
          <Text style={styles.meta}>
            #{b.bid_id} · ${Number(b.monthly_price).toFixed(2)}/mo · {b.outcome || 'open'}
          </Text>
          <View style={styles.row}>
            {['won', 'lost', 'withdrawn'].map((o) => (
              <Pressable
                key={o}
                style={styles.chip}
                onPress={async () => {
                  try {
                    await setBidOutcome(b.bid_id, o);
                    await load();
                  } catch (err) {
                    const message = err instanceof Error ? err.message : 'Failed';
                    if (Platform.OS === 'web') window.alert(message);
                    else Alert.alert('Outcome', message);
                  }
                }}
              >
                <Text style={styles.chipText}>{o}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
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
    marginBottom: 12,
  },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: '#134e4a', padding: 12, borderRadius: 4 },
  kpiLabel: { color: '#99f6e4', fontSize: 11 },
  kpiValue: { color: '#ecfdf5', fontSize: 18, fontWeight: '700', marginTop: 4 },
  section: { marginTop: 16, marginBottom: 8, fontWeight: '700', color: '#0f172a' },
  line: { color: '#334155', marginBottom: 4 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  client: { fontWeight: '700', color: '#0f172a' },
  meta: { color: '#64748b', marginTop: 4, fontSize: 12 },
  row: { flexDirection: 'row', gap: 6, marginTop: 10 },
  chip: {
    borderWidth: 1,
    borderColor: '#0f766e',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: '#0f766e', fontSize: 12, fontWeight: '600' },
});
