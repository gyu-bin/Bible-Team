-- 나눔(share) 관련만 — 이미 reading_groups, profiles, group_members, reading_logs 실행한 경우 이것만 실행
-- Supabase Dashboard SQL Editor에서 실행

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

alter table public.share_posts enable row level security;
alter table public.share_likes enable row level security;
alter table public.share_comments enable row level security;

drop policy if exists "share_posts select" on public.share_posts;
drop policy if exists "share_posts insert" on public.share_posts;
drop policy if exists "share_posts update" on public.share_posts;
drop policy if exists "share_posts delete" on public.share_posts;
create policy "share_posts select" on public.share_posts for select using (true);
create policy "share_posts insert" on public.share_posts for insert with check (auth.uid() = author_id);
create policy "share_posts update" on public.share_posts for update using (auth.uid() = author_id);
create policy "share_posts delete" on public.share_posts for delete using (auth.uid() = author_id);

drop policy if exists "share_likes select" on public.share_likes;
drop policy if exists "share_likes insert" on public.share_likes;
drop policy if exists "share_likes delete" on public.share_likes;
create policy "share_likes select" on public.share_likes for select using (true);
create policy "share_likes insert" on public.share_likes for insert with check (auth.uid() = user_id);
create policy "share_likes delete" on public.share_likes for delete using (auth.uid() = user_id);

drop policy if exists "share_comments select" on public.share_comments;
drop policy if exists "share_comments insert" on public.share_comments;
drop policy if exists "share_comments update" on public.share_comments;
drop policy if exists "share_comments delete" on public.share_comments;
create policy "share_comments select" on public.share_comments for select using (true);
create policy "share_comments insert" on public.share_comments for insert with check (auth.uid() = author_id);
create policy "share_comments update" on public.share_comments for update using (auth.uid() = author_id);
create policy "share_comments delete" on public.share_comments for delete using (auth.uid() = author_id);
