# 2by4 Brain

AI operations system for 2by4 LLC. Morning briefings, agentic chat for client management, performance + creative analysis, and ad image generation with a fal.ai + Sharp pipeline.

For the full agency context (clients, metrics, infrastructure), see the top-level `CLAUDE.md`.

## Structure

```
2by4-brain/
├── server.js              # Express app + scheduler + /api routes + /ads, /uploads static
├── brain/
│   ├── dispatcher.js      # Claude API + agentic tool loop + vision on uploaded images
│   └── tools.js           # All tool definitions and executors
├── agents/                # creative-gen, creative-analyst, performance-analyst, cpa-monitor
├── ads/                   # fal-client, compositor, brands config, bundled OFL fonts
├── scheduler/             # morning briefing (7am CT), creative-scheduler, performance-scheduler
├── store/                 # briefings, creative-analyses, performance-analyses (JSON files)
├── config/
│   └── clients.js         # dynamic client fetch from Dash API (with cache)
├── dashboard/
│   └── index.html         # 3-column UI (Briefing/Ads tabs + chat with paste/drop upload)
└── data/                  # runtime storage (gitignored)
    ├── ads/<clientId>/    # composited ads
    └── uploads/           # user-uploaded images
```

## Environment Variables

```
ANTHROPIC_API_KEY=        # Claude API
DASHBOARD_URL=https://dash.2by4llc.com
DASH_PASSWORD=            # shared secret for dash API
GITHUB_TOKEN=             # fine-grained PAT, Issues:rw on claude-dash + 2by4-brain
FAL_KEY=                  # fal.ai API key for image + video gen (format: <uuid>:<secret>)
BRAIN_PUBLIC_URL=         # public base URL for /ads, /uploads, /videos links, e.g. https://brain.2by4llc.com
ADS_STORAGE_DIR=          # path on Railway volume for ads — e.g. /data/ads (see Storage below)
UPLOADS_STORAGE_DIR=      # path on Railway volume for uploads — e.g. /data/uploads
VIDEOS_STORAGE_DIR=       # path on Railway volume for videos — e.g. /data/videos
PORT=3001
```

## Storage — Railway volume required

Brain writes to `data/ads/`, `data/uploads/`, `data/videos/`. **On Railway, the local filesystem is wiped on every redeploy** — without a mounted volume, every `git push` destroys previously generated assets and any URLs returned to users 404.

Setup once on Railway:
1. Service → Settings → Volumes → New Volume, mount at `/data`
2. Set the three `*_STORAGE_DIR` env vars above to point at that mount
3. Redeploy — assets now persist across deploys

`persistFalVariants` falls back to the fal CDN URL (~30-day expiry) if the brain disk doesn't serve, so URLs are never dead in the moment, but a real volume is required for long-term retention. Full details in `CLAUDE.md` "Railway Volume" section.

## Deploy

Railway auto-deploys on push to `main` (~60s). No build step — Node.js ESM.

```bash
git add -A && git commit -m "message" && git push
```

## Usage

- **Dashboard**: open `brain.2by4llc.com`. Left column = client picker. Middle = Morning Briefing / Ads tabs. Right = Brain chat.
- **Morning briefing**: auto-runs 7am CT daily. Use "RUN BRIEFING" to trigger manually.
- **Chat**: select a client, ask Brain about performance, creative, or to generate ads. Paste or drag-drop an image into the chat input to attach (auto-uploads, Brain gets vision on it).
- **Ads**: generated variants and composited finals appear as clickable thumbnails in the middle Ads tab.

## Tool catalog

See `CLAUDE.md` for the full tools catalog and when to use each. Quick reference:

- **Data:** `get_performance`, `get_all_performance`, `get_briefing`, `run_performance_analysis`, `analyze_creatives`, `run_creative_generator`
- **Ad generation:** `list_ad_brands`, `refine_image_prompt`, `generate_image`, `generate_full_ad` (baked text), `generate_variation` (img2img), `composite_ad` (SVG overlay)
- **Code handoff:** `list_dash_files`, `read_dash_file`, `create_fix_request` (opens a GitHub issue for Claude Code to work)

## Key patterns

- **Client config:** always fetch dynamically via `fetchClients()`. Never hardcode IDs in agent logic.
- **Timezone:** use per-client `getYesterdayForClient(timezone)` with manual `YYYY-MM-DD` formatting. Never `.toISOString()` on local-time Date objects.
- **Meta API:** date preset is `last_7d` (not `last_7_days`), insights endpoint is `/insights`, `fbGet` has a 25s timeout.
- **Baked vs overlay ads:** `generate_full_ad` for dramatic display type (model renders text inside image); `generate_image` + `composite_ad` for clean, crisp overlays (CTAs, URLs). Ask Alan which before generating.

## Expanding morning briefing to all clients

In `scheduler/index.js`, replace the `activeClients` filter:

```js
const activeClients = Object.entries(CLIENTS)
  .filter(([, c]) => c.active)
  .map(([id, config]) => ({ id, config }));
```
