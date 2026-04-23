// Downloads fal-generated images to Brain's volume and returns Brain-hosted URLs.
// Called by the generate_* tools after fal returns so the URLs the model/Alan see
// are on our disk (survive fal CDN eviction, Brain redeploys, etc.).

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ADS_DIR = path.resolve(process.env.ADS_STORAGE_DIR || './data/ads');
const PUBLIC_BASE = (process.env.BRAIN_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

function inferExt(contentType, url) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('jpeg') || contentType?.includes('jpg')) return 'jpg';
  if (contentType?.includes('webp')) return 'webp';
  const m = url.split('?')[0].match(/\.(png|jpg|jpeg|webp|gif)$/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

function safeSlug(s) {
  return (s || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Takes the `variants` array returned by fal-client.generateVariants /
// generateVariationsFromSource and rewrites each successful entry's imageUrl
// to a Brain-hosted URL, keeping the original as falSourceUrl.
// Failed entries (with .error) are passed through untouched.
// If a download itself fails we fall back to the fal URL + a persistenceError
// flag so callers still have *something* to show.
export async function persistFalVariants(clientId, variants) {
  const safeClient = safeSlug(clientId);
  const dir = path.join(ADS_DIR, safeClient, 'variants');
  await fs.mkdir(dir, { recursive: true });
  const stamp = Date.now();

  return Promise.all(variants.map(async (v, i) => {
    if (v.error) return v;
    if (!v.imageUrl) return v;
    try {
      const res = await fetch(v.imageUrl);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = crypto.randomBytes(4).toString('hex');
      const ext = inferExt(res.headers.get('content-type'), v.imageUrl);
      const filename = `${stamp}-${i}-${hash}.${ext}`;
      await fs.writeFile(path.join(dir, filename), buf);
      const brainUrl = `${PUBLIC_BASE}/ads/${safeClient}/variants/${filename}`;
      return { ...v, imageUrl: brainUrl, falSourceUrl: v.imageUrl, bytes: buf.length };
    } catch (err) {
      console.warn(`[persist] failed to save variant ${i} for ${safeClient}: ${err.message}`);
      return { ...v, persistenceError: err.message };
    }
  }));
}
