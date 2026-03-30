import cron from 'node-cron';
import { fetchClients, clearClientCache } from '../config/clients.js';
import { runPerformanceAnalyst } from '../agents/performance-analyst.js';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function analyzeAllStickerClients(days = 1) {
  console.log('[PerformanceScheduler] Starting daily performance analysis for sticker clients...');
  clearClientCache();
  const allClients = await fetchClients();

  const sticker = Object.entries(allClients).filter(
    ([, c]) => c.type === 'sticker' && c.metaAccountId
  );

  console.log(`[PerformanceScheduler] ${sticker.length} sticker clients with Meta accounts`);

  for (const [id, config] of sticker) {
    try {
      console.log(`[PerformanceScheduler] Analyzing ${config.name}...`);
      await runPerformanceAnalyst({ clientId: id, days });
    } catch (err) {
      console.error(`[PerformanceScheduler] Failed for ${config.name}:`, err.message);
    }
    await sleep(3000);
  }

  console.log('[PerformanceScheduler] Daily performance analysis complete.');
}

export function initPerformanceScheduler() {
  // Daily at 7:10am CT — after morning briefing (7:00) and creative PAUSE check (7:05)
  cron.schedule('10 7 * * *', async () => {
    console.log('[PerformanceScheduler] Daily performance analysis triggered.');
    await analyzeAllStickerClients(1);
  }, { timezone: 'America/Chicago' });

  console.log('[PerformanceScheduler] Scheduled: daily performance analysis (7:10am CT).');
}
