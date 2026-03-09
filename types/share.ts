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
  /** 선택. 첨부 사진 (data URL 또는 공개 URL) */
  imageUrl?: string | null;
  /** 'share' = 일반 나눔, 'prayer' = 기도 제목. 기본값 'share' */
  postType?: 'share' | 'prayer';
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
