import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Hammer glTF is upright (+Y), with its flat striking face on -X. Grip is on the lower handle.
export const HAMMER_GRIP = Object.freeze([0, -0.085, 0]);
export const HAMMER_YAW = -Math.PI / 2;
export const HAMMER_SCALE = 1.5;

/** Authored first-person props: actual silhouettes, seams, labels, valves, hoses and a grip anchor. */
export function createToolModel(id, assets, textures = {}) {
  const root = new THREE.Group(); root.name = `tool:${id}`;
  const geometries = new Set(), materials = new Set();
  const mat = (color, options = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.64, ...options }); materials.add(m); return m;
  };
  const rubber = mat(0x252a28, { roughness: 0.9 }), steel = mat(0x9a9e9a, { metalness: 0.8, roughness: 0.32 });
  const darkSteel = mat(0x383e3e, { metalness: 0.6, roughness: 0.4 });
  function mesh(geo, material, p = [0, 0, 0], parent = root) {
    geometries.add(geo); const o = new THREE.Mesh(geo, material); o.position.set(...p); parent.add(o); return o;
  }
  const rounded = (w, h, d, material, p, radius = 0.012) => mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, p);
  const cylinder = (r, rb, h, material, p, open = false) => mesh(new THREE.CylinderGeometry(r, rb, h, 32, 1, open), material, p);
  function tube(points, r, material) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 32, r, 8, false), material);
  }
  function ring(r, t, material, p) { const o = mesh(new THREE.TorusGeometry(r, t, 8, 32), material, p); o.rotation.x = Math.PI / 2; return o; }
  const muzzle = new THREE.Object3D(); muzzle.name = 'emitter'; root.add(muzzle);
  const contact = new THREE.Object3D(); contact.name = 'contact'; root.add(contact);
  let gripRadius = 0.025, actuator = null;
  if (id === 'hammer') {
    const template = assets?.models.get('hammer');
    if (template) {
      const pivot = new THREE.Group(); pivot.name = 'hammer-grip';
      pivot.rotation.y = HAMMER_YAW; pivot.scale.setScalar(HAMMER_SCALE);
      const imported = template.clone(true); imported.position.set(...HAMMER_GRIP.map(v => -v));
      imported.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = false;
        o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
        for (const m of [o.material].flat()) { m.depthTest = m.depthWrite = true; materials.add(m); }
      });
      pivot.add(imported); root.add(pivot);
    } else {
      cylinder(0.017, 0.023, 0.41, mat(0x916b43), [0, 0.11, 0]);
      rounded(0.065, 0.065, 0.2, steel, [0, 0.31, 0]);
    }
    contact.position.set(0, 0.341, -0.081);
    gripRadius = 0.022;
  } else if (id === 'slipper') {
    const outline = new THREE.Shape();
    outline.moveTo(-0.056, -0.1); outline.bezierCurveTo(-0.09, -0.13, -0.096, -0.04, -0.091, 0.12);
    outline.bezierCurveTo(-0.091, 0.26, 0.096, 0.26, 0.096, 0.12);
    outline.bezierCurveTo(0.1, -0.04, 0.07, -0.12, -0.056, -0.1);
    const soleGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.019, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 3, steps: 1, curveSegments: 20 });
    mesh(soleGeo, rubber, [0, 0, -0.015]);
    const lining = mesh(soleGeo.clone(), mat(0x9b937d, { map: textures.fabric }), [0, 0, 0.006]); lining.scale.set(0.92, 0.96, 0.38);
    // Open slipper vamp, not a closed box: heel opening and arch remain visible.
    const vertices = [], uv = [], indices = [];
    for (let row = 0; row <= 8; row++) for (let j = 0; j <= 20; j++) {
      const a = Math.PI * j / 20;
      vertices.push(Math.cos(a) * 0.089, 0.065 + row / 8 * 0.13, 0.027 + Math.sin(a) * 0.07);
      uv.push(j / 20, row / 8);
      if (row < 8 && j < 20) { const v = row * 21 + j; indices.push(v, v + 21, v + 1, v + 1, v + 21, v + 22); }
    }
    const vamp = new THREE.BufferGeometry(); vamp.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    vamp.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); vamp.setIndex(indices); vamp.computeVertexNormals();
    mesh(vamp, mat(0x6a7775, { map: textures.fabric, side: THREE.DoubleSide }));
    for (const y of [0.065, 0.19]) tube(Array.from({ length: 17 }, (_, j) => [Math.cos(j / 16 * Math.PI) * 0.089, y, 0.028 + Math.sin(j / 16 * Math.PI) * 0.07]), 0.003, mat(0xb5b09b));
    for (let n = 0; n < 9; n++) rounded(0.12, 0.007, 0.005, darkSteel, [0, -0.06 + n * 0.03, -0.021], 0.002);
    contact.position.set(0, 0.21, -0.025); gripRadius = 0.025;
  } else if (id === 'newspaper') {
    const paper = mat(0xe2dcc6, { map: textures.newspaper, roughness: 0.96 });
    // Slightly tapered roll with real nested paper edges and a loose outer leaf.
    cylinder(0.037, 0.026, 0.43, paper, [0, 0.13, 0]);
    for (let i = 0; i < 6; i++) ring(0.01 + i * 0.0045, 0.0009, mat(i % 2 ? 0x807f70 : 0xe3dec9), [0, 0.3455 + i * 0.0004, 0]);
    const flap = mesh(new THREE.CylinderGeometry(0.041, 0.03, 0.38, 24, 1, true, 0.2, 3.6), paper, [0, 0.14, 0]);
    flap.rotation.y = -0.8;
    ring(0.03, 0.002, rubber, [0, 0.037, 0]); contact.position.set(0, 0.345, 0); gripRadius = 0.029;
  } else if (id === 'spray') {
    gripRadius = 0.046;
    const enamel = mat(0xb0af83, { metalness: 0.35, roughness: 0.44 });
    cylinder(0.046, 0.046, 0.21, enamel, [0, 0.035, 0]);
    cylinder(0.0464, 0.0464, 0.162, mat(0xffffff, { map: textures.spray }), [0, 0.032, 0]);
    cylinder(0.024, 0.046, 0.025, steel, [0, 0.152, 0]);
    for (const y of [-0.071, 0.139]) ring(0.044, 0.003, steel, [0, y, 0]);
    cylinder(0.012, 0.012, 0.018, darkSteel, [0, 0.17, 0]);
    actuator = rounded(0.035, 0.019, 0.036, rubber, [0, 0.183, -0.004], 0.004);
    const nozzle = cylinder(0.005, 0.006, 0.012, darkSteel, [0, 0.181, -0.026]); nozzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.181, -0.034);
  } else if (id === 'vacuum') {
    gripRadius = 0.027;
    const teal = mat(0x46655f, { roughness: 0.44, metalness: 0.12 });
    rounded(0.055, 0.145, 0.062, rubber, [0, -0.008, 0]);
    rounded(0.12, 0.115, 0.25, teal, [0, 0.136, -0.025], 0.035);
    rounded(0.123, 0.035, 0.21, darkSteel, [0, 0.108, -0.025]);
    for (let n = 0; n < 7; n++) rounded(0.104, 0.0035, 0.008, rubber, [0, 0.169, 0.03 - n * 0.015], 0.001);
    const cup = cylinder(0.049, 0.052, 0.12, mat(0x9baca2, { roughness: 0.33, transparent: true, opacity: 0.65, depthWrite: false }), [0, 0.132, -0.2]); cup.rotation.x = Math.PI / 2;
    const filter = cylinder(0.031, 0.031, 0.105, mat(0xbcb5a0), [0, 0.132, -0.2]); filter.rotation.x = Math.PI / 2;
    for (const z of [-0.26, -0.14]) { const r = ring(0.05, 0.005, rubber, [0, 0.132, z]); r.rotation.x = 0; }
    const neck = cylinder(0.024, 0.038, 0.14, darkSteel, [0, 0.132, -0.33]); neck.rotation.x = Math.PI / 2;
    rounded(0.105, 0.025, 0.075, rubber, [0, 0.132, -0.419], 0.008);
    rounded(0.082, 0.01, 0.004, mat(0x070b0b), [0, 0.133, -0.458], 0.002);
    actuator = rounded(0.023, 0.009, 0.028, mat(0xb9914f), [0, 0.197, 0.01], 0.003);
    muzzle.position.set(0, 0.132, -0.46);
  } else if (id === 'extinguisher') {
    gripRadius = 0.025;
    const red = mat(0x9f352a, { metalness: 0.32, roughness: 0.4 });
    const points = [[0, -0.45], [0.07, -0.45], [0.089, -0.432], [0.092, -0.39], [0.092, -0.17], [0.08, -0.13], [0.035, -0.1], [0.025, -0.085], [0, -0.085]].map(([x, y]) => new THREE.Vector2(x, y));
    mesh(new THREE.LatheGeometry(points, 40), red, [-0.015, 0, -0.016]);
    cylinder(0.0925, 0.0925, 0.19, mat(0xffffff, { map: textures.extinguisher }), [-0.015, -0.285, -0.016]);
    ring(0.084, 0.009, rubber, [-0.015, -0.438, -0.016]);
    cylinder(0.025, 0.025, 0.075, mat(0xb19758, { metalness: 0.75 }), [-0.015, -0.07, -0.016]);
    rounded(0.046, 0.035, 0.12, darkSteel, [0, 0, 0]);
    actuator = rounded(0.044, 0.012, 0.145, red, [0, 0.04, 0.008], 0.004);
    const gauge = cylinder(0.025, 0.025, 0.018, steel, [-0.065, -0.065, 0.015]); gauge.rotation.x = Math.PI / 2;
    const dial = cylinder(0.021, 0.021, 0.02, mat(0xd6d8c7), [-0.065, -0.065, 0.017]); dial.rotation.x = Math.PI / 2;
    const needle = rounded(0.003, 0.025, 0.002, mat(0x313b32), [-0.065, -0.065, 0.029], 0.001); needle.rotation.z = -0.6;
    tube([[0.02, -0.065, -0.035], [0.13, -0.08, -0.09], [0.14, -0.16, -0.22], [0.08, -0.08, -0.31], [0.025, 0.015, -0.29]], 0.012, rubber);
    const horn = cylinder(0.052, 0.015, 0.17, rubber, [0.025, 0.02, -0.375], true); horn.rotation.x = -Math.PI / 2;
    const rim = ring(0.051, 0.004, darkSteel, [0.025, 0.02, -0.46]); rim.rotation.x = 0;
    muzzle.position.set(0.025, 0.02, -0.47);
  } else throw new Error(`Unknown tool: ${id}`);
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  let disposed = false;
  return { root, muzzle, contact, gripRadius, actuator,
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear(); } };
}
