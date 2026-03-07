import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: sender }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !sender) return json({ error: 'unauthorized' });

    const body = await req.json() as { to_user_id?: string; group_id?: string; sender_nickname?: string };
    const toUserId = body?.to_user_id;
    const groupId = body?.group_id;
    const senderNickname = (body?.sender_nickname ?? '').trim() || '모임원';

    if (!toUserId || !groupId) return json({ error: 'invalid_params' });
    if (toUserId === sender.id) return json({ error: 'cannot_send_to_self' });

    const { data: members } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
    const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (!memberIds.includes(sender.id) || !memberIds.includes(toUserId)) return json({ error: 'not_in_same_group' });

    const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
    const todayEnd = new Date().toISOString().slice(0, 10) + 'T23:59:59.999Z';
    const { data: alreadySent } = await supabase
      .from('reminder_sent')
      .select('id')
      .eq('to_user_id', toUserId)
      .eq('group_id', groupId)
      .gte('sent_at', todayStart)
      .lte('sent_at', todayEnd)
      .limit(1);
    if (alreadySent && alreadySent.length > 0) return json({ error: 'already_sent_today' });

    const { data: profile } = await supabase.from('profiles').select('expo_push_token').eq('user_id', toUserId).maybeSingle();
    const expoToken = (profile as { expo_push_token?: string } | null)?.expo_push_token;
    if (!expoToken || !expoToken.startsWith('ExponentPushToken')) return json({ error: 'no_push_token' });

    await supabase.from('reminder_sent').insert({ from_user_id: sender.id, to_user_id: toUserId, group_id: groupId });

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        to: expoToken,
        title: '오늘의 읽기 리마인드',
        body: `${senderNickname}님이 오늘 읽기 완료하라고 알려달라고 했어요 📖`,
        data: { type: 'reminder', group_id: groupId },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Expo push error', res.status, err);
      return json({ error: 'push_failed' });
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'internal_error' });
  }
});
