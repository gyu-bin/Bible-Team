import { supabase } from '@/lib/supabase';
import type { ReadingLogRow } from '@/types/database';
import { getGroupMembers } from '@/services/groupService';

/** 모임 멤버별 완료한 일수 (logged_at 날짜 기준 distinct). 로컬/에러 시 {} */
export async function getMemberCompletedDays(
  groupId: string
): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from('reading_logs')
      .select('user_id, logged_at')
      .eq('group_id', groupId);

    if (error) return {};
    const byUser: Record<string, Set<string>> = {};
    for (const row of (data ?? []) as { user_id: string; logged_at: string }[]) {
      const date = row.logged_at.slice(0, 10);
      if (!byUser[row.user_id]) byUser[row.user_id] = new Set();
      byUser[row.user_id].add(date);
    }
    const out: Record<string, number> = {};
    for (const [uid, set] of Object.entries(byUser)) out[uid] = set.size;
    return out;
  } catch {
    return {};
  }
}

/** 모임 멤버별 오늘 완료 여부 + 완료 일수(진척도) */
export async function getGroupMemberProgress(
  groupId: string
): Promise<{ user_id: string; todayCompleted: boolean; completedDays?: number }[]> {
  const [members, completedDaysMap] = await Promise.all([
    getGroupMembers(groupId),
    getMemberCompletedDays(groupId),
  ]);
  const result = await Promise.all(
    members.map(async (m) => ({
      user_id: m.user_id,
      todayCompleted: await hasLoggedToday(groupId, m.user_id).catch(() => false),
      completedDays: completedDaysMap[m.user_id],
    }))
  );
  return result;
}

/** 오늘 이 모임에서 기록한 읽기 로그가 있는지 */
export async function hasLoggedToday(groupId: string, userId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('reading_logs')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .gte('logged_at', `${today}T00:00:00`)
    .lt('logged_at', `${today}T23:59:59.999`)
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
