# Supabase SQL 실행 안내

## 새로 실행해야 할 때

### 1) DB를 처음 만드는 경우
**Supabase Dashboard → SQL Editor**에서 아래 파일 **전체** 실행:

- **`schema.sql`**  
  테이블·RLS 전부 생성 (reading_groups, profiles, group_members, reading_logs, share_posts, share_likes, share_comments)

### 2) 이미 테이블이 있고, 최근 수정사항만 반영하고 싶은 경우
**Supabase Dashboard → SQL Editor**에서 아래 파일 **한 번** 실행:

- **`run-migrations-now.sql`**  
  추가된 컬럼·테이블만 적용 (여러 번 실행해도 안전)

  적용 내용:
  - `reading_groups`: `description`, `starts_at`
  - `share_posts`: `image_url`
  - `profiles`: `expo_push_token`
  - `reminder_sent` 테이블 + RLS + 인덱스

---

## 파일 역할

| 파일 | 용도 |
|------|------|
| `schema.sql` | 전체 스키마 (처음 한 번) |
| `run-migrations-now.sql` | 기존 DB에 최신 변경분만 적용 |
| `migrations/*.sql` | 변경 이력 (참고용, 위에서 이미 반영됨) |
| `schema-push-reminder.sql` | 리마인드용 (내용은 run-migrations-now.sql에 포함됨) |
