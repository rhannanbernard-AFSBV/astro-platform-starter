import { Platform } from 'react-native';

export type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

/**
 * Real device GPS only — no silent Philipsburg fallback.
 * Throws with a clear message when permission/GPS unavailable (web included).
 */
export async function getCrewPosition(): Promise<GpsFix> {
  const Location = await import('expo-location');
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) {
    throw new Error(
      'Location permission denied — enable GPS to clock in / complete rooms'
    );
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
  };
}

/** Geocode property address on-device when possible; else null (API fallback). */
export async function geocodeAddress(
  address: string
): Promise<GpsFix | null> {
  if (!address?.trim()) return null;
  try {
    const Location = await import('expo-location');
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const hits = await Location.geocodeAsync(address.trim());
    if (!hits?.length) return null;
    return {
      latitude: hits[0].latitude,
      longitude: hits[0].longitude,
    };
  } catch {
    if (Platform.OS === 'web') return null;
    return null;
  }
}
