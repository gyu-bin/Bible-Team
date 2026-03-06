import { supabase } from '@/lib/supabase';
import { uploadCertificationImage, deleteCertificationImageFromStorage } from '@/lib/supabaseStorage';
import type { CertificationItem } from '@/lib/certificationStorage';

const TABLE = 'certifications';

export async function getCertificationsFromServer(groupId: string): Promise<CertificationItem[]> {
  const { data, error } = await (supabase as any)
    .from(TABLE)
    .select('id, user_id, user_nickname, image_url, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.map((row: { id: string; user_id: string; user_nickname: string; image_url: string; created_at: string }) => ({
    id: row.id,
    userId: row.user_id,
    userNickname: row.user_nickname || '나',
    imagePath: row.image_url,
    createdAt: row.created_at,
  }));
}

export async function addCertificationToServer(
  groupId: string,
  userId: string,
  userNickname: string,
  imageUri: string,
  createdAt?: string
): Promise<CertificationItem> {
  const fileId = `cert_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const isPng = imageUri.toLowerCase().includes('.png');
  const contentType = isPng ? 'image/png' : 'image/jpeg';
  const imageUrl = await uploadCertificationImage(groupId, imageUri, fileId, contentType);

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
  await deleteCertificationImageFromStorage(row.image_url);
  await (supabase as any).from(TABLE).delete().eq('id', certificationId).eq('group_id', groupId);
}

export async function clearCertificationsForGroupFromServer(groupId: string): Promise<void> {
  const { data: rows } = await (supabase as any).from(TABLE).select('image_url').eq('group_id', groupId);
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (r?.image_url) await deleteCertificationImageFromStorage(r.image_url);
    }
  }
  await (supabase as any).from(TABLE).delete().eq('group_id', groupId);
}
