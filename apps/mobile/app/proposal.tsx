import { Redirect, useRouter } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useBid } from '../src/state/BidContext';

export default function ProposalScreen() {
  const { scan, setScan } = useBid();
  const router = useRouter();
  if (!scan) return <Redirect href="/" />;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Proposal draft</Text>
      <Text style={styles.status}>Status: {scan.proposal.status}</Text>

      <View style={styles.priceBox}>
        <Text style={styles.priceLabel}>Monthly investment</Text>
        <Text style={styles.price}>{scan.financial_ledger.formatted_monthly}</Text>
        {scan.financial_ledger.dual_currency ? (
          <Text style={styles.dual}>
            Also {scan.financial_ledger.dual_currency.formatted_monthly} (
            {scan.financial_ledger.dual_currency.currency_code})
          </Text>
        ) : null}
      </View>

      <Text style={styles.section}>Executive summary</Text>
      <Text style={styles.body}>{scan.proposal_copy.executive_summary}</Text>

      <Text style={styles.section}>Detailed scope of work</Text>
      <Text style={styles.body}>{scan.proposal_copy.detailed_scope_of_work}</Text>

      <Text style={styles.section}>Email HTML preview (truncated)</Text>
      <Text style={styles.html} numberOfLines={12}>
        {scan.proposal.email_html.replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
      </Text>

      <Pressable
        style={styles.btn}
        onPress={() => {
          setScan(null);
          router.replace('/');
        }}
      >
        <Text style={styles.btnText}>Start another walkthrough</Text>
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
  status: { marginTop: 6, color: '#0f766e', fontWeight: '600', marginBottom: 16 },
  priceBox: {
    backgroundColor: '#134e4a',
    padding: 18,
    borderRadius: 4,
    marginBottom: 8,
  },
  priceLabel: { color: '#99f6e4', fontSize: 12 },
  price: { color: '#ecfdf5', fontSize: 28, fontWeight: '700', marginTop: 4 },
  dual: { color: '#5eead4', marginTop: 6 },
  section: {
    marginTop: 18,
    marginBottom: 6,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  body: { color: '#334155', lineHeight: 22 },
  html: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 4,
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
