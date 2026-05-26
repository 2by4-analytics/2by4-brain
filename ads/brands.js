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
    basePromptHints: 'natural light, lush, home setting, warm tones, aspirational, editorial ad aesthetic',
    avoid: 'artificial lighting, sterile backgrounds, fake-looking plants',
    palette: { overlay: '#0a1e0a', headline: '#ffffff', sub: '#cceecc' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'eric-faith-mncg09ih': {
    name: 'Eric – Faith',
    vibe: 'Reverent, warm, meaningful. Gold tones and soft light. Intentional and sacred without being heavy-handed.',
    basePromptHints: 'warm light, gold accents, peaceful, intentional, meaningful moments, editorial quality',
    avoid: 'overly religious imagery, dark tones, stock photo feel',
    palette: { overlay: '#1e1400', headline: '#ffffff', sub: '#ffe9aa' },
    font: { headline: 'playfair', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'craig-revmoto-mmjeuw8s': {
    name: 'Craig – RevMoto',
    vibe: 'Gritty freedom. Open road, cinematic light. Movie still aesthetic. Identity-driven.',
    basePromptHints: 'open road, cinematic, golden hour, freedom, gritty identity, high contrast warm tones',
    avoid: 'helmets blocking face, overly safe stock imagery, suburban settings',
    palette: { overlay: '#0a0a0a', headline: '#ffffff', sub: '#cccccc' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'coco-black-wolf-mn7hvdev': {
    name: 'Coco – Black Wolf',
    vibe: 'Dark, serious, wilderness. Tactical and capable. Gear that actually gets used — not mall ninja.',
    basePromptHints: 'dark tones, tactical, wilderness, serious, dramatic overcast light, desaturated cool palette',
    avoid: 'bright cheerful tones, suburban settings, cosplay-tactical feel, smiling subjects',
    palette: { overlay: '#05050f', headline: '#ffffff', sub: '#aaaacc' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'coco-vm-mn7htjvz': {
    name: 'Coco – VM (Vintage Mama)',
    vibe: 'Bold, feminine, retro. Pin-up adjacent without being costume-y. Saturated palette, confident subject.',
    basePromptHints: 'retro palette, bold, confident, pin-up adjacent, vintage-modern fusion, slightly desaturated vintage film look',
    avoid: 'muted tones, contemporary casual fashion, weak or passive poses',
    palette: { overlay: '#28000a', headline: '#ffffff', sub: '#ffcccc' },
    font: { headline: 'playfair', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'taylor-usago-mp5nblk8': {
    name: 'Taylor – USAGO',
    vibe: 'Dark, moody, masculine 2A. Patriotic without ragebait. Responsibility, brotherhood, training, preparedness. Test-Great-Gear-style product hero with bold headline + amber accent.',
    basePromptHints: 'dark moody background, bold white headline, amber/orange accent, product hero, gritty patriotic tone, editorial ad aesthetic',
    avoid: 'overtly political bait, ragebait, tactical-cosplay, mall-ninja, suburban settings, smiling stock-photo feel, freebie/giveaway framing',
    palette: { overlay: '#0a0a0a', headline: '#ffffff', sub: '#ffb347' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'rob-vintage-horror-mpil2p1b': {
    name: 'Rob – Vintage Horror',
    vibe: 'Vintage VHS-era horror. Blue-teal or B&W moody base — haunted houses, foggy forests, bedroom/POV monster scenes, snowy TV static (Poltergeist nod). Licensed-franchise iconography (F13, Halloween, Nightmare, Beetlejuice, Saw, Terrifier). Treat the source material with reverence — never campy, never parody. Cult-classic horror-movie-poster aesthetic with a "casting call / horror fans wanted" recruit hook.',
    basePromptHints: 'cool blue-teal or desaturated B&W moody base, vintage 80s horror movie poster, slasher franchise iconography, dripping paint or red-banner overlay typography, hand-painted distressed lettering, skull badge top-right, "test and keep merch" reinforcement, midnight movie / VHS-rental aesthetic, fog and neon, practical-effects feel',
    avoid: 'campy, cartoony, parody, jokey, ironic horror, bright cheerful palette, smiling subjects, modern clean ecom aesthetic, generic Halloween costume vibe',
    palette: { overlay: '#050207', headline: '#c9f048', sub: '#e63946' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },

  // Sticker clients without confirmed brand profiles — fill in as we learn the niche.
  'client2':                    { ...DEFAULT, name: 'Jorge',               vibe: 'TODO' },
  'brian-mm0ufx84':             { ...DEFAULT, name: 'Brian',               vibe: 'TODO' },
  'matteo-mm0urlzh':            { ...DEFAULT, name: 'Matteo',              vibe: 'TODO' },
  'todd-mn3cd22p':              { ...DEFAULT, name: 'Todd',                vibe: 'TODO' },
  'craig-readynation-mmkodtu2': { ...DEFAULT, name: 'Craig – ReadyNation', vibe: 'TODO' },

  // ── Shed clients (lead-gen vertical) ──────────────────────────────────────
  // Keyed by the slug from 2by4-sheds/config/clients.js. `type:'shed'` so
  // listBrandedClients() + the dispatcher surface them correctly. Sheds run
  // product + lifestyle imagery with offer/financing hooks; text can be clean
  // overlay OR baked per ad.
  'secure-storage-sheds': {
    type: 'shed',
    name: 'Secure Storage Sheds',
    vibe: 'Texas value and durability. Quality storage sheds and portable buildings shown in real Texas settings — ranch land, rural acreage, suburban backyard, wide blue sky. Clean, solid, trustworthy; "Texas #1 choice." Lifestyle shots feel attainable (not luxury); product shots show a sturdy, well-built structure. Offer variants lead with financing / rent-to-own / free delivery.',
    basePromptHints: 'storage shed or portable building in a real Texas setting, wide blue sky, ranch or suburban backyard, bright natural daylight, sturdy well-built structure, clean and trustworthy, space for price/financing/CTA overlay',
    avoid: 'snow or cold-climate scenes, clutter, flimsy cheap-looking sheds, dark moody tones, dense urban backgrounds, fake-looking renders',
    palette: { overlay: '#1f2d3d', headline: '#ffffff', sub: '#cfe0f0' },
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'sheds-of-kentucky': {
    type: 'shed',
    name: 'Sheds of Kentucky',
    vibe: 'Premium, rustic, Kentucky-built — warmer and more polished than a typical shed dealer. Barns, cabins, and sheds in scenic Kentucky settings: rolling green hills, tree lines, golden-hour light, rural homesteads. Navy and warm-gold brand. Factory-direct, "Built in Kentucky, Built to Last." Offer variants lead with rent-to-own / no credit check.',
    basePromptHints: 'portable building, barn, or cabin in a scenic rural Kentucky landscape, rolling green hills, golden hour, warm natural light, premium rustic-modern feel, craftsmanship, navy and warm gold accents, space for clean price/financing overlay',
    avoid: 'cheap dealer-lot feel, harsh flat midday light, urban settings, cold blue-only palette, cluttered backgrounds, generic stock-photo look',
    palette: { overlay: '#1B3A5C', headline: '#ffffff', sub: '#C8A96E' },
    font: { headline: 'playfair', sub: 'inter' },
    overlayPosition: 'bottom'
  },

  // Shed clients awaiting brand direction — fill in palette/font/vibe as we go.
  'us-patriot-buildings':   { ...DEFAULT, type: 'shed', name: 'US Patriot Buildings',         vibe: 'TODO' },
  'twin-city-barns':        { ...DEFAULT, type: 'shed', name: 'Twin City Barns',              vibe: 'TODO' },
  'speedy-sheds':           { ...DEFAULT, type: 'shed', name: 'Speedy Sheds',                 vibe: 'TODO' },
  'burnett':                { ...DEFAULT, type: 'shed', name: 'Burnett Affordable Buildings', vibe: 'TODO' },
  'london-barns-and-sheds': { ...DEFAULT, type: 'shed', name: 'London Barns & Sheds',         vibe: 'TODO' },
  'repo-depot':             { ...DEFAULT, type: 'shed', name: 'Repo Depot',                    vibe: 'TODO' },
  'timber-hollow':          { ...DEFAULT, type: 'shed', name: 'Timber Hollow',                vibe: 'TODO' },
  'willow-lake-sheds':      { ...DEFAULT, type: 'shed', name: 'Willow Lake Sheds',            vibe: 'TODO' }
};

export function getBrand(clientId) {
  return BRANDS[clientId] || { ...DEFAULT, name: clientId };
}

export function listBrandedClients() {
  // Sticker entries omit `type` (default 'sticker'); shed entries set `type:'shed'`.
  // Consumers (list_ad_brands tool, dispatcher roster) read `type` from here
  // instead of re-deriving it from a parallel hardcoded list.
  return Object.entries(BRANDS).map(([id, b]) => ({
    id,
    name: b.name,
    type: b.type || 'sticker',
    configured: b.vibe !== 'TODO' && b.vibe !== '—'
  }));
}
