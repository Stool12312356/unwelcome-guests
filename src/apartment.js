import * as THREE from 'three';
import { fitModel } from './assets.js';
import { createCity } from './city.js';

/** Static architecture owns its resources. Imported furniture is owned by the asset library. */
export function createApartment(parent, layout, assets) {
  const root = new THREE.Group();
  root.name = 'apartment-architecture';
  parent.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(unit);
  function mat(color, options = {}) {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...options });
    materials.add(value);
    return value;
  }
  function surface(key, color, repeat) {
    const maps = {};
    for (const [channel, source] of Object.entries(assets?.surfaces.get(key) || {})) {
      const texture = source.clone();
      texture.repeat.set(...repeat);
      textures.add(texture);
      maps[channel] = texture;
    }
    return mat(color, { ...maps, normalScale: new THREE.Vector2(0.4, 0.4) });
  }
  function box(material, x, y, z, w, h, d, casts = true) {
    const mesh = new THREE.Mesh(unit, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = casts; mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  const trim = mat(0x423b30), paintedTrim = mat(0x8b8577), brass = mat(0x6e5940, { metalness: 0.65, roughness: 0.38 });
  const lowerWall = surface('plaster', 0x4c5754, [3, 0.65]);
  const ceiling = surface('plaster', 0xa4a095, [3, 6]);
  const glow = mat(0xe4c792, { emissive: 0xffc879, emissiveIntensity: 1.8 });
  const windowGlass = mat(0xa7bbc2, { transparent: true, opacity: 0.065, depthWrite: false, roughness: 0.18, side: THREE.DoubleSide });
  const curtain = mat(0x5b534b, { side: THREE.DoubleSide, roughness: 1 });
  const city = createCity(root, assets);
  const roomColors = layout.rooms?.map(r => r.wall) || [0xc0af94, 0x929f99, 0xa59891];
  for (let i = 0; i < 3; i++) {
    const x = -6 + i * 6;
    const floor = surface('floor', layout.rooms?.[i].floor ?? (i === 1 ? 0xa5ada8 : 0xc1ac90), [2, 4]);
    floor.roughness = 0.82;
    box(floor, x, -0.07, 0, 6, 0.14, 12, false);
    box(ceiling, x, 3.06, 0, 6, 0.12, 12, false);
    const roomWall = surface('plaster', roomColors[i], [3, 1.5]);
    for (const z of [-6, 6]) {
      if (z > 0) box(roomWall, x, 1.5, z, 6, 3, 0.2, false);
      else {
        // Visual opening only: the authoritative north-wall collision still blocks escape/shots.
        box(roomWall, x, 0.53, z, 6, 1.06, 0.2, false);
        box(roomWall, x, 2.85, z, 6, 0.3, 0.2, false);
        for (const side of [-1, 1]) box(roomWall, x + side * 2.15, 1.88, z, 1.7, 1.64, 0.2, false);
      }
      box(lowerWall, x, 0.5, z > 0 ? 5.885 : -5.885, 6, 1, 0.035, false);
      box(trim, x, 1.03, z > 0 ? 5.85 : -5.85, 6, 0.055, 0.045);
      box(paintedTrim, x, 0.09, z > 0 ? 5.84 : -5.84, 6, 0.18, 0.055);
      box(paintedTrim, x, 2.92, z > 0 ? 5.84 : -5.84, 6, 0.12, 0.08);
    }
    // Four frame pieces, not an opaque box behind the glazing.
    for (const side of [-1, 1]) box(trim, x + side * 1.27, 1.9, -5.86, 0.12, 1.75, 0.3);
    for (const y of [1.08, 2.72]) box(trim, x, y, -5.86, 2.65, 0.11, 0.3);
    const glass = box(windowGlass, x, 1.9, -5.92, 2.43, 1.53, 0.015, false);
    glass.name = `window-glass-${i}`;
    box(paintedTrim, x, 1.9, -5.66, 0.065, 1.6, 0.06);
    box(paintedTrim, x, 2, -5.65, 2.48, 0.06, 0.06);
    box(paintedTrim, x, 1.06, -5.58, 2.85, 0.09, 0.45);
    box(brass, x, 2.85, -5.5, 3.5, 0.035, 0.035);
    for (const side of [-1, 1]) for (let pleat = 0; pleat < 5; pleat++) {
      const fold = box(curtain, x + side * (1.35 + pleat * 0.08), 1.6, -5.51 + (pleat % 2) * 0.07, 0.09, 2.4, 0.08);
      fold.rotation.y = side * 0.15;
    }
    // Radiator fins are instanced: one draw call rather than one per fin.
    const radiator = new THREE.InstancedMesh(unit, paintedTrim, 12);
    const transform = new THREE.Object3D();
    for (let n = 0; n < 12; n++) {
      transform.position.set(x - 0.77 + n * 0.14, 0.5, -5.66);
      transform.scale.set(0.09, 0.65, 0.15); transform.updateMatrix();
      radiator.setMatrixAt(n, transform.matrix);
    }
    radiator.castShadow = true; radiator.receiveShadow = true; root.add(radiator);
    const lamp = assets?.models.get('lamp');
    if (lamp) {
      const model = fitModel(lamp, { width: 0.5, height: 0.64, depth: 0.5 });
      model.position.set(x, 2.36, 0);
      // The bulb is inside its shade; shadowing the shade itself would black out the room.
      model.traverse(object => { object.castShadow = false; });
      root.add(model);
    }
    box(glow, x, 2.4, 0, 0.23, 0.018, 0.23, false);
  }
  for (const wall of layout.walls.filter(w => w.id !== 'north' && w.id !== 'south')) {
    const color = roomColors[Math.max(0, Math.min(2, Math.floor((wall.x + 9) / 6)))];
    const wallMat = surface('plaster', color, [wall.depth / 2, 1.5]);
    box(wallMat, wall.x, 1.5, wall.z, wall.width, wall.height, wall.depth);
    box(lowerWall, wall.x, 0.5, wall.z, wall.width + 0.025, 1, wall.depth);
    box(trim, wall.x, 1.03, wall.z, wall.width + 0.06, 0.055, wall.depth);
    box(paintedTrim, wall.x, 0.09, wall.z, wall.width + 0.075, 0.18, wall.depth);
    box(paintedTrim, wall.x, 2.92, wall.z, wall.width + 0.07, 0.12, wall.depth);
  }
  for (const door of layout.doors || [{ x: -3, z: 0, width: 2.4 }, { x: 3, z: 0, width: 2.4 }]) {
    const { x, z, width } = door;
    for (const side of [-1, 1]) box(trim, x, 1.35, z + side * (width / 2 + 0.02), 0.3, 2.7, 0.1);
    box(trim, x, 2.7, z, 0.3, 0.12, width + 0.14);
    box(paintedTrim, x, 2.87, z, 0.23, 0.24, width);
  }
  const ambient = new THREE.HemisphereLight(0xa8bdca, 0x4b3827, 0.4);
  root.add(ambient);
  const roomLights = [-6, 0, 6].map(x => {
    const light = new THREE.SpotLight(0xffd4a1, 48, 15, 1.33, 0.7, 2);
    light.position.set(x, 2.3, 0); light.target.position.set(x, 0, 0);
    light.castShadow = true; light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0003; light.shadow.normalBias = 0.035;
    light.shadow.camera.near = 0.15; light.shadow.camera.far = 16;
    root.add(light, light.target);
    const moon = new THREE.SpotLight(0x9eb8d1, 18, 13, 0.9, 0.8, 2);
    moon.position.set(x, 2.3, -5.5); moon.target.position.set(x + 1, 0, 1.7);
    root.add(moon, moon.target);
    return light;
  });
  const warm = new THREE.Color(0xffd4a1), cold = new THREE.Color(0xb2c7d4);
  return {
    update(blend, time) {
      ambient.intensity = THREE.MathUtils.lerp(0.68, 0.4, blend);
      roomLights.forEach((light, i) => {
        light.color.copy(warm).lerp(cold, blend * 0.7);
        light.intensity = THREE.MathUtils.lerp(48, 17, blend) * (1 - blend * 0.025 * Math.sin(time * 1.8 + i));
      });
      glow.emissiveIntensity = THREE.MathUtils.lerp(1.8, 0.65, blend);
    },
    dispose() {
      root.removeFromParent();
      city.dispose();
      roomLights.forEach(light => light.dispose());
      root.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
      textures.forEach(value => value.dispose()); root.clear();
    },
  };
}
