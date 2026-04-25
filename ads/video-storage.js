// Downloads a fal-hosted video into local data/videos/<clientId>/ and
// returns a public URL served by the Brain Express app at /videos/*.
//
// Note: Railway's filesystem is ephemeral — files are wiped on redeploy.
// fal.media URLs persist ~30 days, so we always return both.

import fs from 'fs/promises';
import path from 'path';

const VIDEOS_DIR = path.resolve(process.env.VIDEOS_STORAGE_DIR || './data/videos');
const PUBLIC_URL_BASE = (process.env.BRAIN_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

export async function downloadVideoToStorage({ falVideoUrl, clientId }) {
  if (!falVideoUrl) throw new Error('falVideoUrl is required');
  if (!clientId) throw new Error('clientId is required');

  const res = await fetch(falVideoUrl);
  if (!res.ok) throw new Error(`video download ${res.status}: ${falVideoUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const dir = path.join(VIDEOS_DIR, clientId);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}.mp4`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, buffer);

  return {
    filePath,
    publicUrl: `${PUBLIC_URL_BASE}/videos/${encodeURIComponent(clientId)}/${encodeURIComponent(filename)}`,
    bytes: buffer.length
  };
}
