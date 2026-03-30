import cron from 'node-cron';
import { fetchClients, clearClientCache } from '../config/clients.js';
import { runCreativeAnalyst } from '../agents/creative-analyst.js';
import { saveCreativeAnalysis, getLatestCreativeAnalysis } from '../store/creative-analyses.js';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function analyzeAllClients() {
  console.log('[CreativeScheduler] Starting full analysis for all clients...');
  clearClientCache();
  const allClients = await fetchClients();
  const eligible = Object.entries(allClients).filter(([, c]) => c.metaAccountId);

  for (const [id, config] of eligible) {
    try {
      console.log(`[CreativeScheduler] Analyzing ${config.name}...`);
      const analysis = await runCreativeAnalyst({ clientId: id, days: 7 });
      await saveCreativeAnalysis(id, analysis);
    } catch (err) {
      console.error(`[CreativeScheduler] Analysis failed for ${config.name}:`, err.message);
    }
    await sleep(3000);
  }

  console.log(`[CreativeScheduler] Full analysis complete. ${eligible.length} clients processed.`);
}

async function dailyPauseCheck() {
  console.log('[CreativeScheduler] Running daily PAUSE check...');
  clearClientCache();
  const allClients = await fetchClients();
  const eligible = Object.entries(allClients).filter(([, c]) => c.metaAccountId);

  for (const [id, config] of eligible) {
    try {
      const latest = await getLatestCreativeAnalysis(id);
      if (!latest) continue;

      const pauseCount = latest.ads?.filter(a => a.flag === 'PAUSE').length ?? 0;
      if (pauseCount >= 2) {
        console.log(`[CreativeScheduler] ${config.name} has ${pauseCount} PAUSE ads — re-analyzing...`);
        const analysis = await runCreativeAnalyst({ clientId: id, days: 7 });
        await saveCreativeAnalysis(id, analysis);
        await sleep(3000);
      }
    } catch (err) {
      console.error(`[CreativeScheduler] PAUSE check failed for ${config.name}:`, err.message);
    }
  }

  console.log('[CreativeScheduler] Daily PAUSE check complete.');
}

export function initCreativeScheduler() {
  // Full analysis every Monday at 7am CT
  cron.schedule('0 7 * * 1', async () => {
    console.log('[CreativeScheduler] Weekly Monday analysis triggered.');
    await analyzeAllClients();
  }, { timezone: 'America/Chicago' });

  // Daily PAUSE check at 7:05am CT (5 min after morning briefing)
  cron.schedule('5 7 * * *', async () => {
    console.log('[CreativeScheduler] Daily PAUSE check triggered.');
    await dailyPauseCheck();
  }, { timezone: 'America/Chicago' });

  console.log('[CreativeScheduler] Scheduled: weekly full analysis (Mon 7am CT), daily PAUSE check (7:05am CT).');
}
