import { useEffect, useState } from 'react';
import {
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../src/state/AuthContext';
import { listTenants } from '../src/api/client';

export default function TenantsScreen() {
  const { ready, token, user, tenantName, switchTenantProfile, logout } =
    useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await listTenants();
        setTenants(res.tenants || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Load failed';
        if (Platform.OS === 'web') window.alert(message);
        else Alert.alert('Tenants', message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (ready && !token) return <Redirect href="/login" />;

  async function onSwitch(tenantId: number) {
    setBusy(tenantId);
    try {
      await switchTenantProfile(tenantId);
      if (Platform.OS === 'web') {
        window.alert('Switched business profile');
      } else {
        Alert.alert('Switched', 'Active tenant updated');
      }
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Switch failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Switch', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.h1}>Business profiles</Text>
      <Text style={styles.sub}>
        Master firm switch · active: {tenantName} (#{user?.tenant_id})
      </Text>
      {loading ? <ActivityIndicator color="#0f766e" /> : null}
      {tenants.map((t) => (
        <Pressable
          key={t.tenant_id}
          style={[
            styles.card,
            Number(t.tenant_id) === Number(user?.tenant_id) && styles.active,
          ]}
          disabled={busy != null}
          onPress={() => onSwitch(Number(t.tenant_id))}
        >
          {busy === Number(t.tenant_id) ? (
            <ActivityIndicator color="#0f766e" />
          ) : (
            <>
              <Text style={styles.name}>
                {t.name}
                {t.is_master ? ' · MASTER' : ''}
              </Text>
              <Text style={styles.meta}>
                Tenant #{t.tenant_id} · {t.jurisdiction_code}
              </Text>
            </>
          )}
        </Pressable>
      ))}
      <Pressable onPress={() => logout()} style={{ marginTop: 20 }}>
        <Text style={{ color: '#64748b' }}>Sign out</Text>
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
  sub: { marginTop: 6, marginBottom: 16, color: '#64748b', lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 14,
    marginBottom: 8,
  },
  active: { borderColor: '#0f766e', backgroundColor: '#ecfdf5' },
  name: { fontWeight: '700', color: '#0f172a' },
  meta: { color: '#64748b', marginTop: 4, fontSize: 12 },
});
