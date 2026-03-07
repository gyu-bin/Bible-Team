# 모임장 표시 + 구체적으로 할 만한 개선 목록

## 1. 내일 할 것: 모임장 표시

**이미 있는 것**
- 모임 상세 화면에서 참여 중일 때 **"✓ 모임장"** / **"✓ 이미 참여 중"** 배지 (`app/group/[id]/index.tsx`, `isLeader` 사용)
- 모임장만 **모임 삭제**, 일반 멤버만 **모임 탈퇴** 버튼 노출

**추가하면 좋은 표시 위치**

| 위치 | 파일 | 할 일 |
|------|------|--------|
| **참여 멤버 목록** | `app/group/[id]/index.tsx` | "참여 멤버 (N명)" 아래 멤버 행에서 `m.user_id === group.leader_id`인 경우 닉네임 옆에 **"모임장"** 뱃지 표시 |
| **모임 목록(탭)** | `app/(tabs)/groups.tsx` + `components/GroupListItem.tsx` | `currentUserId`를 구해서 `group.leader_id === currentUserId`이면 카드에 **"모임장"** 뱃지 (제목 옆 또는 메타 아래) |
| **(선택) 홈 카드** | `components/TodayReadingCard.tsx` | `group.leader_id`와 `currentUserId` 비교해 이 모임이 내가 만든 모임이면 카드에 작게 **"모임장"** 표시 |

**데이터**
- `ReadingGroupRow`에 `leader_id: string` 있음 (`types/database.ts`, `reading_groups.leader_id`)
- 모임 상세에서는 이미 `isLeader = group.leader_id === currentUserId` 사용 중

---

## 2. 구체적으로 할 만한 개선 (우선순위/난이도 감)

### 바로 붙이기 좋은 것
- **모임 상세**  
  - 참여 멤버 목록에서 리더 옆에 "모임장" 뱃지 (위와 동일)
- **모임 목록**  
  - 내가 만든 모임 카드에 "모임장" 표시 (`GroupListItem`에 `isLeader` prop 추가)
- **초대 코드**  
  - 모임 상세 또는 생성 완료 화면에 **"초대 코드 복사"** 버튼 추가 (이미 공유는 있음)
- **모임 탈퇴/삭제**  
  - 탈퇴/삭제 전 **확인 다이얼로그** 문구를 더 구체적으로 (예: "정말 탈퇴할까요? 참여 기록은 유지됩니다")

### 기능 확장
- **나눔**  
  - 글 **수정** (본인 글만, 서버/로컬 모두 반영)  
  - 댓글 **삭제** (본인 댓글만)
- **인증 피드**  
  - 촬영/선택 시 **해상도·품질 제한**으로 용량 줄이기 (이미 quality 0.6 적용됨, 필요 시 최대 너비 제한)
- **설정**  
  - **알림 on/off** (로컬 설정만이라도 저장)  
  - **다크 모드 고정** (시스템 무시하고 앱만 다크/라이트 선택)

### UX/안정성
- **오프라인/에러**  
  - API 실패 시 "잠시 후 다시 시도해 주세요" 등 **재시도 안내** 또는 버튼
- **접근성**  
  - 중요 버튼/카드에 `accessibilityLabel` 추가 (스크린 리더)
- **홈**  
  - "오늘 읽기 완료" **취소** 시 확인 한 번 더 (실수 방지)

### 데이터/백엔드
- **Supabase**  
  - RLS 정책 점검 (모임 삭제는 모임장만 등)  
  - 인증 이미지: 현재 base64 저장 → 나중에 Storage + 서명 URL로 전환 시 버킷/정책 다시 확인

---

## 3. 참고: 수정 시 건드릴 파일 요약

- **모임장 표시**  
  - `app/group/[id]/index.tsx` (멤버 목록)  
  - `app/(tabs)/groups.tsx` (currentUserId → GroupListItem에 전달)  
  - `components/GroupListItem.tsx` (isLeader prop, 뱃지 UI)  
  - (선택) `components/TodayReadingCard.tsx`, `app/(tabs)/index.tsx` (홈에서 leader 표시)

- **나눔**  
  - `app/(tabs)/share/index.tsx`, `lib/shareStorage.ts`, `services/shareService.ts`

- **설정**  
  - `app/(tabs)/settings.tsx`, `contexts/ThemeContext.tsx` (다크 모드)

이 문서는 `docs/TODO-모임장-및-개선목록.md`에 저장해 두었습니다.
