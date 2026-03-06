import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { ensureAnonymousUser } from '@/lib/supabase';
import { FontSizeProvider } from '@/contexts/FontSizeContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { DataRefreshProvider } from '@/contexts/DataRefreshContext';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureAnonymousUser()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <FontSizeProvider>
        <ThemeProvider>
          <SplashScreen />
        </ThemeProvider>
      </FontSizeProvider>
    );
  }

  return (
    <FontSizeProvider>
      <ThemeProvider>
      <DataRefreshProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
      </Stack>
      </DataRefreshProvider>
      </ThemeProvider>
    </FontSizeProvider>
  );
}

function SplashScreen() {
  const { theme } = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: theme.bg }]}>
      <Text style={styles.splashEmoji}>📖</Text>
      <Text style={[styles.splashTitle, { color: theme.text }]}>바이블 크루</Text>
      <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashEmoji: { fontSize: 48, marginBottom: 8 },
  splashTitle: { fontSize: 22, fontWeight: '700' },
});
