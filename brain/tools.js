import { runCreativeGenerator } from '../agents/creative-gen.js';
import { runCreativeAnalyst } from '../agents/creative-analyst.js';
import { getLatestCreativeAnalysis } from '../store/creative-analyses.js';
import { runPerformanceAnalyst } from '../agents/performance-analyst.js';
import { getLatestPerformanceAnalysis } from '../store/performance-analyses.js';

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

    case 'get_creative_analysis': {
      const analysis = await getLatestCreativeAnalysis(input.clientId);
      if (!analysis) return { message: `No stored creative analysis found for ${input.clientId}. Use analyze_creatives to run a fresh analysis.` };
      return analysis;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
