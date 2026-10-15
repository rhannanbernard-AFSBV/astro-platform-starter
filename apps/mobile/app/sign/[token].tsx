import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
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
import { FlowStepper } from '../../src/components/FlowStepper';
import {
  API_URL,
  requestProposalSignOtp,
  signPublicProposal,
  verifyProposalSignOtp,
} from '../../src/api/client';

export default function SignScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [typed, setTyped] = useState('');
  const [otp, setOtp] = useState('');
  const [signToken, setSignToken] = useState<string | null>(null);
  const [otpNote, setOtpNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    status: string;
    signed_at: string;
    signature_url: string;
  } | null>(null);

  async function sendOtp() {
    if (!signerEmail.trim() || !signerEmail.includes('@')) {
      Alert.alert('Email required', 'Enter the signer email to receive a signing code.');
      return;
    }
    setBusy(true);
    try {
      const result = await requestProposalSignOtp(String(token), signerEmail.trim());
      setOtpNote(
        result.dev_otp
          ? `Dev OTP: ${result.dev_otp}`
          : `Code sent to ${result.sent_to || signerEmail}`
      );
      if (result.dev_otp) setOtp(result.dev_otp);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OTP failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('OTP failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!otp.trim()) {
      Alert.alert('Code required', 'Enter the email signing code.');
      return;
    }
    setBusy(true);
    try {
      const result = await verifyProposalSignOtp(String(token), otp.trim());
      setSignToken(result.sign_token);
      setOtpNote('OTP verified — one-time sign token ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verify failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Verify failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!signerName.trim()) {
      Alert.alert('Name required', 'Enter the signer full name.');
      return;
    }
    setBusy(true);
    try {
      const result = await signPublicProposal(String(token), {
        signerName: signerName.trim(),
        signerEmail: signerEmail.trim() || undefined,
        typedSignature: typed.trim() || signerName.trim(),
        otp: otp.trim() || undefined,
        signToken: signToken || undefined,
      });
      setDone(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Sign failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlowStepper active="portal" />
      <Text style={styles.h1}>Client portal · e-sign</Text>
      <Text style={styles.sub}>
        Email OTP required · {API_URL}/p/{token}
      </Text>

      {done ? (
        <View style={styles.done}>
          <Text style={styles.doneTitle}>Signed</Text>
          <Text style={styles.body}>
            Status {done.status} · {String(done.signed_at)}
          </Text>
          <Text style={styles.body}>
            Portal link can still be viewed but cannot be used to re-sign.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Back</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.label}>Signer name</Text>
          <TextInput style={styles.input} value={signerName} onChangeText={setSignerName} />
          <Text style={styles.label}>Signer email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={signerEmail}
            onChangeText={setSignerEmail}
          />
          <Pressable style={styles.outlineBtn} disabled={busy} onPress={sendOtp}>
            <Text style={styles.outlineText}>Send signing code</Text>
          </Pressable>
          <Text style={styles.label}>Signing code</Text>
          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            placeholder="6-digit OTP"
          />
          {otpNote ? <Text style={styles.otpNote}>{otpNote}</Text> : null}
          <Pressable style={styles.outlineBtn} disabled={busy} onPress={verifyOtp}>
            <Text style={styles.outlineText}>Verify code → one-time token</Text>
          </Pressable>
          <Text style={styles.label}>Typed signature</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder="Leave blank to use name"
          />
          <Pressable style={styles.btn} disabled={busy} onPress={submit}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign proposal</Text>
            )}
          </Pressable>
        </>
      )}
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
  sub: { marginTop: 6, marginBottom: 16, color: '#64748b', fontSize: 12 },
  label: { marginTop: 10, fontSize: 13, color: '#475569', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  otpNote: { marginTop: 6, color: '#0f766e', fontSize: 12, fontWeight: '600' },
  btn: {
    marginTop: 18,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  outlineBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: '#0f766e',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  outlineText: { color: '#0f766e', fontWeight: '600' },
  done: {
    backgroundColor: '#ecfdf5',
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#0f766e',
  },
  doneTitle: { fontWeight: '700', color: '#0f766e', fontSize: 18 },
  body: { marginTop: 6, color: '#334155' },
});
