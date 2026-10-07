import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { Season } from "../../shared/time";
import { Q } from "../quality";

/*
 * The film look: a soft bloom on bright sky and sun glints, then a grade — warm highlights, a touch
 * of lift in the shadows, gentle saturation and a vignette — before filmic tone mapping.
 * On summer afternoons the same pass adds heat haze: the far distance shimmers (it reads the scene's
 * depth, so near things stay still) and the grade turns hot and dusty.
 */
const Grade = {
  uniforms: {
    tDiffuse: { value: null }, uWarm: { value: 0.8 }, uVignette: { value: 0.32 },
    tDepth: { value: null as THREE.DepthTexture | null }, uHeat: { value: 0 }, uTime: { value: 0 }, uNear: { value: 0.1 }, uFar: { value: 900 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float uWarm, uVignette, uHeat, uTime, uNear, uFar; varying vec2 vUv;
    float dist(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, uNear, uFar); }
    void main(){
      vec2 uv = vUv;
      if (uHeat > 0.0) {
        // rising heat: thin wavering bands, strongest far away
        float k = uHeat * smoothstep(25.0, 150.0, dist(vUv));
        vec2 w = vec2(sin(vUv.y * 260.0 - uTime * 5.0 + sin(vUv.x * 23.0 + uTime * 0.7) * 2.0), cos(vUv.y * 190.0 - uTime * 3.6 + vUv.x * 37.0));
        vec2 s = vUv + w * k * vec2(0.0022, 0.0016);
        if (dist(s) > 20.0) uv = s; // never pull a near object's pixels into the distance (no halos)
      }
      vec4 c = texture2D(tDiffuse, uv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.22);                                         // a little richer colour
      c.rgb += vec3(0.0, 0.012, 0.04) * (1.0 - smoothstep(0.0, 0.4, l));    // cool, slightly blue shadows    // lifted, slightly violet shadows
      c.rgb *= mix(vec3(1.0), vec3(1.1, 1.02, 0.86), smoothstep(0.3, 1.1, l) * uWarm); // warm highlights
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.99, 0.86) + vec3(0.035, 0.022, 0.0), uHeat * 0.7); // hot, dusty air
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = c;
    }`,
};

/** How strong the heat haze is (0–1): summer (unhala) afternoons only, building from late morning. */
export const heatHaze = (season: Season, hour: number) => {
  if (season !== "unhala") return 0;
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return ss(10, 13, hour) * (1 - ss(15.5, 17.5, hour));
};

export class Post {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade = new ShaderPass(Grade);
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    // the scene target: half-float for the bloom, multisampled on the high tier (our antialiasing)
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Q.msaa });
    target.depthTexture = new THREE.DepthTexture(1, 1); // read by the heat haze
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.16, 0.5, 0.93);
    this.bloom.enabled = Q.bloom;
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }
  /** Bloom is the costliest pass (five blurs); low-end devices go without. */
  setBloom(on: boolean) {
    this.bloom.enabled = on;
  }
  /** Heat haze for this frame (see `heatHaze`); the low tier goes without. */
  setHeat(heat: number, t: number) {
    const u = this.grade.uniforms;
    u.uHeat.value = Q.tier === "low" ? 0 : heat;
    u.uTime.value = t;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
  }
  render() {
    this.grade.uniforms.tDepth.value = this.composer.readBuffer.depthTexture; // where the scene was drawn
    this.composer.render();
  }
}
