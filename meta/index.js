import { fetchClients } from '../config/clients.js';

const FB_BASE = 'https://graph.facebook.com/v19.0';

// Valid Meta date presets for the days values we support
const DATE_PRESETS = {
  7:  'last_7d',
  14: 'last_14d',
  30: 'last_30d',
};

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('META_ACCESS_TOKEN environment variable not set');
  return t;
}

function redactToken(urlStr) {
  return urlStr.replace(/access_token=[^&]+/, 'access_token=REDACTED');
}

async function fbGet(path, params = {}) {
  const url = new URL(`${FB_BASE}/${path}`);
  url.searchParams.set('access_token', token());
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const redactedUrl = redactToken(url.toString());
  console.log(`[Meta] GET ${redactedUrl}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  let res;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error(`Meta API timed out after 25s — URL: ${redactedUrl}`);
    throw err;
  }
  clearTimeout(timeout);

  const data = await res.json();
  if (data.error) {
    const e = data.error;
    console.error('[Meta] API error:', {
      url: redactedUrl,
      code: e.code,
      error_subcode: e.error_subcode ?? null,
      type: e.type ?? null,
      message: e.message,
      fbtrace_id: e.fbtrace_id ?? null,
    });
    const detail = [
      `code=${e.code}`,
      e.error_subcode != null ? `subcode=${e.error_subcode}` : null,
      e.type ? `type=${e.type}` : null,
      `message="${e.message}"`,
      e.fbtrace_id ? `fbtrace_id=${e.fbtrace_id}` : null,
    ].filter(Boolean).join(' | ');
    throw new Error(`Meta API error — ${detail} — URL: ${redactedUrl}`);
  }
  return data;
}

async function paginate(path, params = {}) {
  const all = [];
  let data = await fbGet(path, params);
  all.push(...(data.data || []));

  let page = 1;
  while (data.paging?.next) {
    page++;
    const res = await fetch(data.paging.next);
    data = await res.json();

    if (data.error) {
      const e = data.error;
      const redactedNext = redactToken(data.paging?.next ?? 'unknown');
      console.error(`[Meta] Pagination error on page ${page}:`, {
        url: redactedNext,
        code: e.code,
        error_subcode: e.error_subcode ?? null,
        type: e.type ?? null,
        message: e.message,
        fbtrace_id: e.fbtrace_id ?? null,
      });
      const detail = [
        `code=${e.code}`,
        e.error_subcode != null ? `subcode=${e.error_subcode}` : null,
        `message="${e.message}"`,
      ].filter(Boolean).join(' | ');
      throw new Error(`Meta API pagination error (page ${page}) — ${detail}`);
    }

    all.push(...(data.data || []));
  }

  return all;
}

function extractPurchases(actions = []) {
  const match = actions.find(a =>
    a.action_type === 'offsite_conversion.fb_pixel_purchase' ||
    a.action_type === 'purchase'
  );
  return match ? parseInt(match.value) : 0;
}

function extractLeads(actions = []) {
  const match = actions.find(a => a.action_type === 'lead');
  return match ? parseInt(match.value) : 0;
}

function extractCPL(costPerAction = []) {
  const match = costPerAction.find(a => a.action_type === 'lead');
  return match ? parseFloat(match.value) : null;
}

function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Fetch all active ads for a client with performance metrics.
 *
 * Two separate requests (Meta requirement):
 *   1. /{accountId}/ads           — creative fields (name, headline, body, thumbnail)
 *   2. /{accountId}/ads/insights  — metrics at ad level (spend, purchases, ctr, cpc)
 *
 * Returns: { clientId, clientName, cppTarget, days, ads: [...] }
 * Each ad: { ad_id, ad_name, headline, primary_text, thumbnail_url,
 *            spend, purchases, cpp, ctr, cpc }
 */
export async function getAdCreatives(clientId, days = 7) {
  const clients = await fetchClients();
  const client = clients[clientId];

  if (!client) throw new Error(`Unknown client: ${clientId}`);
  if (!client.metaAccountId) {
    throw new Error(
      `No Meta ad account ID configured for ${client.name}. ` +
      `Ensure the client's fbAdAccountId is set in the dashboard config.`
    );
  }

  const accountId = client.metaAccountId;
  console.log(`[Meta] getAdCreatives — client=${clientId} account=${accountId} days=${days}`);

  // Use a known valid date_preset if days matches, otherwise build an explicit time_range
  const datePreset = DATE_PRESETS[days];
  const insightDateParam = datePreset
    ? { date_preset: datePreset }
    : (() => {
        const until = new Date();
        const since = new Date();
        since.setDate(until.getDate() - days);
        return { time_range: { since: toDateStr(since), until: toDateStr(until) } };
      })();

  // ── Request 1: active ads with creative details ───────────────────────────
  const ads = await paginate(`${accountId}/ads`, {
    fields: 'id,name,creative{id,title,body,thumbnail_url,image_url}',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: 100,
  });
  console.log(`[Meta] Fetched ${ads.length} active ads for ${clientId}`);

  // ── Request 2: ad-level insights ─────────────────────────────────────────
  const insightRows = await paginate(`${accountId}/insights`, {
    fields: 'ad_id,ad_name,spend,actions,cost_per_action_type,ctr,cpc',
    level: 'ad',
    ...insightDateParam,
    limit: 100,
  });
  console.log(`[Meta] Fetched ${insightRows.length} insight rows for ${clientId}`);

  // Build lookup by ad_id
  const byAdId = {};
  for (const row of insightRows) {
    const spend = parseFloat(row.spend || 0);
    const purchases = extractPurchases(row.actions);
    byAdId[row.ad_id] = {
      spend,
      purchases,
      cpp: purchases > 0 ? spend / purchases : null,
      ctr: parseFloat(row.ctr || 0),
      cpc: parseFloat(row.cpc || 0),
    };
  }

  const merged = ads.map(ad => {
    const creative = ad.creative || {};
    const metrics = byAdId[ad.id] || { spend: 0, purchases: 0, cpp: null, ctr: 0, cpc: 0 };
    return {
      ad_id: ad.id,
      ad_name: ad.name,
      headline: creative.title || null,
      primary_text: creative.body || null,
      thumbnail_url: creative.thumbnail_url || creative.image_url || null,
      ...metrics,
    };
  });

  return {
    clientId,
    clientName: client.name,
    cppTarget: client.cppTarget,
    days,
    ads: merged,
  };
}

/**
 * Fetch ad-level performance metrics for analysis.
 * Pulls spend, leads (Lead pixel event), purchases, CTR, CPC, CPM, CPL, CPP
 * at the individual ad level with campaign and adset context.
 *
 * Returns: { clientId, clientName, cppTarget, days, ads: [...] }
 */
export async function getAdPerformance(clientId, days = 1) {
  const clients = await fetchClients();
  const client = clients[clientId];

  if (!client) throw new Error(`Unknown client: ${clientId}`);
  if (!client.metaAccountId) {
    throw new Error(`No Meta ad account configured for ${client.name}.`);
  }

  const accountId = client.metaAccountId;
  console.log(`[Meta] getAdPerformance — client=${clientId} account=${accountId} days=${days}`);

  const datePreset = DATE_PRESETS[days];
  const insightDateParam = datePreset
    ? { date_preset: datePreset }
    : (() => {
        const until = new Date();
        const since = new Date();
        since.setDate(until.getDate() - days);
        return { time_range: { since: toDateStr(since), until: toDateStr(until) } };
      })();

  const rows = await paginate(`${accountId}/insights`, {
    fields: 'ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type',
    level: 'ad',
    ...insightDateParam,
    limit: 100,
  });
  console.log(`[Meta] Fetched ${rows.length} ad performance rows for ${clientId}`);

  const ads = rows.map(row => {
    const spend = parseFloat(row.spend || 0);
    const leads = extractLeads(row.actions);
    const purchases = extractPurchases(row.actions);
    const cpl = extractCPL(row.cost_per_action_type);
    const cpp = purchases > 0 ? spend / purchases : null;

    return {
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      spend,
      impressions: parseInt(row.impressions || 0),
      clicks: parseInt(row.clicks || 0),
      ctr: parseFloat(row.ctr || 0),
      cpc: parseFloat(row.cpc || 0),
      cpm: parseFloat(row.cpm || 0),
      leads,
      cpl,
      purchases,
      cpp,
    };
  });

  return {
    clientId,
    clientName: client.name,
    cppTarget: client.cppTarget,
    days,
    ads,
  };
}
