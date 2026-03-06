import { Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFontScale } from '@/contexts/FontSizeContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function TabsLayout() {
  const { theme } = useTheme();
  const { fontScale } = useFontScale();
  const tabFontSize = Math.round(12 * fontScale);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={['top']}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.tabActive,
          tabBarInactiveTintColor: theme.tabInactive,
          tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
          tabBarShowLabel: true,
          tabBarLabelStyle: { fontSize: tabFontSize },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '홈',
            headerTitle: '오늘의 읽기 📖',
            tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="groups"
          options={{
            title: '모임',
            headerTitle: '모임 🌿',
            tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="share"
          options={{
            title: '나눔',
            headerTitle: '나눔 💬',
            tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: '설정',
            headerTitle: '설정 ✨',
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
