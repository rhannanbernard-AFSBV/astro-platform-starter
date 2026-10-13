import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useAuth } from '../src/state/AuthContext';
import { API_URL } from '../src/api/client';

export default function LoginScreen() {
  const { ready, token, login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('demo@omniclean.demo');
  const [password, setPassword] = useState('demo1234');
  const [fullName, setFullName] = useState('Demo Estimator');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);

  if (ready && token) return <Redirect href="/" />;

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          companyName: companyName.trim() || undefined,
          tenantId: companyName.trim() ? undefined : '1',
        });
      }
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Auth failed';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Auth failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>OmniClean</Text>
        <Text style={styles.tagline}>Sign in → scan → bid → checklist → portal</Text>
        <Text style={styles.meta}>{API_URL}</Text>
      </View>

      {mode === 'register' ? (
        <>
          <Text style={styles.label}>Full name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />
          <Text style={styles.label}>New company (optional — creates tenant)</Text>
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="Leave blank to join demo tenant 1"
          />
        </>
      ) : null}

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.primaryBtn} disabled={busy} onPress={submit}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        style={styles.switch}
      >
        <Text style={styles.switchText}>
          {mode === 'login'
            ? 'Need an account? Register'
            : 'Have an account? Sign in'}
        </Text>
      </Pressable>

      <Text style={styles.footnote}>
        Demo: demo@omniclean.demo / demo1234 (tenant 1). JWT binds tenant_id —
        spoofing X-Tenant-Id no longer authorizes scans.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  hero: {
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#134e4a',
    borderRadius: 4,
  },
  brand: {
    fontSize: 32,
    color: '#ecfdf5',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
  },
  tagline: { marginTop: 8, color: '#99f6e4', fontSize: 15 },
  meta: { marginTop: 10, color: '#5eead4', fontSize: 12 },
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
  primaryBtn: {
    marginTop: 18,
    backgroundColor: '#0f766e',
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  switch: { marginTop: 16, alignItems: 'center' },
  switchText: { color: '#0f766e', fontWeight: '600' },
  footnote: { marginTop: 20, color: '#64748b', fontSize: 12, lineHeight: 18 },
});
