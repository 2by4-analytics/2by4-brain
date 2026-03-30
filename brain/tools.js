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
          description: 'The client ID from the dashboard (e.g. client1, eric-faith-mncg09ih)'
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
