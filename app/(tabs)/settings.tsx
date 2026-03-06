import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { ensureAnonymousUser, getCurrentUser, signOut } from '@/lib/supabase';
import { getNickname, setNickname } from '@/lib/cache';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { FontSizeKey } from '@/lib/cache';
import { upsertMyNickname } from '@/services/profileService';

const NICKNAME_MAX_LENGTH = 10;

const FONT_SIZE_OPTIONS: { key: FontSizeKey; label: string }[] = [
  { key: 'small', label: '작게' },
  { key: 'medium', label: '보통' },
  { key: 'large', label: '크게' },
];

export default function SettingsScreen() {
  const { theme, isDarkMode, setDarkMode } = useTheme();
  const { fontScale, fontSizeKey, setFontSizeKey } = useFontScale();
  const [email, setEmail] = useState<string | null>(null);
  const [nickname, setNicknameState] = useState<string>('');
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [loading, setLoading] = useState(true);

  const s = (n: number) => Math.round(n * fontScale);

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
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>상태</Text>
            <Text style={[styles.rowValue, { color: theme.text, fontSize: s(15) }]} numberOfLines={1}>
              {email ? email : '바이블 크루와 함께 읽는 중 ✨'}
            </Text>
          </View>
          {email ? (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
            <Text style={[styles.logoutButtonText, { fontSize: s(15) }]}>로그아웃</Text>
          </TouchableOpacity>
          ) : (
            <Text style={[styles.anonHint, { fontSize: s(13), color: theme.textSecondary }]}>로그인 없이도 모임 만들기·참여·읽기 기록이 가능해요.</Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 24, fontSize: s(13), color: theme.textSecondary }]}>앱</Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
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
        <View style={[styles.row, { borderBottomColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>앱 이름</Text>
          <Text style={[styles.rowValue, { color: theme.text, fontSize: s(15) }]} numberOfLines={1}>바이블 크루 📖</Text>
        </View>
        <View style={[styles.row, styles.rowLast, { borderBottomColor: theme.border }]}>
          <Text style={[styles.rowLabel, { fontSize: s(15), color: theme.textSecondary }]}>버전</Text>
          <Text style={[styles.rowValue, { color: theme.text, fontSize: s(15) }]}>1.0.0</Text>
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
