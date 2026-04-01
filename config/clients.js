let cachedClients = null;

const SHED_IDS = ['craig-revmoto-mmjeuw8s', 'craig-readynation-mmkodtu2'];

function normalizeClients(rawClients) {
  const clients = {};
  for (const c of rawClients) {
    const isShed = SHED_IDS.includes(c.id);
    clients[c.id] = {
      name: c.name,
      type: isShed ? 'shed' : 'sticker',
      timezone: c.timezone || 'America/Chicago',
      cppTarget: c.adAccounts?.[0]?.cppTarget || 18,
      metaAccountId: c.adAccounts?.[0]?.fbAdAccountId || null, // e.g. "act_123456789"
      platform: isShed ? ['meta', 'google'] : ['meta'],
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
