import { runCreativeGenerator } from '../agents/creative-gen.js';
import { runCreativeAnalyst } from '../agents/creative-analyst.js';
import { getLatestCreativeAnalysis } from '../store/creative-analyses.js';
import { runPerformanceAnalyst } from '../agents/performance-analyst.js';
import { getLatestPerformanceAnalysis } from '../store/performance-analyses.js';
import { generateImage, generateVariants, generateVariationsFromSource, generateVideoFromImage, MODELS, MODEL_COSTS, VIDEO_I2V_MODELS, VIDEO_MODEL_COSTS } from '../ads/fal-client.js';
import { persistFalVariants } from '../ads/persist.js';
import { composeAd } from '../ads/compositor.js';
import { downloadVideoToStorage } from '../ads/video-storage.js';
import { getBrand, listBrandedClients } from '../ads/brands.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.2by4llc.com';
const DASH_REPO = '2by4-analytics/claude-dash';
const DASH_BRANCH = 'main';
const BRAIN_REPO = '2by4-analytics/2by4-brain';

const REPO_ALIAS = {
  dash: DASH_REPO,
  'claude-dash': DASH_REPO,
  brain: BRAIN_REPO,
  '2by4-brain': BRAIN_REPO
};

async function dashFetch(path) {
  const res = await fetch(`${DASHBOARD_URL}${path}`, {
    headers: { 'x-dash-password': process.env.DASH_PASSWORD }
  });
  if (!res.ok) throw new Error(`Dashboard error: ${res.status}`);
  return res.json();
}

const GH_HEADERS = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': '2by4-brain',
  ...(process.env.GITHUB_TOKEN ? { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } : {})
};

async function githubListPath(path = '') {
  const url = `https://api.github.com/repos/${DASH_REPO}/contents/${path}?ref=${DASH_BRANCH}`;
  const res = await fetch(url, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`GitHub list error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`Path is a file, not a directory: ${path}`);
  return data.map(e => ({ name: e.name, path: e.path, type: e.type, size: e.size }));
}

async function githubCreateIssue({ repo, title, body, labels }) {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not set — cannot create issues. Add a token with issues:write scope to Railway env.');
  }
  const fullRepo = REPO_ALIAS[repo] || REPO_ALIAS.dash;
  const res = await fetch(`https://api.github.com/repos/${fullRepo}/issues`, {
    method: 'POST',
    headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, labels })
  });
  if (!res.ok) throw new Error(`GitHub create-issue error ${res.status}: ${await res.text()}`);
  const issue = await res.json();
  return { repo: fullRepo, number: issue.number, url: issue.html_url, title: issue.title };
}

async function githubReadFile(path) {
  if (!path) throw new Error('path is required');
  const url = `https://raw.githubusercontent.com/${DASH_REPO}/${DASH_BRANCH}/${path}`;
  const res = await fetch(url, { headers: GH_HEADERS });
  if (!res.ok) throw new Error(`GitHub read error ${res.status} for ${path}`);
  const content = await res.text();
  const MAX = 80_000;
  if (content.length > MAX) {
    return { path, truncated: true, bytes: content.length, content: content.slice(0, MAX) };
  }
  return { path, truncated: false, bytes: content.length, content };
}

function getDateRange(period) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const end = now.toISOString().split('T')[0];
  const start = new Date(now);
  
  switch(period) {
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      return { startDate: start.toISOString().split('T')[0], endDate: start.toISOString().split('T')[0] };
    case 'last7':
      start.setDate(start.getDate() - 7);
      return { startDate: start.toISOString().split('T')[0], endDate: end };
    case 'last30':
      start.setDate(start.getDate() - 30);
      return { startDate: start.toISOString().split('T')[0], endDate: end };
    case 'today':
    default:
      return { startDate: end, endDate: end };
  }
}

export const TOOL_DEFINITIONS = [
  {
    name: 'get_performance',
    description: 'Get ad performance data for a client. Use this whenever Alan asks about CPP, spend, purchases, ROAS, or performance for any client or time period.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'The client ID — resolve from client name using the mapping in the system prompt (e.g. "Eric - Plants" → client1, "Faith" → eric-faith-mncg09ih)'
        },
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'last7', 'last30'],
          description: 'Time period to pull data for'
        }
      },
      required: ['clientId', 'period']
    }
  },
  {
    name: 'get_all_performance',
    description: 'Get performance data for ALL clients at once. Use when Alan asks for an overview, wants to compare clients, or asks what needs attention across accounts.',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'last7', 'last30'],
          description: 'Time period to pull data for'
        }
      },
      required: ['period']
    }
  },
  {
    name: 'get_briefing',
    description: 'Get the most recent morning briefing. Use when Alan asks what happened, what needs attention, or references the morning report.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'run_creative_generator',
    description: 'Generate Meta ad creative for a sticker funnel client — 3 hook variations, 3 primary text variations, and an image prompt. Use when Alan asks for ad copy, hooks, creative ideas, or wants to generate ads for a client.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'The client ID (e.g. client1, eric-faith-mncg09ih)'
        },
        brief: {
          type: 'string',
          description: 'Creative brief — describe the angle, audience insight, offer focus, or any specific direction Alan wants'
        }
      },
      required: ['clientId', 'brief']
    }
  },
  {
    name: 'analyze_creatives',
    description: 'Analyze all active Meta ads for a client — scores each creative, flags ads as SCALE/MONITOR/PAUSE, and identifies copy and visual patterns driving performance. Use when Alan asks to review creatives, audit ads, identify what to scale or pause, or understand what is and isn\'t working.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'The client ID (e.g. client1, eric-faith-mncg09ih)'
        },
        days: {
          type: 'number',
          description: 'Number of days of performance data to use (default 7)'
        }
      },
      required: ['clientId']
    }
  },
  {
    name: 'run_performance_analysis',
    description: 'Run a live Meta ads performance analysis for a sticker funnel client — evaluates every active ad against CPP target, CPL ($1–$2), and CTR (3%+). Flags each ad SCALE/MONITOR/PAUSE/INVESTIGATE with specific diagnosis. Use when Alan asks how ads are performing, what to pause, what to scale, or wants a numbers breakdown.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'The client ID — resolve from client name using the mapping in the system prompt (e.g. "Eric - Plants" → client1, "Faith" → eric-faith-mncg09ih)'
        },
        days: {
          type: 'number',
          description: 'Number of days of data to analyze (default 1 = yesterday, use 7 for weekly view)'
        }
      },
      required: ['clientId']
    }
  },
  {
    name: 'get_performance_analysis',
    description: 'Retrieve the most recent stored performance analysis for a client without re-running. Use when Alan wants to review the latest analysis or reference yesterday\'s results.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'The client ID — resolve from client name using the mapping in the system prompt'
        }
      },
      required: ['clientId']
    }
  },
  {
    name: 'list_dash_files',
    description: 'List files and directories in the claude-dash GitHub repo (2by4-analytics/claude-dash, main branch). Use to browse the dash codebase when Alan asks to diagnose dash code, find a file, or explore the repo structure. Returns an array of entries with name, path, type (file/dir), and size.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repo-relative directory path (e.g. "src", "src/routes"). Omit or pass empty string for the repo root.'
        }
      },
      required: []
    }
  },
  {
    name: 'read_dash_file',
    description: 'Read the contents of a single file from the claude-dash GitHub repo. Use to inspect dash source code for diagnosis, tracing bugs, or understanding how a dashboard endpoint works. Large files are truncated at 80KB.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Repo-relative file path (e.g. "src/routes/dashboard.js", "package.json").'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'create_fix_request',
    description: 'Open a GitHub issue describing a bug or requested change, to hand off to Claude Code for implementation. Use when Alan confirms a code change is needed in dash or brain, or when diagnosis has surfaced a clear bug. Always include concrete detail: error symptom, affected file(s) if known, reproduction steps, and what the fix should look like. Do NOT use for questions or speculation — only for actionable fixes.',
    input_schema: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: ['dash', 'brain'],
          description: 'Which repo the fix belongs in. "dash" = claude-dash (default), "brain" = 2by4-brain.'
        },
        title: {
          type: 'string',
          description: 'Concise one-line issue title (under 80 chars). Describe the problem, not the fix.'
        },
        problem: {
          type: 'string',
          description: 'What is wrong. Include: the observed behavior, relevant file paths or endpoints, error messages, how to reproduce. Be specific.'
        },
        suggested_fix: {
          type: 'string',
          description: 'Optional. What you believe the fix should be — approach, file changes, logic adjustment. Omit if unsure.'
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: 'Optional. "high" = broken in prod or blocking Alan. Default "normal".'
        }
      },
      required: ['title', 'problem']
    }
  },
  {
    name: 'refine_image_prompt',
    description: 'Turn a rough idea into a polished image-generation prompt tailored to a client\'s brand. Use when Alan describes what he wants to see ("rider at sunset in the desert") and we need a prompt before calling generate_image. Returns a cleaned prompt that blends Alan\'s direction with the client\'s vibe, base prompt hints, and things-to-avoid. Cheap (no fal call).',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'Client ID (see listBrandedClients for the set).' },
        rough_idea: { type: 'string', description: 'Alan\'s description of the image — can be as loose as he wants.' }
      },
      required: ['clientId', 'rough_idea']
    }
  },
  {
    name: 'generate_image',
    description: 'Generate image variants for an ad via fal.ai. Defaults to 3 variants with different seeds. Use AFTER Alan has approved a prompt. Returns an array of fal-hosted image URLs Alan can pick from before compositing text.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        prompt: { type: 'string', description: 'The polished image prompt (usually from refine_image_prompt).' },
        model: { type: 'string', enum: ['nano-banana-2', 'flux-dev', 'flux-pro', 'gpt-image-2'], description: 'Which fal model. Default nano-banana-2 (fast/cheap). flux-pro for painterly finals. gpt-image-2 for OpenAI-style photorealism + strong prompt adherence (premium cost).' },
        aspect_ratio: { type: 'string', enum: ['1:1', '9:16'], description: 'Image aspect. 1:1 = 1024×1024 square (Meta feed default). 9:16 = vertical (Stories/Reels). Default 1:1.' },
        count: { type: 'number', description: 'How many variants to generate (default 3).' }
      },
      required: ['clientId', 'prompt']
    }
  },
  {
    name: 'generate_full_ad',
    description: 'Generate a complete ad with typography BAKED INTO the image — the model renders headline/subtext as stylized text inside the scene (chipped paint, grunge, mixed fonts, etc.). Use this for dramatic display-type ads where text should feel integrated with the scene, not overlaid on it. Best with nano-banana-2. Returns 3 variants with different seeds. Do NOT use this for clean, readable CTAs/URLs/disclaimers — use composite_ad for those.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        scene: { type: 'string', description: 'The visual scene description (subject, setting, lighting, mood).' },
        copy: {
          type: 'object',
          description: 'The ad copy to bake into the image.',
          properties: {
            headline: { type: 'string', description: 'Main display text, e.g. "FREE OFF-GRID GEAR".' },
            sub: { type: 'string', description: 'Secondary line, e.g. "TEST, REVIEW, & KEEP COOL GEAR!"' },
            treatment: { type: 'string', description: 'Typography treatment, e.g. "huge chipped white paint serif, with one word italic olive green". Be specific — this directly controls how the model renders the text.' }
          },
          required: ['headline']
        },
        model: { type: 'string', enum: ['nano-banana-2', 'flux-pro', 'gpt-image-2'], description: 'Default nano-banana-2 (best at text-in-image). flux-pro for painterly finals. gpt-image-2 also strong at in-image text with high prompt adherence.' },
        aspect_ratio: { type: 'string', enum: ['1:1', '9:16', '16:9'], description: '1:1 = feed (default). 9:16 = Reels/Stories. 16:9 = landscape.' },
        count: { type: 'number', description: 'How many variants (default 3).' }
      },
      required: ['clientId', 'scene', 'copy']
    }
  },
  {
    name: 'generate_variation',
    description: 'Create variation(s) of an existing image via fal image-to-image. Use when Alan pastes a winning ad, or picks a variant and asks for changes. Preserves composition while applying the instruction. DEFAULT COUNT IS 1 — if Alan already picked a specific version and wants a small fix ("make OFF-GRID fully green"), return just 1 refined version. Only use count=3 when Alan is exploring broadly or explicitly asks for multiple variations. Default model nano-banana-2.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        sourceImageUrl: { type: 'string', description: 'URL of the image to vary. Usually a /uploads/ URL from Alan pasting, or a previous generation.' },
        instruction: { type: 'string', description: 'What to change. Be precise about colors, positions, and what should be preserved. Ex: "Recolor the word OFF-GRID to be entirely olive green (#6B8E23), keep everything else identical" — nano-banana is inconsistent with vague instructions.' },
        model: { type: 'string', enum: ['nano-banana-2', 'flux-dev', 'flux-pro', 'gpt-image-2'], description: 'Default nano-banana-2. For a polished final where color/text precision matters, consider flux-pro or gpt-image-2.' },
        count: { type: 'number', description: 'How many variants. DEFAULT 1. Use 3 only when exploring or Alan asks.' }
      },
      required: ['clientId', 'sourceImageUrl', 'instruction']
    }
  },
  {
    name: 'generate_video_from_image',
    description: 'Animate a still image into a short video ad via fal.ai image-to-video. Use AFTER Alan has a winning still ad and wants a Reels/Stories version, or wants to animate a generated image. Defaults to count=1 because video generation is expensive ($0.25–$2.50 per clip). Returns a video URL Alan can preview/download. Default model kling-2.1 (cheap baseline).',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        sourceImageUrl: { type: 'string', description: 'URL of the still image to animate. Usually a final composited ad URL or a fal-generated variant.' },
        motion_prompt: { type: 'string', description: 'What should happen in the video. Be specific: "subject turns head slowly toward camera, wind blowing through trees, golden hour light shifting" — better than vague "make it move". Keep it subtle for ads — heavy motion looks AI.' },
        model: { type: 'string', enum: ['kling-2.1', 'veo3-fast', 'veo3'], description: 'kling-2.1 = cheap baseline (~$0.25). veo3-fast = mid (~$0.75). veo3 = premium for finals (~$2.50). Default kling-2.1.' },
        duration_sec: { type: 'number', description: 'Video length in seconds. Default 5. Most ad models support 5–10s; Veo supports up to 8s.' },
        aspect_ratio: { type: 'string', enum: ['9:16', '1:1', '16:9'], description: '9:16 for Reels/Stories (default), 1:1 for feed, 16:9 for landscape.' }
      },
      required: ['clientId', 'sourceImageUrl', 'motion_prompt']
    }
  },
  {
    name: 'composite_ad',
    description: 'Take a generated image URL and overlay headline + subtext text to produce a finished ad PNG. Use AFTER Alan picks a variant from generate_image. Returns a public URL to the composited ad hosted on Brain. Can specify position, palette overrides, and multiple text overlays.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string' },
        sourceImageUrl: { type: 'string', description: 'fal.ai image URL from generate_image.' },
        overlays: {
          type: 'array',
          description: 'Text overlays. Order = top-to-bottom stack.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              role: { type: 'string', enum: ['headline', 'sub'], description: 'headline = large/bold, sub = smaller caption' },
              color: { type: 'string', description: 'Optional hex override (e.g. "#ffffff").' },
              fontKey: { type: 'string', enum: ['oswald', 'inter', 'playfair'], description: 'Optional font override.' }
            },
            required: ['text', 'role']
          }
        },
        position: { type: 'string', enum: ['top', 'center', 'bottom'], description: 'Where the text stack sits. Defaults to brand config.' },
        overlayColor: { type: 'string', description: 'Optional gradient-background color override (hex).' }
      },
      required: ['clientId', 'sourceImageUrl', 'overlays']
    }
  },
  {
    name: 'list_ad_brands',
    description: 'List which clients have ad-brand profiles configured (palette, font, vibe) and which are still stubs ("TODO"). Use when Alan asks "which clients can I make ads for" or before generating if unsure the client is set up.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_creative_analysis',
    description: 'Retrieve the most recent stored creative analysis for a client without re-running the pipeline. Use when Alan asks to see the latest creative analysis, review scores, or check what was flagged for a client.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: {
          type: 'string',
          description: 'The client ID (e.g. client1, eric-faith-mncg09ih)'
        }
      },
      required: ['clientId']
    }
  }
];

export async function executeTool(name, input, allClients) {
  switch(name) {
    case 'get_performance': {
      const { startDate, endDate } = getDateRange(input.period);
      const data = await dashFetch(`/api/dashboard/${input.clientId}?startDate=${startDate}&endDate=${endDate}`);
      const client = allClients[input.clientId];
      return {
        client: client?.name || input.clientId,
        period: input.period,
        dateRange: { startDate, endDate },
        cppTarget: client?.cppTarget,
        data
      };
    }

    case 'get_all_performance': {
      const { startDate, endDate } = getDateRange(input.period);
      const results = await Promise.allSettled(
        Object.entries(allClients).map(async ([id, c]) => {
          const data = await dashFetch(`/api/dashboard/${id}?startDate=${startDate}&endDate=${endDate}`);
          return { id, name: c.name, cppTarget: c.cppTarget, type: c.type, data };
        })
      );
      return {
        period: input.period,
        dateRange: { startDate, endDate },
        clients: results
          .filter(r => r.status === 'fulfilled')
          .map(r => r.value),
        errors: results
          .filter(r => r.status === 'rejected')
          .map(r => r.reason?.message)
      };
    }

    case 'get_briefing': {
      const res = await fetch('/api/briefing/latest');
      const data = await res.json();
      return data.empty ? { message: 'No briefing available yet' } : data;
    }

    case 'run_creative_generator': {
      const clientConfig = allClients[input.clientId];
      if (!clientConfig) throw new Error(`Unknown client: ${input.clientId}`);
      const creative = await runCreativeGenerator({
        clientId: input.clientId,
        clientName: clientConfig.name,
        brief: input.brief
      });
      return { clientId: input.clientId, clientName: clientConfig.name, ...creative };
    }

    case 'analyze_creatives': {
      const clientConfig = allClients[input.clientId];
      if (!clientConfig) throw new Error(`Unknown client: ${input.clientId}`);
      return await runCreativeAnalyst({
        clientId: input.clientId,
        days: input.days || 7,
      });
    }

    case 'run_performance_analysis': {
      const clientConfig = allClients[input.clientId];
      if (!clientConfig) throw new Error(`Unknown client: ${input.clientId}`);
      return await runPerformanceAnalyst({
        clientId: input.clientId,
        days: input.days || 1,
      });
    }

    case 'get_performance_analysis': {
      const analysis = await getLatestPerformanceAnalysis(input.clientId);
      if (!analysis) return { message: `No stored performance analysis found for ${input.clientId}. Use run_performance_analysis to generate one.` };
      return analysis;
    }

    case 'list_dash_files': {
      return await githubListPath(input.path || '');
    }

    case 'read_dash_file': {
      return await githubReadFile(input.path);
    }

    case 'create_fix_request': {
      const repo = input.repo || 'dash';
      const priority = input.priority || 'normal';
      const bodyParts = [
        `## Problem\n${input.problem}`,
        input.suggested_fix ? `## Suggested fix\n${input.suggested_fix}` : null,
        `---\n_Filed by 2by4 Brain • priority: ${priority}_`
      ].filter(Boolean);
      const labels = ['brain-filed', `priority:${priority}`];
      return await githubCreateIssue({
        repo,
        title: input.title,
        body: bodyParts.join('\n\n'),
        labels
      });
    }

    case 'refine_image_prompt': {
      const brand = getBrand(input.clientId);
      const hints = brand.basePromptHints ? `, ${brand.basePromptHints}` : '';
      const avoid = brand.avoid ? `\n\nAvoid: ${brand.avoid}` : '';
      return {
        clientId: input.clientId,
        clientName: brand.name,
        vibe: brand.vibe,
        prompt: `${input.rough_idea}${hints}.\n\nStyle: ${brand.vibe}${avoid}`,
        note: 'Review this prompt with Alan before calling generate_image. Tweak wording to match his direction.'
      };
    }

    case 'generate_image': {
      const count = input.count ?? 3;
      const model = input.model || 'nano-banana-2';
      const aspectRatio = input.aspect_ratio || '1:1';
      const t0 = Date.now();
      const result = await generateVariants({ model, prompt: input.prompt, aspectRatio, count });
      const tFal = Date.now() - t0;
      const variants = await persistFalVariants(input.clientId, result.variants);
      const tTotal = Date.now() - t0;
      const successCount = variants.filter(v => !v.error).length;
      const errorCount = variants.filter(v => v.error).length;
      console.log(`[generate_image] client=${input.clientId} model=${model} aspect=${aspectRatio} count=${count} fal=${tFal}ms total=${tTotal}ms success=${successCount} errors=${errorCount}`);
      return {
        clientId: input.clientId,
        prompt: input.prompt,
        model,
        aspectRatio,
        variants: variants.map((v, i) => v.error
          ? { index: i, error: v.error }
          : {
              index: i,
              imageUrl: v.imageUrl,
              falSourceUrl: v.falSourceUrl,
              seed: v.seed,
              ...(v.persistenceError ? { persistenceWarning: `Brain disk persistence failed (${v.persistenceError}); imageUrl is the fal CDN URL — works for ~30 days but won't survive past then.` } : {})
            }),
        costEstimate: result.costEstimate,
        _diagnostic: { falMs: tFal, totalMs: tTotal, success: successCount, errors: errorCount },
        note: errorCount > 0
          ? `${errorCount} variant(s) failed. Tell Alan exactly which failed and the error. NEVER fabricate URLs for failed variants.`
          : 'Show the actual URLs from this response to Alan. After he picks one, call composite_ad with the sourceImageUrl. NEVER make up URLs — only use the strings present in this tool result.'
      };
    }

    case 'generate_full_ad': {
      const brand = getBrand(input.clientId);
      const { headline, sub, treatment } = input.copy;
      const model = input.model || 'nano-banana-2';
      const count = input.count ?? 3;
      const aspectRatio = input.aspect_ratio || '1:1';
      const compositionLine = aspectRatio === '9:16'
        ? 'Vertical 9:16 composition (Reels/Stories format) — taller than wide, subject centered with breathing room top and bottom.'
        : aspectRatio === '16:9'
          ? 'Horizontal 16:9 composition (landscape) — wider than tall.'
          : '1:1 square composition.';
      const vibe = brand.vibe && brand.vibe !== 'TODO' && brand.vibe !== '—' ? brand.vibe : '';
      const hints = brand.basePromptHints || '';
      const prompt = [
        input.scene,
        '',
        'Ad typography rendered INSIDE the image, clearly readable and integrated with the scene:',
        `- Headline: "${headline}"`,
        sub ? `- Subhead: "${sub}"` : null,
        treatment ? `Typography treatment: ${treatment}.` : 'Typography treatment: bold display type, high contrast, editorial ad layout, text placed in a clean area of the composition.',
        vibe ? `Style: ${vibe}.` : null,
        hints ? `Style hints: ${hints}.` : null,
        brand.avoid ? `Avoid: ${brand.avoid}.` : null,
        compositionLine
      ].filter(Boolean).join('\n');

      const result = await generateVariants({ model, prompt, aspectRatio, count });
      const variants = await persistFalVariants(input.clientId, result.variants);
      return {
        clientId: input.clientId,
        mode: 'baked-text',
        prompt,
        model,
        aspectRatio,
        variants: variants.map((v, i) => v.error
          ? { index: i, error: v.error }
          : {
              index: i,
              imageUrl: v.imageUrl,
              falSourceUrl: v.falSourceUrl,
              seed: v.seed,
              ...(v.persistenceError ? { persistenceWarning: `Brain disk persistence failed (${v.persistenceError}); imageUrl is the fal CDN URL — works for ~30 days but won't survive past then.` } : {})
            }),
        costEstimate: result.costEstimate,
        note: 'Text is baked into each variant. Show URLs to Alan — no composite_ad needed unless he wants additional overlay on top.'
      };
    }

    case 'generate_variation': {
      const model = input.model || 'nano-banana-2';
      const count = input.count ?? 1;
      const result = await generateVariationsFromSource({
        model,
        prompt: input.instruction,
        sourceImageUrl: input.sourceImageUrl,
        count
      });
      const variants = await persistFalVariants(input.clientId, result.variants);
      return {
        clientId: input.clientId,
        sourceImageUrl: input.sourceImageUrl,
        instruction: input.instruction,
        model,
        variants: variants.map((v, i) => v.error
          ? { index: i, error: v.error }
          : {
              index: i,
              imageUrl: v.imageUrl,
              falSourceUrl: v.falSourceUrl,
              seed: v.seed,
              ...(v.persistenceError ? { persistenceWarning: `Brain disk persistence failed (${v.persistenceError}); imageUrl is the fal CDN URL — works for ~30 days but won't survive past then.` } : {})
            }),
        costEstimate: result.costEstimate,
        note: 'Show URLs to Alan. He can composite_ad on top, or feed a variant back into generate_variation for further iteration.'
      };
    }

    case 'generate_video_from_image': {
      const model = input.model || 'kling-2.1';
      const durationSec = input.duration_sec ?? 5;
      const aspectRatio = input.aspect_ratio || '9:16';
      const result = await generateVideoFromImage({
        model,
        prompt: input.motion_prompt,
        sourceImageUrl: input.sourceImageUrl,
        durationSec,
        aspectRatio
      });
      // Mirror fal's CDN copy to local storage for permanence + serving from /videos/*
      let mirror = null;
      try {
        mirror = await downloadVideoToStorage({ falVideoUrl: result.videoUrl, clientId: input.clientId });
      } catch (err) {
        // Non-fatal — fal URL still works for ~30 days
        console.error('[generate_video_from_image] mirror failed:', err.message);
      }
      return {
        clientId: input.clientId,
        sourceImageUrl: input.sourceImageUrl,
        motion_prompt: input.motion_prompt,
        model,
        durationSec,
        aspectRatio,
        falVideoUrl: result.videoUrl,
        publicUrl: mirror?.publicUrl || result.videoUrl,
        bytes: mirror?.bytes ?? null,
        costEstimate: result.costEstimate,
        note: 'Show publicUrl to Alan. He can request another with different motion or escalate to veo3-fast/veo3 for a polished version.'
      };
    }

    case 'composite_ad': {
      const result = await composeAd({
        clientId: input.clientId,
        sourceImageUrl: input.sourceImageUrl,
        overlays: input.overlays,
        position: input.position,
        overlayColor: input.overlayColor
      });
      return {
        clientId: input.clientId,
        ...result
      };
    }

    case 'list_ad_brands': {
      return {
        availableModels: Object.keys(MODELS),
        modelCosts: MODEL_COSTS,
        clients: listBrandedClients()
      };
    }

    case 'get_creative_analysis': {
      const analysis = await getLatestCreativeAnalysis(input.clientId);
      if (!analysis) return { message: `No stored creative analysis found for ${input.clientId}. Use analyze_creatives to run a fresh analysis.` };
      return analysis;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
