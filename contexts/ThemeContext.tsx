import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme, type ThemeColors } from '@/constants/theme';

const KEY_DARK_MODE = '@bible_crew_dark_mode';

async function getStoredDarkMode(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY_DARK_MODE);
    return value === 'true';
  } catch {
    return false;
  }
}

async function setStoredDarkMode(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_DARK_MODE, value ? 'true' : 'false');
  } catch {
    // ignore
  }
}

type ContextValue = {
  theme: ThemeColors;
  isDarkMode: boolean;
  setDarkMode: (value: boolean) => Promise<void>;
};

const ThemeContext = createContext<ContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    getStoredDarkMode().then(setIsDarkMode);
  }, []);

  const setDarkMode = async (value: boolean) => {
    await setStoredDarkMode(value);
    setIsDarkMode(value);
  };

  const theme = isDarkMode ? darkTheme : lightTheme;
  const value: ContextValue = { theme, isDarkMode, setDarkMode };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: lightTheme,
      isDarkMode: false,
      setDarkMode: setStoredDarkMode,
    };
  }
  return ctx;
}
