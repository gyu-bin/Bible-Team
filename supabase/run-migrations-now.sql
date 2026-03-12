-- ============================================================
-- 기존 DB에 적용: 새로 추가된 컬럼/테이블만 반영 (한 번만 실행)
-- Supabase Dashboard → SQL Editor에서 이 파일 전체 실행
-- ============================================================
-- 이미 schema.sql 전체를 실행한 적 없고, 예전 버전에서 컬럼이 빠져 있을 때
-- 이 스크립트만 실행하면 됩니다. 여러 번 실행해도 안전합니다 (if not exists).
-- ============================================================

-- 1) reading_groups: 설명(선택)
alter table public.reading_groups
  add column if not exists description text;
comment on column public.reading_groups.description is '모임 설명 또는 규칙 (선택)';

-- 2) reading_groups: 시작일(선택)
alter table public.reading_groups
  add column if not exists starts_at date;
comment on column public.reading_groups.starts_at is '선택. 이 날부터 모임이 열림. 없으면 created_at 기준.';

-- 3) share_posts: 사진 첨부(선택)
alter table public.share_posts
  add column if not exists image_url text;
comment on column public.share_posts.image_url is '선택. 첨부 사진 (data URL 또는 공개 URL)';

-- 4) profiles: 푸시 토큰 (리마인드용)
alter table public.profiles
  add column if not exists expo_push_token text;

-- 5) 리마인드 발송 기록 테이블 (같은 사람·같은 모임 하루 1회 제한용)
create table if not exists public.reminder_sent (
  id uuid primary key default gen_random_uuid(),
  to_user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz default now()
);

alter table public.reminder_sent enable row level security;

drop policy if exists "reminder_sent select own" on public.reminder_sent;
create policy "reminder_sent select own" on public.reminder_sent
  for select using (auth.uid() = from_user_id);

drop policy if exists "reminder_sent insert" on public.reminder_sent;
create policy "reminder_sent insert" on public.reminder_sent
  for insert with check (auth.uid() = from_user_id);

create index if not exists idx_reminder_sent_to_group_date
  on public.reminder_sent (to_user_id, group_id, sent_at);

-- 6) share_posts: 함께 읽는 말씀(일차·구절) 연결
alter table public.share_posts
  add column if not exists day_index integer;
comment on column public.share_posts.day_index is '선택. 글 작성 시점 모임 기준 N일차(0-based)';

alter table public.share_posts
  add column if not exists passage_label text;
comment on column public.share_posts.passage_label is '선택. 해당 일차 오늘 읽기 구절 표시용 (예: 로마서 3장)';
