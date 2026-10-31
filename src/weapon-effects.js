import * as THREE from 'three';

export const MAX_PARTICLES = 640;
const styles = {
  spray: { count: 52, color: 0xb8c6a2, size: 0.065, life: 0.48, spread: 0.22 },
  extinguisher: { count: 110, color: 0xe6e7dc, size: 0.13, life: 0.85, spread: 0.4 },
  vacuum: { count: 48, color: 0xb0c5c5, size: 0.036, life: 0.48, spread: 0.3 },
  hammer: { count: 28, color: 0xc5ad83, size: 0.028, life: 0.4, spread: 0.15 },
  newspaper: { count: 15, color: 0xd0cab6, size: 0.026, life: 0.3, spread: 0.1 },
  slipper: { count: 20, color: 0xaa9e84, size: 0.04, life: 0.3, spread: 0.12 },
};

/** Bounded world-space particles, fed only accepted attacks. Never raycast targets or damage. */
export function createWeaponEffects(scene) {
  const root = new THREE.Group(); root.name = 'weapon-effects'; scene.add(root);
  const positions = new Float32Array(MAX_PARTICLES * 3), colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES), alphas = new Float32Array(MAX_PARTICLES);
  const geometry = new THREE.BufferGeometry();
  for (const [name, array, itemSize] of [['position', positions, 3], ['color', colors, 3], ['size', sizes, 1], ['alpha', alphas, 1]]) {
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize).setUsage(THREE.DynamicDrawUsage));
  }
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    uniforms: { viewportHeight: { value: 900 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color;
      uniform float viewportHeight; varying vec3 vColor; varying float vAlpha;
      void main(){ vColor=color;vAlpha=alpha;vec4 p=modelViewMatrix*vec4(position,1.);
      gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*viewportHeight*projectionMatrix[1][1]/max(.1,-p.z),1.,100.); }`,
    fragmentShader: `varying vec3 vColor;varying float vAlpha;
      void main(){float d=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.1,1.,d))*vAlpha;
      if(a<.005)discard;gl_FragColor=vec4(vColor,a);}`,
  });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; points.name = 'use-particles'; root.add(points);
  const particles = [], seen = new Set(); let disposed = false, last = null, emitted = 0;
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const tint = new THREE.Color();
  function upload() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i], t = Math.max(0, Math.min(1, p.age / p.life));
      const fade = Math.min(1, (1 - t) * 4);
      if (p.stream) {
        const travel = p.inward ? 1 - t : t;
        p.position.lerpVectors(p.from, p.to, travel);
        const cone = p.inward ? (1 - t) : t;
        p.position.addScaledVector(p.side, Math.sin(p.angle + t * 6) * p.spread * cone);
        p.position.addScaledVector(p.up, Math.cos(p.angle + t * 6) * p.spread * cone);
      }
      p.position.toArray(positions, i * 3); p.color.toArray(colors, i * 3);
      sizes[i] = p.size * (p.stream && !p.inward ? 0.6 + t * 1.4 : 1);
      alphas[i] = p.opacity * fade;
    }
    geometry.setDrawRange(0, particles.length);
    for (const attr of Object.values(geometry.attributes)) attr.needsUpdate = true;
  }
  function emit({ eventId, weaponId, origin, point, hit = false, surface = 'dust' }) {
    const style = styles[weaponId];
    if (disposed || !style || seen.has(eventId)) return false;
    seen.add(eventId);
    // Events are monotonic within a run. Reset clears history together with particles.
    while (seen.size > 512) seen.delete(seen.values().next().value);
    const from = new THREE.Vector3().copy(origin), to = new THREE.Vector3().copy(point);
    forward.copy(to).sub(from).normalize();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.01) right.set(1, 0, 0); else right.normalize();
    up.crossVectors(right, forward).normalize();
    const stream = ['spray', 'vacuum', 'extinguisher'].includes(weaponId);
    const count = stream || hit ? style.count : 7;
    tint.setHex(surface === 'spider' && !stream ? 0x82724e : style.color);
    for (let i = 0; i < count; i++) {
      if (particles.length === MAX_PARTICLES) particles.shift();
      const angle = i * 2.39996 + emitted * 0.17;
      const radius = 0.25 + ((i * 7) % 17) / 17;
      const velocity = right.clone().multiplyScalar(Math.sin(angle) * radius * 1.2)
        .addScaledVector(up, Math.cos(angle) * radius).addScaledVector(forward, -0.5);
      const life = style.life * (0.75 + (i % 5) * 0.075);
      const p = { stream, inward: weaponId === 'vacuum', from: from.clone(), to: to.clone(), side: right.clone(), up: up.clone(),
        position: (hit || stream ? to : from.clone().lerp(to, 0.25)).clone(), velocity, angle,
        age: stream ? life * (i / count) * 0.65 : 0, life, size: style.size * radius,
        color: tint.clone(), opacity: weaponId === 'extinguisher' ? 0.6 : stream ? 0.4 : 0.7, spread: style.spread * radius };
      particles.push(p);
    }
    emitted++; last = { weaponId, hit, count, eventId }; upload(); return true;
  }
  return {
    root, emit,
    update(dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      dt = Math.min(dt, 0.05);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.age += dt;
        if (p.age >= p.life) { particles.splice(i, 1); continue; }
        if (!p.stream) { p.velocity.y -= dt * 1.6; p.position.addScaledVector(p.velocity, dt); }
      }
      upload();
    },
    resize(height) { material.uniforms.viewportHeight.value = height; },
    reset() { particles.length = 0; seen.clear(); last = null; emitted = 0; upload(); },
    info: () => ({ active: particles.length, emitted, last: last && { ...last } }),
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); particles.length = 0; seen.clear(); },
  };
}
