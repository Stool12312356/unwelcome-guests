import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Subtle photographic finish, no bloom haze or chromatic aberration over targets. */
export function createRendering(renderer, scene, camera, foreground = null) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const render = new RenderPass(scene, camera);
  const output = new OutputPass();
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, time: { value: 0 }, horror: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float horror;
      varying vec2 vUv;
      void main() {
        vec3 c=texture2D(tDiffuse,vUv).rgb;
        float l=dot(c,vec3(.2126,.7152,.0722));
        c=mix(vec3(l),c,.9-horror*.12);
        vec2 p=(vUv-.5)*vec2(1.,.85);
        float vignette=smoothstep(.16,.68,length(p));
        c*=1.-vignette*(.23+horror*.08);
        float grain=fract(sin(dot(vUv+mod(time,13.),vec2(12.9898,78.233)))*43758.5453)-.5;
        c+=grain*.009;
        gl_FragColor=vec4(c,1.);
      }`,
  });
  composer.addPass(render);
  let foregroundPass;
  if (foreground) {
    // Keep the apartment colour, clear only depth before drawing the hand/tool.
    foregroundPass = new RenderPass(foreground.scene, foreground.camera);
    foregroundPass.clear = false;
    foregroundPass.clearDepth = true;
    composer.addPass(foregroundPass);
  }
  composer.addPass(output); composer.addPass(finish);
  return {
    resize(width, height) { composer.setSize(width, height); },
    render(time, horror) {
      finish.uniforms.time.value = time;
      finish.uniforms.horror.value = horror;
      composer.render();
    },
    dispose() { render.dispose(); foregroundPass?.dispose(); output.dispose(); finish.dispose(); composer.dispose(); },
  };
}
