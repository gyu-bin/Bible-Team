import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const KEY_CERTIFICATIONS = '@bible_crew_certifications';
const CERT_DIR_NAME = 'certifications';

export type CertificationItem = {
  id: string;
  userId: string;
  userNickname: string;
  imagePath: string;
  createdAt: string; // ISO string
};

async function getCertDir(): Promise<string> {
  const dir = FileSystem.documentDirectory + CERT_DIR_NAME + '/';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

async function getMap(): Promise<Record<string, CertificationItem[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEY_CERTIFICATIONS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CertificationItem[]>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function setMap(map: Record<string, CertificationItem[]>): Promise<void> {
  await AsyncStorage.setItem(KEY_CERTIFICATIONS, JSON.stringify(map));
}

export async function getCertifications(groupId: string): Promise<CertificationItem[]> {
  const map = await getMap();
  const list = map[groupId];
  if (!Array.isArray(list)) return [];
  return list.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function addCertification(
  groupId: string,
  userId: string,
  userNickname: string,
  imageUri: string,
  createdAt?: string
): Promise<CertificationItem> {
  const dir = await getCertDir();
  const id = `cert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ext = imageUri.toLowerCase().includes('.png') ? '.png' : '.jpg';
  const toPath = dir + id + ext;

  await FileSystem.copyAsync({ from: imageUri, to: toPath });

  const item: CertificationItem = {
    id,
    userId,
    userNickname: userNickname || '나',
    imagePath: toPath,
    createdAt: createdAt ?? new Date().toISOString(),
  };

  const map = await getMap();
  const list = map[groupId] ?? [];
  list.push(item);
  map[groupId] = list;
  await setMap(map);
  return item;
}

export async function deleteCertification(groupId: string, certificationId: string): Promise<void> {
  const map = await getMap();
  const list = map[groupId];
  if (!Array.isArray(list)) return;
  const item = list.find((c) => c.id === certificationId);
  if (item) {
    try {
      await FileSystem.deleteAsync(item.imagePath, { idempotent: true });
    } catch {
      // ignore
    }
    const next = list.filter((c) => c.id !== certificationId);
    map[groupId] = next.length ? next : [];
    if (next.length === 0) delete map[groupId];
    await setMap(map);
  }
}

export async function clearCertificationsForGroup(groupId: string): Promise<void> {
  const map = await getMap();
  const list = map[groupId];
  if (Array.isArray(list)) {
    for (const item of list) {
      try {
        await FileSystem.deleteAsync(item.imagePath, { idempotent: true });
      } catch {
        // ignore
      }
    }
    delete map[groupId];
    await setMap(map);
  }
}
