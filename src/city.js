import * as THREE from 'three';

/** Real exterior at apartment scale; no camera-facing cards. Apartment is on the third floor. */
export function createCity(parent) {
  const root = new THREE.Group();
  root.name = 'city-exterior';
  parent.add(root);
  const geometries = new Set(), materials = new Set();
  const unit = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(unit);
  const batches = new Map();
  const material = (color, extra = {}) => {
    // Exterior has its own haze baked into the distance palette, not the short indoor fog.
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.91, fog: false, ...extra });
    materials.add(mat); return mat;
  };
  const concrete = [material(0x575d60), material(0x66625d), material(0x4a5359), material(0x6a625c)];
  const farConcrete = material(0x414d59), roof = material(0x303b43), trim = material(0x8a8b85);
  const darkGlass = material(0x152a37, { roughness: 0.3, metalness: 0.25 });
  const warmGlass = material(0xaf8450, { emissive: 0xffc77f, emissiveIntensity: 0.8 });
  const coldGlass = material(0x748a91, { emissive: 0x97bfd6, emissiveIntensity: 0.45 });
  const asphalt = material(0x202b31, { roughness: 0.72 });
  const pavement = material(0x4c5355), line = material(0x9c9987), bark = material(0x242c2b);
  const streetGlow = material(0xc8ad79, { emissive: 0xffcb83, emissiveIntensity: 2 });
  function box(mat, x, y, z, w, h, d, ry = 0) {
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push({ x, y, z, w, h, d, ry });
  }
  const ground = -7.5;
  // Street and two pavements are below the player, giving visible perspective near the sill.
  box(asphalt, 0, ground - 0.12, -39, 240, 0.2, 96);
  box(pavement, 0, ground, -8.8, 180, 0.16, 4.5);
  box(pavement, 0, ground, -20, 180, 0.16, 3.7);
  for (let x = -110; x < 110; x += 8) box(line, x, ground + 0.01, -14.6, 3.2, 0.015, 0.12);
  for (const z of [-11.1, -18.1]) box(trim, 0, ground + 0.02, z, 210, 0.18, 0.17);
  const buildings = [];
  function building(x, z, w, d, floors, index, distant = false) {
    const height = floors * 2.75 + 0.5;
    buildings.push({ x, z, width: w, depth: d, height, bottom: ground });
    const facade = distant ? farConcrete : concrete[index % concrete.length];
    box(facade, x, ground + height / 2, z, w, height, d);
    box(roof, x, ground + height + 0.12, z, w + 0.45, 0.24, d + 0.45);
    box(roof, x + w * 0.15, ground + height + 0.8, z - 1, 2.3, 1.4, 1.8);
    box(trim, x - w * 0.27, ground + height + 1.25, z, 0.09, 2.5, 0.09);
    box(roof, x - w * 0.27, ground + height + 1.9, z, 1.2, 0.045, 0.045);
    const columns = Math.max(3, Math.floor(w / 2.3));
    for (let floor = 0; floor < floors; floor++) {
      const y = ground + 1.7 + floor * 2.75;
      if (!distant) box(trim, x, y - 1.05, z + d / 2 + 0.08, w, 0.13, 0.18);
      for (let c = 0; c < columns; c++) {
        const wx = x - w / 2 + (c + 0.5) * w / columns;
        const lit = ((floor * 13 + c * 7 + index * 11) % 9);
        const glass = lit < 2 ? warmGlass : lit === 3 ? coldGlass : darkGlass;
        box(glass, wx, y, z + d / 2 + 0.022, 0.9, 1.35, 0.045);
        if (!distant) {
          box(trim, wx, y - 0.73, z + d / 2 + 0.12, 1.05, 0.1, 0.25);
          box(roof, wx, y, z + d / 2 + 0.06, 0.045, 1.35, 0.04);
          if (c % 3 === 1 && floor > 0) {
            box(concrete[0], wx, y - 0.8, z + d / 2 + 0.5, 1.6, 0.16, 1);
            box(roof, wx, y - 0.48, z + d / 2 + 0.98, 1.6, 0.62, 0.07);
          }
        }
      }
      // Side windows make the closest blocks visibly volumetric as the player moves.
      if (!distant) for (const side of [-1, 1]) for (let c = 0; c < 3; c++) {
        box((floor + c + index) % 5 === 0 ? warmGlass : darkGlass, x + side * (w / 2 + 0.025), y, z - d / 2 + (c + 0.5) * d / 3, 0.05, 1.35, 0.85);
      }
    }
    if (!distant) {
      box(roof, x, ground + 1.15, z + d / 2 + 0.08, 1.2, 2.3, 0.12);
      box(trim, x, ground + 2.55, z + d / 2 + 0.6, 2.2, 0.16, 1.2);
    }
  }
  // Gaps in the first row expose the second/third row rather than a continuous flat facade.
  [-49, -29, -9, 12, 34, 56].forEach((x, i) => building(x, -29 - (i % 2) * 4, 13 + (i % 3), 9, 4 + (i % 3), i));
  for (let i = 0; i < 9; i++) building(-91 + i * 23, -57 - (i % 3) * 5, 13 + i % 4, 12, 7 + i % 5, i + 6, true);
  for (let i = 0; i < 10; i++) building(-123 + i * 27, -103 - (i % 2) * 9, 15 + i % 6, 16, 9 + i % 7, i + 15, true);
  // Street furniture, parked cars and bare trees — all shared-geometry batches.
  for (let x = -66; x <= 66; x += 12) {
    box(roof, x, ground + 2.8, -19, 0.12, 5.6, 0.12);
    box(roof, x, ground + 5.6, -17.9, 0.12, 0.12, 2.3);
    box(streetGlow, x, ground + 5.5, -16.9, 0.55, 0.09, 0.8);
  }
  for (let i = 0; i < 11; i++) {
    const x = -55 + i * 10, z = i % 2 ? -12 : -17;
    box(concrete[i % 4], x, ground + 0.62, z, 3.8, 0.8, 1.65);
    box(darkGlass, x + 0.2, ground + 1.2, z, 1.9, 0.55, 1.45);
    for (const axle of [-1.2, 1.2]) box(roof, x + axle, ground + 0.35, z, 0.6, 0.65, 1.8);
    box(warmGlass, x - 1.92, ground + 0.63, z, 0.03, 0.2, 1.15);
  }
  for (let i = 0; i < 12; i++) {
    const x = -66 + i * 12, z = -21.5;
    box(bark, x, ground + 2.3, z, 0.24, 4.6, 0.24);
    for (const side of [-1, 1]) {
      box(bark, x + side * 0.75, ground + 4.35, z, 0.1, 2.4, 0.1, 0);
      const list = batches.get(bark); list.at(-1).rz = -side * 0.6;
      box(bark, x + side * 1.1, ground + 5.4, z - 0.2, 0.05, 1.4, 0.05);
    }
  }
  const transform = new THREE.Object3D();
  for (const [mat, instances] of batches) {
    const mesh = new THREE.InstancedMesh(unit, mat, instances.length);
    mesh.name = 'city-batch';
    instances.forEach((p, index) => {
      transform.position.set(p.x, p.y, p.z);
      transform.rotation.set(0, p.ry, p.rz || 0);
      transform.scale.set(p.w, p.h, p.d); transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.computeBoundingSphere(); root.add(mesh);
  }
  const skyGeometry = new THREE.SphereGeometry(230, 32, 20);
  geometries.add(skyGeometry);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vPos; void main(){
      float h=normalize(vPos).y;
      vec3 c=mix(vec3(.19,.23,.28),vec3(.025,.055,.10),smoothstep(-.02,.65,h));
      float cloud=sin(vPos.x*.045+sin(vPos.z*.023)*3.)*sin(vPos.z*.035+vPos.y*.13);
      c+=cloud*.012*smoothstep(.0,.2,h);
      gl_FragColor=vec4(c,1.); }`,
  });
  materials.add(skyMaterial);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial); sky.name = 'city-sky'; root.add(sky);
  const moon = new THREE.DirectionalLight(0xa4bed5, 1.6);
  moon.position.set(-30, 65, 30); root.add(moon);
  let disposed = false;
  return {
    root, buildings,
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent();
      root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear();
    },
  };
}
