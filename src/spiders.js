// Spider behaviour. Small spiders walk the floor, leap onto furniture tops ("perches"), sit there,
// weave webs, flee from threats and (when bold) stalk and pounce at the player. Deterministic via random().
export const FLOOR_Y = 0.07; // body centre height on a surface (feet touch it)
const WALK_MARGIN = 0.12, FLOOR_JUMP = 1.1, PERCH_JUMP = 0.9, MAX_LEAP = 1.7;
// How far the walkable top is inset from a prop's footprint.
// Only broad, flat tops; chair backs, sloped TV cases and cushions are not landing pads.
const INSET = { table: 0.25, cabinet: 0.25, box: 0.25, aquarium: 0.25 };
const SPEED = { wander: 0.8, approach: 1.3, flee: 2.0, stalk: 1.0 };
const FLIGHT = new Set(['leap', 'jump']);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const lerp = (a, b, t) => a + (b - a) * t;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const roomOf = x => x < -3 ? 0 : x > 3 ? 2 : 1;

export function createSpiders({ state, random, emit, clearAt, spawnWeb }) {
  const brains = new Map();
  let perches = [];
  let speed = 0;
  const rnd = (a, b) => a + random() * (b - a);
  const pick = list => list[Math.floor(random() * list.length)];

  function computePerches() {
    perches = state.props.filter(p => !p.broken && INSET[p.kind] !== undefined).map(p => {
      const m = INSET[p.kind];
      return { id: p.id, x: p.x, z: p.z, x0: p.x - p.width / 2 + m, x1: p.x + p.width / 2 - m,
        z0: p.z - p.depth / 2 + m, z1: p.z + p.depth / 2 - m, y: p.y + p.height / 2 + FLOOR_Y };
    });
  }
  const perchOf = id => perches.find(p => p.id === id);
  const nearest = (r, p) => ({ x: clamp(p.x, r.x0, r.x1), z: clamp(p.z, r.z0, r.z1) });
  const crowd = (id, self) => [...brains.values()].filter(b => b.spider !== self && b.spider.hp > 0 &&
    (b.spider.on === id || b.leap?.perchId === id)).length;

  /** Move out of furniture after a landing. */
  function snapClear(s) {
    if (clearAt(s, 0.1)) return;
    for (let r = 0.15; r < 1.6; r += 0.15) for (let a = 0; a < 8; a++) {
      const p = { x: s.x + Math.cos(a * 0.785) * r, z: s.z + Math.sin(a * 0.785) * r };
      if (clearAt(p, 0.1)) { s.x = p.x; s.z = p.z; return; }
    }
  }

  function leap(s, b, to, { perchId = null, mode = 'leap', after = null, arc, dur } = {}) {
    const gap = Math.hypot(to.x - s.x, to.z - s.z), rise = to.y - s.y;
    b.leap = { from: { x: s.x, y: s.y, z: s.z }, to, t: 0, perchId, after,
      dur: dur ?? clamp(0.28 + gap * 0.22 + Math.abs(rise) * 0.12, 0.3, 0.9),
      arc: arc ?? 0.1 + Math.max(0, rise) * 0.5 + gap * 0.1 };
    s.mode = mode; s.on = null; b.goal = null; b.next = null;
  }

  function fly(s, b, dt) {
    const L = b.leap;
    L.t += dt;
    const u = Math.min(1, L.t / L.dur);
    s.x = lerp(L.from.x, L.to.x, u); s.z = lerp(L.from.z, L.to.z, u);
    s.y = lerp(L.from.y, L.to.y, u) + L.arc * 4 * u * (1 - u);
    if (u < 1) return;
    b.leap = null;
    const perch = L.perchId && perchOf(L.perchId);
    if (perch) { s.on = perch.id; s.y = perch.y; Object.assign(s, nearest(perch, s)); }
    else { s.on = null; s.y = FLOOR_Y; snapClear(s); }
    if (L.after === 'flee') b.fear = Math.max(b.fear, 0.9);
    s.mode = s.on ? 'perch' : 'idle';
    b.timer = L.after ? 0 : rnd(0.4, 1.4);
  }

  function drop(s, b) { // the furniture under the spider was destroyed
    s.on = null; b.leap = null; b.goal = null; b.next = null; b.vy = 0; s.mode = 'fall'; b.fear = 1;
  }
  function fall(s, b, dt) {
    b.vy -= 9 * dt; s.y += b.vy * dt;
    if (s.y > FLOOR_Y) return;
    s.y = FLOOR_Y; snapClear(s); s.mode = 'idle'; b.timer = 0;
  }

  function walk(s, goal, v, dt) {
    const dx = goal.x - s.x, dz = goal.z - s.z, len = Math.hypot(dx, dz);
    if (len < 0.08) return true;
    const a = Math.min(v * dt, len), nx = s.x + dx / len * a, nz = s.z + dz / len * a;
    if (clearAt({ x: nx, z: nz }, WALK_MARGIN)) { s.x = nx; s.z = nz; }
    else if (clearAt({ x: nx, z: s.z }, WALK_MARGIN)) s.x = nx;
    else if (clearAt({ x: s.x, z: nz }, WALK_MARGIN)) s.z = nz;
    return Math.hypot(goal.x - s.x, goal.z - s.z) < 0.1;
  }

  function approachPoint(s, perch) {
    const n = nearest(perch, s), dx = s.x - n.x, dz = s.z - n.z, len = Math.hypot(dx, dz) || 1;
    return [{ x: n.x + dx / len * 0.3, z: n.z + dz / len * 0.3 }, { x: n.x + 0.3, z: n.z },
      { x: n.x - 0.3, z: n.z }, { x: n.x, z: n.z + 0.3 }, { x: n.x, z: n.z - 0.3 }]
      .find(p => clearAt(p, WALK_MARGIN)) ?? null;
  }

  function hopCandidates(s) {
    return perches.filter(p => {
      if (p.id === s.on || crowd(p.id, s) >= 2 || roomOf(p.x) !== roomOf(s.x)) return false;
      if (s.on) return p.y - s.y <= PERCH_JUMP && flat(s, nearest(p, s)) <= MAX_LEAP - 0.3;
      return p.y - FLOOR_Y <= FLOOR_JUMP && roomOf(p.x) === roomOf(s.x) && flat(s, p) <= 4;
    });
  }

  /** Jump (from a perch / when close enough) or walk to a take-off point first. */
  function planHop(s, b, perch, mode = 'approach') {
    const landing = nearest(perch, s), gap = flat(s, landing), to = { ...landing, y: perch.y };
    if (s.on) { if (gap > MAX_LEAP) return false; leap(s, b, to, { perchId: perch.id }); return true; }
    if (gap <= 0.55) { leap(s, b, to, { perchId: perch.id }); return true; }
    const spot = approachPoint(s, perch);
    if (!spot) return false;
    b.goal = spot; b.next = { perchId: perch.id }; s.mode = mode; b.timer = 6;
    return true;
  }

  /** Jump from a perch to the floor, away from `away` when given. */
  function planDrop(s, b, away, after) {
    const base = away ? Math.atan2(s.z - away.z, s.x - away.x) : rnd(0, Math.PI * 2);
    for (let k = 0; k < 8; k++) {
      const angle = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6;
      for (let t = 0.3; t <= 2; t += 0.1) {
        const p = { x: s.x + Math.cos(angle) * t, z: s.z + Math.sin(angle) * t };
        if (!clearAt(p, 0.14)) continue;
        leap(s, b, { ...p, y: FLOOR_Y }, { after });
        return true;
      }
    }
    return false;
  }

  function refuge(s) {
    const P = state.player;
    const items = state.props.filter(p => !p.broken && roomOf(p.x) === roomOf(s.x));
    items.sort((a, c) => c.valueRub / (1 + flat(s, c)) - a.valueRub / (1 + flat(s, a)));
    for (const prop of items) {
      const dx = prop.x - P.x, dz = prop.z - P.z, len = Math.hypot(dx, dz) || 1;
      const extent = Math.max(prop.width, prop.depth) / 2 + 0.4;
      const spot = [{ x: prop.x + dx / len * extent, z: prop.z + dz / len * extent },
        { x: prop.x, z: prop.z + prop.depth / 2 + 0.35 }, { x: prop.x, z: prop.z - prop.depth / 2 - 0.35 }]
        .find(p => clearAt(p, 0.2));
      if (spot) return spot;
    }
    return { x: clamp(s.x + (s.x - P.x), -8.3, 8.3), z: clamp(s.z + (s.z - P.z), -5.5, 5.5) };
  }

  function assess(s, b) {
    const d = flat(s, state.player);
    const threat = clamp((4.2 - d) / 4.2, 0, 1) * (0.55 + 0.45 * clamp(speed / 3.2, 0, 1));
    return { d, danger: b.fear * 0.9 + threat * (s.on ? 0.6 : 1) };
  }

  function planFlee(s, b) {
    const P = state.player;
    b.fear = Math.max(b.fear, 0.55);
    const here = flat(s, P);
    const away = hopCandidates(s).filter(p => flat(p, P) > here + (s.on ? 0.4 : 0));
    if (s.on) {
      if (away.length && random() < 0.5 && planHop(s, b, pick(away), 'flee')) return;
      if (planDrop(s, b, P, 'flee')) return;
      s.mode = 'perch'; b.timer = 1; return;
    }
    if (away.length && random() < b.curious + 0.15) {
      away.sort((a, c) => flat(s, a) - flat(s, c));
      if (planHop(s, b, away[0], 'flee')) return;
    }
    b.goal = refuge(s); b.next = null; s.mode = 'flee'; b.timer = rnd(1.2, 2.6);
  }

  function pounce(s, b) {
    const P = state.player, dx = P.x - s.x, dz = P.z - s.z, len = Math.hypot(dx, dz) || 1;
    const run = Math.max(0, len - 0.65);
    let to = { x: s.x + dx / len * run, z: s.z + dz / len * run };
    if (!clearAt(to, 0.1)) to = { x: s.x, z: s.z };
    emit('jump', s, 1);
    b.pounceAt = state.elapsed + rnd(12, 20);
    leap(s, b, { ...to, y: FLOOR_Y }, { mode: 'jump', after: 'flee', arc: s.on ? 0.65 : 0.45,
      dur: clamp(0.35 + run * 0.18, 0.4, 0.8) });
  }

  function web(s, b) {
    s.mode = 'web'; b.timer = 0.8; b.webAt = state.elapsed + rnd(12, 22);
    const perch = s.on && perchOf(s.on);
    const radius = perch ? Math.min(0.5, 0.45 * Math.min(perch.x1 - perch.x0, perch.z1 - perch.z0)) : rnd(0.4, 0.7);
    spawnWeb(s.x, perch ? perch.y - FLOOR_Y + 0.035 : 0.035, s.z, radius);
  }

  function wander(s, b) {
    for (let i = 0; i < 8; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(1, 3.5);
      const p = { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r };
      if (roomOf(p.x) !== roomOf(s.x) || !clearAt(p, WALK_MARGIN + 0.05)) continue;
      b.goal = p; b.next = null; s.mode = 'wander'; b.timer = 6;
      return true;
    }
    return false;
  }

  function think(s, b) {
    const { d, danger } = assess(s, b);
    const P = state.player;
    if (danger > 0.5) return planFlee(s, b);
    if (state.elapsed >= b.pounceAt && b.bold > 0.45 && d > 0.9 && (state.mood === 'horror' || b.bold > 0.75)) {
      if (d < (s.on ? 2.4 : 1.9)) return pounce(s, b);
      if (!s.on && d < 3.6) { s.mode = 'stalk'; b.goal = { x: P.x, z: P.z }; b.timer = 3; return undefined; }
    }
    if (state.elapsed >= b.webAt) return web(s, b);
    const r = random();
    if (s.on) {
      const hops = hopCandidates(s);
      if (r < 0.4 && hops.length && planHop(s, b, pick(hops))) return undefined;
      if (r < 0.7 && planDrop(s, b, null, null)) return undefined;
      s.mode = 'perch'; b.timer = rnd(2, 5);
      return undefined;
    }
    const hops = hopCandidates(s).sort((a, c) => flat(s, a) - flat(s, c)).slice(0, 3);
    if (r < b.curious && hops.length && planHop(s, b, pick(hops))) return undefined;
    if (r < b.curious + 0.35 && wander(s, b)) return undefined;
    s.mode = 'idle'; b.timer = rnd(1, 3);
    return undefined;
  }

  function arrive(s, b) {
    const next = b.next && perchOf(b.next.perchId);
    b.next = null;
    if (next && (s.mode === 'approach' || s.mode === 'flee')) {
      leap(s, b, { ...nearest(next, s), y: next.y }, { perchId: next.id });
      return;
    }
    if (s.mode === 'flee') { s.mode = 'hide'; b.timer = rnd(2, 4.5); }
    else { s.mode = 'idle'; b.timer = rnd(0.4, 2); }
  }

  const INTERRUPTIBLE = new Set(['idle', 'wander', 'approach', 'perch', 'web', 'stalk']);
  const WEB_READY = new Set(['idle', 'perch', 'hide', 'wander']);
  function live(s, b, dt) {
    b.fear = Math.max(0, b.fear - dt * 0.15);
    if (s.on && !perchOf(s.on)) drop(s, b);
    if (FLIGHT.has(s.mode)) return fly(s, b, dt);
    if (s.mode === 'fall') return fall(s, b, dt);
    b.timer -= dt;
    if (state.elapsed >= b.webAt && WEB_READY.has(s.mode)) b.timer = 0;
    if (s.mode === 'hide' && flat(s, state.player) < 1) { b.fear = Math.max(b.fear, 0.8); b.timer = 0; }
    else if (INTERRUPTIBLE.has(s.mode) && assess(s, b).danger > 0.6) b.timer = 0;
    if (b.timer <= 0) think(s, b);
    if (SPEED[s.mode] === undefined || FLIGHT.has(s.mode)) return undefined;
    if (s.mode === 'stalk') {
      if (flat(s, state.player) < 1.6) return pounce(s, b);
      b.goal = { x: state.player.x, z: state.player.z };
    }
    if (!b.goal) { s.mode = 'idle'; b.timer = 0; return undefined; }
    if (walk(s, b.goal, SPEED[s.mode], dt)) return arrive(s, b);
    b.stuck.t += dt;
    if (b.stuck.t >= 0.6) { // blocked by furniture or a wall: choose again
      if (flat(s, b.stuck) < 0.05) { b.goal = null; b.next = null; s.mode = 'idle'; b.timer = 0; }
      b.stuck = { x: s.x, z: s.z, t: 0 };
    }
    return undefined;
  }

  return {
    add(spider, index) {
      brains.set(spider.id, { spider, timer: rnd(0.3, 1.8), webAt: 5 + index * 1.2 + rnd(0, 2), goal: null,
        next: null, leap: null, vy: 0, fear: 0, bold: rnd(0.2, 1), curious: rnd(0.3, 0.8),
        pounceAt: rnd(10, 20), stuck: { x: spider.x, z: spider.z, t: 0 } });
    },
    update(dt, playerSpeed) {
      computePerches();
      speed = playerSpeed;
      for (const b of brains.values()) if (b.spider.hp > 0) live(b.spider, b, dt);
    },
    /** A tool was used at `impact`; the victim (if any) is terrified, others nearby get nervous. */
    alarm(impact, { victimId = null, killed = false } = {}) {
      for (const b of brains.values()) {
        const s = b.spider;
        if (s.hp <= 0) continue;
        const dd = flat(s, impact);
        if (s.id === victimId) b.fear = 1;
        else if (dd < 3.5) b.fear = Math.max(b.fear, 0.6 + (1 - dd / 3.5) * 0.4);
        else if (killed && dd < 6) b.fear = Math.max(b.fear, 0.6);
        if (b.fear > 0.5 && (INTERRUPTIBLE.has(s.mode) || s.mode === 'hide')) b.timer = 0;
      }
    },
  };
}
