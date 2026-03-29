export const CLIENTS = {
  // Sticker Funnel Clients
  'eric-plant': {
    name: 'Eric / Plant',
    type: 'sticker',
    niche: 'houseplant',
    cppTarget: 18,
    dailySpend: 4000,
    platform: ['meta'],
    brief: 'houseplant',
    active: true
  },
  'eric-faith': {
    name: 'Eric / Faith',
    type: 'sticker',
    niche: 'faith',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'jorge': {
    name: 'Jorge',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },
  'brian': {
    name: 'Brian',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },
  'matteo': {
    name: 'Matteo',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },
  'todd': {
    name: 'Todd',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },
  'coco-vm': {
    name: 'Coco-VM',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },
  'coco-blackwolf': {
    name: 'Coco-Black Wolf',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },

  // Shed Clients
  'craig-revmoto': {
    name: 'Craig-RevMoto',
    type: 'shed',
    platform: ['meta', 'google'],
    stack: ['wordpress', 'gohighlevel', 'tagmanager'],
    active: true
  },
  'craig-readynation': {
    name: 'Craig-ReadyNation',
    type: 'shed',
    platform: ['meta', 'google'],
    stack: ['wordpress', 'gohighlevel', 'tagmanager'],
    active: true
  }
};

export const CLIENT_TYPES = {
  sticker: Object.entries(CLIENTS).filter(([, c]) => c.type === 'sticker').map(([id, c]) => ({ id, ...c })),
  shed: Object.entries(CLIENTS).filter(([, c]) => c.type === 'shed').map(([id, c]) => ({ id, ...c }))
};
