import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(__dirname, '..', 'data', 'briefings');

async function ensureDir() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

export async function saveBriefing(briefing) {
  await ensureDir();
  const date = new Date().toISOString().split('T')[0];
  const filepath = path.join(STORE_DIR, `${date}.json`);
  const data = {
    date,
    generatedAt: new Date().toISOString(),
    ...briefing
  };
  await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  console.log(`[Store] Briefing saved: ${filepath}`);
  return data;
}

export async function getLatestBriefing() {
  await ensureDir();
  const files = await fs.readdir(STORE_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
  if (!jsonFiles.length) return null;
  const content = await fs.readFile(path.join(STORE_DIR, jsonFiles[0]), 'utf-8');
  return JSON.parse(content);
}

export async function getAllBriefings(days = 30) {
  await ensureDir();
  const files = await fs.readdir(STORE_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, days);
  const briefings = await Promise.all(
    jsonFiles.map(async f => {
      const content = await fs.readFile(path.join(STORE_DIR, f), 'utf-8');
      return JSON.parse(content);
    })
  );
  return briefings;
}

export async function getBriefingByDate(date) {
  const filepath = path.join(STORE_DIR, `${date}.json`);
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
