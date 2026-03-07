import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ReadingGroupRow } from '@/types/database';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';

interface GroupListItemProps {
  group: ReadingGroupRow;
  onPress: () => void;
  /** 내가 모임장이면 true → 카드에 모임장 뱃지 표시 */
  isLeader?: boolean;
}

export function GroupListItem({ group, onPress, isLeader }: GroupListItemProps) {
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const s = (n: number) => Math.round(n * fontScale);
  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: theme.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text, fontSize: s(16) }]} numberOfLines={1}>
            {group.title}
          </Text>
          {isLeader ? (
            <View style={[styles.leaderBadge, { backgroundColor: theme.primary, marginLeft: 8 }]}>
              <Text style={[styles.leaderBadgeText, { fontSize: s(11), color: '#FFF' }]}>모임장</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.meta, { fontSize: s(13), color: theme.textSecondary }]}>
          {group.start_book} · 하루 {group.pages_per_day}장 · {group.duration_days}일
        </Text>
      </View>
      <Text style={[styles.chevron, { fontSize: s(24), color: theme.textSecondary }]}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: {
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
  },
  leaderBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  leaderBadgeText: { fontWeight: '600' },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
  },
});
