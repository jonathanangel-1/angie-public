import { env } from 'cloudflare:workers';

type StorageEnv = { UPLOADS?: R2Bucket };

export function inspirationBucket() {
  const bucket = (env as unknown as StorageEnv).UPLOADS;
  if (!bucket) throw new Error('R2 binding UPLOADS is unavailable.');
  return bucket;
}

export async function storeInspirationImage(id: string, type: string, bytes: ArrayBuffer) {
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const key = `angie/inspirations/${id}.${extension}`;
  await inspirationBucket().put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: 'private, max-age=31536000, immutable' },
    customMetadata: { recommendationId: id },
  });
  return key;
}

// Private, content-addressed model responses. Exact image, prompt, schema,
// candidate images and model all participate in the key; no stock is cached.
export function privateSearchCache() {
  return {
    async get(key: string) {
      const object = await inspirationBucket().get(`angie/search-cache/${key}.json`);
      return object ? object.json<{ createdAt: number; body: unknown }>() : null;
    },
    async put(key: string, value: { createdAt: number; body: unknown }) {
      await inspirationBucket().put(`angie/search-cache/${key}.json`, JSON.stringify(value), { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
    },
  };
}
