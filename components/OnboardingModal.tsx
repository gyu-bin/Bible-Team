import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';

const KEY_ONBOARDING_DONE = '@bible_crew_onboarding_done';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_ONBOARDING_DONE);
    return v === 'true';
  } catch {
    return false;
  }
}

export async function setOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_ONBOARDING_DONE, 'true');
  } catch {}
}

interface OnboardingModalProps {
  visible: boolean;
  onDismiss: () => void;
  onCreateGroup: () => void;
  onJoinByCode: () => void;
}

export function OnboardingModal({ visible, onDismiss, onCreateGroup, onJoinByCode }: OnboardingModalProps) {
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);

  const handleCreate = () => {
    setOnboardingDone();
    onDismiss();
    onCreateGroup();
  };

  const handleJoin = () => {
    setOnboardingDone();
    onDismiss();
    onJoinByCode();
  };

  const handleSkip = () => {
    setOnboardingDone();
    onDismiss();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.emoji, { fontSize: s(48) }]}>📖</Text>
          <Text style={[styles.title, { color: theme.text, fontSize: s(20) }]}>모임으로 성경 읽기를 함께해요</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary, fontSize: s(15) }]}>
            새 모임을 만들거나, 친구에게 받은 초대 코드로 참여할 수 있어요.
          </Text>
          <TouchableOpacity style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={handleCreate} activeOpacity={0.8}>
            <Text style={[styles.primaryButtonText, { fontSize: s(16) }]}>새 모임 만들기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.primary, borderWidth: 2 }]}
            onPress={handleJoin}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.primary, fontSize: s(16) }]}>초대 코드로 참여</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} style={styles.skipRow}>
            <Text style={[styles.skipText, { color: theme.textSecondary, fontSize: s(14) }]}>일단 둘러볼게요</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  emoji: { marginBottom: 16 },
  title: { fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  subtitle: { textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: { fontWeight: '600', color: '#FFF' },
  secondaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: { fontWeight: '600' },
  skipRow: { paddingVertical: 8 },
  skipText: {},
});
