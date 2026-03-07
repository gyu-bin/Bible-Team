-- 푸시 리마인드용: profiles에 푸시 토큰, 리마인드 발송 제한 테이블
-- Supabase Dashboard SQL Editor에서 실행 (기존 schema 적용 후)

-- 1) profiles에 expo_push_token 추가
alter table public.profiles
  add column if not exists expo_push_token text;

-- 2) 리마인드 발송 기록 (같은 사람·같은 모임에 하루 1회만 발송)
create table if not exists public.reminder_sent (
  id uuid primary key default gen_random_uuid(),
  to_user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz default now()
);

alter table public.reminder_sent enable row level security;

-- 본인이 보낸 기록만 조회 가능 (선택)
create policy "reminder_sent select own" on public.reminder_sent
  for select using (auth.uid() = from_user_id);

-- Edge Function에서 삽입하려면 service_role 사용. 클라이언트에서는 삽입 불필요.
create policy "reminder_sent insert" on public.reminder_sent
  for insert with check (auth.uid() = from_user_id);

-- 인덱스: 오늘 같은 수신자+모임 발송 여부 빠르게 조회
create index if not exists idx_reminder_sent_to_group_date
  on public.reminder_sent (to_user_id, group_id, sent_at);
