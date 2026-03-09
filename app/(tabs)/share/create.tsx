import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Ionicons from '@expo/vector-icons/Ionicons';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useDataRefresh } from '@/contexts/DataRefreshContext';
import { addSharePost } from '@/lib/shareStorage';
import { getCachedGroups, getLocalGroups } from '@/lib/cache';
import { getMyGroups } from '@/services/groupService';
import { ensureAnonymousUser, getCurrentUser } from '@/lib/supabase';
import { setPendingNewPost } from './pendingNewPost';
import type { ReadingGroupRow } from '@/types/database';

export default function ShareCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ groupId?: string; groupTitle?: string }>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { invalidate } = useDataRefresh();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [groups, setGroups] = useState<ReadingGroupRow[]>([]);

  useEffect(() => {
    if (params.groupId) {
      setGroupId(params.groupId);
      if (params.groupTitle) setGroupTitle(params.groupTitle);
      else {
        const g = groups.find((x) => x.id === params.groupId);
        if (g) setGroupTitle(g.title);
      }
    }
  }, [params.groupId, params.groupTitle, groups.length]);

  useEffect(() => {
    (async () => {
      const user = await ensureAnonymousUser().catch(() => null) ?? await getCurrentUser().catch(() => null);
      if (user?.id) {
        try {
          const list = await getMyGroups(user.id);
          if (list.length > 0) setGroups(list);
          else {
            const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
            setGroups(local.length > 0 ? local : cached);
          }
        } catch {
          const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
          setGroups(local.length > 0 ? local : cached);
        }
      } else {
        const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
        setGroups(local.length > 0 ? local : cached);
      }
    })();
  }, []);

  const handleAddPhoto = () => {
    Alert.alert('사진 첨부', '사진을 어떻게 올릴까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '갤러리',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('권한 필요', '사진 접근 권한이 필요해요.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.5,
          });
          if (!result.canceled && result.assets[0]?.uri) setImageUri(result.assets[0].uri);
        },
      },
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
            quality: 0.5,
          });
          if (!result.canceled && result.assets[0]?.uri) setImageUri(result.assets[0].uri);
        },
      },
    ]);
  };

  const canSubmit =
    !!groupId &&
    (!!content.trim() || !!imageUri) &&
    !submitting;
  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!groupId) {
      Alert.alert('모임 선택', '나눔을 올릴 모임을 선택해 주세요.');
      return;
    }
    if ((!trimmed && !imageUri) || submitting) return;
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        const isPng = imageUri.toLowerCase().includes('.png');
        const contentType = isPng ? 'image/png' : 'image/jpeg';
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        imageUrl = `data:${contentType};base64,${base64}`;
      }
      const newPost = await addSharePost(trimmed || ' ', {
        groupId: groupId ?? undefined,
        groupTitle: groupTitle ?? undefined,
        imageUrl: imageUrl ?? undefined,
      });
      setPendingNewPost(newPost);
      invalidate();
      router.back();
    } catch (e) {
      console.error(e);
      Alert.alert('등록 실패', '글 저장에 실패했어요. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 50 : 0}
    >
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: theme.bg, borderBottomWidth: 1, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          onPress={() => {
            if (content.trim() || imageUri) {
              Alert.alert('취소할까요?', '작성 중인 내용이 사라져요.', [
                { text: '계속 작성', style: 'cancel' },
                { text: '취소', style: 'destructive', onPress: () => router.back() },
              ]);
            } else {
              router.back();
            }
          }}
          style={styles.headerBtn}
          hitSlop={12}
          disabled={submitting}
        >
          <Text style={[styles.cancelText, { fontSize: s(16), color: theme.textSecondary }]}>취소</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: s(18), color: theme.primary }]}>나눔 글쓰기</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[styles.headerBtn, styles.headerSubmitBtn]}
          hitSlop={12}
        >
          {submitting ? (
            <>
              <ActivityIndicator size="small" color={theme.primary} style={styles.headerSpinner} />
              <Text style={[styles.submitText, { fontSize: s(16), color: theme.textSecondary }]}>등록 중...</Text>
            </>
          ) : (
            <Text
              style={[
                styles.submitText,
                { fontSize: s(16), color: canSubmit ? theme.primary : theme.textSecondary },
              ]}
            >
              등록
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: groupId ? theme.primary : theme.border }]}>
          <View style={styles.groupRow}>
            <Text style={[styles.groupLabel, { fontSize: s(15), color: theme.text }]}>
              모임 선택 <Text style={{ color: theme.primary }}>*</Text>
            </Text>
            <TouchableOpacity
              style={[
                styles.groupValueWrap,
                {
                  borderColor: groupId ? theme.primary : theme.border,
                  backgroundColor: groupId ? '#E8A0BF18' : theme.bgSecondary,
                },
              ]}
              onPress={() => setShowGroupPicker(true)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.groupValue, { fontSize: s(15), color: groupTitle ? theme.primary : theme.textSecondary }]}
                numberOfLines={1}
              >
                {groupTitle || '모임을 선택해 주세요'}
              </Text>
              <Ionicons name="chevron-down" size={s(20)} color={groupId ? theme.primary : theme.textSecondary} />
            </TouchableOpacity>
          </View>
          {!groupId && (
            <Text style={[styles.requiredHint, { fontSize: s(13), color: theme.textSecondary }]}>
              나눔을 올릴 모임을 선택해야 해요.
            </Text>
          )}
          {groups.length === 0 && (
            <Text style={[styles.requiredHint, { fontSize: s(13), color: theme.textSecondary, marginTop: 4 }]}>
              참여 중인 모임이 없어요. 모임 탭에서 먼저 모임에 참여해 주세요.
            </Text>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.inputLabel, { fontSize: s(15), color: theme.text }]}>내용</Text>
          <TextInput
            style={[styles.input, { fontSize: s(16), color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
            placeholder="읽은 말씀에 대한 나눔을 적어주세요 (글 또는 사진 중 하나는 꼭 넣어주세요)"
            placeholderTextColor={theme.textSecondary}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
          />
          <View style={styles.photoRow}>
            <TouchableOpacity
              style={[styles.photoBtn, { backgroundColor: '#E8A0BF18', borderColor: theme.primary }]}
              onPress={handleAddPhoto}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={s(28)} color={theme.primary} />
              <Text style={[styles.photoBtnText, { fontSize: s(13), color: theme.primary }]}>사진 첨부</Text>
            </TouchableOpacity>
            {imageUri ? (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: imageUri }} style={[styles.photoPreview, { backgroundColor: theme.border }]} resizeMode="cover" />
                <TouchableOpacity style={styles.photoRemove} onPress={() => setImageUri(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={s(26)} color={theme.text} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <Modal visible={showGroupPicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowGroupPicker(false)}
          />
          <View style={[styles.pickerContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.pickerTitle, { fontSize: s(17), color: theme.primary }]}>모임 선택</Text>
            <Text style={[styles.pickerSubtitle, { fontSize: s(14), color: theme.textSecondary }]}>
              나눔을 올릴 모임을 선택해 주세요.
            </Text>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {groups.length === 0 ? (
                <Text style={[styles.pickerEmpty, { fontSize: s(15), color: theme.textSecondary }]}>
                  참여 중인 모임이 없어요. 모임에 먼저 참여해 주세요.
                </Text>
              ) : (
                groups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.pickerRow, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    setGroupId(g.id);
                    setGroupTitle(g.title);
                    setShowGroupPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.pickerRowText, { fontSize: s(15), color: theme.text }]}
                    numberOfLines={1}
                  >
                    {g.title}
                  </Text>
                </TouchableOpacity>
              ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: { minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  headerSubmitBtn: { flexDirection: 'row' },
  headerSpinner: { marginRight: 6 },
  cancelText: { color: lightTheme.textSecondary },
  headerTitle: { fontWeight: '700', color: lightTheme.text },
  submitText: { fontWeight: '600', textAlign: 'right' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16 },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupLabel: { fontWeight: '600', color: lightTheme.text },
  groupValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  groupValue: { flex: 1, marginRight: 4, textAlign: 'right' },
  requiredHint: { marginTop: 8 },
  inputLabel: { fontWeight: '600', marginBottom: 10 },
  input: {
    minHeight: 160,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  photoBtn: {
    width: 72,
    height: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoBtnText: { marginTop: 4 },
  photoPreviewWrap: { position: 'relative' },
  photoPreview: { width: 72, height: 72, borderRadius: 12 },
  photoRemove: { position: 'absolute', top: -4, right: -4 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  pickerTitle: { fontWeight: '700', color: lightTheme.text },
  pickerSubtitle: { marginTop: 4, marginBottom: 16 },
  pickerScroll: { maxHeight: 280 },
  pickerEmpty: { paddingVertical: 20, textAlign: 'center' },
  pickerRow: {
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  pickerRowText: { color: lightTheme.text },
});
