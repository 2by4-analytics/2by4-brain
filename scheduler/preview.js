// Local preview for the deterministic morning briefing.
// Hits live Dash for one client, builds the briefing, and writes a standalone
// HTML file that mirrors the dashboard's briefing styling.
//
// Usage:
//   DASH_PASSWORD=xxx node scheduler/preview.js <clientId> [date]
//   DASH_PASSWORD=xxx node scheduler/preview.js --all
//
// Output: ./briefing-preview.html (open in a browser)

import { writeFileSync } from 'fs';
import { fetchClients } from '../config/clients.js';
import { buildBriefing } from './index.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.2by4llc.com';

function getYesterdayForClient(timezone) {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  local.setDate(local.getDate() - 1);
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchDashboardData(clientId, date) {
  const url = `${DASHBOARD_URL}/api/dashboard/${clientId}?startDate=${date}&endDate=${date}`;
  const res = await fetch(url, {
    headers: { 'x-dash-password': process.env.DASH_PASSWORD }
  });
  if (!res.ok) throw new Error(`Dashboard fetch failed (${res.status}) for ${clientId}`);
  return res.json();
}

function renderPage(clients, reportDate) {
  const cards = clients.map(c => {
    if (c.status === 'error') {
      return `<div class="briefing-client">
        <div class="briefing-client-header">
          <span class="briefing-client-name">${c.clientName}</span>
          <span class="briefing-status-badge badge-error">ERROR</span>
        </div>
        <div class="briefing-content"><p style="color:var(--red)">${c.error}</p></div>
      </div>`;
    }
    const hasRed = c.analysis.includes('🔴') && !c.analysis.match(/🔴[^\n]*\n\s*None/i);
    const hasYellow = c.analysis.includes('🟡') && !c.analysis.match(/🟡[^\n]*\n\s*None/i);
    const badgeClass = hasRed ? 'badge-alert' : hasYellow ? 'badge-warn' : 'badge-ok';
    const badgeText = hasRed ? 'ATTENTION' : hasYellow ? 'WATCH' : 'ON TRACK';
    return `<div class="briefing-client">
      <div class="briefing-client-header">
        <span class="briefing-client-name">${c.clientName}</span>
        <span class="briefing-status-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="briefing-content" data-raw="${encodeURIComponent(c.analysis)}"></div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Briefing Preview — ${reportDate}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0a; --surface: #111; --surface2: #1a1a1a; --border: #222;
    --accent: #e8ff00; --accent-dim: rgba(232,255,0,0.12);
    --text: #f0f0f0; --text-dim: #666; --text-mid: #999;
    --red: #ff4444; --yellow: #ffaa00; --green: #00ff88;
    --red-dim: rgba(255,68,68,0.1); --yellow-dim: rgba(255,170,0,0.1); --green-dim: rgba(0,255,136,0.1);
    --mono: 'Space Mono', monospace; --sans: 'DM Sans', sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: var(--sans); padding: 32px; }
  .wrap { max-width: 900px; margin: 0 auto; }
  .page-header {
    font-family: var(--mono); font-size: 11px; color: var(--text-dim);
    letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 24px;
  }
  .briefing-client { margin-bottom: 24px; border: 1px solid var(--border); background: var(--surface); }
  .briefing-client-header {
    padding: 12px 16px; background: var(--surface2); border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .briefing-client-name {
    font-family: var(--mono); font-size: 12px; font-weight: 700;
    color: var(--accent); letter-spacing: 0.05em;
  }
  .briefing-status-badge { font-family: var(--mono); font-size: 10px; padding: 3px 8px; letter-spacing: 0.05em; }
  .badge-ok    { background: var(--green-dim);  color: var(--green); }
  .badge-warn  { background: var(--yellow-dim); color: var(--yellow); }
  .badge-alert { background: var(--red-dim);    color: var(--red); }
  .badge-error { background: rgba(100,100,100,0.1); color: var(--text-dim); }
  .briefing-content { padding: 16px; font-size: 13px; line-height: 1.7; color: var(--text); }
  .briefing-content h2 {
    font-family: var(--mono); font-size: 11px; color: var(--text-dim);
    letter-spacing: 0.1em; text-transform: uppercase;
    margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border);
  }
  .briefing-content h2:first-child { margin-top: 0; }
  .briefing-content ul { list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .briefing-content li::before { content: '— '; color: var(--text-dim); }
  .briefing-content p { margin-bottom: 8px; }
  .flag-red { color: var(--red); }
  .flag-yellow { color: var(--yellow); }
  .flag-green { color: var(--green); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="page-header">Briefing Preview · Report for ${reportDate}</div>
    ${cards}
  </div>
<script>
// Mirror of dashboard/index.html renderMarkdown — keep in sync.
function renderMarkdown(text) {
  return text
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\\d+)\\. (.+)$/gm, '<li><strong>$1.</strong> $2</li>')
    .replace(/🔴/g, '<span class="flag-red">🔴</span>')
    .replace(/🟡/g, '<span class="flag-yellow">🟡</span>')
    .replace(/🟢/g, '<span class="flag-green">🟢</span>')
    .replace(/\\n\\n/g, '</p><p>')
    .replace(/^(?!<[hlu]|<\\/[hlu]|<ta|<\\/ta)/gm, '')
    .replace(/<li>/g, '</p><li>')
    .replace(/<\\/li>(\\n<li>)/g, '</li><li>');
}
document.querySelectorAll('.briefing-content[data-raw]').forEach(el => {
  const raw = decodeURIComponent(el.getAttribute('data-raw'));
  el.innerHTML = renderMarkdown(raw);
});
</script>
</body>
</html>`;
}

async function main() {
  if (!process.env.DASH_PASSWORD) {
    console.error('Set DASH_PASSWORD in the environment before running this script.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const clientId = all ? null : args[0];
  const dateOverride = all ? args[1] : args[1];

  if (!all && !clientId) {
    console.error('Usage: node scheduler/preview.js <clientId> [YYYY-MM-DD]');
    console.error('       node scheduler/preview.js --all [YYYY-MM-DD]');
    process.exit(1);
  }

  const clients = await fetchClients();
  const targets = all
    ? Object.entries(clients)
    : clients[clientId]
      ? [[clientId, clients[clientId]]]
      : null;
  if (!targets) {
    console.error(`Unknown clientId: ${clientId}. Available: ${Object.keys(clients).join(', ')}`);
    process.exit(1);
  }

  const reportDate = dateOverride || getYesterdayForClient('America/Chicago');
  const debug = args.includes('--debug');
  const results = [];
  for (const [id, config] of targets) {
    const date = dateOverride || getYesterdayForClient(config.timezone);
    try {
      console.log(`Fetching ${config.name} (id=${id}, tz=${config.timezone}) for ${date}...`);
      const data = await fetchDashboardData(id, date);
      const acctCount = (data.adAccounts || []).length;
      const totalSpend = (data.adAccounts || []).reduce((s, a) => s + (a.fbSpend || 0), 0);
      const totalSales = (data.adAccounts || []).reduce((s, a) => s + (a.cocTotals?.sales || 0), 0);
      console.log(`  ↳ ${acctCount} ad account(s), fbSpend=$${totalSpend.toFixed(2)}, sales=${totalSales}`);
      if (debug || totalSpend === 0) {
        const fname = `briefing-preview-${id}-raw.json`;
        writeFileSync(fname, JSON.stringify(data, null, 2));
        console.log(`  ↳ raw response written to ${fname}`);
      }
      const analysis = buildBriefing(config, data);
      results.push({ clientName: config.name, status: 'success', analysis });
    } catch (err) {
      console.log(`  ↳ ERROR: ${err.message}`);
      results.push({ clientName: config.name, status: 'error', error: err.message });
    }
  }

  const html = renderPage(results, reportDate);
  const outPath = 'briefing-preview.html';
  writeFileSync(outPath, html);
  console.log(`\nWrote ${outPath} — open it in your browser.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
