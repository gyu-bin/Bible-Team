import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  onPress?: () => void;
}

export function EmptyState({ title, subtitle, buttonLabel, onPress }: EmptyStateProps) {
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { fontSize: s(18), color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { fontSize: s(15), color: theme.textSecondary }]}>{subtitle}</Text> : null}
      {buttonLabel && onPress ? (
        <TouchableOpacity style={[styles.button, { backgroundColor: theme.primary }]} onPress={onPress} activeOpacity={0.8}>
          <Text style={[styles.buttonText, { fontSize: s(16) }]}>{buttonLabel}</Text>
        </TouchableOpacity>
      ) : null}
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
  button: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 20,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
