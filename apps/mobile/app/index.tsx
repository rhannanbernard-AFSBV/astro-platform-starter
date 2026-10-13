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
  Image,
  Platform,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, createScan, healthCheck } from '../src/api/client';
import { FlowStepper } from '../src/components/FlowStepper';
import { useBid } from '../src/state/BidContext';
import { useAuth } from '../src/state/AuthContext';

export default function ScanScreen() {
  const router = useRouter();
  const { setScan } = useBid();
  const { ready, token, user, tenantName, logout } = useAuth();
  const [clientName, setClientName] = useState('Philipsburg Medical Plaza');
  const [address, setAddress] = useState('1 Front Street, Philipsburg, SXM');
  const [frequency, setFrequency] = useState('5x / week');
  // Empty by default — do not lock mock-scale pricing at 12500
  const [hintSqFt, setHintSqFt] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiNote, setApiNote] = useState(`API: ${API_URL}`);

  if (ready && !token) return <Redirect href="/login" />;
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#0f766e" />
      </View>
    );
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access for walkthrough uploads.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function captureCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Allow camera access to capture walkthrough photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function runDemo(mock: boolean) {
    if (!clientName.trim()) {
      Alert.alert('Client required', 'Enter a client name to create a bid.');
      return;
    }
    setBusy(true);
    try {
      try {
        const h = await healthCheck();
        setApiNote(
          `API ok · vision ${h.openai_configured ? 'GPT-4o' : 'mock'} · email ${h.email_transport}`
        );
      } catch {
        setApiNote(`Cannot reach API at ${API_URL}`);
      }

      const scan = await createScan({
        clientName: clientName.trim(),
        propertyAddress: address.trim(),
        frequency: frequency.trim(),
        hintSqFt: hintSqFt.trim() || undefined,
        imageUri,
        mock: mock || !imageUri,
      });
      setScan(scan);
      router.push('/ledger');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Scan failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>OmniClean</Text>
        <Text style={styles.tagline}>Scan the site. Price the bid. Send the portal.</Text>
        <Text style={styles.meta}>
          {tenantName || 'Tenant'} · {user?.email}
        </Text>
        <Text style={styles.meta}>{apiNote}</Text>
        <View style={styles.heroActions}>
          <Pressable onPress={() => router.push('/admin')}>
            <Text style={styles.logoutText}>Admin</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/history')}>
            <Text style={styles.logoutText}>History</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/tenants')}>
            <Text style={styles.logoutText}>Switch</Text>
          </Pressable>
          <Pressable onPress={() => logout()}>
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <FlowStepper active="scan" />
      <Text style={styles.stepHint}>1 · Capture walkthrough spatial data</Text>

      <Text style={styles.label}>Client name</Text>
      <TextInput style={styles.input} value={clientName} onChangeText={setClientName} />

      <Text style={styles.label}>Property address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} />

      <Text style={styles.label}>Frequency</Text>
      <TextInput style={styles.input} value={frequency} onChangeText={setFrequency} />

      <Text style={styles.label}>Calibrated sq ft (optional)</Text>
      <TextInput
        style={styles.input}
        value={hintSqFt}
        onChangeText={setHintSqFt}
        keyboardType="numeric"
        placeholder="Leave blank — use legend / vision scale"
      />
      <Text style={styles.calibHint}>
        Only set when you measured the floor yourself. Blank uses deterministic
        pixels_per_foot (when available) or vision estimate — never a silent 12,500 default.
      </Text>

      <View style={styles.captureRow}>
        <Pressable style={styles.secondaryBtn} onPress={captureCamera}>
          <Text style={styles.secondaryBtnText}>Camera capture</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={pickFromLibrary}>
          <Text style={styles.secondaryBtnText}>
            {imageUri ? 'Change from library' : 'Photo library'}
          </Text>
        </Pressable>
      </View>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} />
      ) : null}

      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy || !imageUri}
        onPress={() => runDemo(false)}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {imageUri ? 'Scan with GPT-4o → Bid' : 'Attach photo to scan live'}
          </Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.outlineBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => runDemo(true)}
      >
        <Text style={styles.outlineBtnText}>Skip photo · demo scan (mock)</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Live scan needs OPENAI_API_KEY on the API. Bid math always uses Decimal on the
        server — never the LLM.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 8 },
  hero: {
    marginBottom: 16,
    padding: 20,
    borderRadius: 4,
    backgroundColor: '#134e4a',
  },
  brand: {
    fontSize: 32,
    color: '#ecfdf5',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  },
  tagline: { marginTop: 8, color: '#99f6e4', fontSize: 15, lineHeight: 22 },
  meta: { marginTop: 12, color: '#5eead4', fontSize: 12 },
  heroActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 16,
  },
  logoutText: { color: '#ccfbf1', fontWeight: '600', fontSize: 13 },
  stepHint: {
    fontSize: 14,
    fontWeight: '700',
    color: '#134e4a',
    marginBottom: 4,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  },
  label: { marginTop: 8, fontSize: 13, color: '#475569', fontWeight: '600' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
  },
  calibHint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 4 },
  captureRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 4,
    marginTop: 4,
    backgroundColor: '#e2e8f0',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outlineBtn: {
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  outlineBtnText: { color: '#0f766e', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#e2e8f0',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  disabled: { opacity: 0.6 },
  footnote: { marginTop: 16, color: '#64748b', fontSize: 12, lineHeight: 18 },
});
