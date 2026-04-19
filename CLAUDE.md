# 2by4 Brain — CLAUDE.md

AI operations layer for 2by4 LLC. See the master OS context at the top-level `CLAUDE.md` for full client roster, metrics definitions, and infrastructure overview.

---

## What Brain Is

Brain is the intelligence layer of the 2by4 Agency OS. It owns:
- All AI agent logic (briefings, creative gen, performance analysis)
- The agentic chat interface for client management
- Ad image generation + composite pipeline (fal.ai + Sharp)
- Cross-repo code diagnosis (reads claude-dash source from GitHub)
- Fix handoff to Claude Code via GitHub Issues
- Vision on user-uploaded images (Claude Opus 4.7)
- All secrets and API keys (Anthropic, Meta via Dash, fal.ai, GitHub)
- Scheduled jobs (cron via `node-cron`)

Brain calls Dash for data. Brain never hits Meta or CoC directly.

---

## File Structure

```
2by4-brain/
├── server.js                      # Express app entry point + scheduler init
├── brain/
│   ├── dispatcher.js              # Claude API + agentic tool loop
│   └── tools.js                   # All tool definitions + executors (see Tools section below)
├── agents/
│   ├── creative-gen.js            # Generates 3 hooks, 3 primary texts, image prompt (text only)
│   ├── creative-analyst.js        # Scores ads SCALE/MONITOR/PAUSE; auto-triggers creative gen on PAUSE
│   ├── performance-analyst.js     # Daily performance analysis per sticker client
│   └── cpa-monitor.js             # CPA monitoring (in progress)
├── ads/
│   ├── brands.js                  # Per-client ad brand config (palette, font, vibe, base prompt hints)
│   ├── fal-client.js              # fal.ai HTTP wrapper — text-to-image + image-to-image via queue API
│   ├── compositor.js              # Sharp-based SVG text overlay for clean CTAs/URLs
│   └── fonts/                     # Bundled OFL TTFs (Oswald, Inter, Playfair Display)
├── meta/
│   └── index.js                   # Meta Ads API wrapper (25s AbortController timeout on fbGet)
├── scheduler/
│   ├── index.js                   # 7am CT morning briefing
│   ├── creative-scheduler.js      # Monday 7am full analysis + daily 7:05am PAUSE check
│   └── performance-scheduler.js   # Daily performance analysis runner
├── store/
│   ├── briefings.js               # JSON briefing store at /app/data/briefings/
│   ├── creative-analyses.js       # Creative analysis persistence
│   └── performance-analyses.js    # Performance analysis persistence
├── config/
│   └── clients.js                 # Dynamic client fetch from Dash API (with cache)
├── dashboard/
│   └── index.html                 # 3-column UI: client sidebar, Briefing/Ads tabs, Brain chat (paste/drop for image upload)
└── data/                          # Runtime storage (gitignored)
    ├── ads/<clientId>/*.png       # Composited ads, served at /ads/*
    └── uploads/*.png              # User-uploaded images, served at /uploads/*
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=        # Claude API key
DASHBOARD_URL=https://dash.2by4llc.com
DASH_PASSWORD=            # shared secret for dash API calls
GITHUB_TOKEN=             # fine-grained PAT — Issues:read-write on claude-dash + 2by4-brain
FAL_KEY=                  # fal.ai API key for image generation (format: <uuid>:<secret>)
BRAIN_PUBLIC_URL=         # e.g. https://brain.2by4llc.com — used when building public /ads and /uploads URLs
PORT=3001
```

---

## Key Patterns

**Client config:** Always fetch dynamically via `fetchClients()` from `config/clients.js`. Never hardcode client IDs in agent logic. Filter by `c.type === 'sticker'` for sticker-only agents.

**Tool loop discipline:** The dispatcher system prompt must prevent Claude from calling overlapping tools redundantly (e.g., `get_performance` + `run_performance_analysis` for the same request). This causes slow responses.

**Scheduling:** All cron jobs use CT (America/Chicago). Use `node-cron` with timezone option.

**Timezone date handling:** Use per-client `getYesterdayForClient(timezone)` with manual date string formatting (`YYYY-MM-DD`). Never call `.toISOString()` on a local-time Date object — causes UTC drift at day boundaries and wrong data.

**Meta API quirks:**
- Date preset: `last_7d` (not `last_7_days`)
- Insights endpoint: `/insights` (not `/ads/insights`)
- `fbGet` has a 25-second `AbortController` timeout in `meta/index.js`

**Agent output pattern:** Agents receive client config + data → return structured output → stored in `/store/` → surfaced via chat or briefing.

---

## Scheduler Summary

| Job | File | Time | Scope |
|---|---|---|---|
| Morning briefing | `scheduler/index.js` | 7:00am CT daily | All active clients (plants only — one line to uncomment to expand) |
| Full creative analysis | `scheduler/creative-scheduler.js` | 7:00am CT Monday | All sticker clients |
| PAUSE check | `scheduler/creative-scheduler.js` | 7:05am CT daily | All sticker clients |
| Performance analysis | `scheduler/performance-scheduler.js` | Daily | All sticker clients with Meta accounts |

---

## Ad Scoring Logic

Applied by creative analyst. Exactly one flag per ad:

- **SCALE** — CPP ≤ target AND CTR ≥ 3% AND CPL < $2.50 → allocate more budget
- **MONITOR** — not quite SCALE, not bad enough to PAUSE → watch
- **PAUSE** — CPP over target OR CTR < 2% → stop spend

When PAUSE ads are detected, creative analyst auto-triggers creative gen using winning patterns from SCALE ads as reference.

---

## Tools Catalog

Brain exposes these tools to Claude via the agentic loop in `brain/dispatcher.js`. All defined in `brain/tools.js`.

### Data / performance
- `get_performance(clientId, period)` — pull one client's performance for today / yesterday / last7 / last30
- `get_all_performance(period)` — pull all clients at once
- `get_briefing()` — retrieve the latest morning briefing
- `run_performance_analysis(clientId, days?)` — live ad-level analysis (CPP vs target, CPL, CTR) with SCALE/MONITOR/PAUSE flags per ad
- `get_performance_analysis(clientId)` — last stored performance analysis
- `analyze_creatives(clientId, days?)` — live creative analysis pipeline
- `get_creative_analysis(clientId)` — last stored creative analysis
- `run_creative_generator(clientId, brief)` — generate 3 hooks / 3 primary texts / 1 image prompt (text only — no image gen)

### Ad image generation
- `list_ad_brands()` — show which clients have brand profiles configured + available models (nano-banana-2, flux-dev, flux-pro)
- `refine_image_prompt(clientId, rough_idea)` — blend Alan's rough idea with the client's brand vibe into a polished image prompt
- `generate_image(clientId, prompt, model?, aspect_ratio?, count?)` — 3 image variants via fal.ai (image only, no text) — use when text will be overlaid cleanly
- `generate_full_ad(clientId, scene, copy, model?, count?)` — 3 variants where headline/subtext are BAKED into the image by the model — use for dramatic display typography (chipped paint, grunge, mixed fonts)
- `generate_variation(clientId, sourceImageUrl, instruction, model?, count?)` — image-to-image refinement of an existing image (defaults to count=1 for a single refined version)
- `composite_ad(clientId, sourceImageUrl, overlays[], position?, overlayColor?)` — SVG overlay of crisp text on a generated image — use for clean CTAs, URLs, disclaimers

### Code diagnosis / handoff
- `list_dash_files(path?)` — browse claude-dash repo
- `read_dash_file(path)` — fetch a file from claude-dash
- `create_fix_request({ repo, title, problem, suggested_fix?, priority? })` — file a GitHub issue to hand off a fix to Claude Code

---

## Ad Generation — Baked Text vs Clean Overlay

Two fundamentally different paths, and Brain should ask which one before generating.

**Baked (`generate_full_ad`)**: the model renders the ad text as part of the image. Works for dramatic display type — chipped paint, hand-painted, grunge, mixed fonts per word. The text feels integrated with the scene. Best model: `nano-banana-2`. Inconsistent with vague instructions; be specific about hex colors and per-word treatments.

**Overlay (`generate_image` → `composite_ad`)**: generate the image without text, then compose SVG text on top. Pixel-crisp, consistent typography, legible. Best for CTAs, URLs, legal disclaimers — anything that must be readable, not expressive. Uses bundled Oswald / Inter / Playfair Display fonts.

**Image-to-image variations (`generate_variation`)**: paste a winning image (drag-drop or paste into the chat input), ask for changes ("same composition but daytime"). Default `count=1` for refinement on an already-picked version; pass `count=3` for exploration.

**Vision:** when a user message contains image URLs (uploaded or pasted), the dispatcher auto-converts them into Claude vision content blocks via `expandImagesInMessages()`. Brain can actually see the image and craft better variation prompts.

**Storage:**
- Uploads → `data/uploads/<hash>.<ext>` → served at `/uploads/*`
- Composited ads → `data/ads/<clientId>/<timestamp>.png` → served at `/ads/*`
- Fal-generated variants → hosted on fal.media CDN (30-day retention, no local copy)

All paths configurable via `ADS_STORAGE_DIR` / `UPLOADS_STORAGE_DIR` env vars.

---

## Code Diagnosis & Fix Handoff

Brain can read the `claude-dash` source from GitHub and file fix requests back to either repo.

**Read tools** (public repo, no auth needed):
- `list_dash_files(path?)` — list a directory in `2by4-analytics/claude-dash@main`
- `read_dash_file(path)` — fetch a file via raw.githubusercontent.com (truncated at 80KB)

**Handoff tool** (requires `GITHUB_TOKEN`):
- `create_fix_request({ repo, title, problem, suggested_fix?, priority? })` — opens an issue in `claude-dash` (default) or `2by4-brain`, labeled `brain-filed` + `priority:<level>`, returns the issue URL.

**Workflow:** Alan reports a bug or requests a change → Brain investigates with read tools → confirms with Alan → files issue → Alan opens Claude Code in the target repo and works the issue. Brain never edits code directly.

---

## Deploy

Railway — auto-deploys on push to `main`. No build step needed (Node.js ESM).

To deploy changes: commit + push to main, Railway picks it up in ~60 seconds.

```bash
git add -A && git commit -m "your message" && git push
```

---

## Development

Claude Code is installed at `~/2by4-brain`. Terminal alias: `brain` = `cd ~/2by4-brain && claude`.

When making changes via Claude Code: edit files → test locally if possible → push to deploy.
