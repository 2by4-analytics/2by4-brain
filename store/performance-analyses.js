import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(__dirname, '..', 'data', 'performance-analyses');

async function ensureDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function savePerformanceAnalysis(clientId, analysis) {
  await ensureDir();
  const date = new Date().toISOString().split('T')[0];
  const filepath = path.join(STORE_DIR, `${clientId}-${date}.json`);
  const data = {
    date,
    generatedAt: new Date().toISOString(),
    ...analysis,
  };
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  console.log(`[Store] Performance analysis saved: ${filepath}`);
  return data;
}

export async function getLatestPerformanceAnalysis(clientId) {
  await ensureDir();
  const files = await fs.readdir(STORE_DIR);
  const matches = files
    .filter(f => f.startsWith(`${clientId}-`) && f.endsWith('.json'))
    .sort()
    .reverse();
  if (!matches.length) return null;
  const content = await fs.readFile(path.join(STORE_DIR, matches[0]), 'utf-8');
  return JSON.parse(content);
}
