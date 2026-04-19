// Sharp-based ad compositor: takes a source image URL + overlay config,
// produces a finished PNG on disk and returns a public URL for it.
//
// Text rendering uses sharp's Pango-based text input with explicit fontfile paths,
// so no system font install is required on Railway.

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBrand } from './brands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, 'fonts');

const FONT_FILES = {
  oswald:    path.join(FONTS_DIR, 'Oswald.ttf'),
  inter:     path.join(FONTS_DIR, 'Inter.ttf'),
  playfair:  path.join(FONTS_DIR, 'PlayfairDisplay.ttf')
};

// Pango font family names inside each TTF (used in the markup).
const FONT_FAMILY = {
  oswald:   'Oswald',
  inter:    'Inter',
  playfair: 'Playfair Display'
};

const ADS_DIR = path.resolve(process.env.ADS_STORAGE_DIR || './data/ads');
const PUBLIC_URL_BASE = (process.env.BRAIN_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image download ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function gradientSvg({ width, height, position, color }) {
  const { r, g, b } = hexToRgb(color);
  const gradH = Math.round(height * 0.42);
  let y, dir;
  if (position === 'top') { y = 0; dir = 'x1="0" y1="0" x2="0" y2="1"'; }
  else if (position === 'center') { y = Math.round(height * 0.29); dir = 'x1="0" y1="0" x2="0" y2="1"'; }
  else { y = height - gradH; dir = 'x1="0" y1="1" x2="0" y2="0"'; }
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
       <defs><linearGradient id="g" ${dir}>
         <stop offset="0%" stop-color="rgb(${r},${g},${b})" stop-opacity="0.82"/>
         <stop offset="100%" stop-color="rgb(${r},${g},${b})" stop-opacity="0"/>
       </linearGradient></defs>
       <rect x="0" y="${y}" width="${width}" height="${gradH}" fill="url(#g)"/>
     </svg>`
  );
}

async function renderTextBlock({ text, fontKey, sizePx, color, width, align = 'centre' }) {
  const family = FONT_FAMILY[fontKey] || FONT_FAMILY.inter;
  const fontfile = FONT_FILES[fontKey] || FONT_FILES.inter;
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const markup = `<span font="${family} Bold ${sizePx}" foreground="${color}" letter_spacing="-1000">${escaped}</span>`;
  return sharp({
    text: {
      text: markup,
      fontfile,
      width,
      height: Math.round(sizePx * 2.2),
      rgba: true,
      align
    }
  }).png().toBuffer();
}

function positionOffsets({ canvasSize, position, overlayHeight }) {
  if (position === 'top')    return { topBase: Math.round(canvasSize * 0.10) };
  if (position === 'center') return { topBase: Math.round(canvasSize * 0.46) };
  return { topBase: canvasSize - overlayHeight - Math.round(canvasSize * 0.06) };
}

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

// Main compositor. Returns { filePath, publicUrl, width, height }.
export async function composeAd({
  clientId,
  sourceImageUrl,
  overlays,          // [{ text, role: 'headline'|'sub', color?, fontKey? }]
  position,          // 'top' | 'center' | 'bottom' — overrides brand default
  overlayColor,      // hex — overrides brand default
  canvasSize = 1024, // square edge
  outputName         // optional basename
}) {
  if (!sourceImageUrl) throw new Error('sourceImageUrl is required');
  if (!overlays?.length) throw new Error('at least one overlay is required');

  const brand = getBrand(clientId);
  const pos = position || brand.overlayPosition || 'bottom';
  const bgColor = overlayColor || brand.palette.overlay;

  // 1. Fetch + square-crop the source image.
  const srcBuffer = await downloadBuffer(sourceImageUrl);
  const squared = await sharp(srcBuffer)
    .resize(canvasSize, canvasSize, { fit: 'cover', position: 'centre' })
    .toBuffer();

  // 2. Gradient overlay SVG.
  const gradient = gradientSvg({ width: canvasSize, height: canvasSize, position: pos, color: bgColor });

  // 3. Render each text overlay.
  const rendered = await Promise.all(overlays.map(async (o) => {
    const isHeadline = o.role !== 'sub';
    const fontKey = o.fontKey || (isHeadline ? brand.font.headline : brand.font.sub);
    const color = o.color || (isHeadline ? brand.palette.headline : brand.palette.sub);
    const sizePx = isHeadline
      ? Math.round(canvasSize * 0.082)
      : Math.round(canvasSize * 0.038);
    const buf = await renderTextBlock({
      text: o.text,
      fontKey,
      sizePx,
      color,
      width: Math.round(canvasSize * 0.88)
    });
    const meta = await sharp(buf).metadata();
    return { buffer: buf, height: meta.height, width: meta.width, role: isHeadline ? 'headline' : 'sub' };
  }));

  // 4. Stack overlays vertically with a small gap.
  const gap = Math.round(canvasSize * 0.015);
  const stackHeight = rendered.reduce((h, r) => h + r.height, 0) + gap * (rendered.length - 1);
  const { topBase } = positionOffsets({ canvasSize, position: pos, overlayHeight: stackHeight });

  const composites = [{ input: gradient, top: 0, left: 0 }];
  let cursor = topBase;
  for (const r of rendered) {
    composites.push({
      input: r.buffer,
      top: cursor,
      left: Math.round((canvasSize - r.width) / 2)
    });
    cursor += r.height + gap;
  }

  // 5. Flatten → write to disk.
  const out = await sharp(squared).composite(composites).png({ quality: 95 }).toBuffer();

  const clientDir = path.join(ADS_DIR, clientId);
  await ensureDir(clientDir);
  const filename = `${outputName || `${Date.now()}`}.png`;
  const filePath = path.join(clientDir, filename);
  await fs.writeFile(filePath, out);

  return {
    filePath,
    publicUrl: `${PUBLIC_URL_BASE}/ads/${encodeURIComponent(clientId)}/${encodeURIComponent(filename)}`,
    width: canvasSize,
    height: canvasSize,
    bytes: out.length
  };
}
