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
  Image,
  Platform,
  Switch,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, createScan, healthCheck } from '../src/api/client';
import { FlowStepper } from '../src/components/FlowStepper';
import { useBid } from '../src/state/BidContext';
import { useAuth } from '../src/state/AuthContext';

const GUIDE = [
  {
    id: 'doorway',
    title: '1 · Doorway for scale',
    hint: 'Photograph a full door leaf (~3 ft). Stand square to the opening.',
  },
  {
    id: 'floor',
    title: '2 · Floor texture',
    hint: 'Capture dominant substrate texture (LVT, carpet, terrazzo…).',
  },
  {
    id: 'room',
    title: '3 · Each room / zone',
    hint: 'Walk room-to-room. Add clinics, restrooms, breakrooms separately.',
  },
] as const;

export default function ScanScreen() {
  const router = useRouter();
  const { setScan, setCaptureUris } = useBid();
  const { ready, token, user, tenantName, logout } = useAuth();
  const [clientName, setClientName] = useState('Philipsburg Medical Plaza');
  const [address, setAddress] = useState('1 Front Street, Philipsburg, SXM');
  const [frequency, setFrequency] = useState('5x / week');
  const [hintSqFt, setHintSqFt] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiNote, setApiNote] = useState(`API: ${API_URL}`);
  const [openaiReady, setOpenaiReady] = useState<boolean | null>(null);
  const [guideIdx, setGuideIdx] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mockEnabled, setMockEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await healthCheck();
        if (cancelled) return;
        setOpenaiReady(Boolean(h.openai_configured));
        setApiNote(
          `API ok · vision ${h.openai_configured ? 'GPT-4o' : 'key missing'} · email ${h.email_transport}`
        );
      } catch {
        if (!cancelled) {
          setOpenaiReady(null);
          setApiNote(`Cannot reach API at ${API_URL}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready && !token) return <Redirect href="/login" />;
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#0f766e" />
      </View>
    );
  }

  const guide = GUIDE[Math.min(guideIdx, GUIDE.length - 1)];
  const progress = Math.min(1, imageUris.length / 3);

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
      setImageUris((prev) => {
        const next = [...prev, ...result.assets.map((a) => a.uri)].slice(0, 12);
        setGuideIdx(Math.min(next.length, GUIDE.length - 1));
        return next;
      });
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
      Alert.alert(
        'Camera needed',
        'Allow camera access to capture walkthrough photos. Or pick from library. Mock stays under Advanced.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUris((prev) => {
        const next = [...prev, result.assets[0].uri].slice(0, 12);
        setGuideIdx(Math.min(Math.max(guideIdx + 1, next.length > 0 ? 1 : 0), GUIDE.length - 1));
        return next;
      });
    }
  }

  async function runScan(mock: boolean) {
    if (!clientName.trim()) {
      Alert.alert('Client required', 'Enter a client name to create a bid.');
      return;
    }
    if (!mock && imageUris.length === 0) {
      Alert.alert(
        'Camera frames required',
        'Capture doorway / floor / rooms first. Live GPT-4o needs photo frames (video alone is not enough).'
      );
      return;
    }
    if (!mock && openaiReady === false) {
      Alert.alert(
        'OpenAI key missing',
        'Set OPENAI_API_KEY on the API for live camera vision, or enable Advanced → mock scan.'
      );
      return;
    }

    setBusy(true);
    try {
      try {
        const h = await healthCheck();
        setOpenaiReady(Boolean(h.openai_configured));
        setApiNote(
          `API ok · vision ${h.openai_configured ? 'GPT-4o' : 'key missing'} · email ${h.email_transport}`
        );
      } catch {
        setApiNote(`Cannot reach API at ${API_URL}`);
      }

      const scan = await createScan({
        clientName: clientName.trim(),
        propertyAddress: address.trim(),
        frequency: frequency.trim(),
        hintSqFt: hintSqFt.trim() || undefined,
        imageUris: mock ? undefined : imageUris,
        videoUri: mock ? undefined : videoUri,
        mock,
        commitPricing: false,
      });
      setCaptureUris(mock ? [] : [...imageUris]);
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
        <Text style={styles.tagline}>Camera walkthrough → AI spatial → calibrate → bid.</Text>
        <Text style={styles.meta}>
          {tenantName || 'Tenant'} · {user?.email}
        </Text>
        <Text style={styles.meta}>{apiNote}</Text>
        {openaiReady === false ? (
          <Text style={styles.warnBanner}>
            No OPENAI_API_KEY — live camera scan will fail until the API key is set. Mock is under
            Advanced.
          </Text>
        ) : null}
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
      <Text style={styles.stepHint}>Guided multi-frame capture (camera primary)</Text>

      <View style={styles.guideCard}>
        <Text style={styles.guideTitle}>{guide.title}</Text>
        <Text style={styles.guideHint}>{guide.hint}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.calibHint}>
          {imageUris.length}/12 frames
          {videoUri ? ' · video attached' : ''} · progress toward 3 guided shots
        </Text>
      </View>

      <Pressable
        style={[styles.primaryBtn, busy && styles.disabled]}
        disabled={busy}
        onPress={captureCamera}
      >
        <Text style={styles.primaryBtnText}>Capture with camera</Text>
      </Pressable>

      <View style={styles.captureRow}>
        <Pressable style={styles.secondaryBtn} onPress={() => pickFromLibrary(true)}>
          <Text style={styles.secondaryBtnText}>Add from library</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={pickVideo}>
          <Text style={styles.secondaryBtnText}>
            {videoUri ? 'Change video' : 'Optional video'}
          </Text>
        </Pressable>
      </View>

      {imageUris.length ? (
        <ScrollView horizontal style={styles.previewRow}>
          {imageUris.map((uri) => (
            <Image key={uri} source={{ uri }} style={styles.previewThumb} />
          ))}
        </ScrollView>
      ) : null}
      {(imageUris.length > 0 || videoUri) && (
        <Pressable
          onPress={() => {
            setImageUris([]);
            setVideoUri(null);
            setGuideIdx(0);
          }}
        >
          <Text style={styles.clearMedia}>Clear media · reset guide</Text>
        </Pressable>
      )}

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

      <Pressable
        style={[
          styles.primaryBtn,
          (busy || mockEnabled || imageUris.length === 0) && styles.disabled,
        ]}
        disabled={busy || mockEnabled || imageUris.length === 0}
        onPress={() => runScan(false)}
      >
        {busy && !mockEnabled ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {imageUris.length
              ? `AI scan ${imageUris.length} frame(s) → Calibrate`
              : 'Capture frames to run live AI scan'}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setShowAdvanced((v) => !v)}>
        <Text style={styles.advToggle}>
          {showAdvanced ? 'Hide' : 'Show'} Advanced / dev (mock)
        </Text>
      </Pressable>
      {showAdvanced ? (
        <View style={styles.advBox}>
          <View style={styles.switchRow}>
            <Text style={styles.advLabel}>Mock spatial extract (no camera / no GPT-4o)</Text>
            <Switch
              value={mockEnabled}
              onValueChange={setMockEnabled}
              trackColor={{ true: '#99f6e4', false: '#cbd5e1' }}
              thumbColor={mockEnabled ? '#0f766e' : '#f8fafc'}
            />
          </View>
          <Pressable
            style={[styles.outlineBtn, (!mockEnabled || busy) && styles.disabled]}
            disabled={!mockEnabled || busy}
            onPress={() => runScan(true)}
          >
            <Text style={styles.outlineBtnText}>Run mock scan → Calibrate</Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Live path needs device camera frames + OPENAI_API_KEY. Multi-frame images fuse in GPT-4o;
        optional video is coverage metadata. Bid math uses Decimal only after you commit on
        Calibrate.
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
  warnBanner: {
    marginTop: 10,
    color: '#fef3c7',
    fontSize: 12,
    lineHeight: 17,
    backgroundColor: 'rgba(180,83,9,0.35)',
    padding: 8,
    borderRadius: 4,
  },
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
  guideCard: {
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#99f6e4',
    borderRadius: 4,
    padding: 14,
    marginBottom: 4,
  },
  guideTitle: { fontSize: 16, fontWeight: '700', color: '#134e4a' },
  guideHint: { marginTop: 6, color: '#475569', fontSize: 13, lineHeight: 18 },
  progressTrack: {
    marginTop: 12,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: '#0f766e' },
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
  calibHint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 8 },
  captureRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
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
    marginTop: 12,
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
  advToggle: {
    marginTop: 16,
    color: '#64748b',
    fontWeight: '700',
    fontSize: 13,
  },
  advBox: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  advLabel: { flex: 1, color: '#475569', fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.6 },
  footnote: { marginTop: 16, color: '#64748b', fontSize: 12, lineHeight: 18 },
});
