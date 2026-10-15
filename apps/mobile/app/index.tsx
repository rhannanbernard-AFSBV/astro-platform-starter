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
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
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

  async function pickFromLibrary(multi = true) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access for walkthrough uploads.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: multi,
      selectionLimit: 12,
    });
    if (!result.canceled && result.assets?.length) {
      setImageUris((prev) =>
        [...prev, ...result.assets.map((a) => a.uri)].slice(0, 12)
      );
    }
  }

  async function pickVideo() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow media access for walkthrough video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.8,
      videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets[0]) {
      setVideoUri(result.assets[0].uri);
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
      setImageUris((prev) => [...prev, result.assets[0].uri].slice(0, 12));
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

      // Live GPT-4o needs image frames; video-only falls back to mock coverage path
      const liveNeedsFrames = !mock && imageUris.length === 0 && Boolean(videoUri);
      const scan = await createScan({
        clientName: clientName.trim(),
        propertyAddress: address.trim(),
        frequency: frequency.trim(),
        hintSqFt: hintSqFt.trim() || undefined,
        imageUris: mock || liveNeedsFrames ? undefined : imageUris,
        videoUri: mock ? undefined : videoUri,
        mock: mock || liveNeedsFrames || (!imageUris.length && !videoUri),
        // Defer pricing until calibrate screen
        commitPricing: false,
      });
      setScan(scan);
      router.push('/calibrate');
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
      <Text style={styles.stepHint}>1 · Multi-frame walkthrough (photos + optional video)</Text>

      <Text style={styles.label}>Client name</Text>
      <TextInput style={styles.input} value={clientName} onChangeText={setClientName} />

      <Text style={styles.label}>Property address</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} />

      <Text style={styles.label}>Frequency</Text>
      <TextInput style={styles.input} value={frequency} onChangeText={setFrequency} />

      <Text style={styles.label}>Calibrated sq ft hint (optional)</Text>
      <TextInput
        style={styles.input}
        value={hintSqFt}
        onChangeText={setHintSqFt}
        keyboardType="numeric"
        placeholder="Leave blank — calibrate after extract"
      />
      <Text style={styles.calibHint}>
        Prefer the calibrate step after scan. Hint only overrides vision when you already
        measured the floor.
      </Text>

      <View style={styles.captureRow}>
        <Pressable style={styles.secondaryBtn} onPress={captureCamera}>
          <Text style={styles.secondaryBtnText}>Add camera shot</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => pickFromLibrary(true)}>
          <Text style={styles.secondaryBtnText}>Add photos</Text>
        </Pressable>
      </View>
      <Pressable style={[styles.secondaryBtn, { marginTop: 8 }]} onPress={pickVideo}>
        <Text style={styles.secondaryBtnText}>
          {videoUri ? 'Change walkthrough video' : 'Add walkthrough video'}
        </Text>
      </Pressable>
      {imageUris.length ? (
        <ScrollView horizontal style={styles.previewRow}>
          {imageUris.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.previewThumb} />
          ))}
        </ScrollView>
      ) : null}
      {imageUris.length || videoUri ? (
        <Text style={styles.calibHint}>
          {imageUris.length} photo(s)
          {videoUri ? ' · video attached' : ''} · max 12 frames to API
        </Text>
      ) : null}
      {(imageUris.length > 0 || videoUri) && (
        <Pressable
          onPress={() => {
            setImageUris([]);
            setVideoUri(null);
          }}
        >
          <Text style={styles.clearMedia}>Clear media</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy || (!imageUris.length && !videoUri)}
        onPress={() => runDemo(false)}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {imageUris.length || videoUri
              ? 'Scan walkthrough → Calibrate'
              : 'Attach photos/video to scan live'}
          </Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.outlineBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => runDemo(true)}
      >
        <Text style={styles.outlineBtnText}>Skip media · demo scan (mock) → Calibrate</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Live scan needs OPENAI_API_KEY. Multi-frame images go to GPT-4o; video is coverage
        metadata (add photo frames for live vision). Bid math always uses Decimal on the
        server.
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
  previewRow: { marginTop: 8, maxHeight: 88 },
  previewThumb: {
    width: 80,
    height: 80,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: '#e2e8f0',
  },
  clearMedia: { color: '#b45309', fontWeight: '600', marginTop: 4 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
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
