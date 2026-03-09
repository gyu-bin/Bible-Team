import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getMyGroups, joinGroup, getGroupByInviteCode, isMember } from '@/services/groupService';
import { getCachedGroups, setCachedGroups } from '@/lib/cache';
import { GroupListItem } from '@/components/GroupListItem';
import { EmptyState } from '@/components/EmptyState';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh } from '@/contexts/DataRefreshContext';
import type { ReadingGroupRow } from '@/types/database';

export default function GroupsListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const { refreshKey, invalidate } = useDataRefresh();
  const s = (n: number) => Math.round(n * fontScale);
  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ReadingGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const mountedRef = useRef(false);
  const lastFetchRef = useRef(0);
  const STALE_MS = 30_000;

  const load = useCallback(async () => {
    lastFetchRef.current = Date.now();
    setLoadError(false);
    try {
      const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
      setUserId(user?.id ?? null);

      if (!user) {
        setGroups([]);
        await setCachedGroups([]);
        return;
      }

      const cached = await getCachedGroups();
      setGroups(cached);
      const list = await getMyGroups(user.id);
      setGroups(list);
      await setCachedGroups(list);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFetchRef.current < STALE_MS) return;
      lastFetchRef.current = now;
      load();
    }, [load])
  );

  useEffect(() => {
    if (params.action === 'create') {
      router.push('/groups/create');
      router.setParams({ action: undefined });
    } else if (params.action === 'join') {
      setJoinModalVisible(true);
      router.setParams({ action: undefined });
    }
  }, [params.action]);

  const handleJoinByCode = async () => {
    const code = inviteCodeInput.trim().toUpperCase().replace(/\s/g, '');
    if (!code) {
      Alert.alert('알림', '초대 코드를 입력해 주세요.');
      return;
    }
    const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
    if (!user) {
      Alert.alert(
        '참여 불가',
        '현재 Supabase 익명 로그인이 꺼져 있어요.\n\nSupabase 콘솔에서 Auth → Providers → Anonymous 를 활성화한 뒤 다시 시도해 주세요.'
      );
      return;
    }
    const uid = user.id;
    setJoining(true);
    try {
      const group = await getGroupByInviteCode(code);
      if (!group) {
        Alert.alert(
          '알림',
          '유효하지 않은 초대 코드예요.\n\n· 공백 없이, 대문자로 입력해보세요.\n· 코드를 정확히 입력했는지 확인해 주세요.\n· 방금 만든 코드라면, 모임 생성이 서버에 성공했는지 확인해 주세요.'
        );
        return;
      }
      const already = await isMember(group.id, uid);
      if (already) {
        Alert.alert('알림', '이미 참여 중인 모임이에요.');
        setJoinModalVisible(false);
        setInviteCodeInput('');
        return;
      }
      await joinGroup(group.id, uid);
      setUserId(uid);
      const list = await getMyGroups(uid);
      await setCachedGroups(list);
      setGroups(list);
      invalidate();
      setJoinModalVisible(false);
      setInviteCodeInput('');
      router.push(`/group/${group.id}`);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', e instanceof Error ? e.message : '참여에 실패했어요.');
    } finally {
      setJoining(false);
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.loadingText, { fontSize: s(15), color: theme.textSecondary }]}>불러오는 중이에요 ✨</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg, padding: 24 }]}>
        <Text style={[styles.loadingText, { fontSize: s(15), color: theme.textSecondary, textAlign: 'center' }]}>
          일시적인 문제예요. 잠시 후 다시 시도해주세요.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
          onPress={() => { setLoading(true); load(); }}
          activeOpacity={0.8}
        >
          <Text style={[styles.retryButtonText, { fontSize: s(16) }]}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.sectionTitle, { fontSize: s(20), color: theme.text }]}>참여 중인 모임 🌿</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={[styles.joinByCodeButton, { borderColor: theme.border }]} onPress={() => setJoinModalVisible(true)}>
              <Text style={[styles.joinByCodeButtonText, { fontSize: s(14), color: theme.text }]}>초대 코드로 참여</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, { backgroundColor: theme.primary }]} onPress={() => router.push('/groups/create')} activeOpacity={0.8}>
              <Text style={[styles.addButtonText, { fontSize: s(14) }]}>+ 새 읽기 모임</Text>
            </TouchableOpacity>
          </View>
        </View>

        {groups.length === 0 ? (
          <EmptyState
            title="아직 모임이 없어요 🌱"
            subtitle="새 모임을 만들거나, 친구에게 받은 초대 코드로 참여해 보세요!"
            buttonLabel="새 읽기 모임 만들기"
            onPress={() => router.push('/groups/create')}
            secondaryButtonLabel="초대 코드로 참여"
            secondaryOnPress={() => setJoinModalVisible(true)}
          />
        ) : (
          groups.map((group) => (
            <GroupListItem
              key={group.id}
              group={group}
              onPress={() => router.push(`/group/${group.id}`)}
              isLeader={!!userId && group.leader_id === userId}
            />
          ))
        )}
      </ScrollView>

      <Modal visible={joinModalVisible} transparent animationType="fade">
        <View style={styles.joinModalOverlay}>
          <View style={[styles.joinModalBox, { backgroundColor: theme.card }]}>
            <Text style={[styles.joinModalTitle, { fontSize: s(18), color: theme.text }]}>초대 코드로 참여</Text>
            <Text style={[styles.joinModalSub, { fontSize: s(14), color: theme.textSecondary, marginBottom: 12 }]}>
              친구에게 받은 초대 코드를 입력하세요.
            </Text>
            <TextInput
              style={[styles.joinModalInput, { backgroundColor: theme.bgSecondary, color: theme.text, fontSize: s(16) }]}
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              placeholder="예: ABC12DEF"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
            />
            <View style={styles.joinModalActions}>
              <TouchableOpacity style={[styles.joinModalCancel, { borderColor: theme.border }]} onPress={() => { setJoinModalVisible(false); setInviteCodeInput(''); }}>
                <Text style={[styles.joinModalCancelText, { fontSize: s(15), color: theme.textSecondary }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.joinModalSubmit, { backgroundColor: theme.primary }]}
                onPress={handleJoinByCode}
                disabled={joining}
              >
                {joining ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={[styles.joinModalSubmitText, { fontSize: s(15) }]}>참여하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: lightTheme.textSecondary },
  retryButton: { marginTop: 20, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 20 },
  retryButtonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  joinByCodeButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  joinByCodeButtonText: { fontSize: 14, fontWeight: '600' },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  joinModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  joinModalBox: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
  },
  joinModalTitle: { fontWeight: '700', marginBottom: 4 },
  joinModalSub: {},
  joinModalInput: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  joinModalActions: { flexDirection: 'row', gap: 12 },
  joinModalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  joinModalCancelText: {},
  joinModalSubmit: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  joinModalSubmitText: { fontWeight: '600', color: '#FFF' },
});
