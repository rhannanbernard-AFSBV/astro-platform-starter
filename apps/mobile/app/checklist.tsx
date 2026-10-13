import { useCallback, useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { FlowStepper } from '../src/components/FlowStepper';
import { useBid } from '../src/state/BidContext';
import {
  logGps,
  registerPushToken,
  setGeofenceFromAddress,
  uploadQaPhoto,
} from '../src/api/client';
import { getCrewPosition, geocodeAddress } from '../src/location';
import {
  enqueueOfflineEvent,
  flushOfflineQueue,
  pendingCount,
} from '../src/offline/queue';

export default function ChecklistScreen() {
  const { scan } = useBid();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [qaDone, setQaDone] = useState<Record<number, boolean>>({});
  const [completed, setCompleted] = useState<Record<number, boolean>>({});
  const [clockedIn, setClockedIn] = useState(false);
  const [offlinePending, setOfflinePending] = useState(0);
  const [netHint, setNetHint] = useState('');

  const refreshPending = useCallback(async () => {
    setOfflinePending(await pendingCount());
  }, []);

  useEffect(() => {
    if (!scan) return;
    refreshPending();
    const unsub = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setNetHint(online ? '' : 'Offline — queue will auto-flush on reconnect');
      if (online) {
        flushOfflineQueue()
          .then(() => refreshPending())
          .catch(() => undefined);
      }
    });
    return () => unsub();
  }, [scan, refreshPending]);

  const run = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      setBusyId(key);
      try {
        await fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed';
        if (Platform.OS === 'web') window.alert(message);
        else Alert.alert('Error', message);
      } finally {
        setBusyId(null);
      }
    },
    []
  );

  if (!scan) return <Redirect href="/" />;

  async function pickQaPhoto(): Promise<string | null> {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.granted) {
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!shot.canceled && shot.assets[0]) return shot.assets[0].uri;
    }
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      throw new Error('Camera or photo library permission required for QA');
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets[0]) return null;
    return picked.assets[0].uri;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlowStepper active="checklist" />
      <Text style={styles.h1}>Crew checklist</Text>
      <Text style={styles.sub}>
        Clock in (site geofence from address) → camera QA high-risk → complete rooms.
      </Text>
      {netHint ? <Text style={styles.net}>{netHint}</Text> : null}

      <View style={styles.opsRow}>
        <Pressable
          style={styles.opsBtn}
          disabled={!!busyId}
          onPress={() =>
            run('clock', async () => {
              const pos = await getCrewPosition();
              if (!clockedIn) {
                // Prefer property address / map geocode — not "current GPS as site"
                const address = (scan.property_address || '').trim();
                if (!address) {
                  throw new Error(
                    'Property address missing on bid — re-scan with an address to set site geofence'
                  );
                }
                let set = false;
                try {
                  const local = await geocodeAddress(address);
                  if (local) {
                    await setGeofenceFromAddress(scan.bid_id, {
                      address,
                      center_lat: local.latitude,
                      center_lng: local.longitude,
                      radius_m: 200,
                      label: address,
                    });
                    set = true;
                  }
                } catch {
                  /* fall through to API geocoder */
                }
                if (!set) {
                  await setGeofenceFromAddress(scan.bid_id, {
                    address,
                    radius_m: 200,
                    label: address,
                  });
                }
                await logGps(scan.bid_id, {
                  event_type: 'clock_in',
                  latitude: pos.latitude,
                  longitude: pos.longitude,
                  accuracy_m: pos.accuracy,
                });
                try {
                  await registerPushToken(
                    `stub-expo-${scan.bid_id}-${Date.now()}`,
                    'expo'
                  );
                } catch {
                  /* push stub optional */
                }
                setClockedIn(true);
              } else {
                await logGps(scan.bid_id, {
                  event_type: 'clock_out',
                  latitude: pos.latitude,
                  longitude: pos.longitude,
                  accuracy_m: pos.accuracy,
                });
                setClockedIn(false);
              }
            })
          }
        >
          {busyId === 'clock' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.opsBtnText}>
              {clockedIn ? 'GPS clock-out' : 'GPS clock-in + site geofence'}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.opsBtn, { backgroundColor: '#334155', marginTop: 8 }]}
          disabled={!!busyId}
          onPress={() =>
            run('sync', async () => {
              const result = await flushOfflineQueue();
              await refreshPending();
              if (Platform.OS === 'web') {
                window.alert(
                  `Synced ${result.synced}, remaining ${result.remaining}`
                );
              } else {
                Alert.alert(
                  'Offline sync',
                  `Synced ${result.synced}, remaining ${result.remaining}`
                );
              }
            })
          }
        >
          {busyId === 'sync' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.opsBtnText}>
              Sync offline queue ({offlinePending})
            </Text>
          )}
        </Pressable>
      </View>

      {scan.crew_checklist.map((zone, idx) => {
        const cid = zone.checklist_id;
        return (
          <View
            key={`${zone.room_zone}-${idx}`}
            style={[styles.card, zone.is_high_risk && styles.riskCard]}
          >
            <View style={styles.row}>
              <Text style={styles.seq}>{zone.sequence ?? idx + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.zone}>{zone.room_zone}</Text>
                {zone.is_high_risk ? (
                  <Text style={styles.badge}>HIGH RISK · PHOTO QA REQUIRED</Text>
                ) : null}
                {cid && qaDone[cid] ? (
                  <Text style={styles.ok}>QA photo verified</Text>
                ) : null}
                {cid && completed[cid] ? (
                  <Text style={styles.ok}>Room completed (GPS logged)</Text>
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

            <View style={styles.zoneActions}>
              {zone.is_high_risk && cid ? (
                <Pressable
                  style={styles.smallBtn}
                  disabled={!!busyId}
                  onPress={() =>
                    run(`qa-${cid}`, async () => {
                      const uri = await pickQaPhoto();
                      if (!uri) return;
                      await uploadQaPhoto(
                        scan.bid_id,
                        cid,
                        uri,
                        zone.ai_audit_prompt || undefined
                      );
                      setQaDone((s) => ({ ...s, [cid]: true }));
                    })
                  }
                >
                  {busyId === `qa-${cid}` ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.smallBtnText}>Camera QA photo</Text>
                  )}
                </Pressable>
              ) : null}
              {cid ? (
                <>
                  <Pressable
                    style={[styles.smallBtn, styles.smallBtnAlt]}
                    disabled={!!busyId}
                    onPress={() =>
                      run(`done-${cid}`, async () => {
                        if (zone.is_high_risk && !qaDone[cid]) {
                          throw new Error(
                            'Upload AI photo QA before completing this high-risk zone'
                          );
                        }
                        const pos = await getCrewPosition();
                        await logGps(scan.bid_id, {
                          event_type: 'room_complete',
                          checklist_id: cid,
                          latitude: pos.latitude,
                          longitude: pos.longitude,
                          accuracy_m: pos.accuracy,
                        });
                        setCompleted((s) => ({ ...s, [cid]: true }));
                      })
                    }
                  >
                    {busyId === `done-${cid}` ? (
                      <ActivityIndicator color="#0f766e" size="small" />
                    ) : (
                      <Text style={styles.smallBtnAltText}>Complete + GPS</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={[styles.smallBtn, styles.smallBtnAlt]}
                    disabled={!!busyId}
                    onPress={() =>
                      run(`off-${cid}`, async () => {
                        if (zone.is_high_risk && !qaDone[cid]) {
                          throw new Error(
                            'Upload AI photo QA before queuing offline complete for high-risk zones'
                          );
                        }
                        const pos = await getCrewPosition();
                        await enqueueOfflineEvent(scan.bid_id, {
                          event_type: 'room_complete',
                          checklist_id: cid,
                          latitude: pos.latitude,
                          longitude: pos.longitude,
                          accuracy_m: pos.accuracy,
                          notes: 'queued offline',
                        });
                        await refreshPending();
                        setCompleted((s) => ({ ...s, [cid]: true }));
                      })
                    }
                  >
                    <Text style={styles.smallBtnAltText}>Complete offline</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        );
      })}

      <Pressable style={styles.btn} onPress={() => router.push('/proposal')}>
        <Text style={styles.btnText}>Next · Proposal & portal</Text>
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
  sub: { marginTop: 6, marginBottom: 8, color: '#64748b', lineHeight: 20 },
  net: {
    marginBottom: 12,
    color: '#b45309',
    fontWeight: '600',
    fontSize: 13,
  },
  opsRow: { marginBottom: 12 },
  opsBtn: {
    backgroundColor: '#134e4a',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  opsBtnText: { color: '#ecfdf5', fontWeight: '600' },
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
  ok: { marginTop: 2, color: '#0f766e', fontSize: 12, fontWeight: '600' },
  task: { color: '#334155', marginBottom: 3, paddingLeft: 4 },
  audit: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#0f172a',
    borderRadius: 4,
  },
  auditLabel: { color: '#5eead4', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  auditText: { color: '#e2e8f0', fontSize: 13, lineHeight: 18 },
  zoneActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  smallBtn: {
    backgroundColor: '#0f766e',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  smallBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  smallBtnAlt: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#0f766e',
  },
  smallBtnAltText: { color: '#0f766e', fontWeight: '600', fontSize: 13 },
  btn: {
    marginTop: 12,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
