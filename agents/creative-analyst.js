import Anthropic from '@anthropic-ai/sdk';
import { getAdCreatives } from '../meta/index.js';
import { runCreativeGenerator } from './creative-gen.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function downloadBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mediaType = contentType.split(';')[0].trim();
    // Claude supports image/jpeg, image/png, image/gif, image/webp
    const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const type = supported.includes(mediaType) ? mediaType : 'image/jpeg';
    const buffer = await res.arrayBuffer();
    return { base64: Buffer.from(buffer).toString('base64'), mediaType: type };
  } catch (err) {
    console.warn(`[CreativeAnalyst] Failed to download thumbnail ${url}:`, err.message);
    return null;
  }
}

function buildAdBlock(ad) {
  const lines = [
    `── Ad: ${ad.ad_name} ──`,
    `Headline:     ${ad.headline || '(none)'}`,
    `Primary text: ${ad.primary_text || '(none)'}`,
    `Spend: $${ad.spend.toFixed(2)}  |  Purchases: ${ad.purchases}  |  CPP: ${ad.cpp != null ? '$' + ad.cpp.toFixed(2) : 'N/A'}`,
    `CTR: ${ad.ctr.toFixed(2)}%  |  CPC: $${ad.cpc.toFixed(2)}`,
  ];
  return lines.join('\n');
}

const ANALYST_SYSTEM = `You are a performance creative analyst for a direct-response Meta ads agency.

You will be shown a set of active ads for one client — each includes the ad image, copy, and 7-day performance metrics.

Your job:
1. Score each ad 1–10 based on CPP vs the client's CPP target
2. Flag each ad: SCALE / MONITOR / PAUSE
3. Identify copy and visual patterns that separate winners from losers
4. Write a concise executive summary

Flag definitions:
- SCALE: CPP well below target, or strong CTR/CPC with early purchases — increase budget
- MONITOR: CPP within 15% of target, or good signals but limited spend — watch closely
- PAUSE: CPP significantly above target with meaningful spend, or spend with zero purchases

Always return valid JSON only — no markdown, no explanation outside the JSON.`;

export async function runCreativeAnalyst({ clientId, days = 7 }) {
  let result;
  try {
    result = await getAdCreatives(clientId, days);
  } catch (err) {
    console.error(`[CreativeAnalyst] getAdCreatives failed for ${clientId}:`, err.message);
    throw err; // re-throw with full message intact — do not genericize
  }
  const { clientName, cppTarget, ads } = result;

  if (!ads.length) {
    return { clientId, clientName, cppTarget, days, adsAnalyzed: 0, ads: [], patterns: null, summary: 'No active ads found.' };
  }

  // Download all thumbnails in parallel, fail gracefully per ad
  const adsWithImages = await Promise.all(
    ads.map(async ad => ({ ...ad, image: await downloadBase64(ad.thumbnail_url) }))
  );

  // Build content blocks: intro → [image, text] per ad → instructions
  const content = [];

  content.push({
    type: 'text',
    text: `Analyzing ${adsWithImages.length} active Meta ads for ${clientName}.\nCPP target: $${cppTarget}\nDate range: last ${days} days\n`,
  });

  for (const ad of adsWithImages) {
    if (ad.image) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: ad.image.mediaType, data: ad.image.base64 },
      });
    }
    content.push({ type: 'text', text: buildAdBlock(ad) });
  }

  content.push({
    type: 'text',
    text: `Return a JSON object with exactly this structure:
{
  "ads": [
    {
      "ad_id": "...",
      "ad_name": "...",
      "score": <1-10>,
      "flag": "SCALE" | "MONITOR" | "PAUSE",
      "reason": "<one sentence>"
    }
  ],
  "patterns": {
    "winning": "<hooks/angles/offers working best>",
    "losing": "<what is underperforming and why>",
    "copy_patterns": "<copy themes and structures correlated with performance>",
    "visual_patterns": "<visual/creative patterns correlated with performance>"
  },
  "summary": "<2-3 sentence executive summary of creative health>"
}`,
  });

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: ANALYST_SYSTEM,
    messages: [{ role: 'user', content }],
  });

  const raw = response.content[0].text.trim();
  const jsonText = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    : raw;

  const analysis = JSON.parse(jsonText);

  // Close the loop: if there are PAUSE ads and winning patterns, generate new concepts
  let new_concepts = null;
  const pauseCount = analysis.ads?.filter(a => a.flag === 'PAUSE').length ?? 0;
  const winningPatterns = analysis.patterns?.winning;
  if (pauseCount >= 1 && winningPatterns) {
    try {
      const brief = `Based on winning creative patterns: ${winningPatterns}. ` +
        `Copy themes driving performance: ${analysis.patterns?.copy_patterns || 'N/A'}. ` +
        `Visual patterns that work: ${analysis.patterns?.visual_patterns || 'N/A'}. ` +
        `Generate new concepts that double down on what's working.`;
      console.log(`[CreativeAnalyst] ${pauseCount} PAUSE ad(s) found — generating new concepts for ${clientId}`);
      new_concepts = await runCreativeGenerator({ clientId, clientName, brief });
    } catch (err) {
      console.warn(`[CreativeAnalyst] Creative gen failed for ${clientId}:`, err.message);
      new_concepts = null;
    }
  }

  return {
    clientId,
    clientName,
    cppTarget,
    days,
    adsAnalyzed: ads.length,
    ...analysis,
    new_concepts,
  };
}
