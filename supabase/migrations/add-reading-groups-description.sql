-- 모임 설명/규칙 컬럼 추가: 로컬 저장에서 DB 저장으로 이전
-- Supabase Dashboard SQL Editor에서 실행
alter table public.reading_groups
  add column if not exists description text;

comment on column public.reading_groups.description is '모임 설명 또는 규칙 (선택). 예: 매일 아침 9시에 인증해요';
