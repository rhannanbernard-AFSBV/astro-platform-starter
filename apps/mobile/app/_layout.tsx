import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BidProvider } from '../src/state/BidContext';
import { AuthProvider } from '../src/state/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <BidProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#0f766e' },
            headerTintColor: '#f8fafc',
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: '#f1f5f9' },
          }}
        >
          <Stack.Screen name="login" options={{ title: 'Sign in', headerShown: false }} />
          <Stack.Screen name="index" options={{ title: 'OmniClean Scanner' }} />
          <Stack.Screen name="calibrate" options={{ title: 'Calibrate bid' }} />
          <Stack.Screen name="ledger" options={{ title: 'Bid Ledger' }} />
          <Stack.Screen name="checklist" options={{ title: 'Crew Checklist' }} />
          <Stack.Screen name="proposal" options={{ title: 'Proposal Draft' }} />
          <Stack.Screen name="admin" options={{ title: 'Tenant Admin' }} />
          <Stack.Screen name="history" options={{ title: 'Bid History' }} />
          <Stack.Screen name="tenants" options={{ title: 'Switch Tenant' }} />
          <Stack.Screen name="sign/[token]" options={{ title: 'E-sign proposal' }} />
        </Stack>
      </BidProvider>
    </AuthProvider>
  );
}
