import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  Share,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupById, getGroupMembers, joinGroup, isMember, leaveGroup, deleteGroup } from '@/services/groupService';
import type { ReadingGroupRow } from '@/types/database';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { getCachedGroups, setCachedGroups, getLocalGroupById, isLocalUserId, getNickname, removeGroupFromMyCache, deleteLocalGroup, getOrCreateLocalUserId } from '@/lib/cache';
import { getGroupDescription, setGroupDescription } from '@/lib/groupDescriptionStorage';
import { getCertifications, clearCertificationsForGroup, type CertificationItem } from '@/lib/certificationStorage';
import { getNicknamesByUserIds, upsertMyNickname } from '@/services/profileService';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh } from '@/contexts/DataRefreshContext';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const { invalidate } = useDataRefresh();
  const s = (n: number) => Math.round(n * fontScale);
  const [group, setGroup] = useState<ReadingGroupRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ user_id: string; joined_at: string }[]>([]);
  const [memberNicknames, setMemberNicknames] = useState<Record<string, string>>({});
  const [myNickname, setMyNickname] = useState<string>('');
  const [description, setDescription] = useState('');
  const [certifications, setCertifications] = useState<CertificationItem[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isLocalGroup = typeof id === 'string' && (id.startsWith('local_') || isLocalUserId(id));

  const loadGroup = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!id) return;
      if (!opts.silent) setLoading(true);
      try {
        const [user, nickname] = await Promise.all([
          ensureAnonymousUser().catch(() => null) ?? getCurrentUser().catch(() => null),
          getNickname(),
        ]);
        const groupData = isLocalGroup ? await getLocalGroupById(id) : await getGroupById(id);
        setGroup(groupData ?? null);
        if (groupData) {
          const [desc, certs] = await Promise.all([
            getGroupDescription(groupData.id),
            getCertifications(groupData.id),
          ]);
          setDescription(desc);
          setCertifications(certs);
        }
        const uid = user?.id ?? (isLocalGroup ? await getOrCreateLocalUserId() : null);
        setCurrentUserId(uid);
        setMyNickname(nickname ?? '');

        if (user?.id && nickname?.trim()) {
          upsertMyNickname(user.id, nickname).catch(() => {});
        }

        if (groupData && user) {
          if (isLocalGroup) {
            setAlreadyMember(true);
            setMembers([{ user_id: user.id, joined_at: new Date().toISOString() }]);
          } else {
            const member = await isMember(groupData.id, user.id);
            setAlreadyMember(member);
            const list = await getGroupMembers(groupData.id);
            setMembers(list);
            const nickMap = await getNicknamesByUserIds(list.map((m) => m.user_id)).catch(() => ({}));
            setMemberNicknames(nickMap);
          }
        } else if (groupData && isLocalGroup) {
          setAlreadyMember(true);
          if (groupData.leader_id) {
            setMembers([{ user_id: groupData.leader_id, joined_at: groupData.created_at }]);
          }
        } else if (groupData && !isLocalGroup) {
          const list = await getGroupMembers(groupData.id);
          setMembers(list);
          const nickMap = await getNicknamesByUserIds(list.map((m) => m.user_id)).catch(() => ({}));
          setMemberNicknames(nickMap);
        }
      } catch (e) {
        console.error(e);
        if (!opts.silent) setGroup(null);
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [id, isLocalGroup]
  );

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const isLeader = !!group && !!currentUserId && group.leader_id === currentUserId;

  useFocusEffect(
    useCallback(() => {
      getNickname().then((n) => setMyNickname(n ?? ''));
      if (!id) return;
      loadGroup({ silent: true });
    }, [id, loadGroup])
  );

  const onRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await loadGroup({ silent: true });
    setRefreshing(false);
  }, [id, loadGroup]);

  const handleLeave = () => {
    if (!group || !currentUserId) return;
    Alert.alert(
      '모임 탈퇴',
      '이 모임에서 탈퇴할까요? 탈퇴해도 지금까지의 참여 기록은 유지돼요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              if (isLocalGroup) {
                await removeGroupFromMyCache(group.id);
                invalidate();
                router.replace('/(tabs)/groups');
              } else {
                await leaveGroup(group.id, currentUserId);
                await removeGroupFromMyCache(group.id);
                invalidate();
                router.replace('/(tabs)/groups');
              }
            } catch (e) {
              console.error(e);
              Alert.alert('오류', '탈퇴에 실패했어요.');
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteGroup = () => {
    if (!group || !currentUserId || !isLeader) return;
    Alert.alert(
      '모임 삭제',
      '모임을 삭제하면 복구할 수 없어요. 인증 피드·나눔 연결도 함께 사라져요. 정말 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await setGroupDescription(group.id, '');
              await clearCertificationsForGroup(group.id);
              if (isLocalGroup) {
                await deleteLocalGroup(group.id);
                invalidate();
                router.replace('/(tabs)/groups');
              } else {
                await deleteGroup(group.id);
                await removeGroupFromMyCache(group.id);
                invalidate();
                router.replace('/(tabs)/groups');
              }
            } catch (e) {
              console.error(e);
              Alert.alert('오류', '모임 삭제에 실패했어요.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleShare = () => {
    if (!group) return;
    const url = `https://bible-crew.app/group/${group.id}`;
    const message = `📖 [바이블 크루] "${group.title}" 모임 초대\n초대 코드: ${group.invite_code}\n${url}`.trim();
    Share.share(
      { message, title: '모임 초대', url: Platform.OS === 'ios' ? url : undefined },
      { dialogTitle: '모임 초대 공유' }
    ).catch((e) => {
      if (e?.message?.includes('cancel') || e?.message?.includes('dismiss')) return;
      console.warn('Share failed', e);
      Alert.alert('공유 실패', '공유에 실패했어요.');
    });
  };

  const handleJoin = async () => {
    const uid = currentUserId ?? (await ensureAnonymousUser())?.id ?? (await getCurrentUser().catch(() => null))?.id;
    if (!group || !uid) {
      Alert.alert('알림', '잠시 후 다시 시도해 주세요.');
      return;
    }
    if (alreadyMember) {
      Alert.alert('알림', '이미 참여 중인 모임이에요 ✨');
      return;
    }

    setJoining(true);
    try {
      await joinGroup(group.id, uid);
      setAlreadyMember(true);
      const cached = await getCachedGroups();
      if (!cached.some((g) => g.id === group.id)) {
        await setCachedGroups([group, ...cached]);
      }
      invalidate();
      Alert.alert('참여 완료 🎉', '모임에 참여했어요!', [
        { text: '확인', onPress: () => router.replace('/(tabs)/groups') },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '참여에 실패했어요.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { fontSize: s(16), color: theme.textSecondary }]}>모임 정보 불러오는 중이에요 ✨</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorText, { fontSize: s(16), color: theme.textSecondary }]}>모임을 찾을 수 없어요</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={[styles.backChevron, { fontSize: s(28), color: theme.text }]}>‹</Text>
          <Text style={[styles.backLabel, { fontSize: s(17), color: theme.text }]}>뒤로</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={s(24)} color={theme.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.title, { color: theme.text, fontSize: s(22) }]}>{group.title}</Text>
        <Text style={[styles.meta, { fontSize: s(15), color: theme.textSecondary }]}>시작: {group.start_book}</Text>
        <Text style={[styles.meta, { fontSize: s(15), color: theme.textSecondary }]}>하루 {group.pages_per_day}장 · {group.duration_days}일</Text>
        {description ? (
          <View style={[styles.descriptionSection, { borderTopColor: theme.border }]}>
            <Text style={[styles.memberSectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>모임 설명 / 규칙</Text>
            <Text style={[styles.descriptionText, { fontSize: s(15), color: theme.text }]}>{description}</Text>
          </View>
        ) : null}
        <View style={[styles.memberSection, { borderTopColor: theme.border }]}>
          <Text style={[styles.memberSectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>참여 멤버 ({members.length}명)</Text>
          {members.map((m, i) => {
            const isLeaderMember = m.user_id === group.leader_id;
            const displayName = currentUserId === m.user_id
              ? (myNickname || memberNicknames[m.user_id] || '나')
              : (memberNicknames[m.user_id] || `멤버 ${i + 1}`);
            return (
              <View key={m.user_id} style={[styles.memberRow, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }]}>
                <Text style={[styles.memberLabel, { fontSize: s(15), color: theme.text }]}>{displayName}</Text>
                {isLeaderMember ? (
                  <View style={[styles.leaderBadge, { backgroundColor: theme.primary, marginLeft: 8 }]}>
                    <Text style={[styles.leaderBadgeText, { fontSize: s(11), color: '#FFF' }]}>모임장</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {alreadyMember ? (
        <TouchableOpacity
          style={[styles.certSection, { borderTopColor: theme.border }]}
          onPress={() => router.push(`/group/${id}/feed`)}
          activeOpacity={0.7}
        >
          <View style={styles.certSectionLeft}>
            <Text style={[styles.memberSectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>인증 피드</Text>
            <Text style={[styles.certSectionHint, { fontSize: s(13), color: theme.textSecondary }]}>
              사진을 올리고 모아서 볼 수 있어요
            </Text>
          </View>
          <View style={styles.certSectionRight}>
            {certifications.length > 0 ? (
              <Text style={[styles.certCount, { fontSize: s(14), color: theme.primary }]}>{certifications.length}건</Text>
            ) : null}
            <Ionicons name="chevron-forward" size={s(20)} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>
      ) : null}

      {alreadyMember ? (
        <TouchableOpacity
          style={[styles.certSection, { borderTopColor: theme.border }]}
          onPress={() => router.push({ pathname: '/(tabs)/share', params: { groupId: id as string } })}
          activeOpacity={0.7}
        >
          <View style={styles.certSectionLeft}>
            <Text style={[styles.memberSectionTitle, { fontSize: s(13), color: theme.textSecondary }]}>이 모임 나눔 보기</Text>
            <Text style={[styles.certSectionHint, { fontSize: s(13), color: theme.textSecondary }]}>
              이 모임에서 올린 나눔 글만 볼 수 있어요
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={s(20)} color={theme.textSecondary} />
        </TouchableOpacity>
      ) : null}

      {!alreadyMember ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.primary }, joining && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={joining}
        >
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, { fontSize: s(16) }]}>참여하기 ✨</Text>
          )}
        </TouchableOpacity>
      ) : (
        <>
          <View style={[styles.memberBadge, { backgroundColor: theme.doneBg }]}>
            <Text style={[styles.memberBadgeText, { color: theme.doneText, fontSize: s(16) }]}>
              {isLeader ? '✓ 모임장' : '✓ 이미 참여 중'}
            </Text>
          </View>
          <View style={styles.actionsRow}>
            {isLeader && (
              <TouchableOpacity
                style={[styles.editButton, { borderColor: theme.primary }]}
                onPress={() => router.push(`/group/${id}/edit`)}
                activeOpacity={0.8}
              >
                <Text style={[styles.editButtonText, { fontSize: s(15), color: theme.primary }]}>모임 수정</Text>
              </TouchableOpacity>
            )}
            {!isLeader && (
              <TouchableOpacity
                style={[styles.leaveButton, { borderColor: theme.textSecondary }, leaving && styles.actionDisabled]}
                onPress={handleLeave}
                disabled={leaving}
                activeOpacity={0.8}
              >
                <Text style={[styles.leaveButtonText, { fontSize: s(15), color: theme.textSecondary }]}>모임 탈퇴</Text>
              </TouchableOpacity>
            )}
            {isLeader && (
              <TouchableOpacity
                style={[styles.deleteGroupButton, deleting && styles.actionDisabled]}
                onPress={handleDeleteGroup}
                disabled={deleting}
                activeOpacity={0.8}
              >
                <Text style={[styles.deleteGroupButtonText, { fontSize: s(15) }]}>모임 삭제</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backChevron: { fontSize: 28, fontWeight: '300', marginRight: 4 },
  backLabel: { fontSize: 17 },
  shareButton: { padding: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16 },
  errorText: { fontSize: 16 },
  card: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  meta: { fontSize: 15, marginBottom: 4 },
  descriptionSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 1 },
  descriptionText: { lineHeight: 22, marginTop: 6 },
  certSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  certSectionLeft: {},
  certSectionHint: { marginTop: 2 },
  certSectionRight: { flexDirection: 'row', alignItems: 'center' },
  certCount: { fontWeight: '600', marginRight: 6 },
  memberSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 1 },
  memberSectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  memberRow: { paddingVertical: 6 },
  memberLabel: { fontSize: 15 },
  leaderBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  leaderBadgeText: { fontWeight: '600' },
  button: {
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  memberBadge: {
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  memberBadgeText: { fontSize: 16, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  editButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  editButtonText: { fontWeight: '600' },
  leaveButton: {
    flex: 1,
    minWidth: 100,
    marginRight: 6,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  leaveButtonText: {},
  deleteGroupButton: {
    flex: 1,
    marginLeft: 6,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: '#DC2626',
  },
  deleteGroupButtonText: { color: '#FFF', fontWeight: '600' },
  actionDisabled: { opacity: 0.6 },
});
