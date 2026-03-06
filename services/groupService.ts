import { supabase } from '@/lib/supabase';
import type { CreateGroupInput } from '@/types/group';
import type { ReadingGroupRow } from '@/types/database';

const INVITE_CODE_LENGTH = 8;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isSchemaError(error: { code?: string; message?: string }): boolean {
  return error?.code === 'PGRST205' || (typeof error?.message === 'string' && error.message.includes('schema cache'));
}

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

/**
 * 모임장이 '어디서부터, 하루 몇 장, 기간'을 설정해 모임을 생성하고 초대 코드를 반환합니다.
 */
export async function createGroup(input: CreateGroupInput): Promise<ReadingGroupRow> {
  const inviteCode = generateInviteCode();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('reading_groups')
    .insert({
      title: input.title,
      leader_id: input.leaderId,
      start_book: input.startBook,
      pages_per_day: input.pagesPerDay,
      duration_days: input.durationDays,
      invite_code: inviteCode,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ReadingGroupRow;
}

export async function getGroupById(id: string): Promise<ReadingGroupRow | null> {
  const { data, error } = await supabase
    .from('reading_groups')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    if (error.code === 'PGRST205') return null;
    throw error;
  }
  return data as ReadingGroupRow;
}

export async function getGroupByInviteCode(inviteCode: string): Promise<ReadingGroupRow | null> {
  const { data, error } = await supabase
    .from('reading_groups')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    if (error.code === 'PGRST205') return null;
    throw error;
  }
  return data as ReadingGroupRow;
}

export async function joinGroup(groupId: string, userId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('group_members').insert({ group_id: groupId, user_id: userId });
  if (error) throw error;
}

export async function isMember(groupId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isSchemaError(error)) return false;
    throw error;
  }
  return data != null;
}

/** 모임 멤버 목록 (user_id, joined_at). 로컬 모임/테이블 없으면 [] */
export async function getGroupMembers(groupId: string): Promise<{ user_id: string; joined_at: string }[]> {
  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('user_id, joined_at')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });

    if (error) {
      if (isSchemaError(error)) return [];
      throw error;
    }
    return (data ?? []) as { user_id: string; joined_at: string }[];
  } catch (e) {
    if (e && typeof e === 'object' && isSchemaError(e as { code?: string; message?: string })) return [];
    throw e;
  }
}

/** 내가 참여 중인 모임 목록 (모임 정보 포함). 테이블이 없으면 [] 반환 */
export async function getMyGroups(userId: string): Promise<ReadingGroupRow[]> {
  try {
    const { data: members, error: memError } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);

    if (memError) {
      if (isSchemaError(memError)) return [];
      throw memError;
    }
    if (!members?.length) return [];

    const ids = members.map((m: { group_id: string }) => m.group_id);
    const { data: groups, error } = await supabase
      .from('reading_groups')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false });

    if (error) {
      if (isSchemaError(error)) return [];
      throw error;
    }
    return (groups ?? []) as ReadingGroupRow[];
  } catch (e) {
    if (e && typeof e === 'object' && isSchemaError(e as { code?: string; message?: string })) return [];
    throw e;
  }
}

/** 모임 탈퇴 (group_members에서 삭제) */
export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  if (error) throw error;
}

/** 모임 삭제 (모임장만. group_members 먼저 삭제 후 reading_groups 삭제) */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error: membersError } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId);
  if (membersError) throw membersError;
  const { error } = await supabase.from('reading_groups').delete().eq('id', groupId);
  if (error) throw error;
}
