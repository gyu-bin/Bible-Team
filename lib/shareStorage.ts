import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateLocalUserId, getNickname } from '@/lib/cache';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import {
  getSharePostsFromServer,
  addSharePostToServer,
  updateSharePostFromServer,
  deleteSharePostFromServer,
  getShareLikesFromServer,
  toggleShareLikeOnServer,
  getShareCommentsFromServer,
  addShareCommentToServer,
  deleteShareCommentFromServer,
  getAllShareLikeCountsFromServer,
  getAllShareCommentCountsFromServer,
} from '@/services/shareService';
import type { SharePost, ShareLike, ShareComment } from '@/types/share';

const KEY_SHARE_POSTS = '@bible_crew_share_posts';
const KEY_SHARE_LIKES = '@bible_crew_share_likes';
const KEY_SHARE_COMMENTS = '@bible_crew_share_comments';

function generateId(): string {
  return 'share_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function getStoredPosts(): Promise<SharePost[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SHARE_POSTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SharePost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setStoredPosts(posts: SharePost[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SHARE_POSTS, JSON.stringify(posts));
  } catch {
    // ignore
  }
}

async function getStoredLikes(): Promise<ShareLike[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SHARE_LIKES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShareLike[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setStoredLikes(likes: ShareLike[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SHARE_LIKES, JSON.stringify(likes));
  } catch {
    // ignore
  }
}

async function getStoredComments(): Promise<ShareComment[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SHARE_COMMENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ShareComment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setStoredComments(comments: ShareComment[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_SHARE_COMMENTS, JSON.stringify(comments));
  } catch {
    // ignore
  }
}

const SHARE_PAGE_SIZE = 20;

/** 나눔 글 목록 (최신순). limit/offset 있으면 페이지네이션 */
export async function getSharePosts(options?: { limit?: number; offset?: number }): Promise<SharePost[]> {
  const limit = options?.limit ?? 1000;
  const offset = options?.offset ?? 0;
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      return await getSharePostsFromServer({ limit, offset });
    } catch (e) {
      console.warn('getSharePostsFromServer failed', e);
    }
  }
  const all = await getStoredPosts();
  const sorted = [...all].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return sorted.slice(offset, offset + limit);
}

/** 전체 좋아요/댓글 수 맵 (목록용). 로그인 시 서버, 아니면 로컬 */
export async function getShareCounts(): Promise<{
  likeCountByPost: Record<string, number>;
  commentCountByPost: Record<string, number>;
}> {
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      const [likeCountByPost, commentCountByPost] = await Promise.all([
        getAllShareLikeCountsFromServer(),
        getAllShareCommentCountsFromServer(),
      ]);
      return { likeCountByPost, commentCountByPost };
    } catch (e) {
      console.warn('getShareCounts from server failed', e);
    }
  }
  const [likes, comments] = await Promise.all([getStoredLikes(), getStoredComments()]);
  const likeCountByPost: Record<string, number> = {};
  const commentCountByPost: Record<string, number> = {};
  likes.forEach((l) => {
    likeCountByPost[l.postId] = (likeCountByPost[l.postId] ?? 0) + 1;
  });
  comments.forEach((c) => {
    commentCountByPost[c.postId] = (commentCountByPost[c.postId] ?? 0) + 1;
  });
  return { likeCountByPost, commentCountByPost };
}

/** 나눔 글 작성 (내용 + 선택한 모임 + 선택 사진). 세션 있으면 서버, 없으면 기기 로컬 */
export async function addSharePost(
  content: string,
  options?: { groupId?: string | null; groupTitle?: string | null; imageUrl?: string | null; postType?: 'share' | 'prayer' }
): Promise<SharePost> {
  const authorNickname = (await getNickname()) || '익명';
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      return await addSharePostToServer(user.id, authorNickname, content, options);
    } catch (e) {
      console.warn('addSharePostToServer failed', e);
      throw e;
    }
  }
  const authorId = await getOrCreateLocalUserId();
  const post: SharePost = {
    id: generateId(),
    authorId,
    authorNickname,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    groupId: options?.groupId ?? null,
    groupTitle: options?.groupTitle ?? null,
    imageUrl: options?.imageUrl ?? null,
    postType: options?.postType ?? 'share',
  };
  const posts = await getStoredPosts();
  await setStoredPosts([post, ...posts]);
  return post;
}

/** 특정 글 좋아요 목록 (userId 배열). 로그인 시 서버 */
export async function getShareLikes(postId: string): Promise<string[]> {
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      return await getShareLikesFromServer(postId);
    } catch (e) {
      console.warn('getShareLikesFromServer failed', e);
    }
  }
  const likes = await getStoredLikes();
  return likes.filter((l) => l.postId === postId).map((l) => l.userId);
}

/** 좋아요 토글. 로그인 시 서버 */
export async function toggleShareLike(postId: string): Promise<boolean> {
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  const userId = user?.id ?? (await getOrCreateLocalUserId());
  if (user?.id) {
    try {
      return await toggleShareLikeOnServer(postId, user.id);
    } catch (e) {
      console.warn('toggleShareLikeOnServer failed', e);
    }
  }
  const likes = await getStoredLikes();
  const idx = likes.findIndex((l) => l.postId === postId && l.userId === userId);
  if (idx >= 0) {
    likes.splice(idx, 1);
    await setStoredLikes(likes);
    return false;
  }
  likes.push({ postId, userId });
  await setStoredLikes(likes);
  return true;
}

/** 특정 글 댓글 목록. 로그인 시 서버 */
export async function getShareComments(postId: string): Promise<ShareComment[]> {
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      return await getShareCommentsFromServer(postId);
    } catch (e) {
      console.warn('getShareCommentsFromServer failed', e);
    }
  }
  const comments = await getStoredComments();
  return comments
    .filter((c) => c.postId === postId)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

/** 댓글 작성. 로그인 시 서버 */
export async function addShareComment(postId: string, content: string): Promise<ShareComment> {
  const authorNickname = (await getNickname()) || '익명';
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      return await addShareCommentToServer(postId, user.id, authorNickname, content);
    } catch (e) {
      console.warn('addShareCommentToServer failed', e);
    }
  }
  const authorId = await getOrCreateLocalUserId();
  const comment: ShareComment = {
    id: generateId(),
    postId,
    authorId,
    authorNickname,
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };
  const comments = await getStoredComments();
  await setStoredComments([...comments, comment]);
  return comment;
}

/** 나눔 글 수정 (본인 글만). 로그인 시 서버, 아니면 로컬 */
export async function updateSharePost(
  postId: string,
  content: string,
  options?: { groupId?: string | null; groupTitle?: string | null }
): Promise<SharePost> {
  const authorNickname = (await getNickname()) || '익명';
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      return await updateSharePostFromServer(postId, user.id, content, options);
    } catch (e) {
      console.warn('updateSharePostFromServer failed', e);
      throw e;
    }
  }
  const posts = await getStoredPosts();
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) throw new Error('Post not found');
  const updated: SharePost = {
    ...posts[idx],
    content: content.trim(),
    groupId: options?.groupId ?? posts[idx].groupId ?? null,
    groupTitle: options?.groupTitle ?? posts[idx].groupTitle ?? null,
  };
  posts[idx] = updated;
  await setStoredPosts(posts);
  return updated;
}

/** 댓글 삭제 (본인 댓글만). 로그인 시 서버, 아니면 로컬 */
export async function deleteShareComment(commentId: string): Promise<void> {
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  const authorId = user?.id ?? (await getOrCreateLocalUserId());
  if (user?.id) {
    try {
      await deleteShareCommentFromServer(commentId, user.id);
      return;
    } catch (e) {
      console.warn('deleteShareCommentFromServer failed', e);
      throw e;
    }
  }
  const comments = await getStoredComments();
  await setStoredComments(comments.filter((c) => c.id !== commentId));
}

/** 나눔 글 삭제. 로그인 시 서버(본인 글만), 아니면 로컬 */
export async function deleteSharePost(postId: string): Promise<void> {
  const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
  if (user?.id) {
    try {
      await deleteSharePostFromServer(postId, user.id);
      return;
    } catch (e) {
      console.warn('deleteSharePostFromServer failed', e);
    }
  }
  const posts = await getStoredPosts();
  await setStoredPosts(posts.filter((p) => p.id !== postId));
  const likes = await getStoredLikes();
  await setStoredLikes(likes.filter((l) => l.postId !== postId));
  const comments = await getStoredComments();
  await setStoredComments(comments.filter((c) => c.postId !== postId));
}
