import { generateLevel } from './levels.js';
import { createSpiders, FLOOR_Y } from './spiders.js';
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

function generator(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let n = Math.imul(s ^ (s >>> 15), 1 | s);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}


function insideXZ(p, box, margin = 0) {
  return Math.abs(p.x - box.x) < box.width / 2 + margin &&
    Math.abs(p.z - box.z) < box.depth / 2 + margin;
}

function surfaceDistance(p, target, spider = false) {
  if (spider) return Math.max(0, distance(p, target) - 0.14);
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
      layout: null, props: [], spiders: [], webs: [], events: [] };
    const generated = generateLevel(random);
    state.layout = generated.layout; state.props = generated.props;
    state.player = { ...state.layout.spawn };
    brains = createSpiders({ state, random, emit, clearAt, spawnWeb(x, y, z, radius) {
      const web = { id: `web-${++webId}`, x, y, z, radius, ttl: 8 };
      state.webs.push(web); emit('web', web, radius);
    } });
    for (let i = 0; i < count; i++) {
      let p;
      for (let attempt = 0; attempt < 300; attempt++) {
        const candidate = { x: -8.4 + random() * 16.8, y: FLOOR_Y, z: -5.4 + random() * 10.8 };
        if (clearAt(candidate) && distance(candidate, state.player) > 1.8 &&
            state.spiders.every(s => distance(s, candidate) > 0.6)) { p = candidate; break; }
      }
      // Deterministic free-cell fallback also checks partitions and furniture.
      if (!p) {
        for (let row = 0; row < 17 && !p; row++) {
          for (let column = 0; column < 27; column++) {
            const candidate = { x: -8.45 + column * 0.65, y: FLOOR_Y, z: -5.2 + row * 0.65 };
            if (clearAt(candidate) && state.spiders.every(s => distance(s, candidate) > 0.6)) {
              p = candidate; break;
            }
          }
        }
      }
      if (!p) throw new Error('No safe spider spawn cell available');
      const spider = { id: `spider-${i + 1}`, ...p, hp: 100, mode: 'idle', on: null };
      state.spiders.push(spider);
      brains.add(spider, i);
    }
    return getState();
  }


  function step(dt = 0, player) {
    const previousPlayer = state.player;
    state.events = [];
    if (validPoint(player)) state.player = { x: clamp(player.x, -8.9, 8.9),
      y: clamp(player.y, 0, 3), z: clamp(player.z, -5.9, 5.9) };
    const delta = finite(dt) ? clamp(dt, 0, 0.05) : 0;
    if (state.status !== 'playing' || !delta) return getState();
    state.elapsed += delta;
    cooldown = Math.max(0, cooldown - delta);
    state.mood = state.elapsed % 28 < 18 ? 'calm' : 'horror';
    state.webs = state.webs.map(w => ({ ...w, ttl: w.ttl - delta })).filter(w => w.ttl > 0);
    const playerSpeed = Math.hypot(state.player.x - previousPlayer.x, state.player.z - previousPlayer.z) / delta;
    brains.update(delta, playerSpeed);
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
    brains.alarm(impact, { victimId: targetId, killed: state.events.some(e => e.type === 'kill') });
    if (state.aliveSpiders === 0) state.status = 'won';
    return getState();
  }

  restart({ seed });
  return { getState, step, attack, restart };
}
