import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { generateLevel, validateLevel, ROOM_TEMPLATES } from '../src/levels.js';
import { createSimulation } from '../src/simulation.js';
import { createWorld } from '../src/world.js';
import { canOccupy } from '../src/movement.js';

function rng(seed) { let n = seed; return () => ((n = Math.imul(n, 1664525) + 1013904223 >>> 0) / 4294967296); }
test('2000 seed: заготовки без пересечений, свободный маршрут через все комнаты', () => {
  const variants = new Set(), templates = new Set();
  for (let seed = 0; seed < 2000; seed++) {
    const level = generateLevel(rng(seed));
    assert.deepEqual(validateLevel(level), [], `seed=${seed}`);
    variants.add(level.layout.variant);
    level.layout.rooms.forEach(r => templates.add(r.templateId));
    for (let x = -8.5; x < 8.5; x += 0.1) assert.ok(canOccupy(level, x, 0));
    assert.ok(canOccupy(level, level.layout.spawn.x, level.layout.spawn.z));
  }
  assert.ok(variants.size > 200);
  assert.equal(templates.size, ROOM_TEMPLATES.length);
});

test('пауки уменьшены вдвое; визуальный силуэт остаётся доступен для raycast', () => {
  const state = createSimulation({ seed: 3 }).getState();
  const scene = new THREE.Scene(), world = createWorld(THREE, scene, state);
  scene.updateMatrixWorld(true);
  const spider = world.getTargets().find(o => o.userData.targetId.startsWith('spider-'));
  const size = new THREE.Box3().setFromObject(spider).getSize(new THREE.Vector3());
  assert.ok(size.x < 0.5 && size.y < 0.2);
  assert.equal(state.spiders[0].y, 0.07);
  world.dispose();
});

test('ИИ запрыгивает, сидит на мебели, плетёт паутину; разрушенная опора вызывает падение', () => {
  let perched = 0, leaped = 0, webs = 0, falls = 0;
  const modes = new Set();
  for (let seed = 0; seed < 12; seed++) {
    const sim = createSimulation({ seed });
    let state = sim.getState(), brokenSupport = false;
    for (let i = 0; i < 1600; i++) {
      state = sim.step(0.05, { x: -8, y: 1.65, z: 0 });
      for (const s of state.spiders.filter(s => s.hp > 0)) {
        assert.ok(Number.isFinite(s.y) && s.y >= 0.07 - 1e-9);
        modes.add(s.mode);
        if (s.mode === 'leap') leaped++;
        if (s.mode === 'fall') falls++;
        if (s.on) {
          perched++;
          const prop = state.props.find(p => p.id === s.on);
          assert.ok(prop && !prop.broken);
          assert.ok(Math.abs(s.y - (prop.y + prop.height / 2 + 0.07)) < 1e-8);
          assert.ok(Math.abs(s.x - prop.x) <= prop.width / 2 && Math.abs(s.z - prop.z) <= prop.depth / 2);
          if (!brokenSupport && prop.hp <= 120) {
            sim.step(0, { x: prop.x, y: 1.65, z: prop.z });
            const result = sim.attack({ weaponId: 'hammer', targetId: prop.id, point: prop });
            if (result.props.find(p => p.id === prop.id).broken) brokenSupport = true;
          }
        }
      }
      webs += state.events.filter(e => e.type === 'web').length;
    }
  }
  assert.ok(perched > 0 && leaped > 0 && webs > 0 && falls > 0, JSON.stringify({ perched, leaped, webs, falls }));
  for (const mode of ['wander', 'flee', 'hide', 'web']) assert.ok(modes.has(mode), mode);
});

test('принятый удар пугает находящихся рядом пауков без дополнительного урона', () => {
  const sim = createSimulation({ seed: 9 });
  const s = sim.getState().spiders[0];
  sim.step(0, { x: s.x, y: 1.65, z: s.z + 0.5 });
  let state = sim.attack({ weaponId: 'newspaper', targetId: s.id, point: s });
  assert.equal(state.spiders[0].hp, s.hp - 25);
  state = sim.step(0.05, state.player);
  assert.ok(['flee', 'leap', 'hide'].includes(state.spiders[0].mode));
});
