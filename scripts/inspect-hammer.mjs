import { readFile } from 'node:fs/promises';
const base = new URL('../public/assets/models/wooden_hammer_01/', import.meta.url);
const json = JSON.parse(await readFile(new URL('wooden_hammer_01.gltf', base), 'utf8'));
const buffer = await readFile(new URL(json.buffers[0].uri, base));
const accessor = json.accessors[0], view = json.bufferViews[accessor.bufferView];
const points = Array.from({ length: accessor.count }, (_, i) => [0, 1, 2].map(axis => buffer.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0) + i * 12 + axis * 4)));
for (const [name, subset] of [['handle', points.filter(p => p[1] < -0.04)], ['head-front', points.filter(p => p[0] < -0.035 && p[1] > 0.08)], ['head-back', points.filter(p => p[0] > 0.035 && p[1] > 0.08)]]) {
  console.log(name, { count: subset.length, min: [0, 1, 2].map(a => Math.min(...subset.map(p => p[a]))), max: [0, 1, 2].map(a => Math.max(...subset.map(p => p[a]))) });
}
