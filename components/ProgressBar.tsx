import { View, StyleSheet } from 'react-native';

interface ProgressBarProps {
  progress: number;
  height?: number;
  backgroundColor?: string;
  fillColor?: string;
}

export function ProgressBar({
  progress,
  height = 8,
  backgroundColor = '#E8ECF1',
  fillColor = '#2563EB',
}: ProgressBarProps) {
  const value = Math.min(1, Math.max(0, progress));
  return (
    <View style={[styles.track, { height, backgroundColor }]}>
      <View style={[styles.fill, { width: `${value * 100}%`, backgroundColor: fillColor, height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 999,
  },
});
