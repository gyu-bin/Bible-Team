import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getMyGroups } from '@/services/groupService';
import { hasLoggedToday, logChapters, deleteTodayLogs, getGroupMemberProgress, getMyLoggedDates, getConsecutiveDays, getThisWeekCompletedCount } from '@/services/readingLogService';
import { getNicknamesByUserIds } from '@/services/profileService';
// import { sendReminderPush } from '@/services/reminderPushService'; // 리마인드(미완료 푸시) 기능
import { getCachedGroups, getCachedLoggedToday, setCachedGroups, setCachedLoggedToday, setCachedLoggedTodayGroup, getLocalGroups, isLocalUserId, getOrCreateLocalUserId, getNickname } from '@/lib/cache';
import { getTodayChapters } from '@/constants/bibleBooks';
import { TodayReadingCard, type MemberProgressItem } from '@/components/TodayReadingCard';
import { EmptyState } from '@/components/EmptyState';
import { OnboardingModal, hasSeenOnboarding } from '@/components/OnboardingModal';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh } from '@/contexts/DataRefreshContext';
import type { ReadingGroupRow } from '@/types/database';

/** 모임의 실제 1일차 기준일 (starts_at 있으면 그날, 없으면 생성일) */
function getGroupStartDate(group: ReadingGroupRow): string {
  return group.starts_at ?? group.created_at;
}

function getDayIndex(startDate: string): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start.getTime() > today.getTime()) return -1;
  const diff = Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const { refreshKey } = useDataRefresh();
  const s = (n: number) => Math.round(n * fontScale);
  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ReadingGroupRow[]>([]);
  const [loggedToday, setLoggedToday] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [memberProgress, setMemberProgress] = useState<Record<string, MemberProgressItem[]>>({});
  const [memberNicknames, setMemberNicknames] = useState<Record<string, string>>({});
  const [myNickname, setMyNickname] = useState<string>('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [completeToast, setCompleteToast] = useState<string | null>(null);
  const [milestoneToast, setMilestoneToast] = useState<number | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [consecutiveDays, setConsecutiveDays] = useState(0);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [user, nickname] = await Promise.all([
        ensureAnonymousUser().catch(() => null) ?? getCurrentUser().catch(() => null),
        getNickname(),
      ]);
      setUserId(user?.id ?? null);
      setMyNickname(nickname ?? '');

      const cachedGroups = await getCachedGroups();
      const cachedLogged = await getCachedLoggedToday();
      setGroups(cachedGroups);
      setLoggedToday(cachedLogged);

      if (!user) {
        const localGroups = await getLocalGroups();
        setGroups(localGroups.length > 0 ? localGroups : cachedGroups);
        if (localGroups.length > 0) await setCachedGroups(localGroups);
        const localUserId = await getOrCreateLocalUserId();
        setUserId(localUserId);
        const progressMap: Record<string, MemberProgressItem[]> = {};
        for (const g of localGroups.length > 0 ? localGroups : cachedGroups) {
          progressMap[g.id] = [{ user_id: localUserId, todayCompleted: cachedLogged[g.id] ?? false }];
        }
        setMemberProgress(progressMap);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const list = await getMyGroups(user.id);
      setGroups(list);
      await setCachedGroups(list);

      const map: Record<string, boolean> = {};
      await Promise.all(
        list.map(async (g) => {
          const done = await hasLoggedToday(g.id, user.id);
          map[g.id] = done;
        })
      );
      setLoggedToday(map);
      await setCachedLoggedToday(map);

      const progressMap: Record<string, MemberProgressItem[]> = {};
      await Promise.all(
        list.map(async (g) => {
          const progress = await getGroupMemberProgress(g.id).catch(() => []);
          progressMap[g.id] = progress;
        })
      );
      setMemberProgress(progressMap);

      const allUserIds = Array.from(new Set(Object.values(progressMap).flat().map((m) => m.user_id)));
      const nickMap = await getNicknamesByUserIds(allUserIds).catch(() => ({}));
      setMemberNicknames(nickMap);

      const myDates = await getMyLoggedDates(user.id).catch(() => []);
      setConsecutiveDays(getConsecutiveDays(myDates));
      setThisWeekCount(getThisWeekCompletedCount(myDates));
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      getNickname().then((n) => setMyNickname(n ?? ''));
      // 포커스 시 진행 중인 멤버 닉네임만 먼저 재조회해 설정에서 바꾼 닉네임이 바로 반영되도록 함
      const ids = Array.from(new Set(Object.values(memberProgress).flat().map((m) => m.user_id)));
      if (ids.length > 0) {
        getNicknamesByUserIds(ids).then(setMemberNicknames).catch(() => {});
      }
      load();
    }, [load, memberProgress])
  );

  useEffect(() => {
    if (!loading && groups.length === 0) {
      hasSeenOnboarding().then((done) => {
        if (!done) setShowOnboarding(true);
      });
    }
  }, [loading, groups.length]);

  const handleUndoComplete = async (group: ReadingGroupRow) => {
    const uid = userId ?? (await ensureAnonymousUser().catch(() => null))?.id ?? (await getOrCreateLocalUserId().catch(() => null));
    const isLocal = !uid || isLocalUserId(uid) || group.id.startsWith('local_');
    if (!isLocal && uid) {
      try {
        await deleteTodayLogs(group.id, uid);
      } catch (e) {
        console.error(e);
      }
    }
    setLoggedToday((prev) => ({ ...prev, [group.id]: false }));
    await setCachedLoggedTodayGroup(group.id, false);
    if (uid && memberProgress[group.id]) {
      setMemberProgress((prev) => ({
        ...prev,
        [group.id]: (prev[group.id] ?? []).map((m) =>
          m.user_id === uid ? { ...m, todayCompleted: false } : m
        ),
      }));
    }
    if (uid && !isLocalUserId(uid)) {
      const myDates = await getMyLoggedDates(uid).catch(() => []);
      setConsecutiveDays(getConsecutiveDays(myDates));
      setThisWeekCount(getThisWeekCompletedCount(myDates));
    }
  };

  const handleComplete = async (group: ReadingGroupRow) => {
    const isLocal = isLocalUserId(group.id) || group.id.startsWith('local_');
    const uid = userId ?? (await ensureAnonymousUser())?.id;
    if (!isLocal && !uid) return;
    setCompletingId(group.id);
    try {
      if (isLocal || !uid) {
        setLoggedToday((prev) => ({ ...prev, [group.id]: true }));
        await setCachedLoggedTodayGroup(group.id, true);
        if (uid && memberProgress[group.id]) {
          setMemberProgress((prev) => ({
            ...prev,
            [group.id]: (prev[group.id] ?? []).map((m) =>
              m.user_id === uid ? { ...m, todayCompleted: true } : m
            ),
          }));
        }
        setCompleteToast(group.title);
        setTimeout(() => setCompleteToast(null), 2200);
        setCompletingId(null);
        return;
      }
      const dayIndex = getDayIndex(getGroupStartDate(group));
      const chapters = getTodayChapters(group.start_book, group.pages_per_day, dayIndex);
      const entries = chapters.flatMap((c) => {
        const arr: { book: string; chapter: number }[] = [];
        for (let ch = c.fromChapter; ch <= c.toChapter; ch++) arr.push({ book: c.book, chapter: ch });
        return arr;
      });
      if (entries.length > 0) {
        await logChapters(group.id, uid, entries);
        setLoggedToday((prev) => ({ ...prev, [group.id]: true }));
        await setCachedLoggedTodayGroup(group.id, true);
        if (memberProgress[group.id]) {
          setMemberProgress((prev) => ({
            ...prev,
            [group.id]: (prev[group.id] ?? []).map((m) =>
              m.user_id === uid ? { ...m, todayCompleted: true } : m
            ),
          }));
        }
        if (uid && !isLocalUserId(uid)) {
          const myDates = await getMyLoggedDates(uid).catch(() => []);
          setConsecutiveDays(getConsecutiveDays(myDates));
          setThisWeekCount(getThisWeekCompletedCount(myDates));
          const MILESTONES = [7, 30, 66, 100, 365];
          const totalDays = myDates.length;
          if (MILESTONES.includes(totalDays)) {
            setMilestoneToast(totalDays);
            setTimeout(() => setMilestoneToast(null), 4000);
          }
        }
        setCompleteToast(group.title);
        setTimeout(() => setCompleteToast(null), 2200);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCompletingId(null);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.loadingText, { fontSize: s(15), color: theme.textSecondary }]}>불러오는 중이에요 ✨</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg, padding: 24 }]}>
        <Text style={[styles.loadingText, { fontSize: s(15), color: theme.textSecondary, textAlign: 'center' }]}>
          일시적인 문제예요. 잠시 후 다시 시도해주세요.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
          onPress={() => { setLoading(true); load(); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.retryButtonText, { fontSize: s(16) }]}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <OnboardingModal
          visible={showOnboarding}
          onDismiss={() => setShowOnboarding(false)}
          onCreateGroup={() => router.push({ pathname: '/(tabs)/groups', params: { action: 'create' } })}
          onJoinByCode={() => router.push({ pathname: '/(tabs)/groups', params: { action: 'join' } })}
        />
        <EmptyState
          title="아직 참여 중인 모임이 없어요 🌱"
          subtitle="새 모임을 만들거나, 친구에게 받은 초대 코드로 참여해 보세요!"
          buttonLabel="새 모임 만들기"
          onPress={() => router.push({ pathname: '/(tabs)/groups', params: { action: 'create' } })}
          secondaryButtonLabel="초대 코드로 참여"
          secondaryOnPress={() => router.push({ pathname: '/(tabs)/groups', params: { action: 'join' } })}
        />
      </View>
    );
  }

  const inProgressGroups = groups.filter((g) => {
    const day = getDayIndex(getGroupStartDate(g));
    return day >= 0 && day < g.duration_days;
  });
  const completedGroups = groups.filter((g) => getDayIndex(getGroupStartDate(g)) >= g.duration_days);
  const notStartedGroups = groups.filter((g) => getDayIndex(getGroupStartDate(g)) < 0);
  const showCompleted = !completedCollapsed;
  const listToShow = [...notStartedGroups, ...inProgressGroups, ...(showCompleted ? completedGroups : [])];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        <Text style={[styles.sectionTitle, { fontSize: s(13), marginBottom: s(6), color: theme.textSecondary }]}>오늘의 읽기 📖</Text>
        {(consecutiveDays > 0 || thisWeekCount > 0) && userId && (
          <View style={[styles.statsRow, { backgroundColor: theme.bgSecondary, marginBottom: s(12) }]}>
            <View>
              <Text style={[styles.statsText, { fontSize: s(13) }]}>
                {consecutiveDays > 0 && (
                  <Text style={{ color: theme.primary, fontWeight: '600' }}>🔥 매일 읽기 연속 {consecutiveDays}일</Text>
                )}
                {consecutiveDays > 0 && thisWeekCount > 0 && (
                  <Text style={{ color: theme.textSecondary }}> · </Text>
                )}
                {thisWeekCount > 0 && (
                  <Text style={{ color: theme.textSecondary, fontWeight: '600' }}>이번 주 {thisWeekCount}일 완료</Text>
                )}
              </Text>
              <Text style={[styles.statsHint, { fontSize: s(11), color: theme.textSecondary, marginTop: 2 }]}>
                (참여 중인 모임 중 매일 최소 1회 읽기 완료한 날 기준)
              </Text>
            </View>
          </View>
        )}
        <Text style={[styles.refreshHint, { fontSize: s(11), color: theme.textSecondary, marginBottom: s(12) }]}>
          ↓ 당겨서 새로고침하면 함께 읽는 사람 정보가 갱신돼요
        </Text>
        {listToShow.map((group) => {
          const dayIndex = getDayIndex(getGroupStartDate(group));
          const isDone = dayIndex >= group.duration_days;
          const notStarted = dayIndex < 0;
          const displayDayIndex = isDone ? group.duration_days - 1 : Math.max(0, dayIndex);
          const collapsed = collapsedGroupIds[group.id];
          if (notStarted) {
            const startD = group.starts_at ? new Date(group.starts_at) : null;
            const startLabel = startD ? `${startD.getMonth() + 1}월 ${startD.getDate()}일부터 시작` : '시작일 미정';
            return (
              <TouchableOpacity
                key={group.id}
                style={[styles.collapsedCardRow, { backgroundColor: theme.card }]}
                onPress={() => router.push(`/group/${group.id}`)}
                activeOpacity={0.8}
              >
                <Text style={[styles.collapsedCardTitle, { color: theme.text, fontSize: s(15) }]} numberOfLines={1}>
                  {group.title}
                </Text>
                <Text style={[styles.collapsedCardDay, { color: theme.textSecondary, fontSize: s(13) }]}>
                  {startLabel}
                </Text>
              </TouchableOpacity>
            );
          }
          if (collapsed) {
            const collapsedChapters = getTodayChapters(group.start_book, group.pages_per_day, displayDayIndex);
            const collapsedReadingText = collapsedChapters.length > 0
              ? collapsedChapters.map((r) => r.fromChapter === r.toChapter ? `${r.book} ${r.fromChapter}장` : `${r.book} ${r.fromChapter}~${r.toChapter}장`).join(', ')
              : null;
            return (
              <TouchableOpacity
                key={group.id}
                style={[styles.collapsedCardRow, { backgroundColor: theme.card }]}
                onPress={() => setCollapsedGroupIds((prev) => ({ ...prev, [group.id]: false }))}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.collapsedCardTitle, { color: theme.text, fontSize: s(15) }]} numberOfLines={1}>
                    {group.title}
                  </Text>
                  {collapsedReadingText && !loggedToday[group.id] ? (
                    <Text style={[{ color: theme.textSecondary, fontSize: s(12), marginTop: 2 }]} numberOfLines={1}>
                      오늘: {collapsedReadingText}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.collapsedCardRight}>
                  {loggedToday[group.id] ? (
                    <Text style={[styles.collapsedCardDone, { color: theme.doneText, fontSize: s(12), marginRight: 8 }]}>오늘 완료</Text>
                  ) : null}
                  <Text style={[styles.collapsedCardDay, { color: theme.textSecondary, fontSize: s(13) }]}>
                    {displayDayIndex + 1}일차 / {group.duration_days}일
                  </Text>
                  <Text style={[styles.collapsedCardChevron, { color: theme.textSecondary, fontSize: s(16) }]}>›</Text>
                </View>
              </TouchableOpacity>
            );
          }
          return (
            <TodayReadingCard
              key={group.id}
              group={group}
              dayIndex={displayDayIndex}
              totalDays={group.duration_days}
              isLoggedToday={loggedToday[group.id] ?? false}
              onComplete={() => handleComplete(group)}
              onUndoComplete={() => handleUndoComplete(group)}
              completing={completingId === group.id}
              onPress={() => router.push(`/group/${group.id}`)}
              onCollapse={() => setCollapsedGroupIds((prev) => ({ ...prev, [group.id]: true }))}
              memberProgress={memberProgress[group.id]}
              memberNicknames={memberNicknames}
              currentUserId={userId ?? undefined}
              currentUserNickname={myNickname || undefined}
            />
          );
        })}
        {completedGroups.length > 0 && completedCollapsed && (
          <TouchableOpacity
            style={[styles.collapsedRow, { backgroundColor: theme.card }]}
            onPress={() => setCompletedCollapsed(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.collapsedRowText, { fontSize: s(14), color: theme.textSecondary }]}>
              완료된 모임 {completedGroups.length}개 (탭해서 펼치기)
            </Text>
            <Text style={[styles.collapsedRowChevron, { fontSize: s(18), color: theme.textSecondary }]}>›</Text>
          </TouchableOpacity>
        )}
        {completedGroups.length > 0 && !completedCollapsed && (
          <TouchableOpacity
            style={[styles.collapsedRow, { backgroundColor: theme.bgSecondary }]}
            onPress={() => setCompletedCollapsed(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.collapsedRowText, { fontSize: s(14), color: theme.textSecondary }]}>완료된 모임 접기</Text>
            <Text style={[styles.collapsedRowChevron, { fontSize: s(18), color: theme.textSecondary }]}>∧</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      {milestoneToast ? (
        <View style={[styles.milestoneToast, { backgroundColor: '#F59E0B' }]} pointerEvents="none">
          <Text style={styles.milestoneToastEmoji}>
            {milestoneToast >= 100 ? '🏆' : milestoneToast >= 66 ? '🌟' : milestoneToast >= 30 ? '🎉' : '🔥'}
          </Text>
          <Text style={styles.milestoneToastText}>
            누적 {milestoneToast}일 달성! 정말 대단해요!
          </Text>
        </View>
      ) : completeToast ? (
        <View style={[styles.toast, { backgroundColor: theme.primary }]} pointerEvents="none">
          <Text style={styles.toastText}>오늘 읽기 완료 ✨ · {completeToast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: lightTheme.textSecondary },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.textSecondary,
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  statsText: { fontWeight: '600' },
  statsHint: {},
  refreshHint: {},
  collapsedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginBottom: 12,
  },
  collapsedCardTitle: { fontWeight: '600', flex: 1, marginRight: 8 },
  collapsedCardRight: { flexDirection: 'row', alignItems: 'center' },
  collapsedCardDay: {},
  collapsedCardDone: { fontWeight: '600' },
  collapsedCardChevron: { fontWeight: '300', marginLeft: 4 },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginTop: 8,
  },
  collapsedRowText: {},
  collapsedRowChevron: { fontWeight: '300' },
  toast: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  toastText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  milestoneToast: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  milestoneToastEmoji: { fontSize: 32, marginBottom: 4 },
  milestoneToastText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  retryButton: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
