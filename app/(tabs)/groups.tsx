import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getMyGroups, createGroup, joinGroup } from '@/services/groupService';
import { getCachedGroups, setCachedGroups, getLocalGroups, getOrCreateLocalUserId, createLocalGroup } from '@/lib/cache';
import { setGroupDescription } from '@/lib/groupDescriptionStorage';
import { GroupListItem } from '@/components/GroupListItem';
import { EmptyState } from '@/components/EmptyState';
import { BIBLE_BOOKS, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/constants/bibleBooks';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ReadingGroupRow } from '@/types/database';

type CreateStep = 'form' | 'share';

export default function GroupsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ReadingGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [createStep, setCreateStep] = useState<CreateStep>('form');
  const [title, setTitle] = useState('');
  const [startBook, setStartBook] = useState('');
  const [showBookList, setShowBookList] = useState(false);
  const [pagesPerDay, setPagesPerDay] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<ReadingGroupRow | null>(null);

  const load = useCallback(async () => {
    try {
      const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
      setUserId(user?.id ?? null);

      if (!user) {
        const localGroups = await getLocalGroups();
        setGroups(localGroups);
        await setCachedGroups(localGroups);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const cached = await getCachedGroups();
      setGroups(cached);
      const list = await getMyGroups(user.id);
      setGroups(list);
      await setCachedGroups(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openCreate = () => {
    setCreateStep('form');
    setTitle('');
    setStartBook('');
    setPagesPerDay('3');
    setDurationDays('30');
    setDescription('');
    setCreatedGroup(null);
    setModalVisible(true);
  };

  const closeCreate = () => {
    setModalVisible(false);
    setShowBookList(false);
    setCreatedGroup(null);
    load();
  };

  const handleCreate = async () => {
    const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
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

    setCreating(true);
    try {
      if (!user) {
        const localUserId = await getOrCreateLocalUserId();
        const group = await createLocalGroup({
          title: title.trim(),
          leaderId: localUserId,
          startBook: book.nameKo,
          pagesPerDay: pages,
          durationDays: days,
        });
        if (description.trim()) await setGroupDescription(group.id, description.trim());
        setCreatedGroup(group);
        setCreateStep('share');
        return;
      }
      const group = await createGroup({
        title: title.trim(),
        leaderId: user.id,
        startBook: book.nameKo,
        pagesPerDay: pages,
        durationDays: days,
      });
      await joinGroup(group.id, user.id);
      if (description.trim()) await setGroupDescription(group.id, description.trim());
      setCreatedGroup(group);
      setCreateStep('share');
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const schemaError = err?.code === 'PGRST205' || (typeof err?.message === 'string' && err.message.includes('schema cache'));
      if (schemaError && user) {
        try {
          const group = await createLocalGroup({
            title: title.trim(),
            leaderId: user.id,
            startBook: book.nameKo,
            pagesPerDay: pages,
            durationDays: days,
          });
          if (description.trim()) await setGroupDescription(group.id, description.trim());
          setCreatedGroup(group);
          setCreateStep('share');
        } catch (localErr) {
          console.error(localErr);
          Alert.alert('오류', '모임 생성에 실패했어요. Supabase에 테이블을 만든 뒤 다시 시도해 주세요.');
        }
      } else {
        console.error(e);
        Alert.alert('오류', e instanceof Error ? e.message : '모임 생성에 실패했어요.');
      }
    } finally {
      setCreating(false);
    }
  };

  const shareInvite = async () => {
    if (!createdGroup) return;
    const url = `https://bible-crew.app/group/${createdGroup.id}`;
    const message = `📖 [바이블 크루] "${createdGroup.title}" 모임에 초대할게요!\n초대 코드: ${createdGroup.invite_code}\n${url}`;
    try {
      await Share.share({ message, title: '모임 초대' });
    } catch {
      // user cancelled
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.loadingText, { fontSize: s(15) }]}>불러오는 중이에요 ✨</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.sectionTitle, { fontSize: s(20) }]}>참여 중인 모임 🌿</Text>
          <TouchableOpacity style={styles.addButton} onPress={openCreate} activeOpacity={0.8}>
            <Text style={[styles.addButtonText, { fontSize: s(14) }]}>+ 새 읽기 모임</Text>
          </TouchableOpacity>
        </View>

        {groups.length === 0 ? (
          <EmptyState
            title="아직 모임이 없어요 🌱"
            subtitle="새 모임을 만들거나 초대 링크로 참여해 보세요!"
            buttonLabel="새 읽기 모임 만들기"
            onPress={openCreate}
          />
        ) : (
          groups.map((group) => (
            <GroupListItem
              key={group.id}
              group={group}
              onPress={() => router.push(`/group/${group.id}`)}
            />
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={closeCreate}>
        <KeyboardAvoidingView
          style={[styles.modalContainer, { backgroundColor: theme.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalHeader, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12), paddingBottom: 12 }]}>
            <TouchableOpacity onPress={closeCreate}>
              <Text style={[styles.modalCancel, { fontSize: s(16) }]}>취소</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { fontSize: s(18) }]}>
              {createStep === 'form' ? '새 읽기 모임 ✨' : '초대 공유'}
            </Text>
            <View style={{ width: 48 }} />
          </View>

          {createStep === 'form' ? (
            <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
              <Text style={[styles.label, { fontSize: s(13) }]}>모임 이름</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
                value={title}
                onChangeText={setTitle}
                placeholder="예: 창세기 함께 읽기"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
              />
              <Text style={[styles.label, { fontSize: s(13) }]}>시작 책</Text>
              <TouchableOpacity
                style={[styles.input, { backgroundColor: theme.card }]}
                onPress={() => setShowBookList(true)}
              >
                <Text style={[startBook ? styles.inputText : styles.inputPlaceholder, { color: startBook ? theme.text : theme.textSecondary, fontSize: s(16) }]}>
                  {startBook || '선택 (예: 창세기)'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.label, { fontSize: s(13) }]}>하루 분량 (장)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
                value={pagesPerDay}
                onChangeText={setPagesPerDay}
                placeholder="3"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
              />
              <Text style={[styles.label, { fontSize: s(13) }]}>기간 (일)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
                value={durationDays}
                onChangeText={setDurationDays}
                placeholder="30"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
              />
              <Text style={[styles.label, { fontSize: s(13) }]}>모임 설명 / 규칙 (선택)</Text>
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
              <TouchableOpacity
                style={[styles.submitButton, creating && styles.submitDisabled]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={[styles.submitButtonText, { fontSize: s(16) }]}>만들기</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.shareContent}>
              {createdGroup && (
                <>
                  <View style={[styles.shareCard, { backgroundColor: theme.card }]}>
                    <Text style={[styles.shareTitle, { color: theme.text, fontSize: s(20) }]}>{createdGroup.title}</Text>
                    <Text style={[styles.shareMeta, { fontSize: s(15) }]}>
                      {createdGroup.start_book} · 하루 {createdGroup.pages_per_day}장 · {createdGroup.duration_days}일
                    </Text>
                    <View style={[styles.inviteCodeBox, { backgroundColor: theme.bgSecondary }]}>
                      <Text style={[styles.inviteCodeLabel, { fontSize: s(12) }]}>초대 코드</Text>
                      <Text style={[styles.inviteCode, { color: theme.text, fontSize: s(24) }]}>{createdGroup.invite_code}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.shareButton} onPress={shareInvite}>
                    <Text style={[styles.shareButtonText, { fontSize: s(16) }]}>초대 링크 공유하기 📤</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.doneButton} onPress={closeCreate}>
                    <Text style={[styles.doneButtonText, { fontSize: s(16) }]}>완료</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </KeyboardAvoidingView>

        {showBookList && (
          <Modal visible animationType="slide">
            <View style={[styles.bookListHeader, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 12), paddingBottom: 12 }]}>
              <Text style={[styles.bookListTitle, { color: theme.text, fontSize: s(18) }]}>시작 책 선택 📖</Text>
              <TouchableOpacity onPress={() => setShowBookList(false)}>
                <Text style={[styles.modalCancel, { fontSize: s(16) }]}>완료</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={[styles.bookList, { backgroundColor: theme.card }]}>
              <View style={styles.bookSectionHeader}>
                <Text style={[styles.bookSectionTitle, { fontSize: s(13) }]}>구약 (39권)</Text>
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
                <Text style={[styles.bookSectionTitle, { fontSize: s(13) }]}>신약 (27권)</Text>
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: lightTheme.textSecondary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: lightTheme.text },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: lightTheme.primary,
    borderRadius: 20,
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  modalCancel: { fontSize: 16, color: lightTheme.textSecondary },
  modalTitle: { fontSize: 18, fontWeight: '700', color: lightTheme.text },
  form: { flex: 1 },
  formContent: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: lightTheme.textSecondary, marginBottom: 6 },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  descriptionInput: {
    minHeight: 100,
    paddingTop: 14,
  },
  inputText: {},
  inputPlaceholder: {},
  submitButton: {
    backgroundColor: lightTheme.primary,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.7 },
  submitButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  shareContent: { flex: 1, padding: 20 },
  shareCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  shareTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  shareMeta: { fontSize: 15, color: lightTheme.textSecondary, marginBottom: 16 },
  inviteCodeBox: {
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  inviteCodeLabel: { fontSize: 12, color: lightTheme.textSecondary, marginBottom: 4 },
  inviteCode: { fontSize: 24, fontWeight: '700', letterSpacing: 2 },
  shareButton: {
    backgroundColor: lightTheme.primary,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  doneButton: { paddingVertical: 16, alignItems: 'center' },
  doneButtonText: { fontSize: 16, color: lightTheme.textSecondary },
  bookListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  bookSectionHeader: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: lightTheme.bg,
  },
  bookSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: lightTheme.textSecondary,
    letterSpacing: 0.5,
  },
  bookListTitle: { fontSize: 18, fontWeight: '700' },
  bookList: { flex: 1 },
  bookRow: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  bookRowText: { fontSize: 16 },
});
