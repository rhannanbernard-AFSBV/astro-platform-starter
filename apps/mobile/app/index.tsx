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
import { useBid } from '../src/state/BidContext';
import { useAuth } from '../src/state/AuthContext';

export default function ScanScreen() {
  const router = useRouter();
  const { setScan } = useBid();
  const { ready, token, user, tenantName, logout } = useAuth();
  const [clientName, setClientName] = useState('Philipsburg Medical Plaza');
  const [address, setAddress] = useState('1 Front Street, Philipsburg, SXM');
  const [frequency, setFrequency] = useState('5x / week');
  const [hintSqFt, setHintSqFt] = useState('12500');
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

  async function pickImage() {
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
        <Text style={styles.tagline}>
          Site walkthrough → ISSA bid → crew checklist → proposal
        </Text>
        <Text style={styles.meta}>
          {tenantName || 'Tenant'} · {user?.email} · {apiNote}
        </Text>
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

      <Text style={styles.label}>Client name</Text>
      <TextInput style={styles.input} value={clientName} onChangeText={setClientName} />

      <Text style={styles.label}>Property address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} />

      <Text style={styles.label}>Frequency</Text>
      <TextInput style={styles.input} value={frequency} onChangeText={setFrequency} />

      <Text style={styles.label}>Hint sq ft (optional / mock)</Text>
      <TextInput
        style={styles.input}
        value={hintSqFt}
        onChangeText={setHintSqFt}
        keyboardType="numeric"
      />

      <Pressable style={styles.secondaryBtn} onPress={pickImage}>
        <Text style={styles.secondaryBtnText}>
          {imageUri ? 'Change walkthrough photo' : 'Attach floorplan / walkthrough photo'}
        </Text>
      </Pressable>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.preview} />
      ) : null}

      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => runDemo(true)}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Run demo scan (mock spatial)</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.outlineBtn, busy && styles.disabled]}
        disabled={busy || !imageUri}
        onPress={() => runDemo(false)}
      >
        <Text style={styles.outlineBtnText}>
          Scan with GPT-4o vision (needs API key + photo)
        </Text>
      </Pressable>

      <Text style={styles.footnote}>
        Bidding math always runs in the API with Decimal arithmetic — never in the LLM.
        Scans require a JWT; tenant_id is taken from the authenticated principal.
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
    marginTop: 12,
    backgroundColor: '#e2e8f0',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#334155', fontWeight: '600' },
  disabled: { opacity: 0.6 },
  footnote: { marginTop: 16, color: '#64748b', fontSize: 12, lineHeight: 18 },
});
