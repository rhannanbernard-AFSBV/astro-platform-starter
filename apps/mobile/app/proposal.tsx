import { useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { FlowStepper } from '../src/components/FlowStepper';
import { useBid } from '../src/state/BidContext';
import { API_URL, proposalPdfUrl, sendProposal } from '../src/api/client';
import { useAuth } from '../src/state/AuthContext';

export default function ProposalScreen() {
  const { scan, setScan } = useBid();
  const { token } = useAuth();
  const router = useRouter();
  const [toEmail, setToEmail] = useState('client@example.com');
  const [busy, setBusy] = useState(false);
  const [sendResult, setSendResult] = useState<{
    status: string;
    transport: string;
    proposal_secure_url: string;
  } | null>(null);

  if (!scan) return <Redirect href="/" />;

  const secureUrl =
    sendResult?.proposal_secure_url || scan.proposal.proposal_secure_url || '';

  async function onSend() {
    if (!toEmail.trim()) {
      Alert.alert('Email required', 'Enter a client email to send the proposal.');
      return;
    }
    setBusy(true);
    try {
      const result = await sendProposal(scan!.bid_id, toEmail.trim());
      setSendResult(result);
      scan!.proposal.status = result.status;
      if (Platform.OS === 'web') {
        window.alert(`Proposal ${result.status} via ${result.transport}`);
      } else {
        Alert.alert('Proposal sent', `Status ${result.status} · transport ${result.transport}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Send failed', message);
    } finally {
      setBusy(false);
    }
  }

  function openSign() {
    if (!secureUrl) return;
    const token = scan!.proposal.access_token;
    if (token) {
      router.push(`/sign/${token}`);
      return;
    }
    Linking.openURL(secureUrl);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlowStepper active="portal" />
      <Text style={styles.h1}>Proposal & portal</Text>
      <Text style={styles.status}>
        Status: {sendResult?.status || scan.proposal.status}
      </Text>

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

      <Text style={styles.section}>Email client portal link</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={toEmail}
        onChangeText={setToEmail}
        placeholder="client@company.com"
      />
      <Pressable style={styles.btn} disabled={busy} onPress={onSend}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Send portal email</Text>
        )}
      </Pressable>
      {sendResult ? (
        <Text style={styles.hint}>
          Delivered via {sendResult.transport}
          {sendResult.transport === 'dry_run'
            ? ' (console log — set RESEND_API_KEY / SMTP to send for real)'
            : ''}
        </Text>
      ) : null}

      <Text style={styles.section}>PDF proposal</Text>
      <Pressable
        style={styles.outlineBtn}
        onPress={async () => {
          const url = proposalPdfUrl(scan.bid_id);
          // Auth'd PDF — open via fetch blob on web; Linking with token query not supported
          if (Platform.OS === 'web' && token) {
            const res = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            window.open(objectUrl, '_blank');
          } else {
            Linking.openURL(
              scan.proposal.proposal_secure_url
                ? `${scan.proposal.proposal_secure_url}/pdf`
                : `${API_URL}/p/${scan.proposal.access_token}/pdf`
            );
          }
        }}
      >
        <Text style={styles.outlineBtnText}>Download / open branded PDF</Text>
      </Pressable>

      {secureUrl ? (
        <>
          <Text style={styles.section}>Client portal &amp; e-sign</Text>
          <Text style={styles.link} numberOfLines={3}>
            {secureUrl}
          </Text>
          <Pressable
            style={styles.outlineBtn}
            onPress={() => Linking.openURL(secureUrl)}
          >
            <Text style={styles.outlineBtnText}>Open client portal (web)</Text>
          </Pressable>
          <Pressable style={[styles.outlineBtn, { marginTop: 8 }]} onPress={openSign}>
            <Text style={styles.outlineBtnText}>In-app e-sign</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable
        style={[styles.btn, { backgroundColor: '#334155', marginTop: 24 }]}
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
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: { marginTop: 8, color: '#64748b', fontSize: 12 },
  link: { color: '#0f766e', fontSize: 12, marginBottom: 8 },
  btn: {
    marginTop: 12,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#0f766e',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  outlineBtnText: { color: '#0f766e', fontWeight: '600' },
});
