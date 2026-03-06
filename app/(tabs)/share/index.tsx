import { useCallback, useEffect, useState } from 'react';
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
  getShareLikes,
  toggleShareLike,
  getShareComments,
  addShareComment,
} from '@/lib/shareStorage';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getOrCreateLocalUserId, getCachedGroups, getLocalGroups } from '@/lib/cache';
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
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null);
  const [filterGroups, setFilterGroups] = useState<{ id: string; title: string }[]>([]);
  const params = useLocalSearchParams<{ groupId?: string }>();

  const loadPosts = useCallback(async () => {
    const [list, counts] = await Promise.all([getSharePosts(), getShareCounts()]);
    setPosts(list);
    setLikeCountByPost(counts.likeCountByPost);
    setCommentCountByPost(counts.commentCountByPost);
  }, []);

  const load = useCallback(async () => {
    try {
      const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
      const uid = user?.id ?? (await getOrCreateLocalUserId());
      setCurrentUserId(uid);
      const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
      const groups = local.length > 0 ? local : cached;
      setFilterGroups(groups.map((g) => ({ id: g.id, title: g.title })));
      await loadPosts();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPosts]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useFocusEffect(
    useCallback(() => {
      loadPosts();
    }, [loadPosts])
  );

  useEffect(() => {
    if (params.groupId) {
      setFilterGroupId(params.groupId);
    }
  }, [params.groupId]);

  const filteredPosts = filterGroupId
    ? posts.filter((p) => p.groupId === filterGroupId)
    : posts;

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
  };

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
        <Text style={[styles.title, { fontSize: s(20) }]}>나눔 💬</Text>
        <Text style={[styles.subtitle, { fontSize: s(13) }]}>읽은 말씀을 나눠보세요</Text>
      </View>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: !filterGroupId ? theme.primary : theme.bgSecondary }]}
          onPress={() => setFilterGroupId(null)}
        >
          <Text style={[styles.filterChipText, { fontSize: s(13), color: !filterGroupId ? '#FFF' : theme.textSecondary }]}>전체</Text>
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
              {filterGroupId ? '이 모임 나눔 글이 없어요' : '아직 나눔 글이 없어요'}
            </Text>
            <Text style={[styles.emptySub, { fontSize: s(13) }]}>첫 번째로 글을 남겨보세요!</Text>
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
                  <Text style={[styles.cardNickname, { fontSize: s(13) }]}>{post.authorNickname}</Text>
                  {post.groupTitle ? (
                    <Text style={[styles.cardGroupTag, { fontSize: s(11) }]} numberOfLines={1}>{post.groupTitle}</Text>
                  ) : null}
                </View>
                <Text style={[styles.cardContent, { fontSize: s(15) }]} numberOfLines={3}>
                  {post.content}
                </Text>
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
            <View style={[styles.detailModalHeader, { backgroundColor: theme.card, paddingTop: Math.max(insets.top, 12), paddingBottom: 12 }]}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setDetailPost(null)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={s(22)} color={theme.primary} />
                <Text style={[styles.closeButtonText, { fontSize: s(16) }]}>닫기</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { fontSize: s(18) }]}>나눔</Text>
              <View style={styles.closeButton} />
            </View>
            {detailPost && (
              <>
                <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailScrollContent} keyboardShouldPersistTaps="handled">
                  <View style={[styles.detailCard, { backgroundColor: theme.card }]}>
                    <View style={styles.detailHeaderRow}>
                      <Text style={[styles.detailNickname, { fontSize: s(13) }]}>
                        {detailPost.authorNickname}
                      </Text>
                      {detailPost.groupTitle ? (
                        <Text style={[styles.detailGroupTag, { fontSize: s(12) }]}>{detailPost.groupTitle}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.detailContent, { fontSize: s(15) }]}>{detailPost.content}</Text>
                    <Text style={[styles.detailDate, { fontSize: s(12) }]}>
                      {formatDate(detailPost.createdAt)}
                    </Text>
                    <TouchableOpacity style={styles.detailLikeRow} onPress={handleLike} activeOpacity={0.7}>
                      <Ionicons
                        name={currentUserId && detailLikes.includes(currentUserId) ? 'heart' : 'heart-outline'}
                        size={s(22)}
                        color={currentUserId && detailLikes.includes(currentUserId) ? theme.primary : theme.textSecondary}
                      />
                      <Text style={[styles.detailLikeText, { fontSize: s(14) }]}>
                        {detailLikes.length}
                      </Text>
                    </TouchableOpacity>
                    {currentUserId === detailPost.authorId && (
                      <TouchableOpacity style={styles.detailDeleteRow} onPress={handleDeletePost} activeOpacity={0.7}>
                        <Ionicons name="trash-outline" size={s(18)} color="#DC2626" />
                        <Text style={[styles.detailDeleteText, { fontSize: s(14) }]}>글 삭제</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={[styles.commentsTitle, { fontSize: s(14) }]}>댓글 ({detailComments.length})</Text>
                  {detailComments.map((c) => (
                    <View key={c.id} style={[styles.commentRow, { borderBottomColor: theme.border }]}>
                      <Text style={[styles.commentNickname, { fontSize: s(13) }]}>{c.authorNickname}</Text>
                      <Text style={[styles.commentContent, { fontSize: s(14) }]}>{c.content}</Text>
                      <Text style={[styles.commentDate, { fontSize: s(11) }]}>{formatDate(c.createdAt)}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={[styles.commentInputRow, { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <TextInput
                    style={[styles.commentInput, { fontSize: s(15) }]}
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
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  filterChipText: { fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { color: lightTheme.textSecondary },
  emptySub: { color: lightTheme.textSecondary, marginTop: 8 },
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
  detailScrollContent: { padding: 20, paddingBottom: 24 },
  detailCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  detailNickname: { fontWeight: '600', color: lightTheme.primary },
  detailGroupTag: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: 10,
    color: lightTheme.textSecondary,
  },
  detailContent: { color: lightTheme.text, lineHeight: 22, marginBottom: 8 },
  detailDate: { color: lightTheme.textSecondary, marginBottom: 12 },
  detailLikeRow: { flexDirection: 'row', alignItems: 'center' },
  detailLikeText: { color: lightTheme.textSecondary, marginLeft: 6 },
  detailDeleteRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  detailDeleteText: { color: '#DC2626', marginLeft: 6 },
  commentsTitle: { fontWeight: '600', color: lightTheme.text, marginBottom: 12 },
  commentRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  commentNickname: { fontWeight: '600', color: lightTheme.primary, marginBottom: 4 },
  commentContent: { color: lightTheme.text },
  commentDate: { color: lightTheme.textSecondary, marginTop: 4, fontSize: 11 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    backgroundColor: lightTheme.card,
  },
  commentInput: {
    flex: 1,
    backgroundColor: lightTheme.bgSecondary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: lightTheme.text,
    marginRight: 10,
  },
  commentSubmit: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 16,
  },
  commentSubmitText: { color: '#FFF', fontWeight: '600' },
});
