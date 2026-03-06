/** 테마 색상 타입 */
export type ThemeColors = {
  bg: string;
  bgSecondary: string;
  card: string;
  primary: string;
  primaryDark: string;
  mint: string;
  mintLight: string;
  coral: string;
  text: string;
  textSecondary: string;
  border: string;
  doneBg: string;
  doneText: string;
  shadow: string;
  tabActive: string;
  tabInactive: string;
};

/** 라이트 테마 (귀여운 톤) */
export const lightTheme: ThemeColors = {
  bg: '#FFF9F6',
  bgSecondary: '#FFF5F0',
  card: '#FFFFFF',
  primary: '#E8A0BF',
  primaryDark: '#D484A3',
  mint: '#7DD3C0',
  mintLight: '#D4F0E9',
  coral: '#FFB5A7',
  text: '#5C4D4D',
  textSecondary: '#9B8B8B',
  border: '#F5E6E0',
  doneBg: '#D4F0E9',
  doneText: '#2D8B7A',
  shadow: '#E8D5D0',
  tabActive: '#E8A0BF',
  tabInactive: '#C4AFA8',
};

/** 다크 테마 */
export const darkTheme: ThemeColors = {
  bg: '#1A1614',
  bgSecondary: '#2A2422',
  card: '#352E2B',
  primary: '#E8A0BF',
  primaryDark: '#D484A3',
  mint: '#5EB8A8',
  mintLight: '#2D4A45',
  coral: '#D49385',
  text: '#F5EDEA',
  textSecondary: '#B8A8A2',
  border: '#4A423E',
  doneBg: '#2D4A45',
  doneText: '#7DD3C0',
  shadow: '#2A2422',
  tabActive: '#E8A0BF',
  tabInactive: '#8A7D78',
};

/** 하위 호환: 기본은 라이트 */
export const theme = lightTheme;
