# 2by4 Brain

AI operations system for 2by4 LLC. Morning briefings + interactive client management.

## Structure

```
2by4-brain/
├── server.js              # Express app + scheduler
├── brain/
│   └── dispatcher.js      # Claude API + system prompt
├── scheduler/
│   └── index.js           # Morning briefing runner (7am CT)
├── store/
│   └── briefings.js       # JSON briefing storage
├── config/
│   └── clients.js         # All client config (single source of truth)
├── agents/                # Sub-agents (to be built)
│   ├── cpa-monitor.js
│   ├── creative-gen.js
│   ├── campaign-analyst.js
│   ├── reporter.js
│   └── onboarding.js
├── data/
│   └── briefings/         # Auto-created, daily JSON files
└── dashboard/
    └── index.html         # The UI
```

## Environment Variables

```
ANTHROPIC_API_KEY=
DASHBOARD_URL=https://dash.2by4llc.com
ADMIN_USER=admin
ADMIN_PASS=
PORT=3001
```

## Deploy to Railway

1. Create new Railway project
2. Connect this GitHub repo
3. Set environment variables above
4. Deploy — auto-deploys on push to main

## Usage

- Open the dashboard in browser
- Morning briefing auto-runs at 7am CT and appears on load
- Use "RUN BRIEFING" button to trigger manually
- Select a client in the left panel to load context
- Chat with Brain in the right panel

## Adding Agents

Each agent goes in `/agents/`. They receive client config + data and return structured output.
The dispatcher in `brain/dispatcher.js` routes to them based on chat intent.

## Expanding to All Clients

In `scheduler/index.js`, replace the `activeClients` array with:
```js
const activeClients = Object.entries(CLIENTS)
  .filter(([, c]) => c.active)
  .map(([id, config]) => ({ id, config }));
```
