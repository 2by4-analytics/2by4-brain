import { fetchClients } from '../config/clients.js';

const FB_BASE = 'https://graph.facebook.com/v19.0';

function token() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error('META_ACCESS_TOKEN environment variable not set');
  return t;
}

async function fbGet(path, params = {}) {
  const url = new URL(`${FB_BASE}/${path}`);
  url.searchParams.set('access_token', token());
  for (const [k, v] of Object.entries(params)) {
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

/**
 * Fetch all active ads for a client with 7-day performance metrics.
 * Returns: { clientId, clientName, cppTarget, days, ads: [...] }
 * Each ad: { ad_id, ad_name, headline, primary_text, thumbnail_url, spend, purchases, cpp, ctr, cpc }
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
  const datePreset = `last_${days}_days`;

  // Active ads with creative details
  const ads = await paginate(`${accountId}/ads`, {
    fields: 'id,name,creative{id,title,body,thumbnail_url,image_url}',
    status: JSON.stringify(['ACTIVE']),
    limit: 100,
  });

  // Ad-level insights for the date range
  const insightRows = await paginate(`${accountId}/insights`, {
    level: 'ad',
    fields: 'ad_id,spend,actions,ctr,cpc',
    date_preset: datePreset,
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
