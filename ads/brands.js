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

  // Palettes marked "placeholder" are neutral/name-derived — these clients have
  // no documented brand colors yet; swap in real hex when confirmed. Vibe +
  // basePromptHints are tailored and drive the imagery regardless.
  'us-patriot-buildings': {
    type: 'shed',
    name: 'US Patriot Buildings',
    vibe: 'Oklahoma-built portable buildings, factory-direct, practical and no-pressure. Subtle American warmth via rust/copper tone (not flag-waving). Buildings on rural/small-town OK & AR property — open land, big sky, honest working-people feel. Rent-to-own / no credit check is a core hook.',
    basePromptHints: 'portable building on rural Oklahoma or Arkansas property, open land, big sky, warm natural light, rust/copper accent tone, practical and trustworthy, space for price/financing/CTA overlay',
    avoid: 'overt political or flag imagery, high-pressure salesy feel, urban settings, snow, clutter, fake-looking renders',
    palette: { overlay: '#2b1c12', headline: '#ffffff', sub: '#d99a6c' }, // brand rust #b5703c
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'burnett': {
    type: 'shed',
    name: 'Burnett Affordable Buildings',
    vibe: 'Affordable sheds, barns, cabins & building shells across Oklahoma & Arkansas. Approachable, value-forward, practical — buildings on rural/small-town OK/AR property. Black wordmark brand. Burnett sells shells (exterior only), so lean "ready to customize / shed-to-home," not turnkey-furnished. Rent-to-own / no credit check hooks.',
    basePromptHints: 'affordable portable shed, barn, or cabin shell on rural Oklahoma/Arkansas property, open land, natural daylight, sturdy and approachable, space for price/financing overlay',
    avoid: 'turnkey/furnished interior framing, luxury feel, urban settings, clutter, snow, fake-looking renders',
    palette: { overlay: '#1c1c1c', headline: '#ffffff', sub: '#dcdcdc' }, // matches black wordmark
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'timber-hollow': {
    type: 'shed',
    name: 'Timber Hollow',
    vibe: 'Rustic, woodsy, cabin-forward. Timber-built cabins, barns, and sheds in natural wooded settings — tree lines, dappled light, warm rustic charm. Premium-rustic. Financing / rent-to-own hooks.',
    basePromptHints: 'rustic timber cabin or shed in a wooded natural setting, tree line, warm dappled light, craftsmanship, cozy rustic-modern feel, space for clean price/financing overlay',
    avoid: 'urban settings, cold sterile tones, flat midday light, clutter, fake-looking renders',
    palette: { overlay: '#2d3326', headline: '#ffffff', sub: '#cbb994' }, // placeholder (woodsy, name-derived)
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'willow-lake-sheds': {
    type: 'shed',
    name: 'Willow Lake Sheds',
    vibe: 'Calm, natural, lakeside. Sheds and cabins in serene outdoor settings — water, willows, soft natural light. Peaceful, clean, dependable. Financing / rent-to-own hooks.',
    basePromptHints: 'portable shed or cabin in a serene lakeside or natural setting, soft natural light, calm and clean, sturdy build, space for clean price/financing overlay',
    avoid: 'busy or urban settings, harsh light, clutter, dark moody tones, fake-looking renders',
    palette: { overlay: '#1f3340', headline: '#ffffff', sub: '#cfe0e8' }, // placeholder (lakeside, name-derived)
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'repo-depot': {
    type: 'shed',
    name: 'Repo Depot',
    vibe: 'Value and deals — quality repo / clearance portable buildings at a discount. Bold, "priced to move" energy. Sturdy buildings shown clearly with price/deal front and center; offer-driven by nature (repo deals, discounts, rent-to-own).',
    basePromptHints: 'sturdy portable building shown clearly on a lot or open yard, bright daylight, value/deal energy, clean and trustworthy, strong space for a price/offer overlay',
    avoid: 'junky or run-down look (still quality buildings), clutter, dark moody tones, luxury framing, fake-looking renders',
    palette: { overlay: '#1f2630', headline: '#ffffff', sub: '#d8e0e8' }, // placeholder (neutral)
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'twin-city-barns': {
    type: 'shed',
    name: 'Twin City Barns',
    vibe: 'Barn-forward portable buildings — sturdy barns, garages, and sheds on open property with a clean, dependable feel. Straightforward dealer, value + quality. Financing / rent-to-own hooks.',
    basePromptHints: 'portable barn or shed on open property, blue sky, natural daylight, sturdy dependable build, clean and approachable, space for price/financing overlay',
    avoid: 'clutter, flimsy or cheap-looking builds, dark moody tones, urban settings, fake-looking renders',
    palette: { overlay: '#1f2630', headline: '#ffffff', sub: '#d8e0e8' }, // placeholder (neutral)
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'speedy-sheds': {
    type: 'shed',
    name: 'Speedy Sheds',
    vibe: 'Fast, easy, get-your-shed-quick. Sheds and portable buildings shown clean and ready to deliver; energetic, approachable, value-forward. Quick-delivery and financing / rent-to-own are natural hooks.',
    basePromptHints: 'clean portable shed ready for delivery, bright daylight, approachable and energetic, sturdy build, open yard or lot, space for price/financing/CTA overlay',
    avoid: 'slow or heavy mood, clutter, cheap-looking sheds, dark tones, urban settings, fake-looking renders',
    palette: { overlay: '#1f2630', headline: '#ffffff', sub: '#d8e0e8' }, // placeholder (neutral)
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  },
  'london-barns-and-sheds': {
    type: 'shed',
    name: 'London Barns & Sheds',
    vibe: 'Barns and sheds with a clean, dependable, small-town feel. Sturdy portable buildings on open rural property. Value + quality; financing / rent-to-own hooks.',
    basePromptHints: 'portable barn or shed on open rural property, blue sky, natural daylight, sturdy dependable build, clean and approachable, space for price/financing overlay',
    avoid: 'clutter, cheap-looking builds, dark moody tones, urban settings, fake-looking renders',
    palette: { overlay: '#1f2630', headline: '#ffffff', sub: '#d8e0e8' }, // placeholder (neutral)
    font: { headline: 'oswald', sub: 'inter' },
    overlayPosition: 'bottom'
  }
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
