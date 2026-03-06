import { Stack } from 'expo-router';

export default function GroupIdLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="feed" />
    </Stack>
  );
}
