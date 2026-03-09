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

const SHARE_PREFIX = 'share';

/**
 * 나눔 글 사진을 Storage에 업로드하고 공개 URL을 반환합니다.
 * DB에는 이 URL만 저장해 행 크기 제한을 피합니다.
 */
export async function uploadShareImage(
  userId: string,
  localUri: string,
  fileId: string,
  contentType: 'image/jpeg' | 'image/png' = 'image/jpeg'
): Promise<string> {
  const ext = contentType === 'image/png' ? '.png' : '.jpg';
  const path = `${SHARE_PREFIX}/${userId}/${fileId}${ext}`;

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
 * DB에 저장된 image_url(공개 URL 또는 경로)로 1시간 유효한 서명 URL 생성.
 * 공개 URL이 로드되지 않을 때(정책/캐시 등) 사용.
 */
export async function getCertificationSignedUrl(imageUrl: string | null | undefined): Promise<string> {
  if (!imageUrl?.trim()) return '';
  let path: string;
  if (imageUrl.startsWith('http')) {
    try {
      const url = new URL(imageUrl);
      const m = url.pathname.match(/\/storage\/v1\/object\/public\/certifications\/(.+)/);
      path = (m?.[1] ?? '').replace(/^\/+/, '');
    } catch {
      return imageUrl;
    }
  } else {
    path = imageUrl.replace(/^\/+/, '');
  }
  if (!path) return imageUrl;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return imageUrl;
  return data.signedUrl;
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
