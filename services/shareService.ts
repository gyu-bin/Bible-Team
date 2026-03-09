import { supabase } from '@/lib/supabase';
import type { SharePost, ShareLike, ShareComment } from '@/types/share';

type SharePostRow = {
  id: string;
  author_id: string;
  author_nickname: string;
  content: string;
  created_at: string;
  group_id: string | null;
  group_title: string | null;
  image_url?: string | null;
  post_type?: string;
};

type ShareCommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  author_nickname: string;
  content: string;
  created_at: string;
};

function toSharePost(r: SharePostRow): SharePost {
  return {
    id: r.id,
    authorId: r.author_id,
    authorNickname: r.author_nickname ?? '',
    content: r.content,
    createdAt: r.created_at,
    groupId: r.group_id ?? null,
    groupTitle: r.group_title ?? null,
    imageUrl: r.image_url ?? null,
    postType: (r.post_type === 'prayer' ? 'prayer' : 'share') as 'share' | 'prayer',
  };
}

function toShareComment(r: ShareCommentRow): ShareComment {
  return {
    id: r.id,
    postId: r.post_id,
    authorId: r.author_id,
    authorNickname: r.author_nickname ?? '',
    content: r.content,
    createdAt: r.created_at,
  };
}

export async function getSharePostsFromServer(options?: { limit?: number; offset?: number }): Promise<SharePost[]> {
  const limit = options?.limit ?? 1000;
  const offset = options?.offset ?? 0;
  const { data, error } = await supabase
    .from('share_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const rows = (data ?? []) as SharePostRow[];
  return rows.map(toSharePost);
}

export async function addSharePostToServer(
  authorId: string,
  authorNickname: string,
  content: string,
  options?: { groupId?: string | null; groupTitle?: string | null; imageUrl?: string | null; postType?: 'share' | 'prayer' }
): Promise<SharePost> {
  const row: Record<string, unknown> = {
    author_id: authorId,
    author_nickname: (authorNickname ?? '').trim() || '익명',
    content: content.trim(),
    group_id: options?.groupId ?? null,
    group_title: options?.groupTitle ?? null,
    post_type: options?.postType ?? 'share',
  };
  if (options?.imageUrl != null && options.imageUrl !== '') row.image_url = options.imageUrl;
  const { data, error } = await supabase
    .from('share_posts')
    .insert(row)
    .select('id, author_id, author_nickname, content, created_at, group_id, group_title, post_type')
    .single();
  if (error) throw error;
  const thin = data as Omit<SharePostRow, 'image_url'>;
  return toSharePost({ ...thin, image_url: options?.imageUrl ?? null } as SharePostRow);
}

export async function updateSharePostFromServer(
  postId: string,
  authorId: string,
  content: string,
  options?: { groupId?: string | null; groupTitle?: string | null; imageUrl?: string | null }
): Promise<SharePost> {
  const update: Record<string, unknown> = {
    content: content.trim(),
    group_id: options?.groupId ?? null,
    group_title: options?.groupTitle ?? null,
  };
  if (options && 'imageUrl' in options) update.image_url = options.imageUrl ?? null;
  const { data, error } = await supabase
    .from('share_posts')
    .update(update)
    .eq('id', postId)
    .eq('author_id', authorId)
    .select()
    .single();

  if (error) throw error;
  return toSharePost(data as SharePostRow);
}

export async function deleteSharePostFromServer(postId: string, authorId: string): Promise<void> {
  const { error } = await supabase
    .from('share_posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', authorId);

  if (error) throw error;
}

export async function deleteShareCommentFromServer(commentId: string, authorId: string): Promise<void> {
  const { error } = await supabase
    .from('share_comments')
    .delete()
    .eq('id', commentId)
    .eq('author_id', authorId);

  if (error) throw error;
}

export async function getShareLikesFromServer(postId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('share_likes')
    .select('user_id')
    .eq('post_id', postId);

  if (error) throw error;
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

export async function getShareLikeCountsFromServer(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('share_likes')
    .select('post_id')
    .in('post_id', postIds);

  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

/** 전체 좋아요 수 (나눔 목록용) */
export async function getAllShareLikeCountsFromServer(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('share_likes').select('post_id');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

/** 전체 댓글 수 (나눔 목록용) */
export async function getAllShareCommentCountsFromServer(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('share_comments').select('post_id');
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

export async function toggleShareLikeOnServer(postId: string, userId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('share_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase.from('share_likes').delete().eq('post_id', postId).eq('user_id', userId);
    return false;
  }
  await supabase.from('share_likes').insert({ post_id: postId, user_id: userId });
  return true;
}

export async function getShareCommentsFromServer(postId: string): Promise<ShareComment[]> {
  const { data, error } = await supabase
    .from('share_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as ShareCommentRow[]).map(toShareComment);
}

export async function getShareCommentCountsFromServer(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('share_comments')
    .select('post_id')
    .in('post_id', postIds);

  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { post_id: string }[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
  }
  return counts;
}

export async function addShareCommentToServer(
  postId: string,
  authorId: string,
  authorNickname: string,
  content: string
): Promise<ShareComment> {
  const { data, error } = await supabase
    .from('share_comments')
    .insert({
      post_id: postId,
      author_id: authorId,
      author_nickname: (authorNickname ?? '').trim() || '익명',
      content: content.trim(),
    })
    .select()
    .single();

  if (error) throw error;
  return toShareComment(data as ShareCommentRow);
}
