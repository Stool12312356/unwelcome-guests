// Pure deterministic gameplay model. Distances are metres, timers seconds.
export const WEAPONS = Object.freeze([
  { id: 'slipper', label: 'Тапок', cooldown: 0.38, range: 2.3, damage: 45, radius: 0 },
  { id: 'newspaper', label: 'Газета', cooldown: 0.24, range: 2.5, damage: 25, radius: 0 },
  { id: 'spray', label: 'Дихлофос', cooldown: 0.22, range: 4, damage: 22, radius: 0.85 },
  { id: 'hammer', label: 'Молоток', cooldown: 0.75, range: 2.4, damage: 120, radius: 0 },
  { id: 'vacuum', label: 'Пылесос', cooldown: 0.3, range: 5, damage: 35, radius: 0.55 },
  { id: 'extinguisher', label: 'Огнетушитель', cooldown: 0.85, range: 5.5, damage: 65, radius: 1.6 },
].map(Object.freeze));

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const validPoint = p => p && finite(p.x) && finite(p.y) && finite(p.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const copy = value => JSON.parse(JSON.stringify(value));
const roomOf = x => x < -3 ? 0 : x > 3 ? 2 : 1;

function generator(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLayout() {
  const walls = [
    { id: 'north', x: 0, z: -6, width: 18.2, depth: 0.2, height: 3 },
    { id: 'south', x: 0, z: 6, width: 18.2, depth: 0.2, height: 3 },
    { id: 'west', x: -9, z: 0, width: 0.2, depth: 12, height: 3 },
    { id: 'east', x: 9, z: 0, width: 0.2, depth: 12, height: 3 },
  ];
  for (const x of [-3, 3]) {
    for (const sign of [-1, 1]) {
      walls.push({ id: `partition-${x}-${sign}`, x, z: sign * 3.6,
        width: 0.2, depth: 4.8, height: 3 });
    }
  }
  return { bounds: { minX: -9, maxX: 9, minZ: -6, maxZ: 6 }, walls,
    spawn: { x: -7, y: 1.65, z: 0 } };
}

function insideXZ(p, box, margin = 0) {
  return Math.abs(p.x - box.x) < box.width / 2 + margin &&
    Math.abs(p.z - box.z) < box.depth / 2 + margin;
}

function surfaceDistance(p, target, spider = false) {
  if (spider) return Math.max(0, distance(p, target) - 0.28);
  return Math.hypot(Math.max(0, Math.abs(p.x - target.x) - target.width / 2),
    Math.max(0, Math.abs(p.y - target.y) - target.height / 2),
    Math.max(0, Math.abs(p.z - target.z) - target.depth / 2));
}

export function createSimulation({ seed = 1, spiderCount = 6 } = {}) {
  const count = finite(spiderCount) ? clamp(Math.floor(spiderCount), 0, 100) : 6;
  let state, random, cooldown, eventId, webId, brains;
  const emit = (type, p, value = 0) => state.events.push({
    id: `event-${++eventId}`, type, x: p.x, y: p.y, z: p.z, value,
  });
  const getState = () => copy(state);
  const clearAt = (p, margin = 0.23) => Math.abs(p.x) < 8.9 - margin &&
    Math.abs(p.z) < 5.9 - margin &&
    !state.layout.walls.some(w => insideXZ(p, w, margin)) &&
    !state.props.some(o => !o.broken && insideXZ(p, o, margin));

  function restart(options = {}) {
    const nextSeed = (options.seed === undefined ? seed : options.seed) >>> 0;
    seed = nextSeed;
    random = generator(seed);
    cooldown = 0; eventId = 0; webId = 0; brains = new Map();
    state = { seed, status: count ? 'playing' : 'won', elapsed: 0, damageRub: 0,
      aliveSpiders: count, totalSpiders: count, mood: 'calm', player: null,
      layout: makeLayout(), props: [], spiders: [], webs: [], events: [] };
    state.player = { ...state.layout.spawn };
    const kinds = [
      ['tv', 1.5, 1.05, 0.65, 48000, 70],
      ['vase', 0.55, 0.95, 0.55, 9500, 25],
      ['aquarium', 1.5, 1.3, 0.75, 36000, 60],
      ['chair', 0.7, 1.05, 0.7, 4200, 65],
      ['table', 1.6, 0.8, 1.1, 18000, 100],
      ['box', 0.85, 0.75, 0.85, 1200, 45],
    ];
    // Separate jittered cells preserve a >3m-wide cross-apartment corridor.
    for (let room = 0; room < 3; room++) {
      for (let slot = 0; slot < 4; slot++) {
        const index = room * 4 + slot;
        const [kind, width, height, depth, valueRub, hp] = kinds[index % kinds.length];
        state.props.push({ id: `prop-${index + 1}`, kind,
          x: -6 + room * 6 + (slot % 2 ? 1.35 : -1.35) + (random() - 0.5) * 0.5,
          y: height / 2, z: (slot < 2 ? -3.6 : 3.6) + (random() - 0.5) * 0.8,
          width, height, depth, valueRub, hp, broken: false });
      }
    }
    // Substantial furniture belongs to the same damage/spawn model, never visual-only obstacles.
    for (const [index, kind, x, z, width, height, depth, valueRub, hp] of [
      [13, 'sofa', -6, 5.05, 2.65, 1.05, 1.15, 28000, 160],
      [14, 'cabinet', 0, 5.25, 1.65, 1.65, 0.85, 22000, 140],
      [15, 'sofa', 6, 5.05, 2.65, 1.05, 1.15, 28000, 160],
    ]) state.props.push({ id: `prop-${index}`, kind, x, y: height / 2, z, width, height, depth, valueRub, hp, broken: false });
    for (let i = 0; i < count; i++) {
      let p;
      for (let attempt = 0; attempt < 300; attempt++) {
        const candidate = { x: -8.4 + random() * 16.8, y: 0.18, z: -5.4 + random() * 10.8 };
        if (clearAt(candidate) && distance(candidate, state.player) > 1.8 &&
            state.spiders.every(s => distance(s, candidate) > 0.6)) { p = candidate; break; }
      }
      // Deterministic free-cell fallback also checks partitions and furniture.
      if (!p) {
        for (let row = 0; row < 17 && !p; row++) {
          for (let column = 0; column < 27; column++) {
            const candidate = { x: -8.45 + column * 0.65, y: 0.18, z: -5.2 + row * 0.65 };
            if (clearAt(candidate) && state.spiders.every(s => distance(s, candidate) > 0.6)) {
              p = candidate; break;
            }
          }
        }
      }
      if (!p) throw new Error('No safe spider spawn cell available');
      const spider = { id: `spider-${i + 1}`, ...p, hp: 100, mode: 'flee' };
      state.spiders.push(spider);
      brains.set(spider.id, { timer: 0, webAt: 6 + i * 1.4 + random() * 2,
        destination: null, jumpTime: 0 });
    }
    return getState();
  }

  function refuge(spider) {
    const candidates = state.props.filter(p => !p.broken && roomOf(p.x) === roomOf(spider.x));
    candidates.sort((a, b) => (b.valueRub / (1 + distance(spider, b))) -
      (a.valueRub / (1 + distance(spider, a))));
    for (const prop of candidates) {
      const dx = prop.x - state.player.x, dz = prop.z - state.player.z;
      const length = Math.hypot(dx, dz) || 1;
      const extent = Math.max(prop.width, prop.depth) / 2 + 0.55;
      const choices = [
        { x: prop.x + dx / length * extent, z: prop.z + dz / length * extent },
        { x: prop.x, z: prop.z + prop.depth / 2 + 0.5 },
        { x: prop.x, z: prop.z - prop.depth / 2 - 0.5 },
      ];
      const choice = choices.find(p => clearAt(p));
      if (choice) return choice;
    }
    return { x: clamp(spider.x + (spider.x - state.player.x), -8.3, 8.3), z: 0 };
  }

  function move(spider, goal, speed, dt) {
    const dx = goal.x - spider.x, dz = goal.z - spider.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.08) return true;
    const amount = Math.min(speed * dt, length);
    const nx = spider.x + dx / length * amount, nz = spider.z + dz / length * amount;
    if (clearAt({ x: nx, z: nz })) { spider.x = nx; spider.z = nz; }
    else if (clearAt({ x: nx, z: spider.z })) spider.x = nx;
    else if (clearAt({ x: spider.x, z: nz })) spider.z = nz;
    return length < 0.25;
  }

  function step(dt = 0, player) {
    state.events = [];
    if (validPoint(player)) state.player = { x: clamp(player.x, -8.9, 8.9),
      y: clamp(player.y, 0, 3), z: clamp(player.z, -5.9, 5.9) };
    const delta = finite(dt) ? clamp(dt, 0, 0.05) : 0;
    if (state.status !== 'playing' || !delta) return getState();
    state.elapsed += delta;
    cooldown = Math.max(0, cooldown - delta);
    state.mood = state.elapsed % 28 < 18 ? 'calm' : 'horror';
    state.webs = state.webs.map(w => ({ ...w, ttl: w.ttl - delta })).filter(w => w.ttl > 0);
    for (const spider of state.spiders) {
      if (spider.hp <= 0) continue;
      const brain = brains.get(spider.id);
      brain.timer -= delta;
      if (state.elapsed >= brain.webAt) {
        brain.webAt = state.elapsed + 12 + random() * 10;
        spider.mode = 'web'; brain.timer = 0.7;
        const web = { id: `web-${++webId}`, x: spider.x, y: 0.035, z: spider.z,
          radius: 0.65 + random() * 0.3, ttl: 8 };
        state.webs.push(web); emit('web', web, web.radius);
      }
      if (brain.timer <= 0) {
        const close = Math.hypot(spider.x - state.player.x, spider.z - state.player.z) < 4;
        const roll = random();
        spider.mode = close && roll < (state.mood === 'horror' ? 0.18 : 0.06) ? 'chase' : 'flee';
        brain.timer = 1.5 + random() * 2;
        brain.destination = refuge(spider);
        if (spider.mode === 'chase' && roll < 0.045) {
          spider.mode = 'jump'; brain.jumpTime = 0; brain.timer = 0.65;
          emit('jump', spider, 1);
        }
      }
      if (spider.mode === 'jump') {
        brain.jumpTime += delta;
        spider.y = 0.18 + Math.sin(Math.min(1, brain.jumpTime / 0.65) * Math.PI) * 1.05;
        move(spider, state.player, 2.8, delta);
      } else {
        spider.y = 0.18;
        if (spider.mode === 'chase') move(spider, state.player, 1.5, delta);
        if (spider.mode === 'flee' && move(spider, brain.destination ?? refuge(spider), 1.25, delta)) {
          spider.mode = 'hide'; brain.timer = 2 + random() * 2;
        }
      }
    }
    return getState();
  }

  function attack({ weaponId, targetId = null, point } = {}) {
    state.events = [];
    const weapon = WEAPONS.find(w => w.id === weaponId);
    if (!weapon || state.status !== 'playing' || cooldown > 1e-8) return getState();
    const target = state.spiders.find(s => s.id === targetId && s.hp > 0) ??
      state.props.find(p => p.id === targetId && !p.broken);
    if (targetId !== null && !target) return getState();
    const impact = point === undefined ? target : point;
    if (!validPoint(impact) || distance(state.player, impact) > weapon.range + 1e-8) return getState();
    if (target && surfaceDistance(impact, target, target.id.startsWith('spider-')) > 0.35) return getState();
    cooldown = weapon.cooldown;
    emit('shot', impact, weapon.damage);
    const targets = [...state.spiders.filter(s => s.hp > 0), ...state.props.filter(p => !p.broken)];
    for (const victim of targets) {
      const isSpider = victim.id.startsWith('spider-');
      const affected = weapon.radius > 0 ? surfaceDistance(impact, victim, isSpider) <= weapon.radius : victim === target;
      if (!affected || surfaceDistance(state.player, victim, isSpider) > weapon.range) continue;
      victim.hp = Math.max(0, victim.hp - weapon.damage);
      if (victim.hp !== 0) continue;
      if (isSpider) { state.aliveSpiders--; emit('kill', victim, 1); }
      else { victim.broken = true; state.damageRub += victim.valueRub; emit('break', victim, victim.valueRub); }
    }
    if (state.aliveSpiders === 0) state.status = 'won';
    return getState();
  }

  restart({ seed });
  return { getState, step, attack, restart };
}
