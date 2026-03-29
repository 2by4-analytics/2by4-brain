import Anthropic from '@anthropic-ai/sdk';
import { CLIENTS } from '../config/clients.js';
import { saveBriefing } from '../store/briefings.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.2by4llc.com';
const DASHBOARD_USER = process.env.ADMIN_USER || 'admin';
const DASHBOARD_PASS = process.env.ADMIN_PASS || '';

async function fetchDashboardData(clientId, date) {
  const url = `${DASHBOARD_URL}/api/dashboard/${clientId}?startDate=${date}&endDate=${date}`;
  const res = await fetch(url, {
    headers: {
  'x-dash-password': process.env.DASH_PASSWORD
}
  });
  if (!res.ok) throw new Error(`Dashboard fetch failed for ${clientId}: ${res.status}`);
  return res.json();
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

async function analyzeClient(clientId, clientConfig, data) {
  const prompt = `You are analyzing yesterday's Meta ad performance for ${clientConfig.name}.
CPP Target: $${clientConfig.cppTarget}
Daily Spend Budget: ~$${clientConfig.dailySpend || 'unknown'}

Raw performance data:
${JSON.stringify(data, null, 2)}

Produce a structured briefing with these exact sections:

## Summary
One sentence on overall account health.

## Key Numbers
- Total Spend: 
- Total Purchases:
- Blended CPP:
- vs Target:

## 🔴 Needs Attention
List any campaigns/adsets/ads that are significantly over CPP target or have issues. Be specific with names and numbers.

## 🟡 Watch
List anything approaching the CPP threshold or showing early warning signs.

## 🟢 Winning
List top performers. What's working?

## Recommended Actions
Numbered list of specific actions Alan should take today. Be direct and actionable.`;

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text;
}

export async function runMorningBriefing() {
  const date = getYesterday();
  console.log(`[Scheduler] Running morning briefing for ${date}`);

  // Phase 1: Plant client only. Later: all clients.
  const activeClients = [
    { id: 'eric-plant', config: CLIENTS['eric-plant'] }
    // Future: Object.entries(CLIENTS).filter(([,c]) => c.active).map(([id, config]) => ({ id, config }))
  ];

  const clientBriefings = [];

  for (const { id, config } of activeClients) {
    try {
      console.log(`[Scheduler] Fetching data for ${config.name}...`);
      const data = await fetchDashboardData(id, date);
      const analysis = await analyzeClient(id, config, data);
      clientBriefings.push({
        clientId: id,
        clientName: config.name,
        type: config.type,
        cppTarget: config.cppTarget,
        analysis,
        rawData: data,
        status: 'success'
      });
    } catch (err) {
      console.error(`[Scheduler] Failed for ${config.name}:`, err.message);
      clientBriefings.push({
        clientId: id,
        clientName: config.name,
        status: 'error',
        error: err.message
      });
    }
  }

  const briefing = await saveBriefing({
    reportDate: date,
    clients: clientBriefings,
    totalClients: clientBriefings.length,
    errors: clientBriefings.filter(c => c.status === 'error').length
  });

  console.log(`[Scheduler] Morning briefing complete. ${clientBriefings.length} clients processed.`);
  return briefing;
}
