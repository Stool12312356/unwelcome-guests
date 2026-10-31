import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createToolModel } from './tool-models.js';
import { createToolTextures } from './tool-textures.js';

const durations = { slipper: 0.31, newspaper: 0.21, hammer: 0.55, spray: 0.2, vacuum: 0.28, extinguisher: 0.65 };
const melee = new Set(['slipper', 'newspaper', 'hammer']);

/** One grip-space for the tool and wrapped fingers: animations cannot detach the handle. */
export function createViewmodel(camera, assets) {
  const root = new THREE.Group(); root.name = 'first-person-rig'; camera.add(root);
  const textures = createToolTextures();
  const handGeometries = new Set(), handMaterials = new Set();
  let model, hand, id, elapsed = Infinity, idle = 0, actuatorRest = 0, disposed = false;
  function material(color, roughness = 0.88) {
    const m = new THREE.MeshStandardMaterial({ color, roughness }); handMaterials.add(m); return m;
  }
  function clearHand() {
    hand?.removeFromParent();
    handGeometries.forEach(g => g.dispose()); handMaterials.forEach(m => m.dispose());
    handGeometries.clear(); handMaterials.clear();
  }
  function buildHand() {
    clearHand(); hand = new THREE.Group(); hand.name = 'wrapped-grip'; root.add(hand);
    const skin = material(0xb09880), nails = material(0xc3b19a, 0.62), cloth = material(0x434841), seam = material(0x272e2b);
    function mesh(geo, mat, p) {
      handGeometries.add(geo); const o = new THREE.Mesh(geo, mat); o.position.set(...p); hand.add(o); return o;
    }
    const rounded = (w, h, d, mat, p, r = 0.014) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, p);
    function tube(points, radius, mat) {
      return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 14, radius, 8, false), mat, [0, 0, 0]);
    }
    const r = model.gripRadius;
    rounded(0.055, 0.097, 0.075, skin, [r + 0.018, -0.015, 0.012]);
    rounded(0.068, 0.07, 0.105, skin, [r + 0.035, -0.046, 0.074]);
    const sleeve = rounded(0.103, 0.11, 0.31, cloth, [r + 0.09, -0.1, 0.23], 0.026);
    sleeve.rotation.set(-0.2, 0.16, 0.24);
    rounded(0.091, 0.087, 0.035, seam, [r + 0.04, -0.05, 0.126], 0.017);
    // Four C-shaped fingers wrap behind and around the handle; there is no solid fist hiding it.
    for (let finger = 0; finger < 4; finger++) {
      if (id === 'spray' && finger === 0) continue;
      const y = 0.023 - finger * 0.023;
      tube([[r + 0.025, y, 0.035], [r + 0.009, y, -0.017], [0, y, -r - 0.01], [-r - 0.007, y, -0.012], [-r + 0.002, y - 0.003, 0.017]], 0.0105 - finger * 0.0006, skin);
      rounded(0.011, 0.013, 0.004, nails, [-r, y, 0.021], 0.003);
    }
    tube([[r + 0.03, 0.027, 0.03], [0.018, 0.062, 0.038], [-r + 0.007, 0.034, 0.041], [-r, 0.009, 0.037]], 0.013, skin);
    if (id === 'spray') {
      hand.position.y = 0.065;
      tube([[r + 0.023, 0.031, 0], [0.039, 0.096, 0.009], [0.003, 0.131, -0.003], [0, 0.125, -0.015]], 0.01, skin);
    }
    if (id === 'extinguisher') { hand.rotation.x = Math.PI / 2; hand.position.set(0.008, -0.012, 0.015); }
  }
  function select(next) {
    if (disposed || next === id) return;
    model?.dispose(); id = next; elapsed = Infinity;
    model = createToolModel(id, assets, textures); root.add(model.root);
    actuatorRest = model.actuator?.position.y || 0;
    buildHand(); update(0);
  }
  function update(dt, walking = false, bob = 0) {
    if (!model || disposed) return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
    idle += dt; elapsed += dt;
    const p = Math.min(1, elapsed / durations[id]);
    const pulse = p < 1 ? Math.sin(p * Math.PI) : 0;
    const strike = p < 1 ? Math.sin(Math.min(1, p / 0.6) * Math.PI) : 0;
    root.position.set(id === 'extinguisher' ? 0.28 : 0.27, id === 'extinguisher' ? -0.12 : -0.25, -0.57);
    root.position.y += Math.sin(idle * 1.5) * 0.002 + (walking ? Math.sin(bob) * 0.008 : 0);
    root.rotation.set(id === 'slipper' ? -0.18 : -0.1, id === 'hammer' ? 0.24 : -0.1, -0.07);
    if (melee.has(id)) {
      // Push the head forward/down, then recover; hammer is heavier than paper.
      root.rotation.x -= strike * (id === 'hammer' ? 1.12 : 0.82);
      root.rotation.z += pulse * (id === 'newspaper' ? 0.52 : 0.28);
      root.position.z -= strike * 0.17; root.position.x -= pulse * 0.09;
      root.position.y -= strike * 0.045;
    } else {
      root.position.z += pulse * (id === 'extinguisher' ? 0.045 : 0.012);
      root.rotation.x += pulse * 0.04;
      if (model.actuator) model.actuator.position.y = actuatorRest - pulse * 0.009;
    }
    root.updateMatrixWorld(true);
  }
  select('slipper');
  return {
    root, select, update,
    trigger() { elapsed = 0; update(0); },
    reset() { elapsed = Infinity; idle = 0; update(0); },
    emitter(cameraWorld, target = new THREE.Vector3()) {
      root.updateMatrixWorld(true);
      model.muzzle.getWorldPosition(target); camera.worldToLocal(target);
      return cameraWorld.localToWorld(target);
    },
    info: () => ({ id, elapsed, duration: durations[id] }),
    dispose() { if (disposed) return; disposed = true; model?.dispose(); clearHand(); textures.dispose(); root.removeFromParent(); },
  };
}
