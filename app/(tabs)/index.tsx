import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getMyGroups } from '@/services/groupService';
import { hasLoggedToday, logChapters, getGroupMemberProgress } from '@/services/readingLogService';
import { getNicknamesByUserIds } from '@/services/profileService';
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

function getDayIndex(createdAt: string): number {
  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
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

  const handleUndoComplete = async (group: ReadingGroupRow) => {
    setLoggedToday((prev) => ({ ...prev, [group.id]: false }));
    await setCachedLoggedTodayGroup(group.id, false);
    const uid = userId ?? await getOrCreateLocalUserId().catch(() => null);
    if (uid && memberProgress[group.id]) {
      setMemberProgress((prev) => ({
        ...prev,
        [group.id]: (prev[group.id] ?? []).map((m) =>
          m.user_id === uid ? { ...m, todayCompleted: false } : m
        ),
      }));
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
      const dayIndex = getDayIndex(group.created_at);
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        <Text style={[styles.sectionTitle, { fontSize: s(13), marginBottom: s(12), color: theme.textSecondary }]}>오늘의 읽기 📖</Text>
        {groups.map((group) => {
          const dayIndex = getDayIndex(group.created_at);
          const isDone = dayIndex >= group.duration_days;
          return (
            <TodayReadingCard
              key={group.id}
              group={group}
              dayIndex={isDone ? group.duration_days - 1 : dayIndex}
              totalDays={group.duration_days}
              isLoggedToday={loggedToday[group.id] ?? false}
              onComplete={() => handleComplete(group)}
              onUndoComplete={() => handleUndoComplete(group)}
              completing={completingId === group.id}
              onPress={() => router.push(`/group/${group.id}`)}
              memberProgress={memberProgress[group.id]}
              memberNicknames={memberNicknames}
              currentUserId={userId ?? undefined}
              currentUserNickname={myNickname || undefined}
            />
          );
        })}
      </ScrollView>
      {completeToast ? (
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
    marginBottom: 12,
    letterSpacing: 0.5,
  },
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
  retryButton: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
