import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BidProvider } from '../src/state/BidContext';

export default function RootLayout() {
  return (
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
        <Stack.Screen name="index" options={{ title: 'OmniClean Scanner' }} />
        <Stack.Screen name="ledger" options={{ title: 'Bid Ledger' }} />
        <Stack.Screen name="checklist" options={{ title: 'Crew Checklist' }} />
        <Stack.Screen name="proposal" options={{ title: 'Proposal Draft' }} />
      </Stack>
    </BidProvider>
  );
}
