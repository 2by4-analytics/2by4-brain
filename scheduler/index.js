import { fetchClients, clearClientCache } from '../config/clients.js';
import { saveBriefing } from '../store/briefings.js';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.2by4llc.com';

// Status light thresholds
const YELLOW_PCT_MAX = 175;              // > 175% of target → red, 101–175% → yellow
const RED_MIN_SPEND_NO_PURCH = 25;       // $25+ spend with zero purchases → red
const WINNING_MIN_SPEND = 30;            // green ad sets need $30+ spend to count as "Winning"

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

function classify(spend, purchases, cppTarget) {
  const cpp = purchases > 0 ? spend / purchases : null;
  const pct = cpp != null ? (cpp / cppTarget) * 100 : null;
  if (purchases === 0) {
    if (spend >= RED_MIN_SPEND_NO_PURCH) return { light: 'red', cpp, pct };
    return { light: null, cpp, pct };
  }
  if (pct > YELLOW_PCT_MAX) return { light: 'red', cpp, pct };
  if (pct > 100) return { light: 'yellow', cpp, pct };
  return { light: 'green', cpp, pct };
}

const EMOJI = { red: '🔴', yellow: '🟡', green: '🟢' };
const lightEmoji = (l) => EMOJI[l] || '⚪';

const fmtMoney = (n) => '$' + n.toFixed(2);
const fmtCPP = (cpp) => cpp == null ? '—' : '$' + cpp.toFixed(2);
const fmtPct = (pct) => pct == null ? '—' : Math.round(pct) + '%';

function metricsTail(spend, purchases, cpp, pct) {
  return `${fmtMoney(spend)} spend · ${purchases} purch · ${fmtCPP(cpp)} CPP · ${fmtPct(pct)} of target`;
}

function buildHierarchy(data, cppTarget) {
  const campaigns = [];
  for (const acct of (data.adAccounts || [])) {
    for (const c of (acct.campaigns || [])) {
      const cSpend = c.fbSpend || 0;
      const cSales = c.cocData?.sales || 0;
      const cCls = classify(cSpend, cSales, cppTarget);

      const adsets = [];
      for (const s of (c.adsets || [])) {
        const sSpend = s.fbSpend || 0;
        const sSales = s.cocData?.sales || 0;
        const sCls = classify(sSpend, sSales, cppTarget);

        const ads = (s.ads || []).map(a => {
          const aSpend = a.fbSpend || 0;
          const aSales = a.cocData?.sales || 0;
          const aCls = classify(aSpend, aSales, cppTarget);
          return { name: a.name, spend: aSpend, purchases: aSales, ...aCls };
        }).sort((a, b) => b.spend - a.spend);

        adsets.push({
          name: s.name,
          campaignName: c.name,
          spend: sSpend,
          purchases: sSales,
          ...sCls,
          ads,
        });
      }
      adsets.sort((a, b) => b.spend - a.spend);

      campaigns.push({
        name: c.name,
        spend: cSpend,
        purchases: cSales,
        ...cCls,
        adsets,
      });
    }
  }
  campaigns.sort((a, b) => b.spend - a.spend);
  return campaigns;
}

function renderAdsetBlock(s) {
  const head = `**${lightEmoji(s.light)} ${s.campaignName} › ${s.name}** — ${metricsTail(s.spend, s.purchases, s.cpp, s.pct)}`;
  const adLines = s.ads
    .filter(a => a.spend > 0)
    .map(a => `- ${lightEmoji(a.light)} ${a.name} — ${metricsTail(a.spend, a.purchases, a.cpp, a.pct)}`);
  return adLines.length ? [head, ...adLines].join('\n') : head;
}

function renderBucket(emoji, title, items) {
  if (!items.length) return `## ${emoji} ${title}\n\nNone.`;
  return `## ${emoji} ${title}\n\n${items.map(renderAdsetBlock).join('\n\n')}`;
}

export function buildBriefing(clientConfig, data) {
  const cppTarget = clientConfig.cppTarget;
  const accounts = data.adAccounts || [];
  const totalSpend = accounts.reduce((s, a) => s + (a.fbSpend || 0), 0);
  const totalPurchases = accounts.reduce((s, a) => s + (a.cocTotals?.sales || 0), 0);
  const blendedCpp = totalPurchases > 0 ? totalSpend / totalPurchases : null;
  const blendedPct = blendedCpp != null ? (blendedCpp / cppTarget) * 100 : null;

  const campaigns = buildHierarchy(data, cppTarget).filter(c => c.spend > 0);
  const allAdsets = campaigns.flatMap(c => c.adsets).filter(s => s.spend > 0);

  const needsAttn = allAdsets.filter(s => s.light === 'red');
  const watch = allAdsets.filter(s => s.light === 'yellow');
  const winning = allAdsets.filter(s => s.light === 'green' && s.spend >= WINNING_MIN_SPEND);

  const vsTargetLine = blendedCpp != null
    ? `${fmtMoney(blendedCpp - cppTarget)} ${blendedCpp >= cppTarget ? 'over' : 'under'} ($${cppTarget} target, ${Math.round(blendedPct)}% of target)`
    : `$${cppTarget} target (no purchases)`;

  const summary = blendedCpp != null
    ? `Yesterday: ${campaigns.length} active campaign(s), ${fmtMoney(totalSpend)} spend, ${totalPurchases} purchase(s). Blended CPP ${fmtCPP(blendedCpp)} vs $${cppTarget} target (${Math.round(blendedPct)}% of target).`
    : `Yesterday: ${campaigns.length} active campaign(s), ${fmtMoney(totalSpend)} spend, 0 purchases.`;

  const campaignLines = campaigns.length
    ? campaigns.map(c => `- ${lightEmoji(c.light)} **${c.name}** — ${metricsTail(c.spend, c.purchases, c.cpp, c.pct)}`).join('\n')
    : 'No active campaigns.';

  return [
    `## Summary\n${summary}`,
    `## Key Numbers\n- Total Spend: ${fmtMoney(totalSpend)}\n- Total Purchases: ${totalPurchases}\n- Blended CPP: ${fmtCPP(blendedCpp)}\n- vs Target: ${vsTargetLine}`,
    `## Campaign Summary\n${campaignLines}`,
    renderBucket('🔴', 'Needs Attention', needsAttn),
    renderBucket('🟡', 'Watch', watch),
    renderBucket('🟢', `Winning (spend ≥ $${WINNING_MIN_SPEND})`, winning),
  ].join('\n\n');
}

export async function runMorningBriefing(targetClientIds = null) {
  console.log(`[Scheduler] Running morning briefing`);

  clearClientCache();
  const allClients = await fetchClients();

  const activeClients = Object.entries(allClients)
    .filter(([id]) => targetClientIds ? targetClientIds.includes(id) : true)
    .map(([id, config]) => ({ id, config }));

  const clientBriefings = [];
  const reportDate = getYesterdayForClient('America/Chicago');

  for (const { id, config } of activeClients) {
    const date = getYesterdayForClient(config.timezone);
    try {
      console.log(`[Scheduler] Fetching data for ${config.name} (date: ${date} in ${config.timezone})...`);
      const data = await fetchDashboardData(id, date);
      const analysis = buildBriefing(config, data);
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
    await new Promise(r => setTimeout(r, 250));
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
