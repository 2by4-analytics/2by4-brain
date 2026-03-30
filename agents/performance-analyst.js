import Anthropic from '@anthropic-ai/sdk';
import { getAdPerformance } from '../meta/index.js';
import { savePerformanceAnalysis } from '../store/performance-analyses.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYST_SYSTEM = `You are a senior Meta ads performance analyst specializing in direct-response sticker funnel campaigns.

## The Business Model
Sticker funnel: Meta ad → survey → opt-in (Lead event) → sticker checkout (~$3 decal) → continuity subscription ($14.95/mo).
- Front-end is intentionally sub-breakeven — CPP target is the ceiling, not the goal
- The real product is the continuity subscriber. Leads (opt-ins) are the lifeblood of the funnel
- Every lead that doesn't purchase is still a prospect in the email/SMS list
- "Partials" in internal reporting = Meta Lead pixel events = opt-ins

## Your Three Benchmarks
1. CPP — must be at or below the client's CPP target. This is the north star.
2. CPL (cost per Lead) — target range $1.00–$2.00. Under $1 is exceptional. Over $3 is a problem.
3. CTR — must be 3%+ to indicate strong creative-audience fit. Under 2% is a creative or audience issue.

## How the Metrics Connect
Low CTR → fewer clicks for same spend → higher CPC → higher CPL → higher CPP.
Diagnose top-down: CTR first, then CPL, then CPP. The root cause is almost always upstream.

## Lead-to-Purchase Rate
leads → purchases conversion should be tracked mentally. If CPL is good but CPP is bad, the funnel post-opt-in has a leak (checkout flow, offer, order bump). Flag this explicitly.

## Flagging Logic
Apply exactly one flag per ad:
- SCALE: CPP at or below target AND CTR 3%+ AND CPL under $2.50 — allocate more budget
- MONITOR: Any metric slightly off but not bad enough to pause — watch for 24–48h more data
- PAUSE: Any of: CPP >30% above target with $20+ spend | CPL >$3.00 with $10+ spend | CTR <1.5% with $15+ spend | spend with zero leads AND zero purchases
- INVESTIGATE: Spend with zero leads AND zero purchases (possible pixel misfire or audience exclusion issue — do not pause until confirmed)

## Status Labels
For each metric, assign:
- cpl_status: EXCELLENT (<$1) | ON_TARGET ($1–$2) | HIGH ($2–$3) | VERY_HIGH (>$3) | NO_LEADS (0 leads)
- ctr_status: STRONG (≥3%) | OK (2–3%) | LOW (1.5–2%) | VERY_LOW (<1.5%)
- cpp_status: BELOW_TARGET | ON_TARGET (within 10%) | ABOVE_TARGET (10–30% over) | WELL_ABOVE_TARGET (>30% over) | NO_PURCHASES | INSUFFICIENT_SPEND (<$10)

## Output Rules
- Be specific. Name the ad. Name the number. Name the action.
- Diagnosis should read like a smart analyst talking to an operator, not a report generator.
- Priority actions should be immediately executable — not vague.
- Always return valid JSON only. No markdown, no text outside the JSON object.`;

function buildAdSummaryBlock(ad, cppTarget) {
  const lines = [
    `Ad: ${ad.ad_name}`,
    `Campaign: ${ad.campaign_name} | Adset: ${ad.adset_name}`,
    `Spend: $${ad.spend.toFixed(2)} | Impressions: ${ad.impressions.toLocaleString()} | Clicks: ${ad.clicks}`,
    `CTR: ${ad.ctr.toFixed(2)}% | CPC: $${ad.cpc.toFixed(2)} | CPM: $${ad.cpm.toFixed(2)}`,
    `Leads: ${ad.leads} | CPL: ${ad.cpl != null ? '$' + ad.cpl.toFixed(2) : 'N/A'}`,
    `Purchases: ${ad.purchases} | CPP: ${ad.cpp != null ? '$' + ad.cpp.toFixed(2) : 'N/A'} | CPP Target: $${cppTarget}`,
  ];
  return lines.join('\n');
}

export async function runPerformanceAnalyst({ clientId, days = 1 }) {
  let performanceData;
  try {
    performanceData = await getAdPerformance(clientId, days);
  } catch (err) {
    console.error(`[PerformanceAnalyst] getAdPerformance failed for ${clientId}:`, err.message);
    throw err;
  }

  const { clientName, cppTarget, ads } = performanceData;

  if (!ads.length) {
    return {
      clientId,
      clientName,
      cppTarget,
      days,
      adsAnalyzed: 0,
      ads: [],
      account_summary: null,
      diagnosis: 'No ad data found for this period.',
      priority_actions: [],
      scale: [],
      pause: [],
    };
  }

  // Build account-level summary stats
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalLeads = ads.reduce((s, a) => s + a.leads, 0);
  const totalPurchases = ads.reduce((s, a) => s + a.purchases, 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const totalImpressions = ads.reduce((s, a) => s + a.impressions, 0);
  const blendedCPL = totalLeads > 0 ? totalSpend / totalLeads : null;
  const blendedCPP = totalPurchases > 0 ? totalSpend / totalPurchases : null;
  const blendedCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const leadToPurchaseRate = totalLeads > 0 ? ((totalPurchases / totalLeads) * 100).toFixed(1) + '%' : null;

  // Build the prompt content
  const promptLines = [
    `Analyzing ${ads.length} ads for ${clientName}.`,
    `CPP Target: $${cppTarget} | Period: last ${days} day(s)`,
    ``,
    `ACCOUNT TOTALS:`,
    `Spend: $${totalSpend.toFixed(2)} | Leads: ${totalLeads} | Purchases: ${totalPurchases}`,
    `Blended CPL: ${blendedCPL != null ? '$' + blendedCPL.toFixed(2) : 'N/A'} | Blended CPP: ${blendedCPP != null ? '$' + blendedCPP.toFixed(2) : 'N/A'} | Blended CTR: ${blendedCTR.toFixed(2)}%`,
    `Lead-to-Purchase Rate: ${leadToPurchaseRate || 'N/A'}`,
    ``,
    `AD-LEVEL BREAKDOWN:`,
    ``,
    ...ads.map(ad => buildAdSummaryBlock(ad, cppTarget)),
    ``,
    `Return a JSON object with exactly this structure:`,
    `{`,
    `  "ads": [`,
    `    {`,
    `      "ad_id": "...",`,
    `      "ad_name": "...",`,
    `      "campaign_name": "...",`,
    `      "adset_name": "...",`,
    `      "spend": <number>,`,
    `      "leads": <number>,`,
    `      "cpl": <number|null>,`,
    `      "purchases": <number>,`,
    `      "cpp": <number|null>,`,
    `      "ctr": <number>,`,
    `      "cpl_status": "EXCELLENT|ON_TARGET|HIGH|VERY_HIGH|NO_LEADS",`,
    `      "ctr_status": "STRONG|OK|LOW|VERY_LOW",`,
    `      "cpp_status": "BELOW_TARGET|ON_TARGET|ABOVE_TARGET|WELL_ABOVE_TARGET|NO_PURCHASES|INSUFFICIENT_SPEND",`,
    `      "flag": "SCALE|MONITOR|PAUSE|INVESTIGATE",`,
    `      "diagnosis": "<one specific sentence explaining the flag>"`,
    `    }`,
    `  ],`,
    `  "account_summary": {`,
    `    "total_spend": <number>,`,
    `    "total_leads": <number>,`,
    `    "blended_cpl": <number|null>,`,
    `    "total_purchases": <number>,`,
    `    "blended_cpp": <number|null>,`,
    `    "blended_ctr": <number>,`,
    `    "lead_to_purchase_rate": "<string|null>"`,
    `  },`,
    `  "diagnosis": "<2-3 sentence analytical breakdown of account health — specific, diagnostic, actionable>",`,
    `  "priority_actions": ["<action 1>", "<action 2>", "<action 3>"],`,
    `  "scale": ["<ad name>"],`,
    `  "pause": ["<ad name>"]`,
    `}`,
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 4096,
    system: ANALYST_SYSTEM,
    messages: [{ role: 'user', content: promptLines.join('\n') }],
  });

  const raw = response.content[0].text.trim();
  const jsonText = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    : raw;

  const analysis = JSON.parse(jsonText);

  const result = {
    clientId,
    clientName,
    cppTarget,
    days,
    adsAnalyzed: ads.length,
    ...analysis,
  };

  await savePerformanceAnalysis(clientId, result);

  return result;
}
