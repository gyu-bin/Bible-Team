-- 바이블 크루 DB 스키마 (Supabase PostgreSQL)
-- Supabase Dashboard SQL Editor에서 실행

-- 모임
create table if not exists public.reading_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  leader_id uuid not null references auth.users(id) on delete cascade,
  start_book text not null,
  pages_per_day int not null check (pages_per_day > 0),
  duration_days int not null check (duration_days > 0),
  invite_code text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 모임 멤버
create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

-- 읽기 기록
create table if not exists public.reading_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  book text not null,
  chapter int not null,
  is_completed boolean default false,
  logged_at timestamptz default now()
);

-- RLS (Row Level Security) 예시: 인증된 사용자만 읽기/쓰기
alter table public.reading_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.reading_logs enable row level security;

create policy "reading_groups select" on public.reading_groups for select using (true);
create policy "reading_groups insert" on public.reading_groups for insert with check (auth.uid() = leader_id);
create policy "group_members select" on public.group_members for select using (true);
create policy "group_members insert" on public.group_members for insert with check (auth.uid() = user_id);
create policy "reading_logs all" on public.reading_logs for all using (auth.uid() = user_id);
