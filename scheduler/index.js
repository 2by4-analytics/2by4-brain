import Anthropic from '@anthropic-ai/sdk';
import { fetchClients, clearClientCache } from '../config/clients.js';
import { saveBriefing } from '../store/briefings.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.2by4llc.com';

async function fetchDashboardData(clientId, date) {
  const url = `${DASHBOARD_URL}/api/dashboard/${clientId}?startDate=${date}&endDate=${date}`;
  const res = await fetch(url, {
    headers: { 'x-dash-password': process.env.DASH_PASSWORD }
  });
  if (!res.ok) throw new Error(`Dashboard fetch failed for ${clientId}: ${res.status}`);
  return res.json();
}

function getYesterday() {
  const now = new Date();
  const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  ct.setDate(ct.getDate() - 1);
  return ct.toISOString().split('T')[0];
}

async function analyzeClient(clientId, clientConfig, data) {
  const prompt = `You are analyzing yesterday's Meta ad performance for ${clientConfig.name}.
CPP Target: $${clientConfig.cppTarget}
Daily Spend Budget: ~$${clientConfig.dailySpend || 'unknown'}

Raw performance data:
${JSON.stringify(data, null, 2)}

Produce a structured briefing with these exact sections. Use plain text only — no markdown tables, no pipe characters, no ### headers.

## Summary
One sentence on overall account health.

## Key Numbers
- Total Spend: $X
- Total Purchases: X
- Blended CPP: $X
- vs Target: $X (X% over/under)

## 🔴 Needs Attention
List campaigns/adsets/ads significantly over CPP target. Format each as:
NAME — $X spend / X purchases / $X CPP / X% over target

## 🟡 Watch
List anything approaching threshold. Same format.

## 🟢 Winning
List top performers. Same format.

## Recommended Actions
1. Specific action
2. Specific action`;

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content[0].text;
}

export async function runMorningBriefing(targetClientIds = null) {
  const date = getYesterday();
  console.log(`[Scheduler] Running morning briefing for ${date}`);

  clearClientCache();
  const allClients = await fetchClients();

  const activeClients = Object.entries(allClients)
    .filter(([id]) => targetClientIds ? targetClientIds.includes(id) : true)
    .map(([id, config]) => ({ id, config }));

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
    await new Promise(r => setTimeout(r, 2000));
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
