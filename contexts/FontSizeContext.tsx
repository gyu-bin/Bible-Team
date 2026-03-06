import React, { createContext, useContext, useEffect, useState } from 'react';
import { getFontSize, setFontSize as saveFontSize, type FontSizeKey } from '@/lib/cache';

const SCALE: Record<FontSizeKey, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
};

type ContextValue = {
  fontScale: number;
  fontSizeKey: FontSizeKey;
  setFontSizeKey: (key: FontSizeKey) => Promise<void>;
};

const FontSizeContext = createContext<ContextValue | null>(null);

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSizeKey, setFontSizeKeyState] = useState<FontSizeKey>('medium');

  useEffect(() => {
    getFontSize().then(setFontSizeKeyState);
  }, []);

  const setFontSizeKey = async (key: FontSizeKey) => {
    await saveFontSize(key);
    setFontSizeKeyState(key);
  };

  const value: ContextValue = {
    fontScale: SCALE[fontSizeKey],
    fontSizeKey,
    setFontSizeKey,
  };

  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontScale(): ContextValue {
  const ctx = useContext(FontSizeContext);
  if (!ctx) {
    return {
      fontScale: 1,
      fontSizeKey: 'medium',
      setFontSizeKey: async (key: FontSizeKey) => {
        await saveFontSize(key);
      },
    };
  }
  return ctx;
}
