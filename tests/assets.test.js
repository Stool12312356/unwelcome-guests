import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { fitModel } from '../src/assets.js';
import { createWorld } from '../src/world.js';
import { createSimulation } from '../src/simulation.js';
import { canOccupy } from '../src/movement.js';

const root = path.resolve('public/assets');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
// Node verifies the actual downloaded geometry. Browser acceptance covers JPEG decoding/PBR.
// Embedded original buffers avoid a second test HTTP server; only texture bindings are omitted.
if (!globalThis.ProgressEvent) globalThis.ProgressEvent = class ProgressEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } };
async function loadGeometry(entry) {
  const file = path.join(root, entry.path);
  const json = JSON.parse(await readFile(file, 'utf8'));
  for (const buffer of json.buffers || []) {
    assert.ok(!buffer.uri.includes('://') && !buffer.uri.includes('..'));
    buffer.uri = `data:application/octet-stream;base64,${(await readFile(path.join(path.dirname(file), buffer.uri))).toString('base64')}`;
  }
  json.materials = (json.materials || []).map(mat => ({ name: mat.name, doubleSided: mat.doubleSided, pbrMetallicRoughness: { roughnessFactor: 0.8 } }));
  json.images = []; json.textures = [];
  return (await new GLTFLoader().parseAsync(JSON.stringify(json), '')).scene;
}
const models = new Map(await Promise.all(Object.entries(manifest.models).map(async ([key, entry]) => [key, await loadGeometry(entry)])));
const assets = { models, surfaces: new Map() };

function disposeTemplates() {
  const geometries = new Set(), materials = new Set();
  models.forEach(model => model.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); [o.material].flat().forEach(m => materials.add(m)); } }));
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
test.after(disposeTemplates);

test('CC0-модели и текстуры локальны, зависимости присутствуют, SHA-256 совпадает', async () => {
  assert.equal(manifest.license, 'CC0-1.0');
  assert.equal(Object.keys(manifest.models).length, 10);
  assert.ok(models.has('facade'));
  for (const file of manifest.files) {
    const bytes = await readFile(path.join(root, file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  }
  for (const entry of Object.values(manifest.models)) {
    const file = path.join(root, entry.path);
    const json = JSON.parse(await readFile(file, 'utf8'));
    for (const dep of [...(json.buffers || []), ...(json.images || [])]) {
      assert.ok(dep.uri && !/^(https?:|\/)|\.\./.test(dep.uri), dep.uri);
      const bytes = await readFile(path.join(path.dirname(file), dep.uri));
      assert.ok(bytes.length > 0);
    }
    assert.equal(json.asset.version, '2.0');
  }
});

test('настоящие glTF вписаны в габариты без деформации, стоят на полу и размечены targetId', () => {
  const state = createSimulation({ seed: 44 }).getState();
  const scene = new THREE.Scene();
  const world = createWorld(THREE, scene, state, assets);
  scene.updateMatrixWorld(true);
  for (const prop of state.props) {
    const target = world.getTargets().find(t => t.userData.targetId === prop.id);
    const bounds = new THREE.Box3().setFromObject(target), size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x <= prop.width + 0.002 && size.y <= prop.height + 0.002 && size.z <= prop.depth + 0.002, prop.kind);
    assert.ok(Math.abs(bounds.min.y) < 0.002, `${prop.kind}: основание на полу`);
    target.traverse(o => assert.equal(o.userData.targetId, prop.id));
    if (models.has(prop.kind)) assert.ok(target.getObjectByName(`asset:${prop.kind}`));
  }
  const a = fitModel(models.get('chair'), { width: 1, height: 1, depth: 1 });
  assert.equal(a.scale.x, a.scale.y); assert.equal(a.scale.y, a.scale.z);
  world.dispose();
});

test('raycast по реальным импортированным поверхностям наносит урон, ломает и удаляет цель', () => {
  for (const kind of ['tv', 'vase', 'chair', 'table', 'box', 'sofa', 'cabinet']) {
    const sim = createSimulation({ seed: 321 });
    let state = sim.getState();
    for (let seed = 0; seed < 100 && !state.props.some(p => p.kind === kind); seed++) state = sim.restart({ seed });
    const prop = state.props.find(p => p.kind === kind);
    assert.ok(prop, `генератор содержит ${kind}`);
    const scene = new THREE.Scene();
    const world = createWorld(THREE, scene, state, assets);
    const target = world.getTargets().find(t => t.userData.targetId === prop.id);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(target);
    const center = bounds.getCenter(new THREE.Vector3());
    // Furniture can be hollow at its centre (chair legs/table). Aim at several actual heights.
    let hit, origin;
    for (const h of [0.85, 0.98, 0.55, 0.25]) {
      const aim = new THREE.Vector3(center.x, bounds.min.y + (bounds.max.y - bounds.min.y) * h, center.z);
      origin = new THREE.Vector3(center.x, 1.65, bounds.max.z + 0.5);
      hit = new THREE.Raycaster(origin, aim.clone().sub(origin).normalize(), 0, 2.4).intersectObjects(world.getTargets(), true)[0];
      if (hit?.object.userData.targetId === prop.id) break;
    }
    assert.equal(hit?.object.userData.targetId, prop.id, `${kind}: луч попал в видимый меш`);
    sim.step(0, origin);
    state = sim.attack({ weaponId: 'hammer', targetId: hit.object.userData.targetId, point: hit.point });
    assert.ok(state.props.find(p => p.id === prop.id).hp < prop.hp, kind);
    for (let i = 0; i < 20; i++) sim.step(0.05, origin);
    state = sim.attack({ weaponId: 'hammer', targetId: prop.id, point: hit.point });
    world.sync(state);
    assert.ok(state.props.find(p => p.id === prop.id).broken, kind);
    assert.ok(!world.getTargets().some(t => t.userData.targetId === prop.id));
    world.dispose();
  }
});

test('restart не дублирует импортированные цели и не освобождает общие ресурсы', () => {
  const sim = createSimulation({ seed: 101 });
  const scene = new THREE.Scene();
  let disposed = 0;
  models.get('chair').traverse(o => { if (o.isMesh) o.geometry.addEventListener('dispose', () => disposed++); });
  for (let i = 0; i < 3; i++) {
    const world = createWorld(THREE, scene, sim.getState(), assets);
    world.sync(sim.restart({ seed: 102 + i }));
    const targets = world.getTargets();
    assert.equal(targets.length, 21);
    assert.equal(new Set(targets.map(t => t.userData.targetId)).size, 21);
    world.dispose(); world.dispose();
    assert.equal(scene.children.length, 0);
    assert.equal(disposed, 0, 'Импортированными ресурсами владеет библиотека, не мир');
  }
});

test('мебель блокирует ходьбу, разрушенная освобождает место; коридор и двери свободны', () => {
  for (let seed = 0; seed < 30; seed++) {
    const state = createSimulation({ seed }).getState();
    for (let x = -8.6; x <= 8.6; x += 0.15) assert.ok(canOccupy(state, x, 0));
    for (const door of state.layout.doors) for (const offset of [-0.8, 0, 0.8]) assert.ok(canOccupy(state, door.x, door.z + offset));
    for (const prop of state.props) {
      assert.equal(canOccupy(state, prop.x, prop.z), false, prop.kind);
      prop.broken = true;
      assert.equal(canOccupy(state, prop.x, prop.z), true, prop.kind);
      prop.broken = false;
    }
    for (const spider of state.spiders) assert.ok(!state.props.some(prop => Math.abs(prop.x - spider.x) < prop.width / 2 + 0.23 && Math.abs(prop.z - spider.z) < prop.depth / 2 + 0.23));
    assert.equal(canOccupy(state, -3, 3), false);
    assert.equal(canOccupy(state, 9, 0), false);
  }
});
