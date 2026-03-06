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
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { lightTheme } from '@/constants/theme';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';
import { addSharePost } from '@/lib/shareStorage';
import { getCachedGroups, getLocalGroups } from '@/lib/cache';
import type { ReadingGroupRow } from '@/types/database';

export default function ShareCreateScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  const [content, setContent] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [groups, setGroups] = useState<ReadingGroupRow[]>([]);

  useEffect(() => {
    (async () => {
      const [cached, local] = await Promise.all([getCachedGroups(), getLocalGroups()]);
      setGroups(local.length > 0 ? local : cached);
    })();
  }, []);

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await addSharePost(trimmed, {
        groupId: groupId ?? undefined,
        groupTitle: groupTitle ?? undefined,
      });
      router.back();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: 12, paddingBottom: 10, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={[styles.cancelText, { fontSize: s(16), color: theme.textSecondary }]}>취소</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: s(18), color: theme.text }]}>나눔 글쓰기</Text>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!content.trim() || submitting}
          style={styles.headerBtn}
        >
          <Text
            style={[
              styles.submitText,
              { fontSize: s(16), color: theme.primary },
              (!content.trim() || submitting) && styles.submitDisabled,
            ]}
          >
            등록
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.groupRow, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.groupLabel, { fontSize: s(15), color: theme.textSecondary }]}>모임 선택</Text>
        <TouchableOpacity
          style={styles.groupValueWrap}
          onPress={() => setShowGroupPicker(true)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.groupValue,
              { fontSize: s(15), color: groupTitle ? theme.text : theme.textSecondary },
            ]}
          >
            {groupTitle || '선택 안 함'}
          </Text>
          <Ionicons name="chevron-down" size={s(20)} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.input, { fontSize: s(16), color: theme.text, backgroundColor: theme.bg }]}
        placeholder="읽은 말씀에 대한 나눔을 적어주세요 (글자 수 제한 없음)"
        placeholderTextColor={theme.textSecondary}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
      />

      {/* 모임 선택 모달 */}
      <Modal visible={showGroupPicker} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowGroupPicker(false)}
          />
          <View style={[styles.pickerContent, { backgroundColor: theme.card }]}>
            <Text style={[styles.pickerTitle, { fontSize: s(16), color: theme.text }]}>어떤 모임에서 올릴까요?</Text>
            <ScrollView style={styles.pickerScroll} nestedScrollEnabled>
              <TouchableOpacity
                style={[styles.pickerRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  setGroupId(null);
                  setGroupTitle(null);
                  setShowGroupPicker(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerRowText, { fontSize: s(15) }]}>선택 안 함</Text>
              </TouchableOpacity>
              {groups.map((g) => (
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
              ))}
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
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
    backgroundColor: lightTheme.card,
  },
  headerBtn: { minWidth: 60 },
  cancelText: { color: lightTheme.textSecondary },
  headerTitle: { fontWeight: '700', color: lightTheme.text },
  submitText: { fontWeight: '600', color: lightTheme.primary, textAlign: 'right' },
  submitDisabled: { opacity: 0.5 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    backgroundColor: lightTheme.card,
  },
  groupLabel: { color: lightTheme.textSecondary, fontWeight: '500' },
  groupValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
    minHeight: 44,
  },
  groupValue: { color: lightTheme.text, marginRight: 6 },
  input: {
    flex: 1,
    padding: 20,
    color: lightTheme.text,
    backgroundColor: lightTheme.bg,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  pickerContent: {
    borderRadius: 20,
    padding: 20,
    maxHeight: 360,
  },
  pickerTitle: { fontWeight: '600', color: lightTheme.text, marginBottom: 16 },
  pickerScroll: { maxHeight: 280 },
  pickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: lightTheme.border,
  },
  pickerRowText: { color: lightTheme.text },
});
