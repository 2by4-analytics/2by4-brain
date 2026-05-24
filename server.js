import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { randomBytes } from 'crypto';
import cron from 'node-cron';
import { runMorningBriefing } from './scheduler/index.js';
import { initCreativeScheduler } from './scheduler/creative-scheduler.js';
import { initPerformanceScheduler } from './scheduler/performance-scheduler.js';
import { chatWithBrain } from './brain/dispatcher.js';
import { getLatestBriefing, getAllBriefings } from './store/briefings.js';
import { fetchClients, clearClientCache } from './config/clients.js';
import { summarizeMeeting } from './agents/meeting-recap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'dashboard')));

// Resolve storage paths once + log them at startup. When ADS_STORAGE_DIR (etc.)
// is unset the path falls back to ./data/ads which is EPHEMERAL on Railway —
// every redeploy wipes it and the URLs Brain returned to the model 404 for the
// user. Logging the resolved paths + env-set status here makes that diagnosable
// from the boot log alone instead of "why are old images broken" detective work.
const STORAGE = {
  ADS:     { path: path.resolve(process.env.ADS_STORAGE_DIR     || './data/ads'),     envSet: !!process.env.ADS_STORAGE_DIR },
  UPLOADS: { path: path.resolve(process.env.UPLOADS_STORAGE_DIR || './data/uploads'), envSet: !!process.env.UPLOADS_STORAGE_DIR },
  VIDEOS:  { path: path.resolve(process.env.VIDEOS_STORAGE_DIR  || './data/videos'),  envSet: !!process.env.VIDEOS_STORAGE_DIR },
  REPORTS: { path: path.resolve(process.env.REPORTS_STORAGE_DIR || './data/reports'), envSet: !!process.env.REPORTS_STORAGE_DIR }
};
for (const [name, s] of Object.entries(STORAGE)) {
  const flag = s.envSet ? '✓ env-set' : '⚠ DEFAULT (likely EPHEMERAL — wiped on redeploy)';
  console.log(`[storage] ${name}: ${s.path} [${flag}]`);
}
app.use('/ads',     express.static(STORAGE.ADS.path));
app.use('/uploads', express.static(STORAGE.UPLOADS.path));
app.use('/videos',  express.static(STORAGE.VIDEOS.path));
app.use('/reports', express.static(STORAGE.REPORTS.path));

// Startup probe — confirm each storage dir is mkdir-able + write+read+delete-able.
// "[storage] X: ... [✓ env-set]" only proves the env var exists; it doesn't prove
// the path is actually writable or that files persist. The probe catches both
// "dir is read-only" and "mkdir succeeds but writeFile silently does nothing".
(async () => {
  for (const [name, s] of Object.entries(STORAGE)) {
    try {
      await fs.mkdir(s.path, { recursive: true });
      const probe = path.join(s.path, '__startup_probe.txt');
      await fs.writeFile(probe, `boot:${Date.now()}`);
      const back = await fs.readFile(probe, 'utf8');
      await fs.unlink(probe);
      const entries = await fs.readdir(s.path);
      console.log(`[storage] ${name}: probe OK (read back "${back.slice(0, 20)}…"), ${entries.length} entries in dir`);
    } catch (err) {
      console.log(`[storage] ${name}: probe FAILED — ${err.message}`);
    }
  }
})();

// Auth middleware (matches existing claude-dash pattern)
const auth = (req, res, next) => next();

// Debug endpoint — list what's actually on disk in each storage dir.
// Use to diagnose "Brain returned a URL but it 404s" — confirms whether the
// file exists, when it was written, and that the server's view of disk matches
// the URL path being requested.
app.get('/api/debug/storage', auth, async (req, res) => {
  // Optional ?sub=client1/variants narrows the listing to a subpath inside ADS
  // (or pass ?root=UPLOADS&sub=... for other roots). Lets us see beyond the
  // top-level dirs without recursing the whole tree.
  const root = (req.query.root || 'ADS').toUpperCase();
  const sub = req.query.sub || '';
  if (sub) {
    if (sub.includes('..') || sub.startsWith('/')) return res.status(400).json({ error: 'sub must be relative without ..' });
    const base = STORAGE[root];
    if (!base) return res.status(400).json({ error: `unknown root: ${root}` });
    const target = path.join(base.path, sub);
    try {
      const stat = await fs.stat(target).catch(() => null);
      const entries = stat?.isDirectory() ? await fs.readdir(target, { withFileTypes: true }) : [];
      return res.json({
        root, sub, path: target, exists: !!stat,
        entries: entries.slice(0, 100).map(e => ({ name: e.name, dir: e.isDirectory() }))
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const out = {};
  for (const [name, s] of Object.entries(STORAGE)) {
    try {
      const stat = await fs.stat(s.path).catch(() => null);
      const entries = stat?.isDirectory() ? await fs.readdir(s.path, { withFileTypes: true }) : [];
      out[name] = {
        path: s.path,
        envSet: s.envSet,
        exists: !!stat,
        entries: entries.slice(0, 50).map(e => ({ name: e.name, dir: e.isDirectory() }))
      };
    } catch (err) {
      out[name] = { path: s.path, envSet: s.envSet, error: err.message };
    }
  }
  res.json(out);
});

// Service-to-service auth: dash → brain calls. Header `x-dash-password` must
// match DASH_PASSWORD env var. Used only by /api/agents/* (no UI fallback).
function serviceAuth(req, res, next) {
  const expected = process.env.DASH_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'DASH_PASSWORD not configured on Brain' });
  if (req.headers['x-dash-password'] !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Dashboard home
app.get('/', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// Image upload — accepts { data: "data:image/png;base64,..." }, returns { url }
app.post('/api/upload', auth, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'string') return res.status(400).json({ error: 'data field required' });
    const match = data.match(/^data:(image\/(png|jpe?g|gif|webp));base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'expected data URI with image/* mime type' });
    const ext = match[2].replace('jpeg', 'jpg');
    const buffer = Buffer.from(match[3], 'base64');
    const dir = path.resolve(process.env.UPLOADS_STORAGE_DIR || './data/uploads');
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(dir, filename), buffer);
    const base = (process.env.BRAIN_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
    res.json({ url: `${base}/uploads/${filename}`, bytes: buffer.length });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Chat endpoint — Brain dispatcher
app.post('/api/chat', auth, async (req, res) => {
  try {
    const { messages, clientContext } = req.body;
    const response = await chatWithBrain(messages, clientContext);
    res.json({ response });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Briefing endpoints
app.get('/api/briefing/latest', auth, async (req, res) => {
  try {
    const briefing = await getLatestBriefing();
    res.json(briefing || { empty: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/briefing/history', auth, async (req, res) => {
  try {
    const history = await getAllBriefings(30);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients-list', auth, async (req, res) => {
  try {
    clearClientCache();
    const clients = await fetchClients();
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Meeting recap — called by claude-dash launchpad upload flow.
// Body: { clientName, fileText?, fileBase64?, fileMimeType?, todayDate? }
// Returns: { recapMarkdown, openItems[] }
app.post('/api/agents/meeting-recap', serviceAuth, async (req, res) => {
  try {
    const out = await summarizeMeeting(req.body || {});
    res.json(out);
  } catch (err) {
    console.error('Meeting recap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger for morning briefing (for testing)
app.post('/api/briefing/run', auth, async (req, res) => {
  try {
    res.json({ status: 'running', message: 'Morning briefing started...' });
    await runMorningBriefing();
  } catch (err) {
    console.error('Briefing run error:', err);
  }
});

// 7am CT daily scheduler
cron.schedule('0 7 * * *', async () => {
  console.log('[Scheduler] Running morning briefing...');
  await runMorningBriefing();
}, { timezone: 'America/Chicago' });

initCreativeScheduler();
initPerformanceScheduler();

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`2by4 Brain running on port ${PORT}`);
});
