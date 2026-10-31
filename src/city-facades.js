import * as THREE from 'three';

/** Selected 3m bays from the Poly Haven catalogue; ignore catalogue display translations. */
export function addCityFacades(root, template, buildings, ground, ownedMaterials) {
  if (!template) return;
  const batches = new Map();
  function place(name, x, y, z, yaw) {
    const source = template.getObjectByName(name);
    if (!source) throw new Error(`Missing facade module: ${name}`);
    const copy = source.clone(true);
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0); copy.scale.set(1, 1, 1);
    copy.updateMatrixWorld(true);
    const placement = new THREE.Matrix4().makeRotationY(yaw);
    placement.setPosition(x, y, z);
    copy.traverse(mesh => {
      if (!mesh.isMesh) return;
      const key = `${mesh.geometry.uuid}:${[mesh.material].flat().map(m => m.uuid).join(':')}`;
      if (!batches.has(key)) {
        const material = [mesh.material].flat().map(m => {
          const mat = m.clone(); mat.fog = false;
          // Glass retains its scanned texture, with restrained interior glow.
          if (mat.name.includes('glass')) { mat.emissive.set(0xa78b65); mat.emissiveIntensity = 0.22; }
          ownedMaterials.add(mat); return mat;
        });
        batches.set(key, { geometry: mesh.geometry, material: Array.isArray(mesh.material) ? material : material[0], matrices: [] });
      }
      batches.get(key).matrices.push(placement.clone().multiply(mesh.matrixWorld));
    });
  }
  for (const b of buildings.slice(0, 6)) {
    const floors = Math.round((b.height - 0.5) / 3);
    const cols = Math.round(b.width / 3), sides = Math.round(b.depth / 3);
    for (const face of [0, 1, 2, 3]) {
      const yaw = face * Math.PI / 2;
      const count = face % 2 ? sides : cols;
      for (let c = 0; c < count; c++) {
        const offset = -count * 1.5 + (c + 1) * 3;
        const local = new THREE.Vector3(offset, 0, face % 2 ? b.width / 2 + 0.03 : b.depth / 2 + 0.03).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const x = b.x + local.x, z = b.z + local.z;
        for (let f = 0; f < floors; f++) {
          const variant = (c + f) % 3 ? 'small' : 'large';
          place(`wall_window_centered_${variant}_02`, x, ground + f * 3, z, yaw);
          place(`window_centered_${variant}_02`, x, ground + f * 3, z, yaw);
          place('cornice_standard_standard_01', x, ground + f * 3 + 2.8, z, yaw);
        }
        place('base_standard_01', x, ground, z, yaw);
        place('crown_standard_standard_01', x, ground + floors * 3, z, yaw);
      }
    }
  }
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    mesh.name = 'asset:facade';
    batch.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere(); root.add(mesh);
  }
}
