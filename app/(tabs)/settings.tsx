import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser, signOut } from '@/lib/supabase';
import { getNickname, setNickname } from '@/lib/cache';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { FontSizeKey } from '@/lib/cache';
import { upsertMyNickname, upsertExpoPushToken } from '@/services/profileService';
import { getExpoPushTokenAsync } from '@/lib/expoPushToken';
import { clearOnboardingDone } from '@/components/OnboardingModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  setupNotificationHandler,
  getStoredReminderTime,
  setStoredReminderTime,
  requestReminderPermission,
  scheduleDailyReminder,
  cancelAllReminders,
  type ReminderTime,
} from '@/lib/reminderNotifications';

const NICKNAME_MAX_LENGTH = 10;
const KEY_NOTIFICATIONS_ENABLED = '@bible_crew_notifications_enabled';

const REMINDER_PRESETS: { label: string; hour: number; minute: number }[] = [
  { label: '오전 7시', hour: 7, minute: 0 },
  { label: '낮 12시', hour: 12, minute: 0 },
  { label: '오후 6시', hour: 18, minute: 0 },
  { label: '오후 8시', hour: 20, minute: 0 },
  { label: '오후 9시', hour: 21, minute: 0 },
];

async function getNotificationsEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_NOTIFICATIONS_ENABLED);
    return v !== 'false';
  } catch {
    return true;
  }
}

async function setNotificationsEnabled(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_NOTIFICATIONS_ENABLED, value ? 'true' : 'false');
  } catch {}
}
const APP_VERSION = require('../../app.json').expo.version;

const FONT_SIZE_OPTIONS: { key: FontSizeKey; label: string }[] = [
  { key: 'small', label: '작게' },
  { key: 'medium', label: '보통' },
  { key: 'large', label: '크게' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, isDarkMode, setDarkMode } = useTheme();
  const { fontScale, fontSizeKey, setFontSizeKey } = useFontScale();
  const [email, setEmail] = useState<string | null>(null);
  const [nickname, setNicknameState] = useState<string>('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [reminderTime, setReminderTimeState] = useState<ReminderTime>({ hour: 20, minute: 0 });
  const [reminderPresetModal, setReminderPresetModal] = useState(false);

  const s = (n: number) => Math.round(n * fontScale);

  const formatReminderTime = (h: number, m: number) => {
    if (h < 12) return `오전 ${h}시 ${m ? `${m}분` : ''}`.trim();
    if (h === 12) return `낮 12시 ${m ? `${m}분` : ''}`.trim();
    return `오후 ${h - 12}시 ${m ? `${m}분` : ''}`.trim();
  };

  useEffect(() => {
    setupNotificationHandler();
    (async () => {
      const enabled = await getNotificationsEnabled();
      setNotificationsEnabledState(enabled);
      const time = await getStoredReminderTime();
      setReminderTimeState(time);
      if (enabled) {
        const granted = await requestReminderPermission();
        if (granted) {
          await scheduleDailyReminder(time.hour, time.minute);
          const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
          if (user?.id) {
            const token = await getExpoPushTokenAsync();
            if (token) await upsertExpoPushToken(user.id, token, (await getNickname()) ?? undefined).catch(() => {});
          }
        }
      }
    })();
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setEmail(u?.email ?? null))
      .catch(() => setEmail(null));
    getNickname()
      .then((n) => {
        setNicknameState(n ?? '');
        return n?.trim();
      })
      .then(async (nick) => {
        if (!nick) return;
        const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
        if (user?.id) await upsertMyNickname(user.id, nick).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  const startEditNickname = () => {
    setNicknameInput(nickname);
    setEditingNickname(true);
  };

  const saveNickname = async () => {
    const value = nicknameInput.trim().slice(0, NICKNAME_MAX_LENGTH);
    if (!value) {
      setEditingNickname(false);
      return;
    }
    setSavingNickname(true);
    try {
      await setNickname(value);
      setNicknameState(value);
      const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
      if (user?.id) {
        await upsertMyNickname(user.id, value);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '닉네임 저장에 실패했어요.');
    }
    setEditingNickname(false);
    setSavingNickname(false);
  };

  const cancelEditNickname = () => {
    setEditingNickname(false);
    setNicknameInput('');
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '로그아웃 할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            setEmail(null);
          } catch (e) {
            console.error(e);
            Alert.alert('오류', '로그아웃에 실패했어요.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.loadingText, { fontSize: s(15), color: theme.textSecondary }]}>불러오는 중이에요 ✨</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>계정</Text>
        <View style={[styles.card, { backgroundColor: theme.card }]}>   
          <TouchableOpacity style={[styles.row, { borderBottomColor: theme.border }]} onPress={startEditNickname} activeOpacity={0.7}>
            <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>닉네임</Text>
            <View style={styles.nicknameValueRow}>
              <Text style={[styles.nicknameValueText, { color: theme.text, fontSize: s(15) }]} numberOfLines={1}>
                {nickname || '설정하기'}
              </Text>
              <Text style={[styles.rowChevron, { fontSize: s(18), color: theme.textSecondary }]}>›</Text>
            </View>
          </TouchableOpacity>
          {editingNickname && (
            <View style={[styles.nicknameEditRow, { borderBottomColor: theme.border }]}>
              <TextInput
                style={[styles.nicknameInput, { fontSize: s(16), backgroundColor: theme.bgSecondary, color: theme.text }]}
                value={nicknameInput}
                onChangeText={setNicknameInput}
                placeholder="닉네임 입력"
                placeholderTextColor={theme.textSecondary}
                maxLength={NICKNAME_MAX_LENGTH}
                autoFocus
              />
              <View style={styles.nicknameEditButtons}>
                <TouchableOpacity style={styles.nicknameCancelBtn} onPress={cancelEditNickname}>
                  <Text style={[styles.nicknameCancelText, { fontSize: s(15), color: theme.textSecondary }]}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.nicknameSaveBtn, savingNickname && styles.nicknameSaveDisabled]}
                  onPress={saveNickname}
                  disabled={savingNickname}
                >
                  <Text style={[styles.nicknameSaveText, { fontSize: s(15) }]}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24, fontSize: s(13), color: theme.textSecondary }]}>앱</Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>알림</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={async (v) => {
              setNotificationsEnabledState(v);
              await setNotificationsEnabled(v);
              if (v) {
                const granted = await requestReminderPermission();
                if (granted) {
                  await scheduleDailyReminder(reminderTime.hour, reminderTime.minute);
                  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
                  if (user?.id) {
                    const token = await getExpoPushTokenAsync();
                    if (token) await upsertExpoPushToken(user.id, token, nickname || undefined).catch(() => {});
                  }
                }
              } else {
                await cancelAllReminders();
              }
            }}
            trackColor={{ false: theme.bgSecondary, true: theme.primary }}
            thumbColor="#FFF"
          />
        </View>
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <TouchableOpacity
            style={styles.rowInner}
            onPress={() => notificationsEnabled && setReminderPresetModal(true)}
            disabled={!notificationsEnabled}
          >
            <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>리마인드 시간</Text>
            <Text style={[styles.rowValue, { color: notificationsEnabled ? theme.text : theme.textSecondary, fontSize: s(15) }]}>
              {formatReminderTime(reminderTime.hour, reminderTime.minute)}
            </Text>
          </TouchableOpacity>
        </View>
        {reminderPresetModal && (
          <View style={[styles.presetModal, { backgroundColor: theme.card }]}>
            <Text style={[styles.presetTitle, { color: theme.text, fontSize: s(15) }]}>알림 받을 시간</Text>
            {REMINDER_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={[styles.presetItem, { borderBottomColor: theme.border }]}
                onPress={async () => {
                  setReminderTimeState({ hour: p.hour, minute: p.minute });
                  await setStoredReminderTime({ hour: p.hour, minute: p.minute });
                  if (notificationsEnabled) await scheduleDailyReminder(p.hour, p.minute);
                  setReminderPresetModal(false);
                }}
              >
                <Text style={[styles.presetItemText, { color: theme.text, fontSize: s(15) }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.presetCancel} onPress={() => setReminderPresetModal(false)}>
              <Text style={[styles.presetCancelText, { color: theme.textSecondary, fontSize: s(15) }]}>취소</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>다크 모드</Text>
          <Switch
            value={isDarkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: theme.bgSecondary, true: theme.primary }}
            thumbColor="#FFF"
          />
        </View>
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>글자 크기</Text>
          <View style={styles.fontSizeOptions}>
            {FONT_SIZE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  styles.fontSizeChip,
                  { backgroundColor: fontSizeKey === opt.key ? theme.primary : theme.bgSecondary },
                ]}
                onPress={() => setFontSizeKey(opt.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.fontSizeChipText,
                    { fontSize: s(14), color: fontSizeKey === opt.key ? '#FFF' : theme.textSecondary },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={[styles.row, styles.rowLast, { borderBottomColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>버전</Text>
          <Text style={[styles.rowValue, { color: theme.text, fontSize: s(15) }]}>{APP_VERSION}</Text>
        </View>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: lightTheme.textSecondary },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  rowInner: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetModal: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: lightTheme.border,
  },
  presetTitle: { marginBottom: 12, fontWeight: '600' },
  presetItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  presetItemText: { fontWeight: '500' },
  presetCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  presetCancelText: {},
  cardHint: { paddingHorizontal: 4, paddingBottom: 8 },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, color: lightTheme.textSecondary },
  rowValue: { fontSize: 15, fontWeight: '500', maxWidth: '55%' },
  rowChevron: { fontSize: 18, color: lightTheme.textSecondary, marginLeft: 4 },
  nicknameValueRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  nicknameValueText: { fontSize: 15, fontWeight: '500', flexShrink: 0 },
  nicknameEditRow: { paddingVertical: 12, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: lightTheme.border },
  nicknameInput: {
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: lightTheme.text,
    marginBottom: 10,
  },
  nicknameEditButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  nicknameCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, marginRight: 8 },
  nicknameCancelText: { fontSize: 15, color: lightTheme.textSecondary },
  nicknameSaveBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: lightTheme.primary, borderRadius: 12 },
  nicknameSaveDisabled: { opacity: 0.6 },
  nicknameSaveText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  logoutButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  logoutButtonText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  anonHint: {
    fontSize: 13,
    color: lightTheme.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  fontSizeOptions: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: 8 },
  fontSizeChip: {
    marginRight: 8,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  fontSizeChipText: { fontWeight: '600' },
});
