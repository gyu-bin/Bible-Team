import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Push Token 발급 (원격 푸시 수신용). 시뮬레이터/Expo Go에서는 제한될 수 있음. */
export async function getExpoPushTokenAsync(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return null;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { eas?: { projectId?: string } }).eas?.projectId;
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token?.data ?? null;
  } catch {
    return null;
  }
}
