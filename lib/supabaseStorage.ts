import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';

const BUCKET = 'certifications';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * 로컬 이미지 파일을 Supabase Storage에 업로드하고 공개 URL을 반환합니다.
 * DB에는 이 URL(텍스트)만 저장해 용량을 아낍니다.
 */
export async function uploadCertificationImage(
  groupId: string,
  localUri: string,
  fileId: string,
  contentType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string> {
  const ext = contentType === 'image/png' ? '.png' : '.jpg';
  const path = `${groupId}/${fileId}${ext}`;

  let body: ArrayBuffer | Blob;
  try {
    const response = await fetch(localUri);
    if (response.ok) {
      body = await response.blob();
    } else {
      throw new Error('fetch failed');
    }
  } catch {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    body = base64ToArrayBuffer(base64);
  }

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

/**
 * Storage에서 파일 삭제 (경로는 public URL에서 추출)
 */
export async function deleteCertificationImageFromStorage(publicUrl: string): Promise<void> {
  try {
    const url = new URL(publicUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
    const path = pathMatch?.[1];
    if (!path) return;
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // ignore
  }
}
