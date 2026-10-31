// Curated CC0 assets from Poly Haven. Run manually, never from the game/build.
// Existing files are reused only when their checksum agrees; local edits are not overwritten.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve('public/assets');
const headers = { 'User-Agent': 'UninvitedGuests-GameJam/1.0 (local CC0 asset preparation)' };
const models = {
  chair: 'painted_wooden_chair_01', table: 'wooden_table_02', tv: 'Television_01',
  vase: 'ceramic_vase_01', box: 'cardboard_box_01', sofa: 'sofa_02',
  cabinet: 'painted_wooden_cabinet', lamp: 'modern_ceiling_lamp_01', hammer: 'wooden_hammer_01',
  facade: 'modular_urban_apartments_facade',
};
const surfaces = { floor: 'old_wood_floor', plaster: 'grey_plaster_03' };
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
async function get(url, json = true) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['api.polyhaven.com', 'dl.polyhaven.org'].includes(u.hostname)) throw new Error(`Unexpected host: ${url}`);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return json ? response.json() : Buffer.from(await response.arrayBuffer());
}
async function download(relative, source) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Unsafe asset path');
  let bytes;
  try { bytes = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (bytes) {
    if (hash(bytes, 'md5') !== source.md5.padStart(32, '0')) throw new Error(`Local file differs: ${relative}`);
  } else {
    bytes = await get(source.url, false);
    if (hash(bytes, 'md5') !== source.md5.padStart(32, '0')) throw new Error(`Checksum mismatch: ${relative}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  return { path: relative.replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes), source: source.url };
}
const manifest = { license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license', models: {}, surfaces: {}, files: [] };
const modelCatalog = await get('https://api.polyhaven.com/assets?t=models');
const textureCatalog = await get('https://api.polyhaven.com/assets?t=textures');
for (const [key, id] of Object.entries(models)) {
  const files = await get(`https://api.polyhaven.com/files/${id}`);
  const gltf = files.gltf?.['1k']?.gltf;
  if (!gltf) throw new Error(`No 1K glTF for ${id}`);
  const folder = `models/${id}`;
  const entry = `${folder}/${id}.gltf`;
  manifest.files.push(await download(entry, gltf));
  for (const [relative, file] of Object.entries(gltf.include)) manifest.files.push(await download(`${folder}/${relative}`, file));
  manifest.models[key] = { id, path: entry, source: `https://polyhaven.com/a/${id}`, authors: modelCatalog[id].authors, polycount: modelCatalog[id].polycount };
  console.log(`Model ready: ${key} (${id})`);
}
for (const [key, id] of Object.entries(surfaces)) {
  const files = await get(`https://api.polyhaven.com/files/${id}`);
  const entry = { id, source: `https://polyhaven.com/a/${id}`, authors: textureCatalog[id].authors, maps: {} };
  for (const [map, channel] of Object.entries({ map: 'Diffuse', normalMap: 'nor_gl', roughnessMap: 'Rough' })) {
    const file = files[channel]?.['2k']?.jpg;
    if (!file) throw new Error(`Missing ${id}/${channel}`);
    const relative = `surfaces/${id}/${map}.jpg`;
    manifest.files.push(await download(relative, file));
    entry.maps[map] = relative;
  }
  manifest.surfaces[key] = entry;
  console.log(`Surface ready: ${key} (${id})`);
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifest.files.length} verified files; ${(manifest.files.reduce((n, f) => n + f.bytes, 0) / 1048576).toFixed(1)} MiB`);
