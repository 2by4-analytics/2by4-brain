export const CLIENTS = {
  'client1': {
    name: 'Eric / Plant',
    type: 'sticker',
    niche: 'houseplant',
    cppTarget: 18,
    dailySpend: 4000,
    platform: ['meta'],
    active: true
  },
  'client1-faith': {
    name: 'Eric / Faith',
    type: 'sticker',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'client2': {
    name: 'Jorge',
    type: 'sticker',
    cppTarget: 18,
    platform: ['meta'],
    active: true
  },
  'brian-mm0ufx84': {
    name: 'Brian',
    type: 'sticker',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'matteo-mm0urlzh': {
    name: 'Matteo',
    type: 'sticker',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'todd-mn3cd22p': {
    name: 'Todd',
    type: 'sticker',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'coco-vm-mn7htjvz': {
    name: 'Coco - VM',
    type: 'sticker',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'coco-black-wolf-mn7hvdev': {
    name: 'Coco - Black Wolf',
    type: 'sticker',
    cppTarget: 25,
    platform: ['meta'],
    active: true
  },
  'craig-revmoto-mmjeuw8s': {
    name: 'Craig-RevMoto',
    type: 'shed',
    cppTarget: 25,
    platform: ['meta', 'google'],
    stack: ['wordpress', 'gohighlevel', 'tagmanager'],
    active: true
  },
  'craig-readynation-mmkodtu2': {
    name: 'Craig-ReadyNation',
    type: 'shed',
    cppTarget: 25,
    platform: ['meta', 'google'],
    stack: ['wordpress', 'gohighlevel', 'tagmanager'],
    active: true
  }
};

export const CLIENT_TYPES = {
  sticker: Object.entries(CLIENTS).filter(([, c]) => c.type === 'sticker').map(([id, c]) => ({ id, ...c })),
  shed: Object.entries(CLIENTS).filter(([, c]) => c.type === 'shed').map(([id, c]) => ({ id, ...c }))
};
