import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReadingGroupRow } from '@/types/database';

const KEY_MY_GROUPS = '@bible_crew_my_groups';
const KEY_LOCAL_GROUPS = '@bible_crew_local_groups';
const KEY_LOCAL_USER_ID = '@bible_crew_local_user_id';
const KEY_LOGGED_TODAY = '@bible_crew_logged_today';
const KEY_LOGGED_DATE = '@bible_crew_logged_date';
const KEY_NICKNAME = '@bible_crew_nickname';
const KEY_FONT_SIZE = '@bible_crew_font_size';

const INVITE_CODE_LENGTH = 8;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

function generateId(): string {
  return 'local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Supabase 사용자 없을 때 쓰는 로컬 사용자 ID (기기별 고정) */
export async function getOrCreateLocalUserId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(KEY_LOCAL_USER_ID);
    if (!id) {
      id = 'local_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      await AsyncStorage.setItem(KEY_LOCAL_USER_ID, id);
    }
    return id;
  } catch {
    return 'local_' + Date.now();
  }
}

/** 로컬에만 저장된 모임 목록 (익명 로그인 꺼져 있을 때 사용) */
export async function getLocalGroups(): Promise<ReadingGroupRow[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LOCAL_GROUPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReadingGroupRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setLocalGroups(groups: ReadingGroupRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LOCAL_GROUPS, JSON.stringify(groups));
  } catch {
    // ignore
  }
}

export function isLocalUserId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('local_');
}

/** 로컬 모임 생성 (Supabase 없이). 생성된 모임을 저장하고 반환 */
export async function createLocalGroup(input: {
  title: string;
  leaderId: string;
  startBook: string;
  pagesPerDay: number;
  durationDays: number;
  startsAt?: string | null;
}): Promise<ReadingGroupRow> {
  const now = new Date().toISOString();
  const group: ReadingGroupRow = {
    id: generateId(),
    title: input.title,
    leader_id: input.leaderId,
    start_book: input.startBook,
    pages_per_day: input.pagesPerDay,
    duration_days: input.durationDays,
    invite_code: generateInviteCode(),
    created_at: now,
    updated_at: now,
    ...(input.startsAt != null && input.startsAt.trim() !== '' && { starts_at: input.startsAt.trim() }),
  };
  const list = await getLocalGroups();
  await setLocalGroups([group, ...list]);
  return group;
}

export async function getLocalGroupById(id: string): Promise<ReadingGroupRow | null> {
  const list = await getLocalGroups();
  return list.find((g) => g.id === id) ?? null;
}

/** 로컬 모임 수정 (모임장만. title, start_book, pages_per_day, duration_days) */
export async function updateLocalGroup(
  groupId: string,
  input: { title: string; startBook: string; pagesPerDay: number; durationDays: number }
): Promise<ReadingGroupRow | null> {
  const list = await getLocalGroups();
  const idx = list.findIndex((g) => g.id === groupId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const updated: ReadingGroupRow = {
    ...list[idx],
    title: input.title,
    start_book: input.startBook,
    pages_per_day: input.pagesPerDay,
    duration_days: input.durationDays,
    updated_at: now,
  };
  const newList = [...list];
  newList[idx] = updated;
  await setLocalGroups(newList);
  const cached = await getCachedGroups();
  const cacheIdx = cached.findIndex((g) => g.id === groupId);
  if (cacheIdx >= 0) {
    const newCached = [...cached];
    newCached[cacheIdx] = updated;
    await setCachedGroups(newCached);
  }
  return updated;
}

export async function getCachedGroups(): Promise<ReadingGroupRow[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_MY_GROUPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReadingGroupRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setCachedGroups(groups: ReadingGroupRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_MY_GROUPS, JSON.stringify(groups));
  } catch {
    // ignore
  }
}

/** 내 목록에서 모임 제거 (탈퇴 시 사용) */
export async function removeGroupFromMyCache(groupId: string): Promise<void> {
  const list = await getCachedGroups();
  await setCachedGroups(list.filter((g) => g.id !== groupId));
}

/** 로컬 모임 삭제 (모임장만. 로컬 목록 + 캐시에서 제거) */
export async function deleteLocalGroup(groupId: string): Promise<void> {
  const local = await getLocalGroups();
  await setLocalGroups(local.filter((g) => g.id !== groupId));
  const cached = await getCachedGroups();
  await setCachedGroups(cached.filter((g) => g.id !== groupId));
}

/** 오늘 날짜 키 (로컬 날짜, 날짜가 바뀌면 캐시 무효화) */
function getTodayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function getCachedLoggedToday(): Promise<Record<string, boolean>> {
  try {
    const dateKey = await AsyncStorage.getItem(KEY_LOGGED_DATE);
    const today = getTodayKey();
    if (dateKey !== today) return {};
    const raw = await AsyncStorage.getItem(KEY_LOGGED_TODAY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function setCachedLoggedToday(map: Record<string, boolean>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_LOGGED_DATE, getTodayKey());
    await AsyncStorage.setItem(KEY_LOGGED_TODAY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export async function setCachedLoggedTodayGroup(groupId: string, value: boolean): Promise<void> {
  const map = await getCachedLoggedToday();
  map[groupId] = value;
  await setCachedLoggedToday(map);
}

/** 사용자 닉네임 (기기별 저장) */
export async function getNickname(): Promise<string> {
  try {
    const value = await AsyncStorage.getItem(KEY_NICKNAME);
    return value?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function setNickname(nickname: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_NICKNAME, (nickname ?? '').trim());
  } catch {
    // ignore
  }
}

export type FontSizeKey = 'small' | 'medium' | 'large';

export async function getFontSize(): Promise<FontSizeKey> {
  try {
    const value = await AsyncStorage.getItem(KEY_FONT_SIZE);
    if (value === 'small' || value === 'medium' || value === 'large') return value;
    return 'medium';
  } catch {
    return 'medium';
  }
}

export async function setFontSize(size: FontSizeKey): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_FONT_SIZE, size);
  } catch {
    // ignore
  }
}
