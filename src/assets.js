import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Clone geometry/material references; the asset library, not each world, owns them. */
export function fitModel(template, { width, height, depth }, { rotation = 0 } = {}) {
  const group = new THREE.Group();
  const model = template.clone(true);
  model.rotation.y += rotation;
  group.add(model);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(width / size.x, height / size.y, depth / size.z);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Некорректные габариты модели');
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  group.scale.setScalar(scale);
  // Descriptor positions use the centre of the collision envelope; models rest on its bottom.
  group.position.y = -height / 2;
  group.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData = {};
  });
  return group;
}

/** Assets are loaded once from our own origin; restarting never re-downloads them. */
export async function loadGameAssets(onProgress = () => {}) {
  const base = `${import.meta.env.BASE_URL}assets/`;
  const response = await fetch(`${base}manifest.json`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Не удалось прочитать список моделей');
  const manifest = await response.json();
  const manager = new THREE.LoadingManager();
  const gltf = new GLTFLoader(manager);
  const textureLoader = new THREE.TextureLoader(manager);
  const models = new Map();
  const surfaces = new Map();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  let done = 0;
  const total = Object.keys(manifest.models).length + Object.keys(manifest.surfaces).length * 3;
  const progress = () => onProgress(++done, total);
  const tasks = Object.entries(manifest.models).map(async ([key, entry]) => {
    const result = await gltf.loadAsync(base + entry.path);
    result.scene.traverse(object => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      for (const mat of [object.material].flat()) {
        materials.add(mat);
        mat.envMapIntensity = 0.35;
        for (const value of Object.values(mat)) if (value?.isTexture) {
          value.anisotropy = 4;
          textures.add(value);
        }
        // Poly Haven's ARM packs ambient occlusion in R, roughness in G, metallic in B.
        if (!mat.aoMap && mat.roughnessMap?.name.includes('arm')) mat.aoMap = mat.roughnessMap;
      }
    });
    models.set(key, result.scene);
    progress();
  });
  for (const [key, entry] of Object.entries(manifest.surfaces)) {
    const maps = {};
    surfaces.set(key, maps);
    for (const [channel, path] of Object.entries(entry.maps)) tasks.push((async () => {
      const texture = await textureLoader.loadAsync(base + path);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      if (channel === 'map') texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      maps[channel] = texture;
      progress();
    })());
  }
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    geometries.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
    textures.forEach(item => { item.dispose(); item.source.data?.close?.(); });
    models.clear(); surfaces.clear();
  }
  const results = await Promise.allSettled(tasks);
  const failed = results.filter(item => item.status === 'rejected');
  if (failed.length) {
    dispose();
    throw new Error(`Не загружено ресурсов: ${failed.length}. Проверьте соединение с локальным сервером.`);
  }
  return { models, surfaces, manifest, dispose };
}
