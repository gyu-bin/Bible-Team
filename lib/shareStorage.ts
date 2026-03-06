import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOrCreateLocalUserId, getNickname } from '@/lib/cache';
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

/** 나눔 글 목록 (최신순) */
export async function getSharePosts(): Promise<SharePost[]> {
  const posts = await getStoredPosts();
  return [...posts].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

/** 전체 좋아요/댓글 수 맵 (목록용) */
export async function getShareCounts(): Promise<{
  likeCountByPost: Record<string, number>;
  commentCountByPost: Record<string, number>;
}> {
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

/** 나눔 글 작성 (내용 + 선택한 모임) */
export async function addSharePost(
  content: string,
  options?: { groupId?: string | null; groupTitle?: string | null }
): Promise<SharePost> {
  const authorId = await getOrCreateLocalUserId();
  const authorNickname = (await getNickname()) || '익명';
  const post: SharePost = {
    id: generateId(),
    authorId,
    authorNickname,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    groupId: options?.groupId ?? null,
    groupTitle: options?.groupTitle ?? null,
  };
  const posts = await getStoredPosts();
  await setStoredPosts([post, ...posts]);
  return post;
}

/** 특정 글 좋아요 목록 (userId 배열) */
export async function getShareLikes(postId: string): Promise<string[]> {
  const likes = await getStoredLikes();
  return likes.filter((l) => l.postId === postId).map((l) => l.userId);
}

/** 좋아요 토글 */
export async function toggleShareLike(postId: string): Promise<boolean> {
  const userId = await getOrCreateLocalUserId();
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

/** 특정 글 댓글 목록 */
export async function getShareComments(postId: string): Promise<ShareComment[]> {
  const comments = await getStoredComments();
  return comments
    .filter((c) => c.postId === postId)
    .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

/** 댓글 작성 */
export async function addShareComment(postId: string, content: string): Promise<ShareComment> {
  const authorId = await getOrCreateLocalUserId();
  const authorNickname = (await getNickname()) || '익명';
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

/** 나눔 글 삭제 (해당 글의 좋아요·댓글 함께 삭제) */
export async function deleteSharePost(postId: string): Promise<void> {
  const posts = await getStoredPosts();
  await setStoredPosts(posts.filter((p) => p.id !== postId));
  const likes = await getStoredLikes();
  await setStoredLikes(likes.filter((l) => l.postId !== postId));
  const comments = await getStoredComments();
  await setStoredComments(comments.filter((c) => c.postId !== postId));
}
