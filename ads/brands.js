// Per-client ad brand config.
// Keyed by clientId (same IDs used everywhere else in Brain).
// Every field is a default — every ad tool accepts per-call overrides.
//
// Font keys: 'oswald' (condensed bold headline) | 'inter' (neutral sans) | 'playfair' (editorial serif).

const DEFAULT = {
  vibe: '—',
  basePromptHints: '',
  avoid: '',
  palette: { overlay: '#000000', headline: '#ffffff', sub: '#eeeeee' },
  font: { headline: 'oswald', sub: 'inter' },
  overlayPosition: 'bottom'
};

export const BRANDS = {
  'client1': {
    name: 'Eric – Plants',
    vibe: 'Bright, airy, natural light. Lush greenery fills the frame. Home or patio settings. Aspirational but attainable.',
    basePromptHints: 'natural light, lush, home setting, warm tones, aspirational, editorial ad aesthetic, 1:1 square',
    avoid: 'artificial lighting, sterile backgrounds, fake-looking plants',
    palette: { overlay: '#0a1e0a', headline: '#ffffff', sub: '#cceecc' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'eric-faith-mncg09ih': {
    name: 'Eric – Faith',
    vibe: 'Reverent, warm, meaningful. Gold tones and soft light. Intentional and sacred without being heavy-handed.',
    basePromptHints: 'warm light, gold accents, peaceful, intentional, meaningful moments, editorial quality, 1:1 square',
    avoid: 'overly religious imagery, dark tones, stock photo feel',
    palette: { overlay: '#1e1400', headline: '#ffffff', sub: '#ffe9aa' },
    font: { headline: 'playfair', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'craig-revmoto-mmjeuw8s': {
    name: 'Craig – RevMoto',
    vibe: 'Gritty freedom. Open road, cinematic light. Movie still aesthetic. Identity-driven.',
    basePromptHints: 'open road, cinematic, golden hour, freedom, gritty identity, high contrast warm tones, 1:1 square',
    avoid: 'helmets blocking face, overly safe stock imagery, suburban settings',
    palette: { overlay: '#0a0a0a', headline: '#ffffff', sub: '#cccccc' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'coco-black-wolf-mn7hvdev': {
    name: 'Coco – Black Wolf',
    vibe: 'Dark, serious, wilderness. Tactical and capable. Gear that actually gets used — not mall ninja.',
    basePromptHints: 'dark tones, tactical, wilderness, serious, dramatic overcast light, desaturated cool palette, 1:1 square',
    avoid: 'bright cheerful tones, suburban settings, cosplay-tactical feel, smiling subjects',
    palette: { overlay: '#05050f', headline: '#ffffff', sub: '#aaaacc' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'coco-vm-mn7htjvz': {
    name: 'Coco – VM (Vintage Mama)',
    vibe: 'Bold, feminine, retro. Pin-up adjacent without being costume-y. Saturated palette, confident subject.',
    basePromptHints: 'retro palette, bold, confident, pin-up adjacent, vintage-modern fusion, slightly desaturated vintage film look, 1:1 square',
    avoid: 'muted tones, contemporary casual fashion, weak or passive poses',
    palette: { overlay: '#28000a', headline: '#ffffff', sub: '#ffcccc' },
    font: { headline: 'playfair', sub: 'inter' },
    overlayPosition: 'bottom'
  },

  // Sticker clients without confirmed brand profiles — fill in as we learn the niche.
  'client2':                    { ...DEFAULT, name: 'Jorge',               vibe: 'TODO' },
  'brian-mm0ufx84':             { ...DEFAULT, name: 'Brian',               vibe: 'TODO' },
  'matteo-mm0urlzh':            { ...DEFAULT, name: 'Matteo',              vibe: 'TODO' },
  'todd-mn3cd22p':              { ...DEFAULT, name: 'Todd',                vibe: 'TODO' },
  'craig-readynation-mmkodtu2': { ...DEFAULT, name: 'Craig – ReadyNation', vibe: 'TODO' }
};

export function getBrand(clientId) {
  return BRANDS[clientId] || { ...DEFAULT, name: clientId };
}

export function listBrandedClients() {
  return Object.entries(BRANDS).map(([id, b]) => ({
    id,
    name: b.name,
    configured: b.vibe !== 'TODO' && b.vibe !== '—'
  }));
}
