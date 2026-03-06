import { Redirect } from 'expo-router';

/** 로그인 없이 사용 가능하므로, 로그인 화면으로 오면 메인(탭)으로 보냄 */
export default function LoginScreen() {
  return <Redirect href="/(tabs)" />;
}
