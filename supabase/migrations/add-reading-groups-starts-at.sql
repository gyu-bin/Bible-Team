-- 모임 시작일(선택): 이 날짜부터 1일차로 열림. 없으면 생성일 기준.
-- Supabase Dashboard SQL Editor에서 실행
alter table public.reading_groups
  add column if not exists starts_at date;

comment on column public.reading_groups.starts_at is '선택. 이 날부터 모임이 열림. 없으면 created_at 기준.';
