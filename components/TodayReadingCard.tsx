import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { ProgressBar } from './ProgressBar';
import type { ReadingGroupRow } from '@/types/database';
import { getTodayChapters } from '@/constants/bibleBooks';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';

export interface MemberProgressItem {
  user_id: string;
  todayCompleted: boolean;
  /** 완료한 일수 (진척도). 있으면 N일차/전체 표시 */
  completedDays?: number;
}

interface TodayReadingCardProps {
  group: ReadingGroupRow;
  dayIndex: number;
  totalDays: number;
  isLoggedToday: boolean;
  onComplete: () => void;
  onUndoComplete?: () => void;
  completing: boolean;
  onPress?: () => void;
  /** 있으면 카드에 "접기" 버튼 표시 */
  onCollapse?: () => void;
  /** 미완료 멤버에게 리마인드 푸시 보내기 (toUserId 전달) */
  onSendReminder?: (toUserId: string) => void;
  memberProgress?: MemberProgressItem[];
  /** user_id → 닉네임 (서버 profiles). 있으면 함께 읽는 사람들에 닉네임 표시 */
  memberNicknames?: Record<string, string>;
  currentUserId?: string | null;
  currentUserNickname?: string;
}

export function TodayReadingCard({
  group,
  dayIndex,
  totalDays,
  isLoggedToday,
  onComplete,
  onUndoComplete,
  completing,
  onPress,
  onCollapse,
  onSendReminder,
  memberProgress = [],
  memberNicknames,
  currentUserId,
  currentUserNickname,
}: TodayReadingCardProps) {
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  const todayChapters = getTodayChapters(group.start_book, group.pages_per_day, dayIndex);
  const dayLabel = dayIndex + 1;
  const progress = totalDays > 0 ? dayIndex / totalDays : 0;
  const todayText =
    todayChapters.length > 0
      ? todayChapters.map((r) => (r.fromChapter === r.toChapter ? `${r.book} ${r.fromChapter}장` : `${r.book} ${r.fromChapter}~${r.toChapter}장`)).join(', ')
      : `${group.start_book} · 하루 ${group.pages_per_day}장`;

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text, fontSize: s(17) }]} numberOfLines={1}>
          {group.title}
        </Text>
        {currentUserId && group.leader_id === currentUserId ? (
          <View style={[styles.leaderBadge, { backgroundColor: theme.primary, marginLeft: 8 }]}>
            <Text style={[styles.leaderBadgeText, { fontSize: s(10), color: '#FFF' }]}>모임장</Text>
          </View>
        ) : null}
        {onCollapse ? (
          <TouchableOpacity
            style={[styles.collapseBtn, { marginLeft: 8 }]}
            onPress={onCollapse}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.collapseBtnText, { color: theme.textSecondary, fontSize: s(12) }]}>접기</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.cardContent}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress}
      >
      <Text style={[styles.todayLabel, { fontSize: s(12), color: theme.textSecondary }]}>오늘의 분량</Text>
      <Text style={[styles.chapters, { color: theme.text, fontSize: s(15) }]} numberOfLines={2}>
        {todayText}
      </Text>
      <View style={styles.progressRow}>
        <Text style={[styles.dayText, { fontSize: s(13), color: theme.textSecondary }]}>
          {dayLabel}일차 / {totalDays}일
        </Text>
        <ProgressBar progress={progress} fillColor={theme.primary} backgroundColor={theme.border} />
      </View>
      {memberProgress.length > 0 && (
        <View style={[styles.memberProgressSection, { borderTopColor: theme.border }]}>
          <Text style={[styles.memberProgressTitle, { fontSize: s(12), color: theme.textSecondary }]}>함께 읽는 사람들</Text>
          {memberProgress.map((mp, i) => (
            <View key={mp.user_id} style={styles.memberProgressItem}>
              <View style={styles.memberProgressRow}>
                <Text style={[styles.memberProgressLabel, { fontSize: s(14), color: theme.text }]}>
                  {currentUserId === mp.user_id
                    ? (currentUserNickname || '나')
                    : (memberNicknames?.[mp.user_id] ?? `멤버 ${i + 1}`)}
                </Text>
                {mp.todayCompleted ? (
                  <Text style={[styles.memberProgressStatus, { fontSize: s(13), color: theme.doneText }]}>✓ 오늘 완료</Text>
                ) : currentUserId !== mp.user_id && onSendReminder ? (
                  <TouchableOpacity onPress={() => onSendReminder(mp.user_id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[styles.memberProgressStatus, { fontSize: s(13), color: theme.textSecondary }]}>○ 미완료 · 탭하면 리마인드</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.memberProgressStatus, { fontSize: s(13), color: theme.textSecondary }]}>○ 미완료</Text>
                )}
              </View>
              {totalDays > 0 && (
                <View style={styles.memberProgressBarRow}>
                  <Text style={[styles.memberDayText, { fontSize: s(11), color: theme.textSecondary }]}>
                    {(mp.completedDays ?? 0)}일차 / {totalDays}일
                  </Text>
                  <View style={{ flex: 1 }}>
                    <ProgressBar
                      progress={Math.min(1, (mp.completedDays ?? 0) / totalDays)}
                      fillColor={theme.primary}
                      backgroundColor={theme.border}
                      height={6}
                    />
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {!isLoggedToday ? (
        <TouchableOpacity
          style={[styles.completeButton, { backgroundColor: theme.primary }]}
          onPress={onComplete}
          disabled={completing}
          activeOpacity={0.8}
        >
          {completing ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={[styles.completeButtonText, { fontSize: s(15) }]}>오늘 읽기 완료 ✨</Text>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.doneBadge, { backgroundColor: theme.doneBg }]}
          onPress={onUndoComplete}
          activeOpacity={0.8}
          disabled={!onUndoComplete}
        >
          <Text style={[styles.doneBadgeText, { color: theme.doneText, fontSize: s(14) }]}>✓ 오늘 완료 · 탭하면 취소</Text>
        </TouchableOpacity>
      )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  cardContent: { flex: 1 },
  collapseBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  collapseBtnText: { fontWeight: '600' },
  title: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  leaderBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  leaderBadgeText: { fontWeight: '600' },
  todayLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  chapters: {
    fontSize: 15,
    marginBottom: 12,
  },
  progressRow: {
    marginBottom: 14,
  },
  memberProgressSection: {
    marginBottom: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  memberProgressTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  memberProgressItem: { marginBottom: 10 },
  memberProgressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  memberProgressLabel: { fontSize: 14 },
  memberProgressStatus: { fontSize: 13 },
  memberProgressBarRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  memberDayText: { marginRight: 8, minWidth: 52 },
  dayText: {
    fontSize: 13,
    marginBottom: 6,
  },
  completeButton: {
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
  },
  completeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  doneBadge: {
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 20,
  },
  doneBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
