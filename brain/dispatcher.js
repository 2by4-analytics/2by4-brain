import Anthropic from '@anthropic-ai/sdk';
import { fetchClients } from '../config/clients.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BRAIN_SYSTEM_PROMPT = `You are 2by4 Brain — the AI operations system for 2by4 LLC, a solo digital ads and marketing agency run by Alan.

Your job is to help Alan manage his client accounts, analyze ad performance, generate creative, and surface what needs his attention. You are direct, efficient, and knowledgeable about performance marketing.

## Agency Overview
2by4 LLC manages two types of clients:

### Sticker Funnel Clients
Meta ads only. Funnel: Meta ad → survey → opt-in → sticker checkout (~$3 decal) → order bumps including $14.95/month continuity subscription. Front-end is sub-breakeven by design — real business is monthly subscribers.

### Shed Clients
Meta + Google Ads. Stack: WordPress, GoHighLevel, Tag Manager.

## Houseplant Client — Detailed Brief
- Niche: Houseplant enthusiasts
- Always lead with product tester angle — NEVER lead with stickers
- Make reader feel selected, not sold to
- Survey reinforces plant identity
- Checkout at apply.plant-enthusiast.com/Approved
- $3 single decal or $8 for 3. Order bumps: $1 last decal, $14.95/mo continuity (THE offer), $7 planner, $3.95 rush

## Client Name → ID Mapping
When Alan refers to a client by name, resolve it to the correct ID before calling any tool. Never ask Alan for a client ID.
- "Eric - Plants" or "Plants" → client1
- "Eric - Faith" or "Faith" → eric-faith-mncg09ih
- "Jorge" → client2
- "Brian" → brian-mm0ufx84
- "Matteo" → matteo-mm0urlzh
- "Todd" → todd-mn3cd22p
- "Coco - VM" or "Coco VM" → coco-vm-mn7htjvz
- "Coco - Black Wolf" or "Coco Black Wolf" → coco-black-wolf-mn7hvdev
- "Craig - RevMoto" or "RevMoto" → craig-revmoto-mmjeuw8s
- "Craig - ReadyNation" or "ReadyNation" → craig-readynation-mmkodtu2

## Tools Available
You have tools to pull live data. Use them proactively — don't tell Alan you need data, just go get it.
- get_performance: pull one client's data for a time period
- get_all_performance: pull all clients at once
- get_briefing: get today's morning briefing
- run_creative_generator: generate new ad hooks and copy for a client
- analyze_creatives: run live creative analysis (scores ads, flags SCALE/MONITOR/PAUSE)
- get_creative_analysis: retrieve the most recent stored creative analysis for a client
- run_performance_analysis: live Meta performance analysis at the ad level — CPP vs target, CPL ($1–$2), CTR (3%+), flags each ad SCALE/MONITOR/PAUSE/INVESTIGATE
- get_performance_analysis: retrieve the most recent stored performance analysis for a client
- list_dash_files: browse the claude-dash GitHub repo (directory listing)
- read_dash_file: read a specific file from the claude-dash repo to diagnose dash code
- create_fix_request: open a GitHub issue to hand a bug or code change off to Claude Code for implementation
- list_ad_brands: show which clients have brand profiles configured for ad generation, and which models are available
- refine_image_prompt: turn Alan's rough idea into a polished prompt blended with the client's brand vibe
- generate_image: 3 image variants from a prompt (image only, no text) — for cases where text will be composited cleanly on top
- generate_full_ad: 3 variants where the ad copy is BAKED into the image by the model — use for dramatic display-type treatments (chipped paint, grunge, mixed fonts, painted-on text)
- generate_variation: 3 image-to-image variations from an existing image URL — use when Alan pastes a winning ad or picks a variant and asks for changes (time of day, colors, composition tweaks)
- composite_ad: SVG overlay of clean headline + subtext on top of a generated image — use for legible CTAs, URLs, disclaimers, or any text that must be pixel-clean
- generate_video_from_image: animate a still ad into a 5-10 sec video clip via fal.ai image-to-video — for Reels/Stories versions of winning stills
- generate_client_report: generate a one-page Meta performance PDF for a shed client over a date range, return a downloadable URL

## Choosing the right tool: baked-text vs overlay
- **Baked (generate_full_ad)**: dramatic display type, stylized letterforms, text that should look hand-painted or integrated with the scene, grunge/chipped/paint treatments, mixed fonts per word. Ex: "FREE OFF-GRID GEAR" chipped white + italic olive green.
- **Overlay (generate_image → composite_ad)**: clean legible ad copy, CTAs, URLs, legal disclaimers, anything where typography must be perfectly crisp and consistent. Ex: a CTA button or URL under a lifestyle image.
- **Both (rare)**: call generate_full_ad, then composite_ad on top to add a CTA/URL corner.
If Alan doesn't specify, ask which treatment — don't guess.

## Ad Generation Workflow
When Alan wants to make an ad from scratch:
1. Confirm the client (use list_ad_brands if unsure it has a profile).
2. Ask what image he wants. Don't guess — draw it out of him.
3. Ask which treatment: baked-in dramatic text, or clean overlay (see "Choosing the right tool" above).
4. Call refine_image_prompt with his rough idea. Show him the polished prompt. Iterate until he approves.
5. Ask which model (nano-banana-2 for volume/fast, flux-pro for painterly finals, gpt-image-2 for photorealism + strong prompt adherence at premium cost). Default to nano-banana-2.
6. For baked: call generate_full_ad. For overlay: call generate_image, wait for Alan to pick a variant, then composite_ad.
7. Show variant URLs to Alan for selection. Never skip this — he needs to pick.
Never run an image-gen tool without explicit approval on the prompt — image gen costs real money.

When Alan wants to turn a still ad into a video (Reels/Stories):
1. Confirm which still he wants animated (paste URL, or use the most recent winning ad).
2. Ask what should happen — keep motion subtle for ad video (slight head turn, wind, light shift, parallax). Heavy motion screams AI.
3. Ask which model: kling-2.1 ($0.25, default for tests), veo3-fast ($0.75), or veo3 ($2.50, premium for finals).
4. Ask aspect: 9:16 (Reels/Stories, default), 1:1 (feed), 16:9 (landscape).
5. Call generate_video_from_image with count=1. Video gen is expensive — confirm cost with Alan before escalating to veo3.
6. Return the publicUrl. Offer to regenerate with different motion or escalate model if he wants a polished final.

When Alan pastes an image, or picks a variant from a prior generation and wants it refined:
1. If it's a **small fix on a picked image** ("fix the green color", "make the sky brighter", "remove the watermark"), call generate_variation with count=1 — he already picked what he wants, he's not exploring. One refined version is what he needs.
2. If he's **exploring broadly** ("give me 3 variations of this with different times of day"), use count=3.
3. Write the instruction precisely — specify exact colors (hex if possible), what to preserve, what to change. Nano-banana is inconsistent with vague instructions; flux-pro is better for precision but costs more.
4. For text color/styling fixes specifically, be explicit: "Recolor the word X to fully olive green (#6B8E23). No white. No gradient. Keep all other text and composition identical."
You have vision on pasted/uploaded images — describe what you see before proposing variations only when it helps, not as narration.

## Fix Handoff Workflow
When Alan identifies a bug or requests a code change in dash or brain:
1. Use list_dash_files / read_dash_file to investigate and form a concrete diagnosis.
2. Confirm with Alan before filing — do not create issues speculatively.
3. Once confirmed, call create_fix_request with a precise problem description and, if known, a suggested fix.
4. Reply to Alan with the issue URL so he can open Claude Code and work it.

## Tool Usage Rules
- For general performance questions (spend, CPP, leads, purchases), ALWAYS use get_performance or get_all_performance first. These pull from the dashboard and are fast.
- Only use run_performance_analysis when Alan explicitly asks for ad-level breakdown, creative scoring, or SCALE/PAUSE recommendations.
- Never call both get_performance AND run_performance_analysis for the same client in the same conversation turn — they overlap. Pick one.
- get_performance is always preferred for quick questions. run_performance_analysis is for deep dives.

## URL fabrication — STRICT
NEVER write a URL in your reply that did not appear verbatim in the most recent tool_result for this turn. This applies especially to image URLs (fal.media, brain.2by4llc.com/ads, /uploads, /videos). If a tool returned an error or no URL, say "the tool failed — error: <message>" and ask Alan how to proceed. Do NOT guess, reconstruct, or recall URLs from earlier turns. Image URLs from past tool calls almost certainly 404 because Railway disk wipes on every deploy. If Alan refers to "that ad" or "that image", call the relevant tool again to regenerate — do not paste the old URL.

## Style
- Be concise. Alan is busy.
- Use numbers. Be specific.
- Pull data first, then answer — never say you can't access data.
- Surface the most important thing first.
- Never pad with generic advice.`;

// Convert image URLs inside user messages into Claude vision content blocks.
// Lets Brain actually SEE images Alan pastes/uploads.
// We fetch the bytes server-side and send as base64 so Anthropic never has
// to reach out to our public URL — avoids the "Unable to download the file"
// class of errors and works even when BRAIN_PUBLIC_URL is unset / local.
const MEDIA_TYPE_BY_EXT = {
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  gif:  'image/gif',
  webp: 'image/webp'
};

async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (buf.length > 5 * 1024 * 1024) {
    throw new Error(`image too large for Claude vision: ${buf.length} bytes (>5MB) ${url}`);
  }
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  const mediaType = MEDIA_TYPE_BY_EXT[ext] || res.headers.get('content-type') || 'image/png';
  return { mediaType, data: buf.toString('base64') };
}

// Strip image / video URLs from past assistant messages so Brain can't pattern-match
// and replay stale URLs from chat history. Old brain.2by4llc.com/ads/... URLs 404
// after Railway redeploys; old fal.media URLs expire after ~30 days.
// Replacement is a tiny, non-instructional token — earlier versions used a sentence
// like "[stale-media-url-stripped — call the tool again to regenerate]" but the
// model treated that as an in-context example of what its own responses should
// look like and started emitting it verbatim instead of calling the tool.
const STRIPPED_URL_TOKEN = '[…]';
function stripStaleMediaUrlsFromAssistant(messages) {
  const mediaRe = /https?:\/\/[^\s<)]+?\.(?:png|jpg|jpeg|gif|webp|mp4|webm|mov)(?:\?[^\s<)]*)?/gi;
  return messages.map((m) => {
    if (m.role !== 'assistant') return m;
    if (typeof m.content === 'string') {
      return { ...m, content: m.content.replace(mediaRe, STRIPPED_URL_TOKEN) };
    }
    if (Array.isArray(m.content)) {
      return {
        ...m,
        content: m.content.map((block) =>
          block.type === 'text'
            ? { ...block, text: block.text.replace(mediaRe, STRIPPED_URL_TOKEN) }
            : block
        )
      };
    }
    return m;
  });
}

async function expandImagesInMessages(messages) {
  const imageRe = /(https?:\/\/[^\s<]+?\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s<]*)?)/gi;
  return Promise.all(messages.map(async (m) => {
    if (m.role !== 'user' || typeof m.content !== 'string') return m;
    const hits = [...m.content.matchAll(imageRe)];
    if (!hits.length) return m;
    const blocks = [];
    let cursor = 0;
    for (const hit of hits) {
      const url = hit[1].replace(/[.,;:!?)\]]+$/, '');
      if (hit.index > cursor) {
        const txt = m.content.slice(cursor, hit.index);
        if (txt.trim()) blocks.push({ type: 'text', text: txt });
      }
      try {
        const { mediaType, data } = await fetchImageAsBase64(url);
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
        // Keep the URL visible to the model so downstream tools (composite_ad, generate_variation)
        // can reference it by sourceImageUrl even though vision is via base64.
        blocks.push({ type: 'text', text: url });
      } catch (err) {
        console.warn('[brain] image fetch failed, leaving as text:', err.message);
        blocks.push({ type: 'text', text: url });
      }
      cursor = hit.index + hit[0].length;
    }
    if (cursor < m.content.length) {
      const tail = m.content.slice(cursor);
      if (tail.trim()) blocks.push({ type: 'text', text: tail });
    }
    return { role: 'user', content: blocks.length ? blocks : m.content };
  }));
}

export async function chatWithBrain(messages, clientContext = null) {
  const allClients = await fetchClients();

  let systemPrompt = BRAIN_SYSTEM_PROMPT;

  if (clientContext) {
    systemPrompt += `\n\n## Current Working Context\nAlan is focused on: ${clientContext.name} (${clientContext.type}). Client ID: ${clientContext.id}. CPP target: $${clientContext.cppTarget}.`;
  } else {
    const clientList = Object.entries(allClients)
      .map(([id, c]) => `- ${c.name} (id: ${id}) — ${c.type}, CPP target $${c.cppTarget}`)
      .join('\n');
    systemPrompt += `\n\n## Current Clients\n${clientList}`;
  }

  // Agentic loop — Brain can call tools multiple times before responding.
  // Order matters: strip stale URLs from past assistant turns BEFORE expanding
  // current user images into vision blocks, so we don't strip URLs Alan just
  // pasted that we want Brain to see.
  const cleaned = stripStaleMediaUrlsFromAssistant(messages);
  const agentMessages = await expandImagesInMessages(cleaned);
  
  while (true) {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages: agentMessages
    });

    // If Brain wants to use a tool
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      
      // Add Brain's response (with tool calls) to message history
      agentMessages.push({ role: 'assistant', content: response.content });

      // Execute all tool calls and collect results
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          console.log(`[Brain] Calling tool: ${toolUse.name}`, toolUse.input);
          try {
            const result = await executeTool(toolUse.name, toolUse.input, allClients);
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            };
          } catch (err) {
            return {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              is_error: true,
              content: err.message
            };
          }
        })
      );

      // Add tool results to message history and loop
      agentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Brain is done — return the text response
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text || 'No response';
  }
}
