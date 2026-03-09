-- 나눔 글에 사진 첨부 (선택). base64 또는 URL 저장
alter table public.share_posts
  add column if not exists image_url text;

comment on column public.share_posts.image_url is '선택. 첨부 사진 (data URL 또는 공개 URL)';
