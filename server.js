import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import cron from 'node-cron';
import { runMorningBriefing } from './scheduler/index.js';
import { chatWithBrain } from './brain/dispatcher.js';
import { getLatestBriefing, getAllBriefings } from './store/briefings.js';
import { fetchClients, clearClientCache } from './config/clients.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// Auth middleware (matches existing claude-dash pattern)
const auth = (req, res, next) => next();

// Dashboard home
app.get('/', auth, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
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

// CPP daily snapshot — all sticker clients, yesterday in their ad account timezone
app.get('/api/cpp-daily', auth, async (req, res) => {
  try {
    const clients = await fetchClients();
    const sticker = Object.entries(clients).filter(([, c]) => c.type === 'sticker');

    const results = await Promise.allSettled(sticker.map(async ([id, c]) => {
      const tz = c.adAccounts?.[0]?.timezone || 'America/Chicago';
      const tzDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
      tzDate.setDate(tzDate.getDate() - 1);
      const date = tzDate.toISOString().split('T')[0];

      const url = `${process.env.DASHBOARD_URL}/api/dashboard/${id}?startDate=${date}&endDate=${date}`;
      const r = await fetch(url, { headers: { 'x-dash-password': process.env.DASH_PASSWORD } });
      if (!r.ok) throw new Error(`Dashboard error: ${r.status}`);
      const data = await r.json();

      // Response shape: { adAccounts: [{ fbSpend, cocTotals: { sales, ... } }] }
      // Sum across all ad accounts for the client's total
      let spend = 0, purchases = 0;
      for (const account of data.adAccounts || []) {
        spend     += account.fbSpend || 0;
        purchases += account.cocTotals?.sales || 0;
      }
      const cpp = purchases > 0 ? spend / purchases : null;
      return { id, name: c.name, date, tz, spend, purchases, cpp, cppTarget: c.cppTarget };
    }));

    res.json(results.map((r, i) => r.status === 'fulfilled'
      ? r.value
      : { id: sticker[i][0], name: sticker[i][1].name, error: r.reason?.message }
    ));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7-day average CPP per sticker client — called separately so yesterday loads first
app.get('/api/cpp-7day', auth, async (req, res) => {
  try {
    const clients = await fetchClients();
    const sticker = Object.entries(clients).filter(([, c]) => c.type === 'sticker');

    const results = await Promise.allSettled(sticker.map(async ([id, c]) => {
      const tz = c.adAccounts?.[0]?.timezone || 'America/Chicago';
      const tzNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
      const endDate = new Date(tzNow); endDate.setDate(tzNow.getDate() - 1);
      const startDate = new Date(tzNow); startDate.setDate(tzNow.getDate() - 7);
      const start = startDate.toISOString().split('T')[0];
      const end = endDate.toISOString().split('T')[0];

      const url = `${process.env.DASHBOARD_URL}/api/dashboard/${id}?startDate=${start}&endDate=${end}`;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 90000);
      let r;
      try {
        r = await fetch(url, { headers: { 'x-dash-password': process.env.DASH_PASSWORD }, signal: abort.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!r.ok) throw new Error(`Dashboard error: ${r.status}`);
      const data = await r.json();

      let spend = 0, purchases = 0;
      for (const account of data.adAccounts || []) {
        spend     += account.fbSpend || 0;
        purchases += account.cocTotals?.sales || 0;
      }
      const cpp = purchases > 0 ? spend / purchases : null;
      return { id, spend, purchases, cpp, start, end };
    }));

    res.json(results.map((r, i) => r.status === 'fulfilled'
      ? r.value
      : { id: sticker[i][0], error: r.reason?.message }
    ));
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`2by4 Brain running on port ${PORT}`);
});
