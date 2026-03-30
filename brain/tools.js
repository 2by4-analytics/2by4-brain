import { runCreativeGenerator } from '../agents/creative-gen.js';
import { runCreativeAnalyst } from '../agents/creative-analyst.js';
import { getLatestCreativeAnalysis } from '../store/creative-analyses.js';
import { runPerformanceAnalyst } from '../agents/performance-analyst.js';
import { getLatestPerformanceAnalysis } from '../store/performance-analyses.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.2by4llc.com';

async function dashFetch(path) {
  const res = await fetch(`${DASHBOARD_URL}${path}`, {
    headers: { 'x-dash-password': process.env.DASH_PASSWORD }
  });
  if (!res.ok) throw new Error(`Dashboard error: ${res.status}`);
  return res.json();
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

    case 'get_creative_analysis': {
      const analysis = await getLatestCreativeAnalysis(input.clientId);
      if (!analysis) return { message: `No stored creative analysis found for ${input.clientId}. Use analyze_creatives to run a fresh analysis.` };
      return analysis;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
