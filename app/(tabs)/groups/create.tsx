import { useState } from 'react';
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
  Share,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { createGroup, joinGroup } from '@/services/groupService';
import { setGroupDescription } from '@/lib/groupDescriptionStorage';
import { useDataRefresh } from '@/contexts/DataRefreshContext';
import { BIBLE_BOOKS, OLD_TESTAMENT_BOOKS, NEW_TESTAMENT_BOOKS } from '@/constants/bibleBooks';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ReadingGroupRow } from '@/types/database';

type Step = 'form' | 'share';

/** 한 달 날짜 그리드 (일~토, 주 단위 배열). 각 셀은 Date | null */
function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();
  const flat: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) flat.push(null);
  for (let d = 1; d <= daysInMonth; d++) flat.push(new Date(year, month, d));
  const remainder = flat.length % 7;
  if (remainder) for (let i = 0; i < 7 - remainder; i++) flat.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));
  return rows;
}

export default function GroupCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const { invalidate } = useDataRefresh();
  const s = (n: number) => Math.round(n * fontScale);

  const [step, setStep] = useState<Step>('form');
  const [title, setTitle] = useState('');
  const [startBook, setStartBook] = useState('');
  const [showBookList, setShowBookList] = useState(false);
  const [pagesPerDay, setPagesPerDay] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<ReadingGroupRow | null>(null);

  const handleCreate = async () => {
    const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
    if (!user) {
      Alert.alert(
        '모임 생성 불가',
        '현재 Supabase 익명 로그인이 꺼져 있어요.\n\nSupabase 콘솔에서 Auth → Providers → Anonymous 를 활성화한 뒤 다시 시도해 주세요.'
      );
      return;
    }
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
      const startsAt =
        startDateInput.trim() !== ''
          ? (() => {
              const d = new Date(startDateInput.trim());
              if (Number.isNaN(d.getTime())) return undefined;
              return d.toISOString().slice(0, 10);
            })()
          : undefined;
      const group = await createGroup({
        title: title.trim(),
        leaderId: user.id,
        startBook: book.nameKo,
        pagesPerDay: pages,
        durationDays: days,
        startsAt: startsAt ?? undefined,
        description: description.trim() || null,
      });
      await joinGroup(group.id, user.id);
      // 로컬에도 저장 (오프라인/로컬 모임 대비 fallback)
      if (description.trim()) await setGroupDescription(group.id, description.trim());
      setCreatedGroup(group);
      setStep('share');
      invalidate();
    } catch (e: unknown) {
      console.error(e);
      const msg =
        e && typeof e === 'object' && 'code' in (e as { code?: string }) && (e as { code: string }).code === 'PGRST205'
          ? 'Supabase에 테이블이 아직 없어요.\n\nSQL로 reading_groups / group_members 테이블을 만든 뒤 다시 시도해 주세요.'
          : e instanceof Error
            ? e.message
            : '모임 생성에 실패했어요.';
      Alert.alert('오류', msg);
    } finally {
      setCreating(false);
    }
  };

  const getInviteMessage = (group: ReadingGroupRow) => {
    const url = `https://bible-crew.app/group/${group.id}`;
    return `📖 [바이블 크루] "${group.title}" 모임에 초대할게요!\n초대 코드: ${group.invite_code}\n${url}`;
  };

  const copyInviteAll = () => {
    if (!createdGroup) return;
    const message = getInviteMessage(createdGroup).trim();
    if (!message) return;
    Share.share({ message, title: '모임 초대' }, { dialogTitle: '모임 초대 공유' }).catch((e) => {
      if (e?.message?.includes('cancel') || e?.message?.includes('dismiss')) return;
      Alert.alert('공유 실패', '공유에 실패했어요.');
    });
  };

  const copyInviteCodeOnly = () => {
    if (!createdGroup) return;
    const code = String(createdGroup.invite_code ?? '').trim();
    if (!code) return;
    Share.share({ message: code, title: '초대 코드' }, { dialogTitle: '초대 코드 공유' }).catch((e) => {
      if (e?.message?.includes('cancel') || e?.message?.includes('dismiss')) return;
      Alert.alert('공유 실패', '공유에 실패했어요.');
    });
  };

  const handleDone = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.bg, borderBottomColor: theme.border, paddingTop: 12, paddingBottom: 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSide}>
          <Text style={[styles.headerCancel, { fontSize: s(16), color: theme.textSecondary }]}>취소</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: s(18), color: theme.text }]} numberOfLines={1}>
          {step === 'form' ? '새 읽기 모임 ✨' : '초대 공유'}
        </Text>
        <View style={styles.headerSide} />
      </View>

      {step === 'form' ? (
        <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>모임 이름</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16), borderColor: theme.border }]}
            value={title}
            onChangeText={setTitle}
            placeholder="예: 창세기 함께 읽기"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />
          <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>시작 책</Text>
          <TouchableOpacity style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setShowBookList(true)}>
            <Text style={[startBook ? styles.inputText : styles.inputPlaceholder, { color: startBook ? theme.text : theme.textSecondary, fontSize: s(16) }]}>
              {startBook || '선택 (예: 창세기)'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>하루 분량 (장)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16), borderColor: theme.border }]}
            value={pagesPerDay}
            onChangeText={setPagesPerDay}
            placeholder="3"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
          />
          <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>기간 (일)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.card, color: theme.text, fontSize: s(16), borderColor: theme.border }]}
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
          <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>시작일 (선택)</Text>
          <TouchableOpacity
            style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => {
              if (startDateInput) {
                const d = new Date(startDateInput + 'T12:00:00');
                if (!Number.isNaN(d.getTime())) setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              } else {
                const t = new Date();
                setCalendarMonth(new Date(t.getFullYear(), t.getMonth(), 1));
              }
              setShowStartDatePicker(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[startDateInput ? styles.inputText : styles.inputPlaceholder, { color: startDateInput ? theme.text : theme.textSecondary, fontSize: s(16) }]}>
              {startDateInput ? `${startDateInput.slice(0, 4)}년 ${startDateInput.slice(5, 7)}월 ${startDateInput.slice(8, 10)}일` : '탭해서 날짜 선택 (비우면 오늘부터)'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: theme.textSecondary, fontSize: s(13) }]}>이 날부터 모임이 열려요. 비우면 만든 날부터 바로 시작돼요.</Text>
          <Text style={[styles.label, { fontSize: s(13), color: theme.textSecondary }]}>모임 설명 / 규칙 (선택)</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput, { backgroundColor: theme.card, color: theme.text, fontSize: s(16), borderColor: theme.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="예: 매일 아침 9시에 인증해요, 스포 금지 등"
            placeholderTextColor={theme.textSecondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TouchableOpacity style={[styles.submitButton, creating && styles.submitDisabled, { backgroundColor: theme.primary }]} onPress={handleCreate} disabled={creating}>
            {creating ? <ActivityIndicator color="#FFF" /> : <Text style={[styles.submitButtonText, { fontSize: s(16) }]}>만들기</Text>}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={[styles.shareContent, { padding: 20 }]}>
          {createdGroup && (
            <>
              <View style={[styles.shareCard, { backgroundColor: theme.card }]}>
                <Text style={[styles.shareTitle, { color: theme.text, fontSize: s(20) }]}>{createdGroup.title}</Text>
                <Text style={[styles.shareMeta, { fontSize: s(15), color: theme.textSecondary }]}>
                  {createdGroup.start_book} · 하루 {createdGroup.pages_per_day}장 · {createdGroup.duration_days}일
                </Text>
                <TouchableOpacity style={[styles.inviteCodeBox, { backgroundColor: theme.bgSecondary }]} onPress={copyInviteCodeOnly} activeOpacity={0.8} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={[styles.inviteCodeLabel, { fontSize: s(12), color: theme.textSecondary }]} pointerEvents="none">초대 코드 (탭하면 복사)</Text>
                  <Text style={[styles.inviteCode, { color: theme.text, fontSize: s(24) }]} pointerEvents="none">{createdGroup.invite_code}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.shareButton, { backgroundColor: theme.primary }]} onPress={copyInviteAll} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.shareButtonText, { fontSize: s(16) }]}>초대 코드·링크 복사 📋</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
                <Text style={[styles.doneButtonText, { fontSize: s(16), color: theme.textSecondary }]}>완료</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* 시작 책 선택 모달 */}
      {showBookList && (
        <Modal visible animationType="slide">
          <View style={[styles.bookListHeader, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: 12, paddingBottom: 10 }]}>
            <Text style={[styles.bookListTitle, { color: theme.text, fontSize: s(18) }]}>시작 책 선택 📖</Text>
            <TouchableOpacity onPress={() => setShowBookList(false)}>
              <Text style={[styles.headerCancel, { fontSize: s(16), color: theme.textSecondary }]}>완료</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={[styles.bookList, { backgroundColor: theme.card }]}>
            <View style={[styles.bookSectionHeader, { backgroundColor: theme.bg }]}>
              <Text style={[styles.bookSectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>구약 (39권)</Text>
            </View>
            {OLD_TESTAMENT_BOOKS.map((b) => (
              <TouchableOpacity key={b.id} style={[styles.bookRow, { borderBottomColor: theme.border }]} onPress={() => { setStartBook(b.nameKo); setShowBookList(false); }}>
                <Text style={[styles.bookRowText, { color: theme.text, fontSize: s(16) }]}>{b.nameKo}</Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.bookSectionHeader, { backgroundColor: theme.bg }]}>
              <Text style={[styles.bookSectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>신약 (27권)</Text>
            </View>
            {NEW_TESTAMENT_BOOKS.map((b) => (
              <TouchableOpacity key={b.id} style={[styles.bookRow, { borderBottomColor: theme.border }]} onPress={() => { setStartBook(b.nameKo); setShowBookList(false); }}>
                <Text style={[styles.bookRowText, { color: theme.text, fontSize: s(16) }]}>{b.nameKo}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Modal>
      )}

      {/* 날짜 선택 모달 - 월별 달력 (네이티브 calendar 미사용으로 크래시 방지) */}
      <Modal visible={showStartDatePicker} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.datePickerOverlay} onPress={() => setShowStartDatePicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.datePickerBox, { backgroundColor: theme.card }]}>
            <View style={styles.calendarMonthRow}>
              <TouchableOpacity
                onPress={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                style={styles.calendarNavBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.calendarNavText, { color: theme.primary, fontSize: s(18) }]}>‹</Text>
              </TouchableOpacity>
              <Text style={[styles.calendarMonthTitle, { color: theme.text, fontSize: s(17) }]}>
                {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                style={styles.calendarNavBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={[styles.calendarNavText, { color: theme.primary, fontSize: s(18) }]}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.calendarWeekRow}>
              {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
                <Text key={w} style={[styles.calendarWeekCell, { color: theme.textSecondary, fontSize: s(12) }]}>{w}</Text>
              ))}
            </View>
            {getMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((week, wi) => (
              <View key={wi} style={styles.calendarWeekRow}>
                {week.map((date, di) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isPast = date ? date.getTime() < today.getTime() : true;
                  const iso = date ? date.toISOString().slice(0, 10) : '';
                  const isSelected = !!date && startDateInput === iso;
                  return (
                    <TouchableOpacity
                      key={di}
                      onPress={() => {
                        if (!date || isPast) return;
                        setStartDateInput(iso);
                      }}
                      disabled={isPast}
                      style={[
                        styles.calendarDayCell,
                        { backgroundColor: theme.bgSecondary },
                        isSelected && { backgroundColor: theme.primary },
                        isPast && styles.calendarDayDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          { fontSize: s(14), color: isPast ? theme.textSecondary : theme.text },
                          isSelected && { color: '#FFF' },
                        ]}
                      >
                        {date ? date.getDate() : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <TouchableOpacity style={[styles.datePickerDoneBtn, { backgroundColor: theme.primary }]} onPress={() => setShowStartDatePicker(false)}>
              <Text style={styles.datePickerDoneText}>날짜 선택 완료</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerSide: { width: 64, alignItems: 'flex-start' },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700' },
  headerCancel: {},
  form: { flex: 1 },
  formContent: { padding: 20, paddingBottom: 40 },
  label: { fontWeight: '600', marginBottom: 6 },
  hint: { marginBottom: 12, marginTop: -4 },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
  },
  descriptionInput: { minHeight: 100, paddingTop: 14 },
  inputText: {},
  inputPlaceholder: {},
  submitButton: { paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginTop: 8 },
  submitDisabled: { opacity: 0.7 },
  submitButtonText: { fontWeight: '600', color: '#FFF' },
  shareContent: { flex: 1 },
  shareCard: { borderRadius: 20, padding: 24, marginBottom: 24 },
  shareTitle: { fontWeight: '700', marginBottom: 8 },
  shareMeta: { marginBottom: 16 },
  inviteCodeBox: { borderRadius: 16, padding: 16, alignItems: 'center' },
  inviteCodeLabel: { marginBottom: 4 },
  inviteCode: { fontWeight: '700', letterSpacing: 2 },
  shareButton: { paddingVertical: 16, borderRadius: 20, alignItems: 'center', marginBottom: 12 },
  shareButtonText: { fontWeight: '600', color: '#FFF' },
  doneButton: { paddingVertical: 16, alignItems: 'center' },
  doneButtonText: {},
  datePickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  datePickerBox: { borderRadius: 20, padding: 16, minWidth: 300 },
  calendarMonthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calendarNavBtn: { padding: 8 },
  calendarNavText: { fontWeight: '700' },
  calendarMonthTitle: { fontWeight: '700' },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calendarWeekCell: { flex: 1, textAlign: 'center', fontWeight: '600', marginBottom: 4 },
  calendarDayCell: { flex: 1, aspectRatio: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center', margin: 2 },
  calendarDayText: { fontWeight: '600' },
  calendarDayDisabled: { opacity: 0.4 },
  datePickerDoneBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  datePickerDoneText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  bookListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1 },
  bookListTitle: { fontWeight: '700' },
  bookSectionHeader: { paddingVertical: 10, paddingHorizontal: 20 },
  bookSectionTitle: { fontWeight: '700', letterSpacing: 0.5 },
  bookList: { flex: 1 },
  bookRow: { paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1 },
  bookRowText: {},
});
