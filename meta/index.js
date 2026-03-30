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

async function fbGet(path, params = {}) {
  const url = new URL(`${FB_BASE}/${path}`);
  url.searchParams.set('access_token', token());
  for (const [k, v] of Object.entries(params)) {
    // Objects (e.g. time_range) must be JSON-encoded; primitives passed as-is
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(`Meta API (${data.error.code}): ${data.error.message}`);
  return data;
}

async function paginate(path, params = {}) {
  const all = [];
  let data = await fbGet(path, params);
  all.push(...(data.data || []));
  while (data.paging?.next) {
    const res = await fetch(data.paging.next);
    data = await res.json();
    if (data.error) break;
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
  // status must be passed as a plain string array value, not double-encoded
  const ads = await paginate(`${accountId}/ads`, {
    fields: 'id,name,creative{id,title,body,thumbnail_url,image_url}',
    effective_status: JSON.stringify(['ACTIVE']),
    limit: 100,
  });

  // ── Request 2: ad-level insights ─────────────────────────────────────────
  const insightRows = await paginate(`${accountId}/ads/insights`, {
    fields: 'ad_id,ad_name,spend,actions,cost_per_action_type,ctr,cpc',
    level: 'ad',
    ...insightDateParam,
    limit: 100,
  });

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
