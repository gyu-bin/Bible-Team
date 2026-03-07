import { supabase } from '@/lib/supabase';

export type SendReminderResult = { ok: true } | { error: string };

/** 미완료 멤버에게 읽기 리마인드 푸시 전송. 같은 수신자·같은 모임에 하루 1회만 가능. */
export async function sendReminderPush(
  toUserId: string,
  groupId: string,
  senderNickname: string
): Promise<SendReminderResult> {
  const { data, error } = await supabase.functions.invoke('send-reminder-push', {
    body: { to_user_id: toUserId, group_id: groupId, sender_nickname: senderNickname },
  });
  if (error) {
    const msg = error.message || '';
    if (msg.includes('non-2xx') || msg.includes('Failed to fetch'))
      return { error: 'function_unavailable' };
    return { error: msg || '전송 실패' };
  }
  if (data?.error) return { error: data.error };
  return { ok: true };
}
