import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, createSimulation } from '../src/simulation.js';
import * as THREE from 'three';
import { createWorld } from '../src/world.js';

test('ИИ движется, чередует настроение и удаляет временную паутину', () => {
  const sim = createSimulation({ seed: 12 });
  const initial = sim.getState();
  const webIds = new Set();
  let expired = false;
  let horror = false;
  for (let i = 0; i < 600; i++) {
    const state = sim.step(0.05, initial.player);
    const live = new Set(state.webs.map(w => w.id));
    if ([...webIds].some(id => !live.has(id))) expired = true;
    state.webs.forEach(w => webIds.add(w.id));
    horror ||= state.mood === 'horror';
  }
  const end = sim.getState();
  assert.notDeepEqual(end.spiders, initial.spiders);
  assert.ok(horror);
  assert.equal(end.mood, 'calm');
  assert.ok(webIds.size > 0);
  assert.ok(expired);
});

test('3D-мир удаляет разбитые цели, создаёт 8 осколков и освобождает сцену', () => {
  const sim = createSimulation({ seed: 44 });
  const scene = new THREE.Scene();
  const initial = sim.getState();
  const world = createWorld(THREE, scene, initial);
  assert.equal(world.getTargets().length, initial.props.length + initial.spiders.length);
  const target = initial.props[0];
  const root = scene.getObjectByName('apartment-world');
  const children = root.children.length;
  sim.step(0, { x: target.x, y: 1.65, z: target.z + 1 });
  const broken = sim.attack({ weaponId: 'hammer', targetId: target.id, point: pointOf(target) });
  assert.ok(broken.props[0].broken);
  world.sync(broken, 0);
  assert.equal(world.getTargets().length, initial.props.length + initial.spiders.length - 1);
  assert.ok(world.getTargets().every(o => o.userData.targetId !== target.id));
  assert.equal(root.children.length, children - 1 + 8);
  world.sync(broken, 0);
  assert.equal(root.children.length, children - 1 + 8, 'Событие не дублирует осколки');
  world.dispose();
  assert.equal(scene.children.length, 0);
  assert.deepEqual(world.getTargets(), []);
});

test('все инструменты попадают raycast с высоты глаз; убитые пауки не цели', () => {
  for (const weapon of WEAPONS) {
    const sim = createSimulation({ seed: 75 });
    const initial = sim.getState();
    const spider = initial.spiders[0];
    const scene = new THREE.Scene();
    const world = createWorld(THREE, scene, initial);
    const origin = new THREE.Vector3(spider.x, 1.65, spider.z + 0.8);
    const destination = new THREE.Vector3(spider.x, spider.y, spider.z);
    const direction = destination.clone().sub(origin).normalize();
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(origin, direction, 0, weapon.range);
    const target = world.getTargets().find(o => o.userData.targetId === spider.id);
    const intersection = ray.intersectObject(target, true)[0];
    assert.ok(intersection, `${weapon.id}: видимая геометрия паука`);
    sim.step(0, origin);
    const after = sim.attack({ weaponId: weapon.id, targetId: spider.id, point: intersection.point });
    assert.ok(after.spiders[0].hp < spider.hp, `${weapon.id}: попадание из камеры`);
    world.dispose();
  }
  const sim = createSimulation({ seed: 75 });
  const scene = new THREE.Scene();
  const world = createWorld(THREE, scene, sim.getState());
  const weapon = WEAPONS.find(w => w.id === 'hammer');
  for (let i = 0; i < 6; i++) {
    const target = sim.getState().spiders.find(s => s.hp > 0);
    const state = hit(sim, weapon, target);
    world.sync(state, 0);
    assert.ok(world.getTargets().every(o => o.userData.targetId !== target.id));
    wait(sim, weapon.cooldown + 0.05);
  }
  assert.equal(sim.getState().status, 'won');
  world.dispose();
});

const SEED = 0x31ab902f;
const MAX_STEPS = 100_000;
const MAX_ATTACKS = 10_000;
const pointOf = ({ x, y, z }) => ({ x, y, z });
const health = (state) => ({
  props: state.props.map(({ id, hp, broken }) => ({ id, hp, broken })),
  spiders: state.spiders.map(({ id, hp }) => ({ id, hp })),
  damageRub: state.damageRub,
  aliveSpiders: state.aliveSpiders,
});

function wait(sim, seconds) {
  assert.ok(Number.isFinite(seconds) && seconds >= 0);
  const steps = Math.ceil(seconds / 0.05);
  assert.ok(steps <= MAX_STEPS, 'Ожидание превысило предохранитель цикла');
  let remaining = seconds;
  for (let i = 0; i < steps; i += 1) {
    const dt = Math.min(0.05, remaining);
    sim.step(dt, sim.getState().player);
    remaining = Math.max(0, remaining - dt);
  }
}

function hit(sim, weapon, target) {
  // Нулевая длительность позволяет прицелиться без движения ИИ.
  const point = pointOf(target);
  sim.step(0, point);
  return sim.attack({ weaponId: weapon.id, targetId: target.id, point });
}

function accountedDamage(state) {
  return state.props.filter((prop) => prop.broken)
    .reduce((sum, prop) => sum + prop.valueRub, 0);
}

function destroyProp(sim, weapon, id) {
  const initial = sim.getState().props.find((prop) => prop.id === id);
  const limit = Math.ceil(initial.hp / weapon.damage) + 2;
  assert.ok(Number.isFinite(limit) && limit <= MAX_ATTACKS);
  for (let i = 0; i < limit; i += 1) {
    const target = sim.getState().props.find((prop) => prop.id === id);
    if (target.broken) return sim.getState();
    hit(sim, weapon, target);
    if (!sim.getState().props.find((prop) => prop.id === id).broken) {
      wait(sim, weapon.cooldown + 0.05);
    }
  }
  assert.fail(`Предмет ${id} не разрушен за ${limit} попаданий`);
}

function assertPosition(point, state, label) {
  const { bounds, walls } = state.layout;
  for (const key of ['x', 'y', 'z']) assert.ok(Number.isFinite(point[key]), `${label}.${key}`);
  assert.ok(point.x >= bounds.minX && point.x <= bounds.maxX, `${label}: X вне квартиры`);
  assert.ok(point.z >= bounds.minZ && point.z <= bounds.maxZ, `${label}: Z вне квартиры`);
  assert.ok(point.y >= 0 && point.y <= 3, `${label}: Y вне квартиры`);
  for (const wall of walls) {
    const inside = Math.abs(point.x - wall.x) < wall.width / 2
      && Math.abs(point.z - wall.z) < wall.depth / 2
      && point.y < wall.height;
    assert.equal(inside, false, `${label}: спавн в стене ${wall.id}`);
  }
}

test('шесть уникальных инструментов имеют конечные рабочие параметры', () => {
  assert.equal(WEAPONS.length, 6);
  assert.deepEqual(new Set(WEAPONS.map(({ id }) => id)), new Set([
    'slipper', 'newspaper', 'spray', 'hammer', 'vacuum', 'extinguisher',
  ]));
  for (const weapon of WEAPONS) {
    assert.equal(typeof weapon.label, 'string');
    assert.ok(weapon.label.length > 0);
    for (const key of ['cooldown', 'range', 'damage']) {
      assert.ok(Number.isFinite(weapon[key]) && weapon[key] > 0, `${weapon.id}.${key}`);
    }
    assert.ok(Number.isFinite(weapon.radius) && weapon.radius >= 0);
  }
});

test('seed воспроизводит начальную расстановку и последовательность действий', () => {
  const a = createSimulation({ seed: SEED });
  const b = createSimulation({ seed: SEED });
  assert.deepEqual(a.getState(), b.getState());
  assert.equal(a.getState().seed, SEED);
  const other = createSimulation({ seed: SEED + 1 }).getState();
  assert.notDeepEqual(
    [a.getState().props, a.getState().spiders], [other.props, other.spiders],
    'Другой seed должен менять расстановку, а не только поле seed',
  );
  const target = a.getState().props[0];
  assert.deepEqual(hit(a, WEAPONS[0], target), hit(b, WEAPONS[0], target));
  for (let i = 0; i < 160; i += 1) {
    assert.deepEqual(a.step(0.05, a.getState().player), b.step(0.05, b.getState().player));
  }
});

test('снимки JSON-совместимы, не разделяют вложенные объекты и не меняются задним числом', () => {
  const sim = createSimulation({ seed: SEED });
  const snapshot = sim.getState();
  const expected = JSON.parse(JSON.stringify(snapshot));
  assert.deepEqual(snapshot, expected);
  snapshot.player.x += 100;
  snapshot.layout.bounds.minX -= 100;
  snapshot.layout.spawn.z += 100;
  snapshot.layout.walls[0].width += 100;
  snapshot.props[0].hp = -999;
  snapshot.spiders[0].hp = -999;
  snapshot.webs.push({ id: 'foreign' });
  snapshot.events.push({ id: 'foreign' });
  assert.deepEqual(sim.getState(), expected);
  const beforeStep = sim.getState();
  const beforeCopy = JSON.parse(JSON.stringify(beforeStep));
  const returned = sim.step(0.05, beforeStep.player);
  assert.deepEqual(beforeStep, beforeCopy);
  const afterStep = sim.getState();
  returned.player.x += 100;
  returned.spiders[0].hp = -999;
  assert.deepEqual(sim.getState(), afterStep);
  const shot = hit(sim, WEAPONS[0], afterStep.props[0]);
  const afterShot = sim.getState();
  shot.props[0].hp = -999;
  shot.events.length = 0;
  assert.deepEqual(sim.getState(), afterShot);
});

test('спавн игрока, мебели и пауков допустим и не попадает в стены', () => {
  for (const seed of [0, 1, SEED, 0xffffffff]) {
    const state = createSimulation({ seed }).getState();
    assert.equal(state.totalSpiders, 6);
    assert.equal(state.aliveSpiders, 6);
    assert.equal(state.spiders.length, 6);
    assert.equal(new Set([...state.props, ...state.spiders].map(({ id }) => id)).size,
      state.props.length + state.spiders.length);
    assertPosition(state.player, state, 'player');
    assertPosition(state.layout.spawn, state, 'spawn');
    for (const entity of [...state.props, ...state.spiders]) {
      assertPosition(entity, state, entity.id);
      assert.ok(Number.isFinite(entity.hp) && entity.hp > 0);
    }
  }
});

test('valueRub начисляется ровно один раз за каждый разрушенный предмет', () => {
  const sim = createSimulation({ seed: SEED });
  const weapon = [...WEAPONS].sort((a, b) => a.radius - b.radius)[0];
  const target = sim.getState().props.find((prop) => prop.valueRub > 0);
  assert.ok(target, 'Нужен предмет с положительной стоимостью');
  const destroyed = destroyProp(sim, weapon, target.id);
  assert.equal(destroyed.props.find((prop) => prop.id === target.id).broken, true);
  assert.equal(destroyed.damageRub, accountedDamage(destroyed));
  assert.ok(destroyed.damageRub >= target.valueRub);
  for (let i = 0; i < 4; i += 1) {
    wait(sim, weapon.cooldown + 0.05);
    const state = hit(sim, weapon, target);
    // Радиус может законно разбить соседей, но не списать стоимость цели повторно.
    assert.equal(state.damageRub, accountedDamage(state));
    assert.equal(state.events.filter((event) => event.type === 'break'
      && event.x === target.x && event.y === target.y && event.z === target.z).length, 0);
  }
});

test('попадание вне range не повреждает ни предметы, ни пауков', () => {
  for (const weapon of WEAPONS) {
    const sim = createSimulation({ seed: SEED });
    const initial = sim.getState();
    for (const target of [initial.props[0], initial.spiders[0]]) {
      // Проверка дальности point действует и при переданном targetId.
      sim.step(0, initial.player);
      const before = sim.getState();
      const farPoint = { x: before.player.x + weapon.range + 1, y: before.player.y, z: before.player.z };
      sim.attack({ weaponId: weapon.id, targetId: target.id, point: farPoint });
      assert.deepEqual(health(sim.getState()), health(before), weapon.id);
      wait(sim, weapon.cooldown + 0.05);
    }
    // Также проверяем настоящее попадание в удалённую цель, если такая есть.
    const { bounds } = initial.layout;
    const corners = [bounds.minX + 0.01, bounds.maxX - 0.01]
      .flatMap((x) => [bounds.minZ + 0.01, bounds.maxZ - 0.01].map((z) => ({ x, y: 1.5, z })));
    for (const target of [initial.props[0], initial.spiders[0]]) {
      const position = corners.sort((a, b) => Math.hypot(b.x - target.x, b.y - target.y, b.z - target.z)
        - Math.hypot(a.x - target.x, a.y - target.y, a.z - target.z))[0];
      sim.step(0, position);
      const before = sim.getState();
      const current = [...before.props, ...before.spiders].find(({ id }) => id === target.id);
      if (Math.hypot(before.player.x - current.x, before.player.y - current.y,
        before.player.z - current.z) <= weapon.range) continue;
      sim.attack({ weaponId: weapon.id, targetId: current.id, point: pointOf(current) });
      assert.deepEqual(health(sim.getState()), health(before), `${weapon.id}: удалённая цель`);
      wait(sim, weapon.cooldown + 0.05);
    }
  }
});

test('cooldown блокирует повторный удар и разрешает его после ожидания', () => {
  const weapon = [...WEAPONS].sort((a, b) => a.damage - b.damage || a.radius - b.radius)[0];
  const sim = createSimulation({ seed: SEED });
  const initial = sim.getState();
  hit(sim, weapon, initial.props[0]);
  assert.notDeepEqual(health(sim.getState()), health(initial), 'Первый удар должен сработать');
  const target = sim.getState().props.find((prop) => !prop.broken);
  assert.ok(target, 'Нужна живая цель для проверки cooldown');
  const before = health(sim.getState());
  hit(sim, weapon, target);
  assert.deepEqual(health(sim.getState()), before, 'Мгновенный повторный удар запрещён');
  wait(sim, weapon.cooldown + 0.05);
  const ready = health(sim.getState());
  hit(sim, weapon, sim.getState().props.find(({ id }) => id === target.id));
  assert.notDeepEqual(health(sim.getState()), ready, 'Удар после cooldown должен сработать');
});

test('уничтожение всех пауков даёт победу; restart полностью восстанавливает забег', () => {
  const sim = createSimulation({ seed: SEED, spiderCount: 6 });
  const initial = sim.getState();
  const weapon = [...WEAPONS].sort((a, b) => b.damage - a.damage)[0];
  destroyProp(sim, weapon, initial.props[0].id);
  wait(sim, weapon.cooldown + 0.05);
  const limit = initial.spiders.reduce((sum, spider) => sum + Math.ceil(spider.hp / weapon.damage), 0) + 6;
  assert.ok(Number.isFinite(limit) && limit <= MAX_ATTACKS);
  for (let i = 0; i < limit && sim.getState().aliveSpiders > 0; i += 1) {
    assert.equal(sim.getState().status, 'playing', 'Победа не должна наступать раньше последнего паука');
    const target = sim.getState().spiders.find((spider) => spider.hp > 0);
    assert.ok(target, 'Счётчик живых пауков должен соответствовать целям');
    hit(sim, weapon, target);
    if (sim.getState().aliveSpiders > 0) wait(sim, weapon.cooldown + 0.05);
  }
  const won = sim.getState();
  assert.equal(won.aliveSpiders, 0, 'Ограниченное число попаданий должно убить всех пауков');
  assert.equal(won.status, 'won');
  assert.ok(won.spiders.every((spider) => spider.hp <= 0));
  sim.restart({ seed: SEED });
  assert.deepEqual(sim.getState(), initial, 'Сброс seed, времени, ущерба, целей, событий и настроения');
  const fresh = createSimulation({ seed: SEED, spiderCount: 6 });
  assert.deepEqual(hit(sim, weapon, initial.props[0]), hit(fresh, weapon, initial.props[0]),
    'restart также сбрасывает скрытый cooldown и генератор событий');
  sim.restart({ seed: SEED + 1 });
  assert.deepEqual(sim.getState(), createSimulation({ seed: SEED + 1, spiderCount: 6 }).getState());
});
