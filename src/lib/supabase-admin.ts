import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getServiceClient() {
  return createClient(supabaseUrl, serviceRoleKey);
}

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Download an external image and re-host it in Supabase Storage.
 * Returns the permanent public URL, or the original URL on failure.
 */
export async function uploadEventImage(
  imageUrl: string,
  slug: string,
): Promise<string> {
  if (!imageUrl) return imageUrl;

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return imageUrl;

    const contentType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    const ext = CONTENT_TYPE_TO_EXT[contentType] || 'jpg';
    const path = `${slug}.${ext}`;

    const buffer = Buffer.from(await res.arrayBuffer());
    const client = getServiceClient();

    const { error } = await client.storage
      .from('event-images')
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error('Storage upload failed:', error.message);
      return imageUrl;
    }

    const { data } = client.storage.from('event-images').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('uploadEventImage failed:', err);
    return imageUrl;
  }
}
