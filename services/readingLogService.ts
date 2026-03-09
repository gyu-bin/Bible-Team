import { supabase } from '@/lib/supabase';
import type { ReadingLogRow } from '@/types/database';
import { getGroupMembers } from '@/services/groupService';

/** 사용자 로컬 기준 오늘 00:00 ~ 23:59:59.999를 UTC ISO 구간으로 반환 (Supabase timestamptz 쿼리용) */
function getTodayLocalRangeISO(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const startOfDay = new Date(y, m, d, 0, 0, 0, 0);
  const endOfDay = new Date(y, m, d, 23, 59, 59, 999);
  return { start: startOfDay.toISOString(), end: endOfDay.toISOString() };
}

/** 사용자 로컬 기준 오늘 날짜 문자열 YYYY-MM-DD */
function getTodayLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO 문자열을 로컬 날짜 YYYY-MM-DD로 */
function toLocalDateString(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 모임 로그에서 멤버별 완료 일수 + 오늘 완료 여부를 쿼리 1회로 추출 */
async function getMemberLogStats(groupId: string): Promise<{
  completedDays: Record<string, number>;
  todayCompleted: Record<string, boolean>;
}> {
  const { data, error } = await supabase
    .from('reading_logs')
    .select('user_id, logged_at')
    .eq('group_id', groupId);

  if (error) return { completedDays: {}, todayCompleted: {} };

  const { start, end } = getTodayLocalRangeISO();
  const todayStart = new Date(start).getTime();
  const todayEnd = new Date(end).getTime();
  const byUser: Record<string, Set<string>> = {};
  const todayCompleted: Record<string, boolean> = {};

  for (const row of (data ?? []) as { user_id: string; logged_at: string }[]) {
    if (!byUser[row.user_id]) byUser[row.user_id] = new Set();
    byUser[row.user_id].add(toLocalDateString(row.logged_at));
    const t = new Date(row.logged_at).getTime();
    if (t >= todayStart && t <= todayEnd) todayCompleted[row.user_id] = true;
  }

  const completedDays: Record<string, number> = {};
  for (const [uid, set] of Object.entries(byUser)) completedDays[uid] = set.size;
  return { completedDays, todayCompleted };
}

/** 모임 멤버별 오늘 완료 여부 + 완료 일수(진척도) — 쿼리 2회 */
export async function getGroupMemberProgress(
  groupId: string
): Promise<{ user_id: string; todayCompleted: boolean; completedDays?: number }[]> {
  const [members, stats] = await Promise.all([
    getGroupMembers(groupId),
    getMemberLogStats(groupId),
  ]);
  return members.map((m) => ({
    user_id: m.user_id,
    todayCompleted: stats.todayCompleted[m.user_id] ?? false,
    completedDays: stats.completedDays[m.user_id],
  }));
}

/** 여러 모임의 멤버 진척도를 쿼리 2회로 한 번에 조회 */
export async function getMultiGroupMemberProgress(
  groupIds: string[]
): Promise<Record<string, { user_id: string; todayCompleted: boolean; completedDays?: number }[]>> {
  if (groupIds.length === 0) return {};

  const { start, end } = getTodayLocalRangeISO();
  const todayStart = new Date(start).getTime();
  const todayEnd = new Date(end).getTime();

  const [membersResult, logsResult] = await Promise.all([
    supabase.from('group_members').select('group_id, user_id').in('group_id', groupIds),
    supabase.from('reading_logs').select('group_id, user_id, logged_at').in('group_id', groupIds),
  ]);

  // 로그 집계
  const completedDates: Record<string, Record<string, Set<string>>> = {};
  const todayDone: Record<string, Record<string, boolean>> = {};

  for (const row of (logsResult.data ?? []) as { group_id: string; user_id: string; logged_at: string }[]) {
    if (!completedDates[row.group_id]) completedDates[row.group_id] = {};
    if (!completedDates[row.group_id][row.user_id]) completedDates[row.group_id][row.user_id] = new Set();
    completedDates[row.group_id][row.user_id].add(toLocalDateString(row.logged_at));
    const t = new Date(row.logged_at).getTime();
    if (t >= todayStart && t <= todayEnd) {
      if (!todayDone[row.group_id]) todayDone[row.group_id] = {};
      todayDone[row.group_id][row.user_id] = true;
    }
  }

  // 멤버별 그룹핑
  const membersByGroup: Record<string, string[]> = {};
  for (const row of (membersResult.data ?? []) as { group_id: string; user_id: string }[]) {
    if (!membersByGroup[row.group_id]) membersByGroup[row.group_id] = [];
    membersByGroup[row.group_id].push(row.user_id);
  }

  const result: Record<string, { user_id: string; todayCompleted: boolean; completedDays?: number }[]> = {};
  for (const groupId of groupIds) {
    result[groupId] = (membersByGroup[groupId] ?? []).map((uid) => ({
      user_id: uid,
      todayCompleted: todayDone[groupId]?.[uid] ?? false,
      completedDays: completedDates[groupId]?.[uid]?.size,
    }));
  }
  return result;
}

/** 오늘 이 모임에서 기록한 읽기 로그가 있는지 (로컬 날짜 기준 00:00~23:59) */
export async function hasLoggedToday(groupId: string, userId: string): Promise<boolean> {
  const { start, end } = getTodayLocalRangeISO();
  const { data, error } = await supabase
    .from('reading_logs')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .gte('logged_at', start)
    .lte('logged_at', end)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data != null;
}

/** 오늘 읽기 완료 기록 (한 건으로 요약 저장) */
export async function logTodayComplete(
  groupId: string,
  userId: string,
  book: string,
  chapter: number
): Promise<ReadingLogRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('reading_logs')
    .insert({ group_id: groupId, user_id: userId, book, chapter, is_completed: true })
    .select()
    .single();

  if (error) throw error;
  return data as ReadingLogRow;
}

/** 내가 읽기 완료한 날짜들 (로컬 날짜 YYYY-MM-DD, 최신순). 게임화/통계용 */
export async function getMyLoggedDates(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('reading_logs')
      .select('logged_at')
      .eq('user_id', userId);

    if (error) return [];
    const set = new Set<string>();
    for (const row of (data ?? []) as { logged_at: string }[]) {
      set.add(toLocalDateString(row.logged_at));
    }
    return Array.from(set).sort((a, b) => (b > a ? 1 : -1));
  } catch {
    return [];
  }
}

/** 연속 읽기 일수 (로컬 오늘 포함, 오늘부터 과거로 이어지는 일수) */
export function getConsecutiveDays(dates: string[]): number {
  if (dates.length === 0) return 0;
  const today = getTodayLocalDateString();
  if (!dates.includes(today)) return 0;
  let count = 0;
  const sorted = [...dates].sort((a, b) => (b > a ? 1 : -1));
  const [y, m, day] = today.split('-').map(Number);
  let d = new Date(y, m - 1, day);
  for (const dateStr of sorted) {
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dateStr !== expected) break;
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

/** 이번 주(일~토) 완료한 일수 */
export function getThisWeekCompletedCount(dates: string[]): number {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  return dates.filter((d) => {
    const t = new Date(d + 'T12:00:00');
    return t >= sunday && t < nextSunday;
  }).length;
}

/** 오늘 이 모임에서 기록한 읽기 로그 전부 삭제 (로컬 날짜 기준, 완료 취소용) */
export async function deleteTodayLogs(groupId: string, userId: string): Promise<void> {
  const { start, end } = getTodayLocalRangeISO();
  const { error } = await supabase
    .from('reading_logs')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .gte('logged_at', start)
    .lte('logged_at', end);
  if (error) throw error;
}

/** 이번 주(일~토) 로컬 시작/종료 ISO 반환 */
function getThisWeekLocalRangeISO(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek, 0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  nextSunday.setMilliseconds(-1);
  return { start: sunday.toISOString(), end: nextSunday.toISOString() };
}

/** 그룹 이번 주 참여 통계: 각 멤버의 이번 주 읽은 일수 */
export async function getGroupWeeklyParticipation(
  groupId: string
): Promise<{ totalMembers: number; activeThisWeek: number; memberWeeklyDays: Record<string, number> }> {
  try {
    const { start, end } = getThisWeekLocalRangeISO();
    const { data, error } = await supabase
      .from('reading_logs')
      .select('user_id, logged_at')
      .eq('group_id', groupId)
      .gte('logged_at', start)
      .lte('logged_at', end);

    if (error) return { totalMembers: 0, activeThisWeek: 0, memberWeeklyDays: {} };

    const byUser: Record<string, Set<string>> = {};
    for (const row of (data ?? []) as { user_id: string; logged_at: string }[]) {
      const date = toLocalDateString(row.logged_at);
      if (!byUser[row.user_id]) byUser[row.user_id] = new Set();
      byUser[row.user_id].add(date);
    }

    const memberWeeklyDays: Record<string, number> = {};
    for (const [uid, set] of Object.entries(byUser)) memberWeeklyDays[uid] = set.size;

    return {
      totalMembers: 0, // caller가 members.length로 채움
      activeThisWeek: Object.keys(memberWeeklyDays).length,
      memberWeeklyDays,
    };
  } catch {
    return { totalMembers: 0, activeThisWeek: 0, memberWeeklyDays: {} };
  }
}

/** 오늘 분량 여러 장 기록 (예: 창세기 1,2,3장) */
export async function logChapters(
  groupId: string,
  userId: string,
  entries: { book: string; chapter: number }[]
): Promise<void> {
  const rows = entries.map((e) => ({
    group_id: groupId,
    user_id: userId,
    book: e.book,
    chapter: e.chapter,
    is_completed: true,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('reading_logs').insert(rows);
  if (error) throw error;
}
