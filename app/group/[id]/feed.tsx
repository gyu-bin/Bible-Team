import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
  PanResponder,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroupById } from '@/services/groupService';
import { getNickname } from '@/lib/cache';
import { getCertifications, addCertification, deleteCertification, type CertificationItem } from '@/lib/certificationStorage';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { ReadingGroupRow } from '@/types/database';

const GAP = 8;
const COLS = 2;

function formatCertDateTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function formatCertDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function formatCertTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

export default function GroupFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);

  const [group, setGroup] = useState<ReadingGroupRow | null>(null);
  const [certifications, setCertifications] = useState<CertificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [myNickname, setMyNickname] = useState('');
  const [cameraPreviewUri, setCameraPreviewUri] = useState<string | null>(null);
  const [cameraPreviewTime, setCameraPreviewTime] = useState('');
  const [stampPosition, setStampPosition] = useState({ x: 20, y: 200 });
  const stampPositionRef = useRef({ x: 20, y: 200 });
  const stampDragStartRef = useRef({ x: 20, y: 200 });
  const [selectedCert, setSelectedCert] = useState<CertificationItem | null>(null);
  const [deletingCertId, setDeletingCertId] = useState<string | null>(null);
  const stampViewRef = useRef<View | null>(null);

  const STAMP_OVERLAY_W = 160;
  const STAMP_OVERLAY_H = 52;

  useEffect(() => {
    stampPositionRef.current = stampPosition;
  }, [stampPosition]);

  const stampPreviewSize = Math.min(width - 48, 400);
  const stampPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          stampDragStartRef.current = { ...stampPositionRef.current };
        },
        onPanResponderMove: (_, gestureState) => {
          const start = stampDragStartRef.current;
          const newX = Math.max(0, Math.min(stampPreviewSize - STAMP_OVERLAY_W, start.x + gestureState.dx));
          const newY = Math.max(0, Math.min(stampPreviewSize - STAMP_OVERLAY_H, start.y + gestureState.dy));
          stampPositionRef.current = { x: newX, y: newY };
          setStampPosition({ x: newX, y: newY });
        },
      }),
    [stampPreviewSize]
  );

  useEffect(() => {
    if (cameraPreviewUri) {
      const x = Math.max(0, (stampPreviewSize - STAMP_OVERLAY_W) / 2);
      const y = Math.max(0, stampPreviewSize - STAMP_OVERLAY_H - 16);
      setStampPosition({ x, y });
      stampPositionRef.current = { x, y };
    }
  }, [cameraPreviewUri, stampPreviewSize]);

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return;
    try {
      const groupData = await getGroupById(id);
      setGroup(groupData ?? null);
      if (groupData) {
        const list = await getCertifications(groupData.id);
        setCertifications(list);
      }
      const user = (await ensureAnonymousUser().catch(() => null)) ?? (await getCurrentUser().catch(() => null));
      setCurrentUserId(user?.id ?? null);
      const nickname = await getNickname();
      setMyNickname(nickname ?? '');
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
      getNickname().then((n) => setMyNickname(n ?? ''));
    }, [])
  );

  const handleAddPhoto = () => {
    if (!group || !currentUserId) return;
    Alert.alert('사진 인증', '사진을 어떻게 올릴까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '카메라',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('권한 필요', '카메라 권한이 필요해요.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]?.uri) {
            setCameraPreviewTime(new Date().toISOString());
            setCameraPreviewUri(result.assets[0].uri);
          }
        },
      },
      {
        text: '갤러리',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]?.uri) {
            setCameraPreviewTime(new Date().toISOString());
            setCameraPreviewUri(result.assets[0].uri);
          }
        },
      },
    ]);
  };

  const padding = 20;
  const contentWidth = width - padding * 2;
  const cardSize = (contentWidth - GAP * (COLS - 1)) / COLS;
  const largeImageSize = Math.min(width, height - 120);

  const handleDeleteCert = (cert: CertificationItem) => {
    if (!group || cert.userId !== currentUserId) return;
    Alert.alert(
      '인증 사진 삭제',
      '이 사진을 삭제할까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            setDeletingCertId(cert.id);
            try {
              await deleteCertification(group.id, cert.id);
              setCertifications((prev) => prev.filter((c) => c.id !== cert.id));
              setSelectedCert(null);
            } catch (e) {
              console.error(e);
              Alert.alert('오류', '삭제에 실패했어요.');
            } finally {
              setDeletingCertId(null);
            }
          },
        },
      ]
    );
  };

  const handleSaveWithTimestamp = async () => {
    if (!stampViewRef.current || !group || !currentUserId || !cameraPreviewUri || !cameraPreviewTime) return;
    setUploading(true);
    try {
      // 사용자가 놓은 스탬프 위치가 화면에 반영된 뒤 캡처하도록 한 프레임 대기
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const uri = await captureRef(stampViewRef, {
        format: 'jpg',
        quality: 0.9,
        result: 'tmpfile',
      });
      if (uri) {
        await addCertification(
          group.id,
          currentUserId,
          myNickname || '나',
          uri,
          cameraPreviewTime
        );
        await load();
      }
      setCameraPreviewUri(null);
      setCameraPreviewTime('');
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '인증 사진 저장에 실패했어요.');
    } finally {
      setUploading(false);
    }
  };

  if (loading && certifications.length === 0) {
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
          인증 피드
        </Text>
        <TouchableOpacity
          onPress={handleAddPhoto}
          disabled={uploading}
          style={styles.addBtn}
          hitSlop={12}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Ionicons name="add-circle" size={s(28)} color={theme.primary} />
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={!!cameraPreviewUri} transparent animationType="fade">
        <View style={styles.stampModalOverlay}>
          <View style={[styles.stampModalBox, { backgroundColor: theme.card, maxWidth: width - 48 }]}>
            <Text style={[styles.stampModalTitle, { fontSize: s(16), color: theme.text }]}>
              오늘의 날짜·시간이 표시돼요
            </Text>
            <View
              ref={stampViewRef}
              style={{ width: stampPreviewSize, height: stampPreviewSize, backgroundColor: '#000' }}
              collapsable={false}
            >
              <Image
                source={{ uri: cameraPreviewUri! }}
                style={{ width: stampPreviewSize, height: stampPreviewSize }}
                resizeMode="cover"
              />
              <View
                style={[
                  styles.stampOverlay,
                  {
                    position: 'absolute',
                    left: stampPosition.x,
                    top: stampPosition.y,
                    width: STAMP_OVERLAY_W,
                    minHeight: STAMP_OVERLAY_H,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                  },
                ]}
                {...stampPanResponder.panHandlers}
              >
                {cameraPreviewTime ? (
                  <>
                    <Text style={styles.stampText} numberOfLines={1}>{formatCertDate(cameraPreviewTime)}</Text>
                    <Text style={styles.stampText} numberOfLines={1}>{formatCertTime(cameraPreviewTime)}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={styles.stampModalActions}>
              <TouchableOpacity
                style={[styles.stampModalBtn, { borderColor: theme.border }]}
                onPress={() => { setCameraPreviewUri(null); setCameraPreviewTime(''); }}
                disabled={uploading}
              >
                <Text style={[styles.stampModalBtnText, { fontSize: s(15), color: theme.textSecondary }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stampModalBtn, styles.stampModalBtnPrimary, { backgroundColor: theme.primary }]}
                onPress={handleSaveWithTimestamp}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.stampModalBtnText, styles.stampModalBtnTextPrimary, { fontSize: s(15) }]}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24, maxWidth: width }]}
        showsVerticalScrollIndicator={false}
        horizontal={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />
        }
      >
        {certifications.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyEmoji, { fontSize: s(48) }]}>📷</Text>
            <Text style={[styles.emptyTitle, { fontSize: s(17), color: theme.text }]}>아직 인증 사진이 없어요</Text>
            <Text style={[styles.emptySub, { fontSize: s(14), color: theme.textSecondary }]}>
              오른쪽 상단 + 버튼으로 첫 사진을 올려보세요
            </Text>
          </View>
        ) : (
          <View style={[styles.grid, { width: contentWidth }]}>
            {certifications.map((cert, index) => (
              <TouchableOpacity
                key={cert.id}
                style={[
                  styles.gridItem,
                  {
                    width: cardSize,
                    marginBottom: GAP,
                    marginRight: index % COLS === COLS - 1 ? 0 : GAP,
                  },
                ]}
                onPress={() => setSelectedCert(cert)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: cert.imagePath }}
                  style={[styles.gridImage, { width: cardSize, height: cardSize }]}
                  resizeMode="cover"
                />
                <Text style={[styles.gridNickname, { fontSize: s(13), color: theme.text }]} numberOfLines={1}>
                  {cert.userNickname}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 사진 크게 보기 모달 */}
      <Modal visible={!!selectedCert} transparent animationType="fade">
        <View style={styles.largeModalOverlay}>
          {selectedCert && (
            <>
              <TouchableOpacity
                style={StyleSheet.absoluteFill}
                activeOpacity={1}
                onPress={() => setSelectedCert(null)}
              />
              <View style={[styles.largeModalContent, { maxWidth: width, maxHeight: height - 100 }]}>
                <Image
                  source={{ uri: selectedCert.imagePath }}
                  style={[styles.largeModalImage, { width: largeImageSize, height: largeImageSize }]}
                  resizeMode="contain"
                />
                <View style={[styles.largeModalInfo, { backgroundColor: theme.card }]}>
                  <Text style={[styles.largeModalNickname, { fontSize: s(15), color: theme.text }]}>
                    {selectedCert.userNickname}
                  </Text>
                  <Text style={[styles.largeModalTime, { fontSize: s(13), color: theme.textSecondary }]}>
                    {formatCertDateTime(selectedCert.createdAt)}
                  </Text>
                </View>
                <View style={styles.largeModalActions}>
                  <TouchableOpacity
                    style={[styles.largeModalCloseBtn, { backgroundColor: theme.bgSecondary }]}
                    onPress={() => setSelectedCert(null)}
                  >
                    <Text style={[styles.largeModalCloseText, { fontSize: s(15), color: theme.text }]}>닫기</Text>
                  </TouchableOpacity>
                  {selectedCert.userId === currentUserId && (
                    <TouchableOpacity
                      style={[styles.largeModalDeleteBtn, { backgroundColor: '#DC2626' }]}
                      onPress={() => handleDeleteCert(selectedCert)}
                      disabled={!!deletingCertId}
                    >
                      {deletingCertId === selectedCert.id ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Text style={[styles.largeModalDeleteText, { fontSize: s(15) }]}>삭제</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>
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
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyEmoji: { marginBottom: 16 },
  emptyTitle: { fontWeight: '600', marginBottom: 8 },
  emptySub: { textAlign: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
  },
  gridItem: {
    maxWidth: '100%',
  },
  gridImage: {
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  gridNickname: { marginTop: 6, fontWeight: '600' },
  stampModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    overflow: 'hidden',
  },
  stampModalBox: {
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    maxWidth: '100%',
  },
  stampModalTitle: { marginBottom: 16, fontWeight: '600' },
  stampOverlay: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  stampModalActions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  stampModalBtn: {
    flex: 1,
    marginHorizontal: 6,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  stampModalBtnPrimary: {},
  stampModalBtnText: { fontWeight: '600' },
  stampModalBtnTextPrimary: { color: '#FFF' },
  largeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  largeModalContent: {
    alignItems: 'center',
  },
  largeModalImage: {
    borderRadius: 12,
    backgroundColor: '#000',
  },
  largeModalInfo: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  largeModalNickname: { fontWeight: '600', marginBottom: 4 },
  largeModalTime: {},
  largeModalActions: {
    flexDirection: 'row',
    marginTop: 16,
  },
  largeModalCloseBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
    marginRight: 12,
  },
  largeModalCloseText: { fontWeight: '600' },
  largeModalDeleteBtn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 16,
  },
  largeModalDeleteText: { color: '#FFF', fontWeight: '600' },
});
