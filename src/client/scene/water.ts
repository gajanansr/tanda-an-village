import * as THREE from "three";
import { D, W } from "../../shared/world";
import type { Heightfield } from "./heightfield";
import { NOISE_GLSL } from "./glslNoise";

/*
 * The river: a plane at water level whose shader knows the ground beneath it (a small height
 * texture), so it is clear and pale in the shallows, deep green-blue in the channel, with a soft
 * edge on the banks, moving ripples, sky reflection by angle and a sun glint.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  /** `pond` limits the sheet to one pond, an ellipse (centre x, z and radii); without it the water covers the map. */
  private rt?: THREE.WebGLRenderTarget;
  private mirror = new THREE.PerspectiveCamera();
  private plane: THREE.Plane;
  private centre: THREE.Vector3;

  constructor(hf: Heightfield, private level: number, pond?: { x: number; z: number; rx: number; rz: number }) {
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -level);
    this.centre = new THREE.Vector3(pond?.x ?? W / 2, level, pond?.z ?? D / 2);
    const data = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) data[x + W * z] = Math.max(0, Math.min(255, ((hf.at(x + 0.5, z + 0.5) - level + 4) / 8) * 255));
    const tex = new THREE.DataTexture(data, W, D, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.uniforms = {
      uTime: { value: 0 },
      uGround: { value: tex },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color("#fff2d8") },
      uSky: { value: new THREE.Color("#8fb4d6") },
      uHorizon: { value: new THREE.Color("#e8d8c0") },
      uRefl: { value: null as THREE.Texture | null },
      uReflOn: { value: 0 },
      uReflMat: { value: new THREE.Matrix4() },
      uPond: { value: pond ? new THREE.Vector4(pond.x, pond.z, pond.rx, pond.rz) : new THREE.Vector4(0, 0, 0, 0) },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uRefl; uniform float uReflOn; uniform mat4 uReflMat;
        uniform float uTime; uniform sampler2D uGround; uniform vec3 uSunDir, uSunColor, uSky, uHorizon; uniform vec4 uPond;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main(){
          vec2 uv = vWorld.xz / vec2(${W.toFixed(1)}, ${D.toFixed(1)});
          float ground = texture2D(uGround, uv).r * 8.0 - 4.0;   // ground height relative to the water
          float depth = clamp(-ground, 0.0, 4.0);
          if (depth < 0.02) discard;
          // a pond's sheet stops at its own banks, even where lower ground lies beyond them
          if (uPond.z > 0.0 && length((vWorld.xz - uPond.xy) / uPond.zw) > 1.06) discard;
          // ripples: two drifting noise fields make a gently moving normal
          vec2 p = vWorld.xz;
          float e = 0.15;
          float h0 = bgFbm(p * 0.45 + vec2(uTime * 0.12, uTime * 0.05)) + 0.5 * bgNoise(p * 1.7 - uTime * 0.3) + 0.25 * bgNoise(p * 5.0 + uTime * 0.5);
          float hx = bgFbm((p + vec2(e, 0.0)) * 0.45 + vec2(uTime * 0.12, uTime * 0.05)) + 0.5 * bgNoise((p + vec2(e, 0.0)) * 1.7 - uTime * 0.3) + 0.25 * bgNoise((p + vec2(e, 0.0)) * 5.0 + uTime * 0.5);
          float hz = bgFbm((p + vec2(0.0, e)) * 0.45 + vec2(uTime * 0.12, uTime * 0.05)) + 0.5 * bgNoise((p + vec2(0.0, e)) * 1.7 - uTime * 0.3) + 0.25 * bgNoise((p + vec2(0.0, e)) * 5.0 + uTime * 0.5);
          vec3 n = normalize(vec3((h0 - hx) * 0.35, 1.0, (h0 - hz) * 0.35));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          // Deccan water is murky: silty olive in the shallows, dark green-brown in the channel
          vec3 shallow = vec3(0.22, 0.25, 0.16), deep = vec3(0.05, 0.11, 0.09);
          vec3 body = mix(shallow, deep, smoothstep(0.05, 1.8, depth));
          body *= 0.55 + 0.45 * max(uSunDir.y, 0.0) + 0.1; // the water's own colour follows the daylight
          // the sky reflects mostly at low angles; near the banks the reflection is of earth and reeds
          // what the water mirrors: low down it's the banks, trees and hills around it (dark), and only
          // steeper up the sky; so a pond reads dark and glassy, not milky
          float day = 0.35 + 0.65 * max(uSunDir.y, 0.0);
          vec3 land = vec3(0.16, 0.18, 0.12) * day;
          float up = reflect(-v, n).y;
          vec3 refl = mix(land, mix(uHorizon, uSky, smoothstep(0.35, 0.9, up)) * 0.8, smoothstep(0.12, 0.45, up));
          if (uReflOn > 0.5) {
            // a real mirror image of the banks, reeds and sky, wobbled by the ripples
            vec4 rp = uReflMat * vec4(vWorld, 1.0);
            refl = texture2D(uRefl, rp.xy / rp.w + n.xz * 0.06).rgb;
          }
          vec3 col = mix(body, refl, uReflOn > 0.5 ? 0.12 + 0.7 * fres : 0.04 + 0.45 * fres);
          float spec = pow(max(dot(reflect(-normalize(uSunDir), n), v), 0.0), 220.0);
          col += uSunColor * spec * 1.2; // small, sharp sun glints
          // a pale line where the water meets the bank
          col = mix(col, vec3(0.62, 0.6, 0.5), (1.0 - smoothstep(0.02, 0.1, depth)) * 0.2); // a wet line where it meets the bank
          float alpha = mix(0.88, 0.99, smoothstep(0.05, 0.6, depth)); // silty: you only just see the bottom at the edge
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    });
    const [x0, z0, x1, z1] = pond ? [pond.x - pond.rx - 1, pond.z - pond.rz - 1, pond.x + pond.rx + 1, pond.z + pond.rz + 1] : [0, 0, W, D];
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, level, (z0 + z1) / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 3;
    this.mesh.name = "water";
  }

  /** Turn on the real mirror reflection (a second, small render of the scene each frame). */
  enableReflection(size = 512) {
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
    this.uniforms.uRefl.value = this.rt.texture;
  }

  /**
   * Render what the water mirrors: the scene seen from the camera reflected below the surface, clipped
   * to what's above the water. Skipped when the water is far away or off screen.
   */
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera) {
    const on = !!this.rt && cam.position.y > this.level && cam.position.distanceTo(this.centre) < 70 &&
      new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)).containsPoint(this.centre);
    this.uniforms.uReflOn.value = on ? 1 : 0;
    if (!on) return;
    const L = this.level, m = this.mirror;
    m.copy(cam);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    m.position.set(cam.position.x, 2 * L - cam.position.y, cam.position.z);
    m.up.set(up.x, -up.y, up.z);
    m.lookAt(m.position.x + fwd.x, m.position.y - fwd.y, m.position.z + fwd.z);
    m.updateMatrixWorld();
    m.projectionMatrix.copy(cam.projectionMatrix);
    this.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(m.projectionMatrix).multiply(m.matrixWorldInverse);
    const prevTarget = renderer.getRenderTarget(), prevClip = renderer.clippingPlanes;
    this.mesh.visible = false;
    renderer.clippingPlanes = [this.plane];
    renderer.setRenderTarget(this.rt!);
    renderer.clear();
    renderer.render(scene, m);
    renderer.setRenderTarget(prevTarget);
    renderer.clippingPlanes = prevClip;
    this.mesh.visible = true;
  }

  update(t: number, sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color, horizon: THREE.Color) {
    this.uniforms.uTime.value = t;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSky.value.copy(sky);
    this.uniforms.uHorizon.value.copy(horizon);
  }
}
