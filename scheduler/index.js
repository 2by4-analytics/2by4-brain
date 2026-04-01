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

function getYesterdayForClient(timezone) {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  local.setDate(local.getDate() - 1);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function analyzeClient(clientId, clientConfig, data) {
  const adAccounts = data.adAccounts || [];
  const totalSales = adAccounts.reduce((s, a) => s + (a.cocTotals?.sales || 0), 0);
  const totalSpend = adAccounts.reduce((s, a) => s + (a.fbSpend || 0), 0);
  const blendedCPP = totalSales > 0 ? (totalSpend / totalSales).toFixed(2) : 'N/A';

  const prompt = `You are analyzing yesterday's Meta ad performance for ${clientConfig.name}.
CPP Target: $${clientConfig.cppTarget}
Daily Spend Budget: ~$${clientConfig.dailySpend || 'unknown'}

Top-line numbers (use these, do not re-sum from hierarchy):
- Total Purchases: ${totalSales}
- Total Spend: $${totalSpend.toFixed(2)}
- Blended CPP: ${blendedCPP !== 'N/A' ? '$' + blendedCPP : 'N/A'}

Full hierarchy data (use for campaign/adset/ad breakdown only):
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
  console.log(`[Scheduler] Running morning briefing`);

  clearClientCache();
  const allClients = await fetchClients();

  const activeClients = Object.entries(allClients)
    .filter(([id]) => targetClientIds ? targetClientIds.includes(id) : true)
    .map(([id, config]) => ({ id, config }));

  const clientBriefings = [];
  // Use Chicago as the reference date for the briefing filename
  const reportDate = getYesterdayForClient('America/Chicago');

  for (const { id, config } of activeClients) {
    const date = getYesterdayForClient(config.timezone);
    try {
      console.log(`[Scheduler] Fetching data for ${config.name} (date: ${date} in ${config.timezone})...`);
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
    reportDate,
    clients: clientBriefings,
    totalClients: clientBriefings.length,
    errors: clientBriefings.filter(c => c.status === 'error').length
  });

  console.log(`[Scheduler] Morning briefing complete. ${clientBriefings.length} clients processed.`);
  return briefing;
}
