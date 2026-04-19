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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'dashboard')));
app.use('/ads', express.static(path.resolve(process.env.ADS_STORAGE_DIR || './data/ads')));
app.use('/uploads', express.static(path.resolve(process.env.UPLOADS_STORAGE_DIR || './data/uploads')));

// Auth middleware (matches existing claude-dash pattern)
const auth = (req, res, next) => next();

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
