import { supabase } from '@/lib/supabase';

export async function upsertMyNickname(userId: string, nickname: string): Promise<void> {
  const value = (nickname ?? '').trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('profiles')
    .upsert({ user_id: userId, nickname: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

/** 내 Expo Push Token을 profiles에 저장 (리마인드 푸시 수신용). nickname 있으면 함께 넣어서 기존 닉네임 유지. */
export async function upsertExpoPushToken(
  userId: string,
  expoPushToken: string,
  existingNickname?: string
): Promise<void> {
  const token = (expoPushToken ?? '').trim();
  if (!token) return;
  const updated_at = new Date().toISOString();
  if (existingNickname !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('profiles')
      .upsert(
        { user_id: userId, nickname: existingNickname, expo_push_token: token, updated_at },
        { onConflict: 'user_id' }
      );
    if (error) throw error;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ expo_push_token: token, updated_at })
      .eq('user_id', userId);
    if (error) throw error;
  }
}

export async function getNicknamesByUserIds(userIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set((userIds ?? []).filter(Boolean)));
  if (ids.length === 0) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, nickname')
    .in('user_id', ids);

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { user_id: string; nickname: string }[]) {
    map[row.user_id] = (row.nickname ?? '').trim();
  }
  return map;
}

