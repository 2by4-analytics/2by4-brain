import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import cron from 'node-cron';
import { runMorningBriefing } from './scheduler/index.js';
import { chatWithBrain } from './brain/dispatcher.js';
import { getLatestBriefing, getAllBriefings } from './store/briefings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard')));

// Auth middleware (matches existing claude-dash pattern)
const auth = (req, res, next) => {
  const b64 = (req.headers.authorization || '').split(' ')[1] || '';
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':');
  if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="2by4 Brain"');
  res.status(401).send('Unauthorized');
};

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
