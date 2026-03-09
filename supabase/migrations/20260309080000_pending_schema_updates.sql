-- 모임 시작일(선택): 이 날짜부터 1일차로 열림. 없으면 생성일 기준.
-- Supabase Dashboard SQL Editor에서 실행
alter table public.reading_groups
  add column if not exists starts_at date;

comment on column public.reading_groups.starts_at is '선택. 이 날부터 모임이 열림. 없으면 created_at 기준.';
-- 모임 설명/규칙 컬럼 추가: 로컬 저장에서 DB 저장으로 이전
-- Supabase Dashboard SQL Editor에서 실행
alter table public.reading_groups
  add column if not exists description text;

comment on column public.reading_groups.description is '모임 설명 또는 규칙 (선택). 예: 매일 아침 9시에 인증해요';
-- 나눔 글에 사진 첨부 (선택). base64 또는 URL 저장
alter table public.share_posts
  add column if not exists image_url text;

comment on column public.share_posts.image_url is '선택. 첨부 사진 (data URL 또는 공개 URL)';
-- 나눔 글 타입 추가: 'share' (일반 나눔) | 'prayer' (기도 제목)
alter table public.share_posts
  add column if not exists post_type text not null default 'share';

comment on column public.share_posts.post_type is 'share=나눔, prayer=기도제목';
-- expo_push_token 컬럼 추가 (profiles)
alter table public.profiles
  add column if not exists expo_push_token text;

-- reminder_sent 테이블 (응원하기 하루 1회 제한용)
create table if not exists public.reminder_sent (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  sent_at timestamptz default now()
);
alter table public.reminder_sent enable row level security;
drop policy if exists "reminder_sent select" on public.reminder_sent;
drop policy if exists "reminder_sent insert" on public.reminder_sent;
create policy "reminder_sent select" on public.reminder_sent for select using (auth.uid() = from_user_id);
create policy "reminder_sent insert" on public.reminder_sent for insert with check (auth.uid() = from_user_id);
