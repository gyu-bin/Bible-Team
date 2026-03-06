import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { deleteCertificationImageFromStorage, getCertificationSignedUrl } from '@/lib/supabaseStorage';
import type { CertificationItem } from '@/lib/certificationStorage';

const TABLE = 'certifications';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const STORAGE_PUBLIC_BASE = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/certifications` : '';

function toFullImageUrl(imageUrl: string | null | undefined): string {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('http') || imageUrl.startsWith('file://')) return imageUrl;
  if (STORAGE_PUBLIC_BASE) return `${STORAGE_PUBLIC_BASE}/${imageUrl.replace(/^\//, '')}`;
  return imageUrl;
}

export async function getCertificationsFromServer(groupId: string): Promise<CertificationItem[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select('id, user_id, user_nickname, image_url, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  const rows = data as { id: string; user_id: string; user_nickname: string; image_url: string; created_at: string }[];
  const items: CertificationItem[] = [];
  for (const row of rows) {
    let imagePath = row.image_url ?? '';
    if (!imagePath.startsWith('data:')) {
      const storedUrl = toFullImageUrl(row.image_url);
      imagePath = storedUrl
        ? await getCertificationSignedUrl(row.image_url).catch(() => storedUrl)
        : '';
      imagePath = imagePath || storedUrl;
    }
    items.push({
      id: row.id,
      userId: row.user_id,
      userNickname: row.user_nickname || '나',
      imagePath,
      createdAt: row.created_at,
    });
  }
  return items;
}

/** 이미지를 base64로 DB에 저장. URL/Storage는 환경에 따라 안 보일 수 있어서, 화면에 확실히 보이게 이 방식 사용 */
export async function addCertificationToServer(
  groupId: string,
  userId: string,
  userNickname: string,
  imageUri: string,
  createdAt?: string
): Promise<CertificationItem> {
  const isPng = imageUri.toLowerCase().includes('.png');
  const contentType = isPng ? 'image/png' : 'image/jpeg';
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const imageUrl = `data:${contentType};base64,${base64}`;

  const { data, error } = await (supabase as any).from(TABLE).insert({
    group_id: groupId,
    user_id: userId,
    user_nickname: userNickname || '나',
    image_url: imageUrl,
    created_at: createdAt ?? new Date().toISOString(),
  }).select('id, user_id, user_nickname, image_url, created_at').single();
  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    userNickname: data.user_nickname || '나',
    imagePath: data.image_url,
    createdAt: data.created_at,
  };
}

export async function deleteCertificationFromServer(groupId: string, certificationId: string): Promise<void> {
  const { data: row, error: selectError } = await (supabase as any)
    .from(TABLE)
    .select('image_url')
    .eq('id', certificationId)
    .eq('group_id', groupId)
    .single();
  if (selectError || !row?.image_url) return;
  if (row.image_url.startsWith('http')) {
    await deleteCertificationImageFromStorage(row.image_url);
  }
  await (supabase as any).from(TABLE).delete().eq('id', certificationId).eq('group_id', groupId);
}

export async function clearCertificationsForGroupFromServer(groupId: string): Promise<void> {
  const { data: rows } = await (supabase as any).from(TABLE).select('image_url').eq('group_id', groupId);
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r?.image_url?.startsWith('http')) await deleteCertificationImageFromStorage(r.image_url);
    }
  }
  await (supabase as any).from(TABLE).delete().eq('group_id', groupId);
}
