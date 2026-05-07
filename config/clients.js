let cachedClients = null;

// Dash's `CLIENTS` env var holds sticker-funnel clients only — shed clients
// live in the separate 2by4-sheds service. So every client we get from
// /api/clients is a sticker. If shed clients ever land in dash, expose a
// `type` field on /api/clients and read it here instead of hardcoding.
function normalizeClients(rawClients) {
  const clients = {};
  for (const c of rawClients) {
    clients[c.id] = {
      name: c.name,
      type: 'sticker',
      timezone: c.timezone || 'America/Chicago',
      cppTarget: c.adAccounts?.[0]?.cppTarget || 18,
      metaAccountId: c.adAccounts?.[0]?.fbAdAccountId || null, // e.g. "act_123456789"
      platform: ['meta'],
      adAccounts: c.adAccounts || [],
      active: true
    };
  }
  return clients;
}

export async function fetchClients() {
  if (cachedClients) return cachedClients;
  const res = await fetch(`${process.env.DASHBOARD_URL}/api/clients`, {
    headers: { 'x-dash-password': process.env.DASH_PASSWORD }
  });
  if (!res.ok) throw new Error(`Failed to fetch clients: ${res.status}`);
  const data = await res.json();
  cachedClients = normalizeClients(data.clients || data);
  console.log(`[Clients] Loaded ${Object.keys(cachedClients).length} clients`);
  return cachedClients;
}

export function clearClientCache() {
  cachedClients = null;
}

export function getClientTypes(clients) {
  return {
    sticker: Object.entries(clients).filter(([, c]) => c.type === 'sticker').map(([id, c]) => ({ id, ...c })),
    shed: Object.entries(clients).filter(([, c]) => c.type === 'shed').map(([id, c]) => ({ id, ...c }))
  };
}
