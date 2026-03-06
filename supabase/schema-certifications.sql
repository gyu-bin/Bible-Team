-- 인증 사진: DB에는 이미지 URL(텍스트)만 저장, 실제 파일은 Storage에 저장해 DB 용량 절약
-- Supabase Dashboard SQL Editor에서 실행 후, Storage에서 bucket 'certifications' 생성 (public)

-- 인증 사진 메타 (이미지 URL만 저장)
create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.reading_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_nickname text not null default '',
  image_url text not null,
  created_at timestamptz default now()
);

create index if not exists idx_certifications_group_id on public.certifications(group_id);

alter table public.certifications enable row level security;

drop policy if exists "certifications select" on public.certifications;
drop policy if exists "certifications insert" on public.certifications;
drop policy if exists "certifications delete" on public.certifications;
create policy "certifications select" on public.certifications for select using (true);
create policy "certifications insert" on public.certifications for insert with check (auth.uid() = user_id);
create policy "certifications delete" on public.certifications for delete using (auth.uid() = user_id);

-- Storage bucket 'certifications' 생성 (Dashboard > Storage > New bucket):
-- 1. Name: certifications
-- 2. Public bucket: 체크 (이미지 URL로 공개 조회)
-- 3. 정책 예시 (Policy):
--    - INSERT: (auth.role() = 'authenticated')
--    - SELECT: (true)
--    - DELETE: (auth.role() = 'authenticated') 또는 RLS로 본인만 삭제
