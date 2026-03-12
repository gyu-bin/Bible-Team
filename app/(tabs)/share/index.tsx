import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh } from '@/contexts/DataRefreshContext';
import {
  getSharePosts,
  getShareCounts,
  deleteSharePost,
  updateSharePost,
  getShareLikes,
  toggleShareLike,
  getShareComments,
  addShareComment,
  deleteShareComment,
} from '@/lib/shareStorage';

const SHARE_PAGE_SIZE = 20;
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getOrCreateLocalUserId, getCachedGroups, getLocalGroups, getNickname } from '@/lib/cache';
import { getMyGroups } from '@/services/groupService';
import { getNicknamesByUserIds } from '@/services/profileService';
import { getAndClearPendingNewPost } from './pendingNewPost';
import type { SharePost, ShareComment } from '@/types/share';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}시간 전`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ShareListScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const { refreshKey } = useDataRefresh();
  const insets = useSafeAreaInsets();
  const s = (n: number) => Math.round(n * fontScale);
  const [posts, setPosts] = useState<SharePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailPost, setDetailPost] = useState<SharePost | null>(null);
  const [detailLikes, setDetailLikes] = useState<string[]>([]);
  const [detailComments, setDetailComments] = useState<ShareComment[]>([]);
  const [detailCommentInput, setDetailCommentInput] = useState('');
  const [detailCommentSubmitting, setDetailCommentSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [likeCountByPost, setLikeCountByPost] = useState<Record<string, number>>({});
  const [commentCountByPost, setCommentCountByPost] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'share' | 'prayer'>('share');
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [filterGroups, setFilterGroups] = useState<{ id: string; title: string }[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [authorNicknamesMap, setAuthorNicknamesMap] = useState<Record<string, string>>({});
  const [currentUserNickname, setCurrentUserNickname] = useState('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editGroupTitle, setEditGroupTitle] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const params = useLocalSearchParams<{ groupId?: string }>();
  const pendingPostRef = useRef<SharePost | null>(null);
  const mountedRef = useRef(false);
  const lastFetchRef = useRef(0);
  const STALE_MS = 30_000;

  const loadPosts = useCallback(async (mergeAtTop?: SharePost | null) => {
    lastFetchRef.current = Date.now();
    let toMerge: SharePost | null | undefined = mergeAtTop;
    if (toMerge == null && pendingPostRef.current) {
      toMerge = pendingPostRef.current;
      pendingPostRef.current = null;
    }
    const [list, counts] = await Promise.all([
      getSharePosts({ limit: SHARE_PAGE_SIZE, offset: 0 }),
      getShareCounts(),
    ]);
    const hasMerged = toMerge != null && !list.some((p) => p.id === toMerge!.id);
    const finalList: SharePost[] = hasMerged && toMerge ? [toMerge, ...list] : list;
    setPosts(finalList);
    setHasMorePosts(list.length >= SHARE_PAGE_SIZE);
    setLikeCountByPost(counts.likeCountByPost);
    setCommentCountByPost(counts.commentCountByPost);
    const authorIds = [...new Set(finalList.map((p) => p.authorId).filter(Boolean))];
    if (authorIds.length > 0) {
      const nickMap = await getNicknamesByUserIds(authorIds).catch(() => ({}));
      setAuthorNicknamesMap(nickMap);
    }
    const currentNick = await getNickname();
    setCurrentUserNickname(currentNick ?? '');
    return finalList;
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMorePosts) return;
    setLoadingMore(true);
    try {
      const list = await getSharePosts({ limit: SHARE_PAGE_SIZE, offset: posts.length });
      setPosts((prev) => [...prev, ...list]);
      setHasMorePosts(list.length >= SHARE_PAGE_SIZE);
      const counts = await getShareCounts();
      setLikeCountByPost(counts.likeCountByPost);
      setCommentCountByPost(counts.commentCountByPost);
      const authorIds = [...new Set(list.map((p) => p.authorId).filter(Boolean))];
      if (authorIds.length > 0) {
        const nickMap = await getNicknamesByUserIds(authorIds).catch(() => ({}));
        setAuthorNicknamesMap((prev) => ({ ...prev, ...nickMap }));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMorePosts, posts.length]);

  const load = useCallback(async () => {
    try {
      const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
      const uid = user?.id ?? (await getOrCreateLocalUserId());
      setCurrentUserId(uid);
      let groups: { id: string; title: string }[] = [];
      if (user?.id) {
        try {
          const list = await getMyGroups(user.id);
          groups = list.map((g) => ({ id: g.id, title: g.title }));
        } catch {
          const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
          const raw = local.length > 0 ? local : cached;
          groups = raw.map((g) => ({ id: g.id, title: g.title }));
        }
      } else {
        const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
        const raw = local.length > 0 ? local : cached;
        groups = raw.map((g) => ({ id: g.id, title: g.title }));
      }
      setFilterGroups(groups);
      await loadPosts();
    } catch (e) {
      console.error(e);
    } finally {
      setGroupsLoaded(true);
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPosts]);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const pendingPost = getAndClearPendingNewPost();
      if (pendingPost) {
        pendingPostRef.current = pendingPost;
        setPosts((prev) => [pendingPost, ...prev]);
        if (pendingPost.authorId) {
          setAuthorNicknamesMap((prev) => ({
            ...prev,
            [pendingPost.authorId]: pendingPost.authorNickname ?? '',
          }));
        }
      }
      const now = Date.now();
      if (!pendingPost && now - lastFetchRef.current < STALE_MS) return;
      lastFetchRef.current = now;
      load();
    }, [load])
  );

  useEffect(() => {
    if (params.groupId) {
      setFilterGroupId(params.groupId);
    }
  }, [params.groupId]);

  const myGroupIds = filterGroups.map((g) => g.id);
  const groupFilteredPosts =
    filterGroupId !== null
      ? posts.filter((p) => p.groupId === filterGroupId)
      : !groupsLoaded
        ? posts
        : posts.filter((p) => p.groupId == null || myGroupIds.includes(p.groupId));
  const filteredPosts = groupFilteredPosts.filter((p) => (p.postType ?? 'share') === activeTab);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const openDetail = async (post: SharePost) => {
    setDetailPost(post);
    setDetailCommentInput('');
    const [likes, comments] = await Promise.all([
      getShareLikes(post.id),
      getShareComments(post.id),
    ]);
    setDetailLikes(likes);
    setDetailComments(comments);
    const commentAuthorIds = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
    if (commentAuthorIds.length > 0) {
      getNicknamesByUserIds(commentAuthorIds).then((m) => setAuthorNicknamesMap((prev) => ({ ...prev, ...m }))).catch(() => {});
    }
  };

  const displayNickname = (authorId: string, storedNickname: string) =>
    authorId === currentUserId ? (currentUserNickname || storedNickname) : (authorNicknamesMap[authorId] ?? storedNickname);

  const handleLike = async () => {
    if (!detailPost) return;
    const liked = await toggleShareLike(detailPost.id);
    const likes = await getShareLikes(detailPost.id);
    setDetailLikes(likes);
    await loadPosts();
  };

  const handleAddComment = async () => {
    if (!detailPost || !detailCommentInput.trim() || detailCommentSubmitting) return;
    setDetailCommentSubmitting(true);
    try {
      await addShareComment(detailPost.id, detailCommentInput.trim());
      setDetailCommentInput('');
      const comments = await getShareComments(detailPost.id);
      setDetailComments(comments);
      await loadPosts();
    } catch (e) {
      console.error(e);
    } finally {
      setDetailCommentSubmitting(false);
    }
  };

  const handleDeletePost = () => {
    if (!detailPost || currentUserId !== detailPost.authorId) return;
    Alert.alert(
      '나눔 글 삭제',
      '이 글을 삭제할까요? 삭제된 글은 복구할 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await deleteSharePost(detailPost.id);
            setDetailPost(null);
            await loadPosts();
          },
        },
      ]
    );
  };

  const openEditModal = () => {
    if (!detailPost) return;
    setEditContent(detailPost.content);
    setEditGroupId(detailPost.groupId ?? null);
    setEditGroupTitle(detailPost.groupTitle ?? null);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!detailPost || !editContent.trim() || editSubmitting) return;
    setEditSubmitting(true);
    try {
      const updated = await updateSharePost(detailPost.id, editContent.trim(), {
        groupId: editGroupId,
        groupTitle: editGroupTitle,
      });
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDetailPost(updated);
      setEditModalVisible(false);
      await loadPosts();
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '수정에 실패했어요.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteComment = (c: ShareComment) => {
    if (c.authorId !== currentUserId) return;
    Alert.alert(
      '댓글 삭제',
      '이 댓글을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setDeletingCommentId(c.id);
            try {
              await deleteShareComment(c.id);
              const comments = await getShareComments(detailPost!.id);
              setDetailComments(comments);
              await loadPosts();
            } catch (e) {
              console.error(e);
              Alert.alert('오류', '댓글 삭제에 실패했어요.');
            } finally {
              setDeletingCommentId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.loadingText, { fontSize: s(15) }]}>불러오는 중이에요 ✨</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]} collapsable={false}>
      <View style={styles.header}>
        <Text style={[styles.title, { fontSize: s(20), color: theme.text }]}>함께 읽는 말씀 나눔 💬</Text>
        <Text style={[styles.subtitle, { fontSize: s(13), color: theme.textSecondary }]}>같이 읽는 구절을 나눠보세요</Text>
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'share' && styles.tabItemActive]}
          onPress={() => setActiveTab('share')}
        >
          <Text style={[styles.tabText, { fontSize: s(15) }, activeTab === 'share' && styles.tabTextActive]}>📖 말씀 나눔</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'prayer' && styles.tabItemActive]}
          onPress={() => setActiveTab('prayer')}
        >
          <Text style={[styles.tabText, { fontSize: s(15) }, activeTab === 'prayer' && styles.tabTextActive]}>🙏 기도 제목</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.filterRow}>
        {filterGroups.length > 0 && (
          <>
            <TouchableOpacity
              style={[styles.filterChip, { backgroundColor: !filterGroupId ? theme.primary : theme.bgSecondary }]}
              onPress={() => setFilterGroupId(null)}
            >
              <Text style={[styles.filterChipText, { fontSize: s(13), color: !filterGroupId ? '#FFF' : theme.textSecondary }]}>내 모임 전체</Text>
            </TouchableOpacity>
            {filterGroups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.filterChip, { backgroundColor: filterGroupId === g.id ? theme.primary : theme.bgSecondary }]}
                onPress={() => setFilterGroupId(filterGroupId === g.id ? null : g.id)}
              >
                <Text style={[styles.filterChipText, { fontSize: s(13), color: filterGroupId === g.id ? '#FFF' : theme.textSecondary }]} numberOfLines={1}>
                  {g.title}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {filteredPosts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { fontSize: s(15) }]}>
              {activeTab === 'prayer'
                ? filterGroupId ? '이 모임 기도 제목이 없어요' : '아직 기도 제목이 없어요'
                : filterGroupId ? '이 모임 나눔 글이 없어요' : filterGroups.length === 0 ? '참여 중인 모임이 없어요' : '내 모임 나눔 글이 없어요'}
            </Text>
            <Text style={[styles.emptySub, { fontSize: s(13) }]}>
              {activeTab === 'prayer' ? '기도 제목을 나눠보세요 🙏' : '첫 번째로 글을 남겨보세요!'}
            </Text>
          </View>
        ) : (
          filteredPosts.map((post) => {
            const likeCount = post.id === detailPost?.id ? detailLikes.length : (likeCountByPost[post.id] ?? 0);
            const commentCount = post.id === detailPost?.id ? detailComments.length : (commentCountByPost[post.id] ?? 0);
            return (
              <TouchableOpacity
                key={post.id}
                style={[styles.card, { backgroundColor: theme.card }]}
                onPress={() => openDetail(post)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardNickname, { fontSize: s(13), color: theme.primary }]}>{displayNickname(post.authorId, post.authorNickname)}</Text>
                  {post.groupId && (() => {
                    const currentName = filterGroups.find((g) => g.id === post.groupId)?.title;
                    const displayName = currentName || post.groupTitle || '';
                    return displayName ? (
                      <Text style={[styles.cardGroupTag, { fontSize: s(11), color: theme.textSecondary }]} numberOfLines={1}>{displayName}</Text>
                    ) : null;
                  })()}
                </View>
                {post.passageLabel ? (
                  <View style={[styles.cardPassageWrap, { backgroundColor: theme.bgSecondary, marginBottom: 6 }]}>
                    <Text style={[styles.cardPassageText, { fontSize: s(12), color: theme.textSecondary }]} numberOfLines={1}>📖 {post.passageLabel}</Text>
                  </View>
                ) : null}
                {post.imageUrl ? (
                  <Image source={{ uri: post.imageUrl }} style={[styles.cardImage, { marginBottom: 8 }]} resizeMode="cover" />
                ) : null}
                {post.content.trim() ? (
                  <Text style={[styles.cardContent, { fontSize: s(15) }]} numberOfLines={3}>
                    {post.content}
                  </Text>
                ) : null}
                <Text style={[styles.cardDate, { fontSize: s(12) }]}>{formatDate(post.createdAt)}</Text>
                <View style={styles.cardMeta}>
                  <View style={styles.cardMetaItem}>
                    <Ionicons name="heart-outline" size={s(14)} color={theme.textSecondary} />
                    <Text style={[styles.cardMetaText, { fontSize: s(12) }]}>{likeCount}</Text>
                  </View>
                  <View style={[styles.cardMetaItem, { marginLeft: 12 }]}>
                    <Ionicons name="chatbubble-outline" size={s(14)} color={theme.textSecondary} />
                    <Text style={[styles.cardMetaText, { fontSize: s(12) }]}>{commentCount}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        {hasMorePosts && posts.length > 0 && (
          <TouchableOpacity
            style={[styles.loadMoreBtn, { backgroundColor: theme.bgSecondary }]}
            onPress={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Text style={[styles.loadMoreText, { fontSize: s(14), color: theme.textSecondary }]}>불러오는 중...</Text>
            ) : (
              <Text style={[styles.loadMoreText, { fontSize: s(14), color: theme.primary }]}>더 보기</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.fabWrapper} pointerEvents="box-none">
        <TouchableOpacity
          style={[
            styles.fab,
            {
              backgroundColor: theme.primary,
              bottom: 24 + (insets.bottom || 0),
            },
          ]}
          onPress={() => router.push('/(tabs)/share/create')}
          activeOpacity={0.9}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Detail modal (likes + comments) */}
      <Modal visible={!!detailPost} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={[styles.detailModal, { backgroundColor: theme.bg }]}>
            <View style={[styles.detailModalHeader, { backgroundColor: theme.card, borderBottomColor: theme.border, paddingTop: Math.max(insets.top, 10), paddingBottom: 10 }]}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setDetailPost(null)}
                activeOpacity={0.7}
                hitSlop={12}
              >
                <Ionicons name="close" size={s(24)} color={theme.primary} />
                <Text style={[styles.closeButtonText, { fontSize: s(15), color: theme.primary }]}>닫기</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { fontSize: s(17), color: theme.text }]}>
                {detailPost?.postType === 'prayer' ? '기도 제목' : '나눔'}
              </Text>
              <View style={styles.closeButton} />
            </View>
            {detailPost && (
              <>
                <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.detailHeaderRow}>
                      <Text style={[styles.detailNickname, { fontSize: s(13), color: theme.primary }]}>
                        {displayNickname(detailPost.authorId, detailPost.authorNickname)}
                      </Text>
                      {detailPost.groupId && (() => {
                        const currentName = filterGroups.find((g) => g.id === detailPost.groupId)?.title;
                        const displayName = currentName || detailPost.groupTitle || '';
                        return displayName ? (
                          <Text style={[styles.detailGroupTag, { fontSize: s(11), color: theme.textSecondary }]} numberOfLines={1}>{displayName}</Text>
                        ) : null;
                      })()}
                    </View>
                    {detailPost.passageLabel ? (
                      <View style={[styles.detailPassageWrap, { backgroundColor: theme.bgSecondary, marginBottom: 8 }]}>
                        <Text style={[styles.detailPassageText, { fontSize: s(12), color: theme.textSecondary }]}>📖 {detailPost.passageLabel}</Text>
                      </View>
                    ) : null}
                    {detailPost.imageUrl ? (
                      <Image
                        source={{ uri: detailPost.imageUrl }}
                        style={[styles.detailImage, { backgroundColor: theme.border }]}
                        resizeMode="cover"
                      />
                    ) : null}
                    {detailPost.content.trim() ? (
                      <Text style={[styles.detailContent, { fontSize: s(15), color: theme.text }]}>{detailPost.content}</Text>
                    ) : null}
                    <View style={styles.detailMetaRow}>
                      <Text style={[styles.detailDate, { fontSize: s(12), color: theme.textSecondary }]}>
                        {formatDate(detailPost.createdAt)}
                      </Text>
                      <TouchableOpacity style={styles.detailLikeRow} onPress={handleLike} activeOpacity={0.7}>
                        <Ionicons
                          name={currentUserId && detailLikes.includes(currentUserId) ? 'heart' : 'heart-outline'}
                          size={s(20)}
                          color={currentUserId && detailLikes.includes(currentUserId) ? theme.primary : theme.textSecondary}
                        />
                        <Text style={[styles.detailLikeText, { fontSize: s(13), color: theme.textSecondary }]}>
                          {detailPost.postType === 'prayer' ? '기도했어요 🙏' : ''}{detailLikes.length}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {currentUserId === detailPost.authorId && (
                      <View style={styles.detailActionsRow}>
                        <TouchableOpacity style={styles.detailEditRow} onPress={openEditModal} activeOpacity={0.7}>
                          <Ionicons name="pencil-outline" size={s(16)} color={theme.primary} />
                          <Text style={[styles.detailEditText, { fontSize: s(13), color: theme.primary }]}>수정</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.detailDeleteRow} onPress={handleDeletePost} activeOpacity={0.7}>
                          <Ionicons name="trash-outline" size={s(16)} color="#DC2626" />
                          <Text style={[styles.detailDeleteText, { fontSize: s(13) }]}>삭제</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.commentsTitle, { fontSize: s(13), color: theme.textSecondary }]}>댓글 {detailComments.length}</Text>
                  {detailComments.map((c) => (
                    <View key={c.id} style={[styles.commentRow, { borderBottomColor: theme.border }]}>
                      <View style={styles.commentRowTop}>
                        <Text style={[styles.commentNickname, { fontSize: s(13), color: theme.primary }]}>{displayNickname(c.authorId, c.authorNickname)}</Text>
                        {currentUserId === c.authorId && (
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(c)}
                            disabled={deletingCommentId === c.id}
                            style={styles.commentDeleteBtn}
                            hitSlop={8}
                          >
                            {deletingCommentId === c.id ? (
                              <Text style={[styles.commentDeleteText, { fontSize: s(11), color: theme.textSecondary }]}>삭제 중</Text>
                            ) : (
                              <Text style={[styles.commentDeleteText, { fontSize: s(11), color: '#DC2626' }]}>삭제</Text>
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={[styles.commentContent, { fontSize: s(14), color: theme.text }]}>{c.content}</Text>
                      <Text style={[styles.commentDate, { fontSize: s(11), color: theme.textSecondary }]}>{formatDate(c.createdAt)}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={[styles.commentInputRow, { borderTopColor: theme.border, backgroundColor: theme.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <TextInput
                    style={[styles.commentInput, { fontSize: s(15), backgroundColor: theme.bgSecondary, color: theme.text }]}
                    placeholder="댓글 입력..."
                    placeholderTextColor={theme.textSecondary}
                    value={detailCommentInput}
                    onChangeText={setDetailCommentInput}
                    onSubmitEditing={handleAddComment}
                    returnKeyType="send"
                  />
                  <TouchableOpacity
                    style={[styles.commentSubmit, { backgroundColor: theme.primary }]}
                    onPress={handleAddComment}
                    disabled={!detailCommentInput.trim() || detailCommentSubmitting}
                  >
                    <Text style={[styles.commentSubmitText, { fontSize: s(14) }]}>등록</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 글 수정 모달 */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.editModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditModalVisible(false)} />
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={[styles.editModalContent, { backgroundColor: theme.bg }]}>
            <View style={[styles.editModalHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Text style={[styles.editModalCancel, { fontSize: s(16), color: theme.textSecondary }]}>취소</Text>
              </TouchableOpacity>
              <Text style={[styles.editModalTitle, { fontSize: s(18), color: theme.text }]}>글 수정</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={!editContent.trim() || editSubmitting}>
                <Text style={[styles.editModalSave, { fontSize: s(16), color: editContent.trim() && !editSubmitting ? theme.primary : theme.textSecondary }]}>
                  {editSubmitting ? '저장 중...' : '저장'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.editModalInput, { backgroundColor: theme.card, color: theme.text, fontSize: s(16) }]}
              placeholder="내용을 입력하세요"
              placeholderTextColor={theme.textSecondary}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.editModalGroupRow, { borderTopColor: theme.border, backgroundColor: theme.card }]}
              onPress={() => {
                const choices = [{ id: null, title: '선택 안 함' }, ...filterGroups];
                Alert.alert(
                  '모임 선택',
                  undefined,
                  [
                    { text: '취소', style: 'cancel' },
                    ...choices.map((g) => ({
                      text: g.title ?? '선택 안 함',
                      onPress: () => {
                        setEditGroupId(g.id);
                        setEditGroupTitle(g.title ?? null);
                      },
                    })),
                  ]
                );
              }}
            >
              <Text style={[styles.editModalGroupLabel, { fontSize: s(14), color: theme.textSecondary }]}>모임</Text>
              <Text style={[styles.editModalGroupValue, { fontSize: s(15), color: theme.text }]} numberOfLines={1}>
                {editGroupTitle ?? '선택 안 함'}
              </Text>
            </TouchableOpacity>
          </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: lightTheme.textSecondary },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontWeight: '700', color: lightTheme.text },
  subtitle: { color: lightTheme.textSecondary, marginTop: 4 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 4 },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: lightTheme.primary,
  },
  tabText: { color: lightTheme.textSecondary, fontWeight: '600' },
  tabTextActive: { color: lightTheme.primary },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 5 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  filterChipText: { fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: lightTheme.textSecondary },
  emptySub: { color: lightTheme.textSecondary, marginTop: 8 },
  loadMoreBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  loadMoreText: { fontWeight: '600' },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  cardNickname: { fontWeight: '600', color: lightTheme.primary },
  cardImage: { width: '100%', aspectRatio: 1, borderRadius: 12 },
  cardGroupTag: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: 8,
    color: lightTheme.textSecondary,
    overflow: 'hidden',
    maxWidth: 160,
  },
  cardPassageWrap: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  cardPassageText: {},
  cardContent: { color: lightTheme.text, lineHeight: 22, marginBottom: 8 },
  cardDate: { color: lightTheme.textSecondary, marginBottom: 8 },
  cardMeta: { flexDirection: 'row' },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center' },
  cardMetaText: { color: lightTheme.textSecondary, marginLeft: 4 },
  fabWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'box-none',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  detailModal: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 80,
  },
  closeButtonText: { color: lightTheme.primary, fontWeight: '600', marginLeft: 6 },
  modalTitle: { fontWeight: '700', color: lightTheme.text },
  detailScroll: { flex: 1 },
  detailScrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  detailCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 },
  detailNickname: { fontWeight: '600' },
  detailGroupTag: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: 140,
  },
  detailPassageWrap: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  detailPassageText: {},
  detailImage: { width: '100%', aspectRatio: 1, borderRadius: 12, marginBottom: 10 },
  detailContent: { lineHeight: 22, marginBottom: 8 },
  detailMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  detailDate: {},
  detailLikeRow: { flexDirection: 'row', alignItems: 'center' },
  detailLikeText: { marginLeft: 4 },
  detailActionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 12 },
  detailEditRow: { flexDirection: 'row', alignItems: 'center' },
  detailEditText: { marginLeft: 4 },
  detailDeleteRow: { flexDirection: 'row', alignItems: 'center' },
  detailDeleteText: { color: '#DC2626', marginLeft: 4 },
  commentRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  commentDeleteBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  commentDeleteText: {},
  editModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  editModalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  editModalCancel: {},
  editModalTitle: { fontWeight: '600' },
  editModalSave: { fontWeight: '600' },
  editModalInput: {
    minHeight: 120,
    margin: 20,
    padding: 16,
    borderRadius: 12,
  },
  editModalGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  editModalGroupLabel: { fontWeight: '500' },
  editModalGroupValue: { flex: 1, marginLeft: 12, textAlign: 'right' },
  commentsTitle: { fontWeight: '600', marginBottom: 8 },
  commentRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  commentNickname: { fontWeight: '600', marginBottom: 4 },
  commentContent: {},
  commentDate: { marginTop: 4, fontSize: 11 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    backgroundColor: lightTheme.card,
  },
  commentInput: {
    flex: 1,
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: lightTheme.text,
    marginRight: 8,
  },
  commentSubmit: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  commentSubmitText: { color: '#FFF', fontWeight: '600' },
});
