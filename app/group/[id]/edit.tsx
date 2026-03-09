import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupById, updateGroup } from '@/services/groupService';
import { getLocalGroupById, updateLocalGroup, isLocalUserId } from '@/lib/cache';
import { getGroupDescription, setGroupDescription } from '@/lib/groupDescriptionStorage';
import { BIBLE_BOOKS, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/constants/bibleBooks';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh } from '@/contexts/DataRefreshContext';
import type { ReadingGroupRow } from '@/types/database';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const { invalidate } = useDataRefresh();
  const s = (n: number) => Math.round(n * fontScale);

  const [group, setGroup] = useState<ReadingGroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [startBook, setStartBook] = useState('');
  const [showBookList, setShowBookList] = useState(false);
  const [pagesPerDay, setPagesPerDay] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const isLocal = typeof id === 'string' && (id.startsWith('local_') || isLocalUserId(id));
        const data = isLocal ? await getLocalGroupById(id) : await getGroupById(id);
        setGroup(data ?? null);
        if (data) {
          setTitle(data.title);
          setStartBook(data.start_book);
          setPagesPerDay(String(data.pages_per_day));
          setDurationDays(String(data.duration_days));
          const desc = await getGroupDescription(data.id);
          setDescription(desc);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSave = async () => {
    if (!group) return;
    const book = BIBLE_BOOKS.find((b) => b.nameKo === startBook.trim() || b.id === startBook.trim());
    if (!book) {
      Alert.alert('알림', '올바른 성경 책 이름을 선택해 주세요. (예: 창세기)');
      return;
    }
    const pages = parseInt(pagesPerDay, 10);
    const days = parseInt(durationDays, 10);
    if (isNaN(pages) || pages < 1 || pages > 50) {
      Alert.alert('알림', '하루 분량은 1~50 장으로 입력해 주세요.');
      return;
    }
    if (isNaN(days) || days < 1 || days > 365) {
      Alert.alert('알림', '기간은 1~365 일로 입력해 주세요.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('알림', '모임 이름을 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      const isLocal = group.id.startsWith('local_') || isLocalUserId(group.id);
      const input = {
        title: title.trim(),
        startBook: book.nameKo,
        pagesPerDay: pages,
        durationDays: days,
      };
      if (isLocal) {
        await updateLocalGroup(group.id, input);
        await setGroupDescription(group.id, description.trim());
      } else {
        await updateGroup(group.id, { ...input, description: description.trim() || undefined });
        // 로컬에도 저장 (fallback)
        await setGroupDescription(group.id, description.trim());
      }
      invalidate();
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '수정에 실패했어요.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { fontSize: s(15), color: theme.textSecondary }]}>불러오는 중이에요</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorText, { fontSize: s(16), color: theme.textSecondary }]}>모임을 찾을 수 없어요</Text>
        <TouchableOpacity style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.back()}>
          <Text style={{ fontSize: s(15), color: theme.primary }}>뒤로</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancelText, { fontSize: s(16), color: theme.textSecondary }]}>취소</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: s(18), color: theme.text }]}>모임 수정</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>모임 이름</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
          value={title}
          onChangeText={setTitle}
          placeholder="예: 창세기 함께 읽기"
          placeholderTextColor={theme.textSecondary}
        />
        <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>시작 책</Text>
        <TouchableOpacity style={[styles.input, { backgroundColor: theme.card }]} onPress={() => setShowBookList(true)}>
          <Text style={[startBook ? styles.inputText : styles.inputPlaceholder, { color: startBook ? theme.text : theme.textSecondary, fontSize: s(16) }]}>
            {startBook || '선택 (예: 창세기)'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>하루 분량 (장)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
          value={pagesPerDay}
          onChangeText={setPagesPerDay}
          placeholder="3"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
        />
        <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>기간 (일)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
          value={durationDays}
          onChangeText={setDurationDays}
          placeholder="30"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
        />
        {(() => {
          const days = parseInt(durationDays, 10);
          if (!isNaN(days) && days >= 1 && days <= 365) {
            const start = new Date();
            const end = new Date();
            end.setDate(end.getDate() + days - 1);
            const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
            return (
              <Text style={[styles.hint, { color: theme.textSecondary, fontSize: s(13) }]}>
                오늘부터 1일차 · 예: {fmt(start)} ~ {fmt(end)}
              </Text>
            );
          }
          return null;
        })()}
        <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>모임 설명 / 규칙 (선택)</Text>
        <TextInput
          style={[styles.input, styles.descriptionInput, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
          value={description}
          onChangeText={setDescription}
          placeholder="예: 매일 아침 9시에 인증해요, 스포 금지 등"
          placeholderTextColor={theme.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <TouchableOpacity style={[styles.submitButton, { backgroundColor: theme.primary }, saving && styles.submitDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.submitButtonText, { fontSize: s(16) }]}>저장</Text>}
        </TouchableOpacity>
      </ScrollView>

      {showBookList && (
        <Modal visible animationType="slide">
          <View style={[styles.bookListHeader, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12), paddingBottom: 12 }]}>
            <Text style={[styles.bookListTitle, { color: theme.text, fontSize: s(18) }]}>시작 책 선택 📖</Text>
            <TouchableOpacity onPress={() => setShowBookList(false)}>
              <Text style={[styles.cancelText, { fontSize: s(16) }]}>완료</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={[styles.bookList, { backgroundColor: theme.card }]}>
            <View style={styles.bookSectionHeader}>
              <Text style={[styles.bookSectionTitle, { color: theme.textSecondary, fontSize: s(13) }]}>구약 (39권)</Text>
            </View>
            {OLD_TESTAMENT_BOOKS.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.bookRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  setStartBook(b.nameKo);
                  setShowBookList(false);
                }}
              >
                <Text style={[styles.bookRowText, { color: theme.text, fontSize: s(16) }]}>{b.nameKo}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.bookSectionHeader}>
              <Text style={[styles.bookSectionTitle, { color: theme.textSecondary, fontSize: s(13) }]}>신약 (27권)</Text>
            </View>
            {NEW_TESTAMENT_BOOKS.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.bookRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  setStartBook(b.nameKo);
                  setShowBookList(false);
                }}
              >
                <Text style={[styles.bookRowText, { color: theme.text, fontSize: s(16) }]}>{b.nameKo}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12 },
  errorText: {},
  backBtn: { padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  cancelText: { color: lightTheme.textSecondary },
  headerTitle: { fontWeight: '700' },
  scroll: { flex: 1 },
  formContent: { padding: 20, paddingBottom: 40 },
  label: { fontWeight: '600', marginBottom: 6 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  inputText: {},
  inputPlaceholder: {},
  hint: { marginBottom: 16 },
  descriptionInput: { minHeight: 100 },
  submitButton: { paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 8 },
  submitDisabled: { opacity: 0.7 },
  submitButtonText: { color: '#FFF', fontWeight: '600' },
  bookListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1 },
  bookListTitle: { fontWeight: '700' },
  bookList: { flex: 1 },
  bookSectionHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  bookSectionTitle: { fontWeight: '600' },
  bookRow: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  bookRowText: {},
});
