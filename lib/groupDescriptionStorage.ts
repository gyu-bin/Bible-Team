import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_GROUP_DESCRIPTIONS = '@bible_crew_group_descriptions';

async function getMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY_GROUP_DESCRIPTIONS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export async function getGroupDescription(groupId: string): Promise<string> {
  const map = await getMap();
  return map[groupId]?.trim() ?? '';
}

export async function setGroupDescription(groupId: string, description: string): Promise<void> {
  try {
    const map = await getMap();
    const trimmed = (description ?? '').trim();
    if (trimmed) {
      map[groupId] = trimmed;
    } else {
      delete map[groupId];
    }
    await AsyncStorage.setItem(KEY_GROUP_DESCRIPTIONS, JSON.stringify(map));
  } catch {
    // ignore
  }
}
