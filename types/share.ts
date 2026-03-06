export interface SharePost {
  id: string;
  authorId: string;
  authorNickname: string;
  content: string;
  createdAt: string;
  /** 선택한 모임 ID (없으면 null) */
  groupId?: string | null;
  /** 선택한 모임 이름 (표시용) */
  groupTitle?: string | null;
}

export interface ShareLike {
  postId: string;
  userId: string;
}

export interface ShareComment {
  id: string;
  postId: string;
  authorId: string;
  authorNickname: string;
  content: string;
  createdAt: string;
}
