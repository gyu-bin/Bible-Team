import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupById } from '@/services/groupService';
import { getLocalGroupById } from '@/lib/cache';
import { getSharePosts } from '@/lib/shareStorage';
import { getNicknamesByUserIds } from '@/services/profileService';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { SharePost } from '@/types/share';
import type { ReadingGroupRow } from '@/types/database';

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

export default function GroupFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);

  const [group, setGroup] = useState<ReadingGroupRow | null>(null);
  const [posts, setPosts] = useState<SharePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return;
    try {
      const isLocal = id.startsWith('local_');
      const groupData = isLocal ? await getLocalGroupById(id) : await getGroupById(id);
      setGroup(groupData ?? null);
      const all = await getSharePosts({ limit: 200, offset: 0 });
      const forGroup = all.filter((p) => p.groupId === id);
      setPosts(forGroup);
      const authorIds = [...new Set(forGroup.map((p) => p.authorId).filter(Boolean))];
      if (authorIds.length > 0) {
        const map = await getNicknamesByUserIds(authorIds).catch(() => ({}));
        setNicknames(map);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const displayName = (post: SharePost) =>
    post.authorId ? (nicknames[post.authorId] || post.authorNickname || '알 수 없음') : (post.authorNickname || '알 수 없음');

  if (loading && posts.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>불러오는 중이에요</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={s(28)} color={theme.text} />
          <Text style={[styles.backLabel, { fontSize: s(17), color: theme.text }]}>뒤로</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { fontSize: s(18), color: theme.text }]} numberOfLines={1}>
          {group?.title ?? '나눔'}
        </Text>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: '/(tabs)/share/create',
              params: { groupId: id as string, groupTitle: group?.title ?? '' },
            })
          }
          style={styles.addBtn}
          hitSlop={12}
        >
          <Ionicons name="add-circle" size={s(28)} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        <Text style={[styles.hint, { color: theme.textSecondary, fontSize: s(14) }]}>
          이 모임에서 올린 나눔 글이에요. 글과 사진을 올리려면 오른쪽 상단 + 를 누르세요.
        </Text>
        {posts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyEmoji, { fontSize: s(48) }]}>💬</Text>
            <Text style={[styles.emptyTitle, { fontSize: s(17), color: theme.text }]}>아직 나눔 글이 없어요</Text>
            <Text style={[styles.emptySub, { fontSize: s(14), color: theme.textSecondary }]}>
              + 버튼으로 첫 글을 올려보세요
            </Text>
          </View>
        ) : (
          posts.map((post) => (
            <TouchableOpacity
              key={post.id}
              style={[styles.card, { backgroundColor: theme.card }]}
              onPress={() => router.push({ pathname: '/(tabs)/share', params: { groupId: id } })}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeaderRow}>
                <Text style={[styles.cardNickname, { fontSize: s(13), color: theme.primary }]}>{displayName(post)}</Text>
                <Text style={[styles.cardDate, { fontSize: s(12), color: theme.textSecondary }]}>{formatDate(post.createdAt)}</Text>
              </View>
              {post.imageUrl ? (
                <Image source={{ uri: post.imageUrl }} style={styles.cardImage} resizeMode="cover" />
              ) : null}
              {post.content.trim() ? (
                <Text style={[styles.cardContent, { fontSize: s(15), color: theme.text }]} numberOfLines={3}>
                  {post.content}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backLabel: { marginLeft: 4 },
  title: { flex: 1, textAlign: 'center', fontWeight: '700' },
  addBtn: { minWidth: 44, alignItems: 'flex-end' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 16 },
  hint: { marginBottom: 16 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyEmoji: { marginBottom: 16 },
  emptyTitle: { fontWeight: '600', marginBottom: 8 },
  emptySub: { textAlign: 'center' },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardNickname: { fontWeight: '600' },
  cardDate: {},
  cardImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 8 },
  cardContent: { lineHeight: 22 },
});
