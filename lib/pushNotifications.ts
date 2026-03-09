import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { upsertExpoPushToken } from '@/services/profileService';
import { getNickname } from './cache';


const PROJECT_ID =
  (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? '';

/** 앱 시작 시 호출 — Expo Push Token을 발급받아 DB에 저장 */
export async function registerPushToken(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return;

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return; // 알림 권한 없으면 skip (settings에서 요청)

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
    if (!token) return;

    const nickname = await getNickname();
    await upsertExpoPushToken(user.id, token, nickname ?? undefined);
  } catch {
    // 시뮬레이터 또는 권한 없으면 조용히 무시
  }
}

