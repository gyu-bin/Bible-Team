import type { SharePost } from '@/types/share';

/** 글 작성 화면에서 등록 성공 시 설정. 목록 화면 포커스 시 꺼내서 맨 위에 붙인 뒤 클리어 */
let pending: SharePost | null = null;

export function setPendingNewPost(post: SharePost | null): void {
  pending = post;
}

export function getAndClearPendingNewPost(): SharePost | null {
  const p = pending;
  pending = null;
  return p;
}
