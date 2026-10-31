import * as THREE from 'three';
import { createSimulation, WEAPONS } from './simulation.js';
import { createWorld } from './world.js';
import { mountUI } from './ui.js';
import { createRendering } from './rendering.js';
import { createViewmodel } from './viewmodel.js';
import { createWeaponEffects } from './weapon-effects.js';
import { canOccupy } from './movement.js';

const EYE_HEIGHT = 1.65;
const PLAYER_RADIUS = 0.22;
const SPEED = 3.2;
const makeSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** Browser adapter: owns rendering/input, while simulation owns all game rules. */
export function createGame({ root, assets = null }) {
  if (!root) throw new Error('Не найден корневой элемент игры.');
  root.classList.add('game-root');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.domElement.className = 'game-canvas';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  root.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141715');
  scene.fog = new THREE.Fog('#222722', 16, 38);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.04, 320);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const fill = new THREE.HemisphereLight(0xd0d9db, 0x403328, 0.16);
  scene.add(fill);
  const flashlight = new THREE.SpotLight(0xe6e3ce, 8, 12, 0.7, 0.85, 1.5);
  flashlight.position.set(0.12, -0.15, 0.6);
  flashlight.target.position.set(0, -0.15, -8);
  camera.add(flashlight, flashlight.target);
  // Viewmodel has its own depth buffer: walls cannot clip it, but its faces still occlude each other.
  const viewScene = new THREE.Scene();
  const viewCamera = camera.clone(false);
  const viewFill = new THREE.HemisphereLight(0xd0d9db, 0x403328, 0.6);
  const viewKey = new THREE.DirectionalLight(0xffe3bd, 1.4);
  viewKey.position.set(-1, 2, 1);
  viewScene.add(viewCamera, viewFill, viewKey);
  const rendering = createRendering(renderer, scene, camera, { scene: viewScene, camera: viewCamera });

  const simulation = createSimulation({ seed: makeSeed(), spiderCount: 6 });
  let state = simulation.getState();
  let world = createWorld(THREE, scene, state, assets);
  let wallBoxes = [];
  let paused = true;
  let started = false;
  let disposed = false;
  let weaponIndex = 0;
  let nextAttack = 0;
  let inspectionFrame = false;
  let lastTime = performance.now();
  let frameId;
  let bob = 0;
  let firing = false;
  const keys = new Set();
  const position = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const point = new THREE.Vector3();
  const wallPoint = new THREE.Vector3();
  const audio = createAudio();
  const removers = [];
  // ?qa=1 — режим приёмки: захват указателя не требуется, панель QA шлёт настоящие события ввода.
  const qaMode = new URLSearchParams(window.location.search).has('qa');
  const locked = () => (qaMode && started) || document.pointerLockElement === renderer.domElement;
  const active = () => started && !paused && !inspectionFrame && locked() && state.status === 'playing';

  // The rig and world-space FX are cosmetic, never raycast targets.
  const viewmodel = createViewmodel(viewCamera, assets);
  const effects = createWeaponEffects(scene);

  function updateWalls() {
    wallBoxes = state.layout.walls.map(w => new THREE.Box3(
      new THREE.Vector3(w.x - w.width / 2, 0, w.z - w.depth / 2),
      new THREE.Vector3(w.x + w.width / 2, w.height, w.z + w.depth / 2),
    ));
  }
  function resetPosition() {
    position.set(state.layout.spawn.x, EYE_HEIGHT, state.layout.spawn.z);
    camera.position.copy(position);
    camera.rotation.set(0, 0, 0);
    state = simulation.step(0, { x: position.x, y: position.y, z: position.z });
    updateWalls();
  }
  function renderUI() {
    ui.render(state, { weaponId: WEAPONS[weaponIndex].id, paused, locked: locked() });
  }
  function pause() {
    paused = true;
    keys.clear();
    firing = false;
    audio.silence();
    if (locked()) document.exitPointerLock();
    lastTime = performance.now();
    renderUI();
  }
  function requestControl() {
    if (disposed || state.status !== 'playing') return;
    audio.unlock();
    inspectionFrame = false;
    if (locked()) {
      paused = false;
      lastTime = performance.now();
      renderUI();
      return;
    }
    // Never advance time until pointerlockchange confirms success.
    paused = true;
    lastTime = performance.now();
    try {
      const request = renderer.domElement.requestPointerLock();
      if (request?.catch) request.catch(() => { if (!disposed) pause(); });
    } catch { pause(); }
    renderUI();
  }
  function newRun() {
    const previousSeed = state.seed;
    let seed = makeSeed();
    if (seed === previousSeed) seed = (seed + 1) >>> 0;
    keys.clear();
    firing = false;
    paused = true;
    started = true;
    state = simulation.restart({ seed });
    world.dispose();
    resetPosition();
    world = createWorld(THREE, scene, state, assets);
    fill.intensity = 0.16;
    flashlight.intensity = 8;
    viewFill.intensity = 0.6;
    viewKey.intensity = 1.4;
    nextAttack = 0;
    inspectionFrame = false;
    effects.reset();
    viewmodel.reset();
    bob = 0;
    audio.reset();
    requestControl();
  }
  function selectWeapon(id) {
    const index = WEAPONS.findIndex(w => w.id === id);
    if (index < 0) return;
    weaponIndex = index;
    viewmodel.select(id);
    renderUI();
  }
  const ui = mountUI(root, {
    onStart: newRun, onRestart: newRun, onPause: pause,
    onResume: requestControl, onWeapon: selectWeapon,
  });

  function canStand(x, z) {
    return canOccupy(state, x, z, PLAYER_RADIUS);
  }
  function move(dt) {
    let x = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    let z = Number(keys.has('KeyS')) - Number(keys.has('KeyW'));
    const length = Math.hypot(x, z);
    if (!length) return false;
    x /= length; z /= length;
    const yaw = camera.rotation.y;
    const dx = (x * Math.cos(yaw) + z * Math.sin(yaw)) * SPEED * dt;
    const dz = (-x * Math.sin(yaw) + z * Math.cos(yaw)) * SPEED * dt;
    // Axis-separated, small steps prevent tunnelling and permit wall sliding.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.06));
    for (let i = 0; i < steps; i++) {
      if (canStand(position.x + dx / steps, position.z)) position.x += dx / steps;
      if (canStand(position.x, position.z + dz / steps)) position.z += dz / steps;
    }
    return true;
  }
  function consume(next, dt = 0) {
    state = next;
    world.sync(state, dt);
    effects.update(dt);
    audio.events(state.events);
    if (state.status === 'won') pause();
  }
  function attack() {
    if (!active() || state.elapsed < nextAttack) return;
    const weapon = WEAPONS[weaponIndex];
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(center, camera);
    raycaster.far = weapon.range;
    const hit = raycaster.intersectObjects(world.getTargets(), true)[0];
    let distance = weapon.range;
    let targetId = null;
    let surfaceHit = Boolean(hit);
    raycaster.ray.at(distance, point);
    if (hit) {
      distance = hit.distance;
      point.copy(hit.point);
      let object = hit.object;
      while (object && !object.userData.targetId) object = object.parent;
      targetId = object?.userData.targetId ?? null;
    }
    // Walls are intentionally separate from target meshes: they still block shots.
    for (const box of wallBoxes) {
      const wallHit = raycaster.ray.intersectBox(box, wallPoint);
      if (wallHit && wallPoint.distanceTo(camera.position) < distance) {
        distance = wallPoint.distanceTo(camera.position);
        point.copy(wallPoint);
        targetId = null;
        surfaceHit = true;
      }
    }
    const next = simulation.attack({ weaponId: weapon.id, targetId, point: { x: point.x, y: point.y, z: point.z } });
    const shot = next.events.find(event => event.type === 'shot');
    if (shot) {
      nextAttack = next.elapsed + weapon.cooldown;
      const origin = viewmodel.emitter(camera);
      // The viewmodel has separate depth; a muzzle touching a wall must not emit beyond it.
      if (origin.distanceTo(camera.position) >= distance) raycaster.ray.at(Math.max(0, distance * 0.3), origin);
      effects.emit({ eventId: shot.id, weaponId: weapon.id, origin, point, hit: surfaceHit,
        surface: targetId?.startsWith('spider-') ? 'spider' : 'dust' });
      viewmodel.trigger();
      audio.shot(weapon.id);
    }
    consume(next);
  }

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }
  function resize() {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewCamera.aspect = camera.aspect;
    viewCamera.updateProjectionMatrix();
    rendering.resize(width, height);
    effects.resize(height * renderer.getPixelRatio());
  }
  listen(window, 'resize', resize);
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  listen(document, 'pointerlockchange', () => {
    if (locked() && started && !document.hidden && state.status === 'playing') {
      paused = false;
      lastTime = performance.now();
      keys.clear();
      firing = false;
    } else { pause(); }
    renderUI();
  });
  listen(document, 'pointerlockerror', pause);
  listen(window, 'blur', () => { if (!qaMode) pause(); });
  listen(document, 'visibilitychange', () => { if (document.hidden && !qaMode) pause(); });
  let lastKey = '-';
  // Один и тот же обработчик обслуживает настоящую клавиатуру и панель приёмки (?qa=1).
  function handleKeyDown(event) {
    lastKey = `${event.code}/${active()}`;
    if (event.code === 'Escape') { if (started) pause(); return; }
    if (!active()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    if (/^Digit[1-6]$/.test(event.code)) selectWeapon(WEAPONS[Number(event.code.slice(5)) - 1].id);
  }
  function handleKeyUp(event) { keys.delete(event.code); }
  listen(window, 'keydown', handleKeyDown);
  listen(window, 'keyup', handleKeyUp);
  listen(document, 'mousemove', event => {
    if (!active() || (qaMode && event.target?.closest?.('.qa-panel, .game-ui'))) return;
    camera.rotation.y -= event.movementX * 0.0022;
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - event.movementY * 0.0022, -1.48, 1.48);
  });
  listen(document, 'mousedown', event => {
    if (event.button !== 0 || !active() || event.target.closest?.('.game-ui, .qa-panel')) return;
    firing = true;
    attack();
  });
  listen(window, 'mouseup', event => { if (event.button === 0) firing = false; });
  listen(root, 'contextmenu', event => event.preventDefault());
  function handleWheel(event) {
    if (!active() || !event.deltaY) return;
    event.preventDefault();
    selectWeapon(WEAPONS[(weaponIndex + (event.deltaY > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length].id);
  }
  listen(root, 'wheel', handleWheel, { passive: false });

  function frame(now) {
    if (disposed) return;
    const dt = active() ? Math.min(Math.max((now - lastTime) / 1000, 0), 0.05) : 0;
    lastTime = now;
    if (active()) {
      const walking = move(dt);
      bob += walking ? dt * 9 : 0;
      camera.position.copy(position);
      consume(simulation.step(dt, { x: position.x, y: position.y, z: position.z }), dt);
      if (firing) attack();
      viewmodel.update(dt, walking, bob);
    }
    const horror = state.mood === 'horror';
    const blend = 1 - Math.exp(-dt * 2);
    fill.intensity = THREE.MathUtils.lerp(fill.intensity, horror ? 0.1 : 0.16, blend);
    flashlight.intensity = THREE.MathUtils.lerp(flashlight.intensity, horror ? 11 : 8, blend);
    viewFill.intensity = THREE.MathUtils.lerp(viewFill.intensity, horror ? 0.3 : 0.6, blend);
    viewKey.intensity = THREE.MathUtils.lerp(viewKey.intensity, horror ? 0.8 : 1.4, blend);
    audio.mood(horror, active());
    viewmodel.root.visible = started && state.status === 'playing';
    renderUI();
    renderer.info.reset();
    rendering.render(now / 1000, horror ? 1 : 0);
    frameId = requestAnimationFrame(frame);
  }
  resetPosition();
  camera.position.set(-7.5, 1.5, 1.1);
  camera.lookAt(-5.7, 1.25, -4.5);
  resize();
  renderUI();
  frameId = requestAnimationFrame(frame);

  // Только для ?qa=1: чтение состояния и перемещение камеры; бой идёт через обычные обработчики ввода.
  const qa = !qaMode ? null : {
    canvas: renderer.domElement,
    info: () => ({
      x: position.x, z: position.z, yaw: camera.rotation.y, pitch: camera.rotation.x,
      weaponId: WEAPONS[weaponIndex].id, weaponRange: WEAPONS[weaponIndex].range,
      paused, started, state, keys: [...keys].join('+'), lastKey, locked: locked(), active: active(),
      targets: world.getTargets().length,
      assets: assets?.models.size || 0,
      effects: effects.info(), inspectionFrame, viewmodel: viewmodel.info(),
      graphics: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...renderer.info.memory },
      targetCenters: Object.fromEntries(world.getTargets().map(group => [group.userData.targetId, new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3())])), 
    }),
    teleport(x, z) {
      if (!canStand(x, z)) return false;
      position.set(x, EYE_HEIGHT, z);
      camera.position.copy(position);
      return true;
    },
    face(yaw, pitch = 0) { camera.rotation.y = yaw; camera.rotation.x = pitch; },
    canStand,
    /** Подаёт клавишу в тот же обработчик, что и window keydown/keyup (синтетические KeyboardEvent в тестовом браузере блокируются). */
    key(code, type = 'keydown') {
      const event = { code, preventDefault() {} };
      if (type === 'keyup') handleKeyUp(event); else handleKeyDown(event);
    },
    /** Тот же attack(), что вызывает ЛКМ: raycast из центра экрана → simulation.attack. */
    hit() { attack(); },
    wheel(deltaY) { handleWheel({ deltaY, preventDefault() {} }); },
    /** Детерминированный прогон реального игрового цикла (движение с коллизиями + симуляция) кадрами по 0.05 с. */
    advance(seconds) {
      if (!active()) return false;
      for (let t = 0; t < seconds && state.status === 'playing'; t += 0.05) {
        move(0.05);
        camera.position.copy(position);
        consume(simulation.step(0.05, { x: position.x, y: position.y, z: position.z }), 0.05);
        viewmodel.update(0.05);
      }
      return true;
    },
    /** QA-only: freeze a real accepted shot for visual inspection, no fake effect injection. */
    captureUse() {
      inspectionFrame = false;
      if (!active()) return;
      attack(); this.advance(0.1); inspectionFrame = true;
    },
    unfreeze() { inspectionFrame = false; lastTime = performance.now(); },
    /** Ускорение времени: прогоняет настоящую симуляцию шагами по 0.05 с. */
    skip(seconds) {
      for (let t = 0; t < seconds && state.status === 'playing'; t += 0.05) {
        consume(simulation.step(0.05, { x: position.x, y: position.y, z: position.z }), 0.05);
      }
    },
  };

  return {
    qa,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      for (const remove of removers) remove();
      observer.disconnect();
      if (locked()) document.exitPointerLock();
      audio.dispose();
      ui.destroy();
      world.dispose();
      viewmodel.dispose();
      effects.dispose();
      rendering.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** All audio is local synthesis; a quiet drone replaces repeated jump scares. */
function createAudio() {
  let context;
  let master;
  let drone;
  let droneGain;
  let muted = true;
  const seen = new Set();
  const voices = new Set();
  function tone(frequency, duration, type = 'sine', volume = 0.08, end = frequency) {
    if (!context || muted || context.state !== 'running' || voices.size > 16) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(master);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start();
    oscillator.stop(now + duration + 0.02);
  }
  function silence() {
    muted = true;
    if (context) master.gain.setTargetAtTime(0, context.currentTime, 0.015);
  }
  return {
    unlock() {
      try {
        if (!context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) return;
          context = new Audio();
          master = context.createGain();
          master.gain.value = 0;
          master.connect(context.destination);
          drone = context.createOscillator();
          drone.type = 'sine';
          drone.frequency.value = 62;
          droneGain = context.createGain();
          droneGain.gain.value = 0;
          drone.connect(droneGain).connect(master);
          drone.start();
        }
        context.resume().catch(() => {});
      } catch { /* Audio is optional: a denied audio device must not block play. */ }
    },
    mood(horror, running) {
      if (!context || !master) return;
      if (!running) { if (!muted) silence(); return; }
      if (muted) { muted = false; master.gain.setTargetAtTime(0.38, context.currentTime, 0.1); }
      const target = horror ? 0.055 : 0.012;
      // Do not continually restart the ramp with an identical target every frame.
      if (droneGain.userMood !== horror) {
        droneGain.userMood = horror;
        droneGain.gain.setTargetAtTime(target, context.currentTime, 0.8);
        drone.frequency.setTargetAtTime(horror ? 49 : 82, context.currentTime, 0.8);
      }
    },
    shot(id) {
      const sprays = ['spray', 'vacuum', 'extinguisher'].includes(id);
      tone(sprays ? 170 : 240, sprays ? 0.23 : 0.11, sprays ? 'sawtooth' : 'triangle', 0.09, sprays ? 85 : 60);
    },
    events(events) {
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        if (event.type === 'break') tone(490, 0.18, 'triangle', 0.12, 75);
        if (event.type === 'kill') tone(210, 0.1, 'sine', 0.09, 55);
      }
      // IDs are monotonic/unique; retain only a bounded recent history.
      while (seen.size > 256) seen.delete(seen.values().next().value);
    },
    silence,
    reset() { seen.clear(); silence(); },
    dispose() {
      silence();
      for (const voice of voices) { try { voice.stop(); } catch { /* already stopped */ } }
      drone?.stop();
      context?.close().catch(() => {});
    },
  };
}
