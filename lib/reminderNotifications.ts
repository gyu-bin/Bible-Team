import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_REMINDER_TIME = '@bible_crew_reminder_time';

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
const REMINDER_CHANNEL_ID = 'bible_crew_reminder';

export type ReminderTime = { hour: number; minute: number };

const DEFAULT_REMINDER: ReminderTime = { hour: 20, minute: 0 };

export async function getStoredReminderTime(): Promise<ReminderTime> {
  try {
    const raw = await AsyncStorage.getItem(KEY_REMINDER_TIME);
    if (!raw) return DEFAULT_REMINDER;
    const parsed = JSON.parse(raw) as { hour?: number; minute?: number };
    const hour = typeof parsed.hour === 'number' ? Math.min(23, Math.max(0, parsed.hour)) : DEFAULT_REMINDER.hour;
    const minute = typeof parsed.minute === 'number' ? Math.min(59, Math.max(0, parsed.minute)) : DEFAULT_REMINDER.minute;
    return { hour, minute };
  } catch {
    return DEFAULT_REMINDER;
  }
}

export async function setStoredReminderTime(time: ReminderTime): Promise<void> {
  await AsyncStorage.setItem(KEY_REMINDER_TIME, JSON.stringify({
    hour: Math.min(23, Math.max(0, time.hour)),
    minute: Math.min(59, Math.max(0, time.minute)),
  }));
}

export async function requestReminderPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: '오늘의 읽기 리마인드',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: true,
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '오늘의 읽기',
      body: '오늘도 말씀 읽기 어떠세요?',
      data: { type: 'reminder' },
      channelId: Platform.OS === 'android' ? REMINDER_CHANNEL_ID : undefined,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? REMINDER_CHANNEL_ID : undefined,
    },
  });
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
