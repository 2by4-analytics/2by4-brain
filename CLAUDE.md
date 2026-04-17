# 2by4 Brain — CLAUDE.md

AI operations layer for 2by4 LLC. See the master OS context at the top-level `CLAUDE.md` for full client roster, metrics definitions, and infrastructure overview.

---

## What Brain Is

Brain is the intelligence layer of the 2by4 Agency OS. It owns:
- All AI agent logic (briefings, creative gen, performance analysis)
- The agentic chat interface for client management
- All secrets and API keys (Anthropic, Meta via Dash)
- Scheduled jobs (cron via `node-cron`)

Brain calls Dash for data. Brain never hits Meta or CoC directly.

---

## File Structure

```
2by4-brain/
├── server.js                      # Express app entry point + scheduler init
├── brain/
│   ├── dispatcher.js              # Claude API + agentic tool loop
│   └── tools.js                   # Tool definitions: get_performance, get_all_performance, get_briefing, run_creative_generator, get_creative_analysis
├── agents/
│   ├── creative-gen.js            # Generates 3 hooks, 3 primary texts, image prompt
│   ├── creative-analyst.js        # Scores ads SCALE/MONITOR/PAUSE; auto-triggers creative gen on PAUSE
│   ├── performance-analyst.js     # Daily performance analysis per sticker client
│   └── cpa-monitor.js             # CPA monitoring (in progress)
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
└── dashboard/
    └── index.html                 # 3-column UI: client sidebar, morning briefing, Brain chat
```

---

## Environment Variables

```
ANTHROPIC_API_KEY=
DASHBOARD_URL=https://dash.2by4llc.com
DASH_PASSWORD=
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
