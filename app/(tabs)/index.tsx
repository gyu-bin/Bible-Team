import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Animated, Modal, TextInput, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getMyGroups } from '@/services/groupService';
import { logChapters, deleteTodayLogs, getMultiGroupMemberProgress, getMyLoggedDates, getConsecutiveDays, getThisWeekCompletedCount } from '@/services/readingLogService';
import { getNicknamesByUserIds } from '@/services/profileService';
import { sendReminderPush } from '@/services/reminderPushService';
import { getCachedGroups, getCachedLoggedToday, setCachedGroups, setCachedLoggedToday, setCachedLoggedTodayGroup, getLocalGroups, isLocalUserId, getOrCreateLocalUserId, getNickname } from '@/lib/cache';
import { getTodayChapters } from '@/constants/bibleBooks';
import { cancelTodayReminderOnComplete } from '@/lib/reminderNotifications';
import { addSharePost } from '@/lib/shareStorage';
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
  const completeToastScale = useRef(new Animated.Value(1)).current;
  const completeToastOpacity = useRef(new Animated.Value(1)).current;
  const [milestoneToast, setMilestoneToast] = useState<number | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(true);
  const [consecutiveDays, setConsecutiveDays] = useState(0);
  const [thisWeekCount, setThisWeekCount] = useState(0);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Record<string, boolean>>({});
  const [meditationModal, setMeditationModal] = useState<{ group: ReadingGroupRow; readingText: string } | null>(null);
  const [meditationInput, setMeditationInput] = useState('');
  const [meditationSubmitting, setMeditationSubmitting] = useState(false);
  const [completionCelebration, setCompletionCelebration] = useState<ReadingGroupRow | null>(null);

  const lastFetchRef = useRef(0);
  const STALE_MS = 30_000;

  const load = useCallback(async () => {
    lastFetchRef.current = Date.now();
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

      const groupIds = list.map((g) => g.id);
      const [progressMap, myDates] = await Promise.all([
        getMultiGroupMemberProgress(groupIds).catch(() => ({} as Record<string, MemberProgressItem[]>)),
        getMyLoggedDates(user.id).catch(() => [] as string[]),
      ]);

      // 내 오늘 완료 여부는 progressMap에서 추출
      const map: Record<string, boolean> = {};
      for (const g of list) {
        const myEntry = (progressMap[g.id] ?? []).find((m) => m.user_id === user.id);
        map[g.id] = myEntry?.todayCompleted ?? false;
      }
      setLoggedToday(map);
      await setCachedLoggedToday(map);
      setMemberProgress(progressMap);

      const allUserIds = Array.from(new Set(Object.values(progressMap).flat().map((m) => m.user_id)));
      const nickMap = await getNicknamesByUserIds(allUserIds).catch(() => ({}));
      setMemberNicknames(nickMap);

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

  const mountedRef = useRef(false);
  useEffect(() => {
    // refreshKey 변경 시만 reload (첫 마운트는 useFocusEffect가 처리)
    if (!mountedRef.current) { mountedRef.current = true; return; }
    load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFetchRef.current < STALE_MS) return;
      lastFetchRef.current = now;
      load();
    }, [load])
  );

  useEffect(() => {
    if (!loading && groups.length === 0) {
      hasSeenOnboarding().then((done) => {
        if (!done) setShowOnboarding(true);
      });
    }
  }, [loading, groups.length]);

  useEffect(() => {
    if (!completeToast) return;
    completeToastScale.setValue(0.5);
    completeToastOpacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(completeToastScale, {
          toValue: 1.15,
          useNativeDriver: true,
          friction: 6,
          tension: 200,
        }),
        Animated.timing(completeToastOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(completeToastScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 100,
      }),
    ]).start();
  }, [completeToast, completeToastScale, completeToastOpacity]);

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
        setTimeout(() => setCompleteToast(null), 2800);
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
        cancelTodayReminderOnComplete().catch(() => {});
        // 묵상 팝업 - 2초 딜레이 후 열기 (완료 토스트 보여준 후)
        const todayChaptersForModal = getTodayChapters(group.start_book, group.pages_per_day, dayIndex);
        const readingLabel = todayChaptersForModal.length > 0
          ? todayChaptersForModal.map(r => r.fromChapter === r.toChapter ? `${r.book} ${r.fromChapter}장` : `${r.book} ${r.fromChapter}~${r.toChapter}장`).join(', ')
          : `${group.start_book}`;
        setTimeout(() => setMeditationModal({ group, readingText: readingLabel }), 2000);
        // 완독 축하 모달
        if (dayIndex >= group.duration_days - 1) {
          setTimeout(() => setCompletionCelebration(group), 1500);
        }
        setCompleteToast(group.title);
        setTimeout(() => setCompleteToast(null), 2800);
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
              onSendReminder={(toUserId: string) => {
                if (!userId || isLocalUserId(userId)) return;
                const name = memberNicknames[toUserId] || '이 멤버';
                Alert.alert(
                  '응원 보내기 📣',
                  `${name}에게 오늘 읽기 리마인드를 보낼까요?`,
                  [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '보내기',
                      onPress: async () => {
                        const result = await sendReminderPush(toUserId, group.id, myNickname || '모임원');
                        if ('ok' in result) {
                          Alert.alert('응원 완료 📣', '읽기 완료하라고 알림을 보냈어요!');
                        } else if (result.error === 'already_sent_today') {
                          Alert.alert('이미 보냈어요', '오늘 이미 응원을 보낸 멤버예요.');
                        } else if (result.error === 'no_push_token') {
                          Alert.alert('알림 불가', '이 멤버는 앱 알림을 허용하지 않았어요.');
                        } else {
                          Alert.alert('오류', '응원 전송에 실패했어요.');
                        }
                      },
                    },
                  ]
                );
              }}
              onNextGroup={() => router.push({ pathname: '/(tabs)/groups', params: { action: 'create' } })}
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
      {meditationModal && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setMeditationModal(null)}
        >
          <View style={styles.meditationOverlay}>
            <View style={[styles.meditationBox, { backgroundColor: theme.card }]}>
              <Text style={[styles.meditationTitle, { color: theme.text, fontSize: s(17) }]}>오늘의 묵상 ✍️</Text>
              <Text style={[styles.meditationSub, { color: theme.textSecondary, fontSize: s(13) }]}>
                {meditationModal.readingText}
              </Text>
              <TextInput
                style={[styles.meditationInput, { backgroundColor: theme.bgSecondary, color: theme.text, fontSize: s(15) }]}
                placeholder="오늘 말씀에서 느낀 점을 한 줄로..."
                placeholderTextColor={theme.textSecondary}
                value={meditationInput}
                onChangeText={setMeditationInput}
                multiline
                autoFocus
                maxLength={200}
              />
              <View style={styles.meditationButtons}>
                <TouchableOpacity
                  style={[styles.meditationSkip, { borderColor: theme.border }]}
                  onPress={() => { setMeditationModal(null); setMeditationInput(''); }}
                >
                  <Text style={[{ fontSize: s(14), color: theme.textSecondary }]}>건너뛰기</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.meditationSubmit, { backgroundColor: meditationInput.trim() ? theme.primary : theme.bgSecondary }, meditationSubmitting && { opacity: 0.6 }]}
                  disabled={!meditationInput.trim() || meditationSubmitting}
                  onPress={async () => {
                    if (!meditationInput.trim() || meditationSubmitting) return;
                    setMeditationSubmitting(true);
                    try {
                      await addSharePost(meditationInput.trim(), {
                        groupId: meditationModal.group.id,
                        groupTitle: meditationModal.group.title,
                      });
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setMeditationSubmitting(false);
                      setMeditationModal(null);
                      setMeditationInput('');
                    }
                  }}
                >
                  <Text style={[{ fontSize: s(14), fontWeight: '600', color: meditationInput.trim() ? '#FFF' : theme.textSecondary }]}>
                    {meditationSubmitting ? '저장 중...' : '나눔에 올리기'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {completionCelebration && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCompletionCelebration(null)}>
          <View style={styles.celebrationOverlay}>
            <View style={[styles.celebrationBox, { backgroundColor: theme.card }]}>
              <Text style={styles.celebrationEmoji}>🎉</Text>
              <Text style={[styles.celebrationTitle, { color: theme.text, fontSize: s(20) }]}>
                완독 달성!
              </Text>
              <Text style={[styles.celebrationSub, { color: theme.textSecondary, fontSize: s(14) }]}>
                "{completionCelebration.title}" 모임을{'\n'}{completionCelebration.duration_days}일 동안 완주했어요!
              </Text>
              <View style={styles.celebrationButtons}>
                <TouchableOpacity
                  style={[styles.celebrationShareBtn, { backgroundColor: theme.primary }]}
                  onPress={async () => {
                    const { Share } = require('react-native');
                    const msg = `📖 "${completionCelebration.title}" 성경 읽기 모임을 ${completionCelebration.duration_days}일 동안 완주했어요!\n바이블 크루와 함께라면 할 수 있어요 🙌`;
                    Share.share({ message: msg }).catch(() => {});
                    setCompletionCelebration(null);
                  }}
                >
                  <Text style={{ fontSize: s(15), fontWeight: '700', color: '#FFF' }}>완독 자랑하기 📣</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.celebrationDoneBtn]}
                  onPress={() => setCompletionCelebration(null)}
                >
                  <Text style={[{ fontSize: s(14), color: theme.textSecondary }]}>닫기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
        <Animated.View
          style={[
            styles.completeToast,
            {
              backgroundColor: theme.primary,
              transform: [{ scale: completeToastScale }],
              opacity: completeToastOpacity,
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.completeToastEmoji}>🎉</Text>
          <Text style={styles.completeToastText}>오늘 읽기 완료!</Text>
          <Text style={styles.completeToastSub}>{completeToast}</Text>
        </Animated.View>
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
  completeToast: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  completeToastEmoji: { fontSize: 36, marginBottom: 4 },
  completeToastText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  completeToastSub: { fontSize: 14, color: 'rgba(255,255,255,0.95)', marginTop: 2 },
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
  meditationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  meditationBox: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  meditationTitle: { fontWeight: '700', marginBottom: 4 },
  meditationSub: { marginBottom: 16 },
  meditationInput: { borderRadius: 12, padding: 14, minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  meditationButtons: { flexDirection: 'row', gap: 12 },
  meditationSkip: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
  meditationSubmit: { flex: 2, paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  celebrationOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  celebrationBox: { borderRadius: 24, padding: 28, alignItems: 'center', width: '100%' },
  celebrationEmoji: { fontSize: 60, marginBottom: 12 },
  celebrationTitle: { fontWeight: '800', marginBottom: 8 },
  celebrationSub: { textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  celebrationButtons: { width: '100%', gap: 10 },
  celebrationShareBtn: { paddingVertical: 16, borderRadius: 20, alignItems: 'center' },
  celebrationDoneBtn: { paddingVertical: 12, alignItems: 'center' },
});
