import { Redirect } from 'expo-router';

/** (auth) 그룹으로 들어온 경우 메인 탭으로 보냄 (로그인 없이 사용) */
export default function AuthIndex() {
  return <Redirect href="/(tabs)" />;
}
