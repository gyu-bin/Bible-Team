import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  onPress?: () => void;
  /** 두 번째 버튼 (예: 모임 만들기 / 초대코드 참여) */
  secondaryButtonLabel?: string;
  secondaryOnPress?: () => void;
}

export function EmptyState({ title, subtitle, buttonLabel, onPress, secondaryButtonLabel, secondaryOnPress }: EmptyStateProps) {
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  const hasPrimary = buttonLabel && onPress;
  const hasSecondary = secondaryButtonLabel && secondaryOnPress;
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { fontSize: s(18), color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { fontSize: s(15), color: theme.textSecondary }]}>{subtitle}</Text> : null}
      <View style={styles.buttonRow}>
        {hasPrimary ? (
          <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={onPress} activeOpacity={0.8}>
            <Text style={[styles.buttonText, { fontSize: s(16) }]}>{buttonLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {hasSecondary ? (
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { borderColor: theme.primary, borderWidth: 2 }]}
            onPress={secondaryOnPress}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonTextSecondary, { fontSize: s(16), color: theme.primary }]}>{secondaryButtonLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  buttonRow: {
    marginTop: 24,
    gap: 12,
    alignItems: 'center',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 20,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  buttonTextSecondary: {
    fontSize: 16,
    fontWeight: '600',
  },
});
