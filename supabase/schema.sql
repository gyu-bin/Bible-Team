-- 바이블 크루 DB 스키마 (Supabase PostgreSQL)
-- Supabase Dashboard SQL Editor에서 실행
-- 이미 reading_groups / profiles / group_members / reading_logs 실행했으면 새로 추가한 나눔만: schema-share-only.sql 실행

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

-- 유저 프로필 (닉네임)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '',
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

-- 나눔 글
create table if not exists public.share_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null default '',
  content text not null,
  created_at timestamptz default now(),
  group_id uuid references public.reading_groups(id) on delete set null,
  group_title text
);

-- 나눔 좋아요
create table if not exists public.share_likes (
  post_id uuid not null references public.share_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (post_id, user_id)
);

-- 나눔 댓글
create table if not exists public.share_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.share_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null default '',
  content text not null,
  created_at timestamptz default now()
);

-- RLS (Row Level Security)
alter table public.reading_groups enable row level security;
alter table public.profiles enable row level security;
alter table public.group_members enable row level security;
alter table public.reading_logs enable row level security;
alter table public.share_posts enable row level security;
alter table public.share_likes enable row level security;
alter table public.share_comments enable row level security;

-- reading_groups 정책 (있으면 삭제 후 생성 → 여러 번 실행 가능)
drop policy if exists "reading_groups select" on public.reading_groups;
drop policy if exists "reading_groups insert" on public.reading_groups;
drop policy if exists "reading_groups update" on public.reading_groups;
drop policy if exists "reading_groups delete" on public.reading_groups;
create policy "reading_groups select" on public.reading_groups for select using (true);
create policy "reading_groups insert" on public.reading_groups for insert with check (auth.uid() = leader_id);
create policy "reading_groups update" on public.reading_groups for update using (auth.uid() = leader_id);
create policy "reading_groups delete" on public.reading_groups for delete using (auth.uid() = leader_id);

-- profiles 정책
drop policy if exists "profiles select" on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles select" on public.profiles for select using (true);
create policy "profiles insert" on public.profiles for insert with check (auth.uid() = user_id);
create policy "profiles update" on public.profiles for update using (auth.uid() = user_id);

-- group_members 정책
drop policy if exists "group_members select" on public.group_members;
drop policy if exists "group_members insert" on public.group_members;
drop policy if exists "group_members delete" on public.group_members;
create policy "group_members select" on public.group_members for select using (true);
create policy "group_members insert" on public.group_members for insert with check (auth.uid() = user_id);
create policy "group_members delete" on public.group_members for delete using (auth.uid() = user_id);

-- reading_logs 정책
drop policy if exists "reading_logs select" on public.reading_logs;
drop policy if exists "reading_logs insert" on public.reading_logs;
drop policy if exists "reading_logs update" on public.reading_logs;
drop policy if exists "reading_logs delete" on public.reading_logs;
create policy "reading_logs select" on public.reading_logs for select using (true);
create policy "reading_logs insert" on public.reading_logs for insert with check (auth.uid() = user_id);
create policy "reading_logs update" on public.reading_logs for update using (auth.uid() = user_id);
create policy "reading_logs delete" on public.reading_logs for delete using (auth.uid() = user_id);

-- share_posts 정책
drop policy if exists "share_posts select" on public.share_posts;
drop policy if exists "share_posts insert" on public.share_posts;
drop policy if exists "share_posts update" on public.share_posts;
drop policy if exists "share_posts delete" on public.share_posts;
create policy "share_posts select" on public.share_posts for select using (true);
create policy "share_posts insert" on public.share_posts for insert with check (auth.uid() = author_id);
create policy "share_posts update" on public.share_posts for update using (auth.uid() = author_id);
create policy "share_posts delete" on public.share_posts for delete using (auth.uid() = author_id);

-- share_likes 정책
drop policy if exists "share_likes select" on public.share_likes;
drop policy if exists "share_likes insert" on public.share_likes;
drop policy if exists "share_likes delete" on public.share_likes;
create policy "share_likes select" on public.share_likes for select using (true);
create policy "share_likes insert" on public.share_likes for insert with check (auth.uid() = user_id);
create policy "share_likes delete" on public.share_likes for delete using (auth.uid() = user_id);

-- share_comments 정책
drop policy if exists "share_comments select" on public.share_comments;
drop policy if exists "share_comments insert" on public.share_comments;
drop policy if exists "share_comments update" on public.share_comments;
drop policy if exists "share_comments delete" on public.share_comments;
create policy "share_comments select" on public.share_comments for select using (true);
create policy "share_comments insert" on public.share_comments for insert with check (auth.uid() = author_id);
create policy "share_comments update" on public.share_comments for update using (auth.uid() = author_id);
create policy "share_comments delete" on public.share_comments for delete using (auth.uid() = author_id);
