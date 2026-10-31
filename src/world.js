import { fitModel } from './assets.js';
import { createApartment } from './apartment.js';

/** Authoritative positions/lifetime come from simulation; assets remain shared across runs. */
export function createWorld(THREE, scene, initialState, assets = null) {
  const root = new THREE.Group();
  root.name = 'apartment-world';
  scene.add(root);
  const geometries = new Set();
  const materials = new Set();
  const props = new Map();
  const spiders = new Map();
  const webs = new Map();
  const debris = [];
  const seenEvents = new Set();
  let targets = [];
  let time = 0;
  let seed = initialState.seed;
  let previousElapsed = initialState.elapsed;
  let layoutKey = '';
  let disposed = false;
  let apartment;
  let moodBlend = initialState.mood === 'horror' ? 1 : 0;
  const geometry = (value) => { geometries.add(value); return value; };
  const material = (color, extra = {}) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra });
    materials.add(value);
    return value;
  };
  const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeo = geometry(new THREE.SphereGeometry(1, 16, 10));
  const cylinderGeo = geometry(new THREE.CylinderGeometry(0.72, 1, 1, 10));
  const palette = {
    wood: material(0x96704e), darkWood: material(0x4c3b32),
    trim: material(0xc7b79c), black: material(0x202a30),
    screen: material(0x293f49, { emissive: 0x264857, emissiveIntensity: 0.3 }),
    ceramic: material(0x9c825e), water: material(0x718e83, { transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.24 }),
    glass: material(0xa5b9b0, { transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.16 }),
    cardboard: material(0xb29a68), red: material(0xb53836),
    spider: material(0x201b19, { roughness: 0.36 }), joint: material(0x3c3029, { roughness: 0.52 }),
    marking: material(0x958574), eye: material(0x271c16, { roughness: 0.12 }),
  };

  function mesh(parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const object = new THREE.Mesh(geo, mat);
    object.position.set(x, y, z);
    object.scale.set(sx, sy, sz);
    object.castShadow = !mat.transparent;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (parent, mat, x, y, z, sx, sy, sz) => mesh(parent, boxGeo, mat, x, y, z, sx, sy, sz);
  function markTarget(group, id) {
    group.traverse((object) => { object.userData.targetId = id; });
  }
  function removeRecord(map, id) {
    const record = map.get(id);
    if (!record) return;
    root.remove(record.group);
    map.delete(id);
  }
  function buildArchitecture(state) {
    apartment?.dispose();
    apartment = createApartment(root, state.layout, assets);
  }

  function makeProp(prop) {
    const group = new THREE.Group();
    group.name = `prop:${prop.kind}:${prop.id}`;
    const w = prop.width, h = prop.height, d = prop.depth;
    const add = (mat, x, y, z, sx, sy, sz) => box(group, mat, x * w, y * h, z * d, sx * w, sy * h, sz * d);
    const imported = assets?.models.get(prop.kind);
    if (imported) {
      const envelope = prop.kind === 'tv' ? { width: w, height: h - 0.4, depth: d } : prop;
      const model = fitModel(imported, envelope, { rotation: prop.yaw ?? (prop.z > 0 ? Math.PI : 0) });
      if (prop.kind === 'tv') {
        model.position.y = -h / 2 + 0.4;
        box(group, palette.darkWood, 0, -h / 2 + 0.37, 0, w, 0.06, d);
        for (const x of [-1, 1]) box(group, palette.darkWood, x * w * 0.43, -h / 2 + 0.17, 0, 0.07, 0.34, d * 0.8);
      }
      model.name = `asset:${prop.kind}`;
      group.add(model);
    } else switch (prop.kind) {
      case 'tv':
        add(palette.black, 0, 0.08, 0, 1, 0.75, 0.46);
        add(palette.screen, 0, 0.09, 0.242, 0.89, 0.62, 0.025);
        add(palette.black, 0, -0.34, 0, 0.12, 0.22, 0.25);
        add(palette.darkWood, 0, -0.47, 0, 0.7, 0.06, 1);
        break;
      case 'vase': {
        const body = mesh(group, sphereGeo, palette.ceramic, 0, -h * 0.12, 0, w * 0.5, h * 0.38, d * 0.5);
        body.rotation.y = 0.25;
        mesh(group, cylinderGeo, palette.ceramic, 0, h * 0.3, 0, w * 0.21, h * 0.36, d * 0.21);
        mesh(group, cylinderGeo, palette.darkWood, 0, h * 0.485, 0, w * 0.18, 0.012, d * 0.18);
        break;
      }
      case 'aquarium':
        add(palette.darkWood, 0, -0.46, 0, 1, 0.08, 1);
        add(palette.water, 0, -0.12, 0, 0.9, 0.64, 0.9);
        add(palette.glass, 0, 0.02, 0, 1, 0.9, 1);
        add(palette.black, 0, 0.47, 0, 1, 0.06, 1);
        for (const x of [-0.48, 0.48]) for (const z of [-0.48, 0.48]) add(palette.black, x, 0, z, 0.035, 0.9, 0.035);
        add(palette.ceramic, 0, -0.38, 0, 0.92, 0.06, 0.92);
        for (let i = 0; i < 3; i++) {
          mesh(group, sphereGeo, palette.ceramic, (i - 1) * w * 0.23, -h * 0.09 + i * 0.06, 0, w * 0.08, h * 0.06, d * 0.08);
        }
        break;
      case 'chair':
        add(palette.wood, 0, -0.04, 0, 1, 0.12, 1);
        add(palette.wood, 0, 0.26, -0.42, 1, 0.48, 0.16);
        for (const x of [-0.39, 0.39]) for (const z of [-0.39, 0.39]) {
          add(palette.darkWood, x, -0.29, z, 0.12, 0.42, 0.12);
        }
        break;
      case 'table':
        add(palette.wood, 0, 0.43, 0, 1, 0.14, 1);
        for (const x of [-0.4, 0.4]) for (const z of [-0.4, 0.4]) {
          add(palette.darkWood, x, -0.07, z, 0.11, 0.86, 0.11);
        }
        break;
      default:
        add(palette.cardboard, 0, 0, 0, 1, 1, 1);
        add(palette.trim, 0, 0.505, 0, 0.14, 0.01, 1);
        add(palette.darkWood, 0, 0.08, 0.505, 0.32, 0.12, 0.01);
    }
    group.position.set(prop.x, prop.y, prop.z);
    markTarget(group, prop.id);
    root.add(group);
    // Pre-cut eight chunks in normalized object space; no runtime fracture solver.
    const cuts = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      cuts.push({ x: x * w * 0.25, y: y * h * 0.25, z: z * d * 0.25,
        w: w * 0.45, h: h * 0.45, d: d * 0.45 });
    }
    return { group, descriptor: { ...prop }, cuts };
  }

  const up = new THREE.Vector3(0, 1, 0);
  function segment(parent, start, end, radius, mat) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a);
    const part = mesh(parent, cylinderGeo, mat, 0, 0, 0, radius, delta.length(), radius);
    part.position.copy(a.add(b).multiplyScalar(0.5));
    part.quaternion.setFromUnitVectors(up, delta.normalize());
    return part;
  }
  function makeSpider(spider) {
    const group = new THREE.Group();
    group.name = `spider:${spider.id}`;
    mesh(group, sphereGeo, palette.spider, 0, 0.025, -0.095, 0.16, 0.12, 0.21);
    mesh(group, sphereGeo, palette.spider, 0, 0.01, 0.12, 0.115, 0.09, 0.105);
    mesh(group, sphereGeo, palette.red, 0, 0.126, -0.11, 0.065, 0.012, 0.08);
    for (const x of [-0.047, 0.047]) {
      mesh(group, sphereGeo, palette.eye, x, 0.045, 0.211, 0.022, 0.024, 0.016);
      segment(group, [x, -0.015, 0.2], [x * 1.4, -0.07, 0.25], 0.014, palette.marking);
    }
    const legs = [];
    for (const side of [-1, 1]) for (let index = 0; index < 4; index++) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.07, 0, 0.13 - index * 0.075);
      const forward = (1.5 - index) * 0.12;
      segment(leg, [0, 0, 0], [side * 0.2, 0.085, forward], 0.017, palette.joint);
      segment(leg, [side * 0.2, 0.085, forward], [side * 0.34, -0.13, forward * 1.6], 0.012, palette.spider);
      group.add(leg);
      legs.push({ leg, index, side });
    }
    group.scale.setScalar(0.5);
    markTarget(group, spider.id);
    root.add(group);
    return { group, legs, lastX: spider.x, lastZ: spider.z, phase: spiders.size * 1.7 };
  }

  function makeWeb(web) {
    const vertices = [];
    const line = (a, b) => vertices.push(...a, ...b);
    const r = web.radius;
    for (let spoke = 0; spoke < 10; spoke++) {
      const angle = spoke * Math.PI / 5;
      line([0, 0, 0], [Math.cos(angle) * r, 0, Math.sin(angle) * r]);
      for (let ring = 1; ring <= 4; ring++) {
        const radius = r * ring / 4;
        const next = angle + Math.PI / 5;
        line([Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
          [Math.cos(next) * radius, 0, Math.sin(next) * radius]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const group = new THREE.LineSegments(geo, webMaterial);
    group.position.set(web.x, Math.max(0.018, web.y), web.z);
    root.add(group);
    return { group, geometry: geo };
  }
  const webMaterial = new THREE.LineBasicMaterial({ color: 0xcbdcce, transparent: true, opacity: 0.58 });
  materials.add(webMaterial);

  const MAX_DEBRIS = 80;
  function clearDebris() {
    for (const item of debris) root.remove(item.mesh);
    debris.length = 0;
  }
  function removeWeb(id) {
    const web = webs.get(id);
    if (!web) return;
    root.remove(web.group);
    web.geometry.dispose();
    webs.delete(id);
  }
  function shatter(record, event) {
    if (!record) return;
    const prop = record.descriptor;
    const mat = prop.kind === 'tv' ? palette.black : prop.kind === 'aquarium'
      ? palette.water : prop.kind === 'vase' ? palette.ceramic
        : prop.kind === 'box' ? palette.cardboard : palette.wood;
    for (let i = 0; i < record.cuts.length; i++) {
      if (debris.length >= MAX_DEBRIS) root.remove(debris.shift().mesh);
      const cut = record.cuts[i];
      const piece = mesh(root, boxGeo, mat, prop.x + cut.x, prop.y + cut.y,
        prop.z + cut.z, cut.w, cut.h, cut.d);
      // Deterministic impulse: repeated renders never roll new random physics.
      const angle = i * 2.39996 + String(event.id).length;
      debris.push({ mesh: piece, vx: Math.cos(angle) * (1.1 + i * 0.12),
        vy: 1.5 + (i % 3) * 0.5, vz: Math.sin(angle) * (1.1 + i * 0.12),
        spin: (i % 2 ? 1 : -1) * (1.5 + i * 0.15), life: 6, halfHeight: cut.h / 2 });
    }
  }
  function updateDebris(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const item = debris[i];
      item.life -= dt;
      item.vy -= 7 * dt;
      item.mesh.position.x += item.vx * dt;
      item.mesh.position.y += item.vy * dt;
      item.mesh.position.z += item.vz * dt;
      if (item.mesh.position.y < item.halfHeight) {
        item.mesh.position.y = item.halfHeight;
        item.vy = Math.abs(item.vy) > 0.2 ? -item.vy * 0.24 : 0;
        item.vx *= Math.exp(-9 * dt);
        item.vz *= Math.exp(-9 * dt);
      }
      item.vx *= Math.exp(-1.1 * dt);
      item.vz *= Math.exp(-1.1 * dt);
      item.mesh.rotation.x += item.spin * dt * Math.min(1, Math.abs(item.vy));
      item.mesh.rotation.z += item.spin * 0.6 * dt * Math.min(1, Math.abs(item.vy));
      item.mesh.position.x = THREE.MathUtils.clamp(item.mesh.position.x, -8.85, 8.85);
      item.mesh.position.z = THREE.MathUtils.clamp(item.mesh.position.z, -5.85, 5.85);
      // Shrink at end of life, without allocating one transparent material per shard.
      if (item.life < 1) item.mesh.scale.multiplyScalar(Math.exp(-5 * dt));
      if (item.life <= 0) {
        root.remove(item.mesh);
        debris.splice(i, 1);
      }
    }
  }
  let previousDamage = initialState.damageRub;
  function sync(state, dt = 0) {
    if (disposed) return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    const restart = state.seed !== seed || state.elapsed < previousElapsed
      || state.damageRub < previousDamage;
    if (restart) {
      for (const id of [...props.keys()]) removeRecord(props, id);
      for (const id of [...spiders.keys()]) removeRecord(spiders, id);
      for (const id of [...webs.keys()]) removeWeb(id);
      clearDebris();
      seenEvents.clear();
      time = 0;
    }
    seed = state.seed;
    previousElapsed = state.elapsed;
    previousDamage = state.damageRub;
    time += dt;
    const nextLayoutKey = JSON.stringify(state.layout);
    if (nextLayoutKey !== layoutKey) {
      buildArchitecture(state);
      layoutKey = nextLayoutKey;
    }
    // Consume events before removing broken prop records, which carry pre-cut chunks.
    for (const event of state.events || []) {
      if (seenEvents.has(event.id)) continue;
      seenEvents.add(event.id);
      if (event.type === 'break') {
        let nearest = null, distance = Infinity;
        for (const record of props.values()) {
          const prop = record.descriptor;
          const broken = state.props.find((candidate) => candidate.id === prop.id)?.broken;
          if (!broken) continue;
          const delta = Math.hypot(prop.x - event.x, prop.y - event.y, prop.z - event.z);
          if (delta < distance) { nearest = record; distance = delta; }
        }
        // break.value is monetary damage, not a target id; associate by location.
        if (nearest && distance < 3) shatter(nearest, event);
      }
    }
    const liveProps = new Set();
    for (const prop of state.props) {
      if (prop.broken) continue;
      liveProps.add(prop.id);
      let record = props.get(prop.id);
      if (!record) { record = makeProp(prop); props.set(prop.id, record); }
      record.group.position.set(prop.x, prop.y, prop.z);
      record.descriptor = { ...prop };
    }
    for (const id of props.keys()) if (!liveProps.has(id)) removeRecord(props, id);
    const liveSpiders = new Set();
    for (const spider of state.spiders) {
      if (spider.hp <= 0) continue;
      liveSpiders.add(spider.id);
      let record = spiders.get(spider.id);
      if (!record) { record = makeSpider(spider); spiders.set(spider.id, record); }
      const dx = spider.x - record.lastX, dz = spider.z - record.lastZ;
      const moving = Math.hypot(dx, dz) > 0.0001;
      if (moving) record.group.rotation.y = Math.atan2(dx, dz);
      record.group.position.set(spider.x, spider.y, spider.z);
      // World position already includes the authoritative jump arc; only pose is cosmetic.
      record.group.rotation.x = spider.mode === 'jump' ? -0.25 : 0;
      const phase = time * (moving ? 19 : 3) + record.phase;
      for (const { leg, index, side } of record.legs) {
        leg.rotation.y = Math.sin(phase + index * 1.6 + side) * (moving ? 0.3 : 0.035);
        leg.rotation.z = spider.mode === 'jump' ? side * 0.45
          : Math.sin(phase + index * 1.6 + side) * (moving ? 0.16 : 0.025);
      }
      record.lastX = spider.x;
      record.lastZ = spider.z;
    }
    for (const id of spiders.keys()) if (!liveSpiders.has(id)) removeRecord(spiders, id);
    const liveWebs = new Set();
    for (const web of state.webs) {
      if (web.ttl <= 0) continue;
      liveWebs.add(web.id);
      if (!webs.has(web.id)) webs.set(web.id, makeWeb(web));
      const record = webs.get(web.id);
      record.group.position.set(web.x, Math.max(0.018, web.y), web.z);
      record.group.scale.setScalar(Math.min(1, Math.max(0.05, web.ttl)));
    }
    for (const id of webs.keys()) if (!liveWebs.has(id)) removeWeb(id);
    updateDebris(dt);
    targets = [...props.values(), ...spiders.values()].map((record) => record.group);
    const targetMood = state.mood === 'horror' ? 1 : 0;
    moodBlend += (targetMood - moodBlend) * (1 - Math.exp(-dt * 1.8));
    apartment.update(moodBlend, time);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(root);
    apartment?.dispose();
    for (const id of [...webs.keys()]) removeWeb(id);
    root.clear();
    for (const geo of geometries) geo.dispose();
    for (const mat of materials) mat.dispose();
    props.clear();
    spiders.clear();
    targets = [];
    debris.length = 0;
    seenEvents.clear();
  }
  sync(initialState, 0);
  return { sync, getTargets: () => targets.slice(), dispose };
}
