// Downloads fal-generated images to Brain's volume and returns Brain-hosted URLs.
// Called by the generate_* tools after fal returns so the URLs the model/Alan see
// are on our disk (survive fal CDN eviction).
//
// Caveat: on Railway WITHOUT a persistent volume mounted at ADS_STORAGE_DIR, the
// disk is wiped on every redeploy. If you want URLs to survive past the next
// deploy, mount a Railway volume and set ADS_STORAGE_DIR to it.

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

// Verify the file we just wrote actually serves over HTTP.
async function verifyServing(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch (err) {
    return false;
  }
}

// Takes the `variants` array returned by fal-client.generateVariants /
// generateVariationsFromSource and rewrites each successful entry's imageUrl
// to a Brain-hosted URL, keeping the original as falSourceUrl.
//
// Always sets falSourceUrl on success AND failure so callers have a
// guaranteed-working fallback to show if the brain URL 404s later.
export async function persistFalVariants(clientId, variants) {
  const safeClient = safeSlug(clientId);
  const dir = path.join(ADS_DIR, safeClient, 'variants');
  await fs.mkdir(dir, { recursive: true });
  const stamp = Date.now();

  return Promise.all(variants.map(async (v, i) => {
    if (v.error) return v;
    if (!v.imageUrl) {
      console.warn(`[persist] variant ${i} ${safeClient}: no imageUrl and no error — surfacing as error so the model sees it. keys=${Object.keys(v).join(',')}`);
      return { ...v, error: 'upstream returned variant with no imageUrl and no error — check Brain logs for the raw fal response' };
    }
    const falUrl = v.imageUrl;

    try {
      const res = await fetch(falUrl);
      if (!res.ok) throw new Error(`fal fetch ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('fal returned 0 bytes');

      const hash = crypto.randomBytes(4).toString('hex');
      const ext = inferExt(res.headers.get('content-type'), falUrl);
      const filename = `${stamp}-${i}-${hash}.${ext}`;
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, buf);

      // Disk-level write verification
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || stat.size !== buf.length) {
        throw new Error(`write verification failed (got ${stat?.size ?? 'no file'}, expected ${buf.length})`);
      }

      const brainUrl = `${PUBLIC_BASE}/ads/${safeClient}/variants/${filename}`;

      // HTTP-level serve verification — catches static-route misconfig + ephemeral-disk issues
      const serves = await verifyServing(brainUrl);
      if (!serves) {
        console.warn(`[persist] variant ${i} written (${buf.length}b) but ${brainUrl} does not serve — returning fal URL as primary`);
        return { ...v, imageUrl: falUrl, falSourceUrl: falUrl, brainUrlAttempted: brainUrl, bytes: buf.length, persistenceError: 'served URL returned non-200 immediately after write' };
      }

      console.log(`[persist] ✓ variant ${i} ${safeClient}: ${filename} (${buf.length}b) → ${brainUrl}`);
      return { ...v, imageUrl: brainUrl, falSourceUrl: falUrl, bytes: buf.length };
    } catch (err) {
      console.warn(`[persist] ✗ variant ${i} ${safeClient}: ${err.message} — falling back to fal URL`);
      return { ...v, imageUrl: falUrl, falSourceUrl: falUrl, persistenceError: err.message };
    }
  }));
}
