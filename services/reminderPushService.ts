import { supabase, ensureAnonymousUser } from '@/lib/supabase';
import { getNickname } from '@/lib/cache';

export type SendReminderResult = { ok: true } | { error: string };

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

/** 미완료 멤버에게 읽기 리마인드 푸시 전송. 같은 수신자·같은 모임에 하루 1회만 가능. */
export async function sendReminderPush(
  toUserId: string,
  groupId: string,
  senderNickname: string
): Promise<SendReminderResult> {
  try {
    // 세션이 로드되지 않았을 수 있으므로 명시적으로 확인 후 refreshSession으로 최신 토큰 확보
    await ensureAnonymousUser().catch(() => null);
    const { data: refreshed } = await supabase.auth.refreshSession();
    const token = refreshed.session?.access_token
      ?? (await supabase.auth.getSession()).data.session?.access_token;

    if (!token) return { error: 'not_logged_in' };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-reminder-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to_user_id: toUserId,
        group_id: groupId,
        sender_nickname: senderNickname,
      }),
    });

    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || json.error) return { error: json.error ?? `http_${res.status}` };
    return { ok: true };
  } catch {
    return { error: 'network_error' };
  }
}

/** 내 닉네임을 자동으로 포함해서 전송하는 편의 함수 */
export async function sendReminderPushWithMyNickname(
  toUserId: string,
  groupId: string
): Promise<SendReminderResult> {
  const nickname = (await getNickname()) ?? '모임원';
  return sendReminderPush(toUserId, groupId, nickname);
}
