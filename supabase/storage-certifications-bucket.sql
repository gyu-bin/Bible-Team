-- 인증 사진용 Storage 버킷 생성 (Bucket not found 오류 해결)
-- Supabase Dashboard > SQL Editor에서 이 파일 내용을 실행하세요.

-- 1. 버킷 생성 (이미 있으면 무시)
insert into storage.buckets (id, name, public)
values ('certifications', 'certifications', true)
on conflict (id) do update set public = true;

-- 2. 정책: 누구나 조회 (공개 버킷)
drop policy if exists "certifications public read" on storage.objects;
create policy "certifications public read"
on storage.objects for select
using (bucket_id = 'certifications');

-- 3. 정책: 로그인한 사용자만 업로드
drop policy if exists "certifications authenticated upload" on storage.objects;
create policy "certifications authenticated upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'certifications');

-- 4. 정책: 본인 객체만 삭제
drop policy if exists "certifications authenticated delete" on storage.objects;
create policy "certifications authenticated delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'certifications');
