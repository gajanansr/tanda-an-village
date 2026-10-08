import * as THREE from "three";
import { B } from "../../shared/blocks";
import { fbm } from "../../shared/noise";
import { D, W } from "../../shared/world";
import { type Heightfield, RES } from "./heightfield";
import { NOISE_GLSL } from "./glslNoise";
import { Q } from "../quality";

/*
 * The ground as one smooth mesh: vertex colours blend what each spot is made of (grass drying to
 * gold in patches, black and red soil, packed-earth roads, river sand), and the fragment shader adds
 * painterly variation so nothing reads as a flat colour or a grid. Near the camera it also gives the
 * ground relief — clods, pebbles and little ridges that catch the low sun — stronger on bare earth
 * than under grass (not on the low tier: it fills half the screen).
 */
const C = (h: string) => new THREE.Color(h);
const PALETTE: Record<number, THREE.Color> = {
  [B.GRASS]: C("#5e6c38"), // the earth under the grass: dark, with old thatch
  [B.DIRT]: C("#9a7c56"),
  [B.ROAD]: C("#ad8f66"),
  [B.BLACK_SOIL]: C("#5b4431"),
  [B.RED_SOIL]: C("#9a5030"),
  [B.SAND]: C("#c9b387"),
  [B.STONE]: C("#8b867c"),
  [B.TILLED]: C("#3a2d24"),
  [B.TILLED_WET]: C("#2c221c"),
};
const DRY = C("#8c7f4c"); // Deccan grass turning gold (the earth under it, darker than the blades)
const RIVERBED = C("#6a604c");

/** Worley-noise crack lines: ~1 where two cells meet (a crack), 0 inside them. */
const CRACK_GLSL = /* glsl */ `
float crackNet(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 h = fract(sin(vec2(dot(i + o, vec2(127.1, 311.7)), dot(i + o, vec2(269.5, 183.3)))) * 43758.5453);
    float d = length(o + h - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return 1.0 - smoothstep(0.0, 0.035, d2 - d1); // hairline cracks
}`;

export function buildTerrain(hf: Heightfield, waterLevel: number): THREE.Mesh {
  const n = hf.n;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const surf = new Float32Array(n * n * 4); // how much of each vertex is sand, wet mud, black (cracking) soil, bare rock
  const tmp = new THREE.Color();
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = i + n * j;
      const x = i / RES, z = j / RES;
      const y = hf.h[k];
      pos.set([x, y, z], k * 3);
      // average the colours of the columns this vertex touches
      tmp.setRGB(0, 0, 0);
      let c = 0, sand = 0, wet = 0, black = 0, rockW = 0;
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const sx = Math.min(W - 1, Math.max(0, Math.floor(x + dx))), sz = Math.min(D - 1, Math.max(0, Math.floor(z + dz)));
        const id = hf.surface[sx + W * sz];
        if (id === B.SAND) sand += 0.25;
        if (id === B.STONE) rockW += 0.25;
        if (id === B.TILLED_WET) wet += 0.25;
        if (id === B.BLACK_SOIL) black += 0.25; // untilled black soil cracks; ploughed soil is clods
        let base = PALETTE[id] ?? PALETTE[B.GRASS];
        if (id === B.GRASS) base = base.clone().lerp(DRY, Math.max(0, Math.min(1, (fbm(sx / 30, sz / 30, 99, 3) - 0.42) * 2.4)));
        tmp.add(base);
        c++;
      }
      tmp.multiplyScalar(1 / c);
      if (y < waterLevel + 0.4) tmp.lerp(RIVERBED, Math.min(1, (waterLevel + 0.4 - y) / 1.2)); // wet mud down to the riverbed
      col.set([tmp.r, tmp.g, tmp.b], k * 3);
      surf.set([sand, Math.max(wet, Math.min(1, (waterLevel + 0.6 - y) / 0.8)), black, rockW], k * 4); // the banks are wet too
    }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let t = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = i + n * j, b = a + 1, c = a + n, d = c + 1;
      idx.set([a, c, b, b, c, d], t);
      t += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSurf", new THREE.BufferAttribute(surf, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  if (Q.tier !== "low") mat.defines = { BG_RELIEF: "" };
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBgWorld;\nvarying vec3 vBgNormal;\nattribute vec4 aSurf;\nvarying vec4 vSurf;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBgNormal = normal;\nvSurf = aSurf;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBgWorld;\nvarying vec3 vBgNormal;\nvarying vec4 vSurf;\nfloat bgBare;\nfloat bgCrack;\n" + NOISE_GLSL + CRACK_GLSL +
        "\nfloat bgRelief(vec2 p){ return bgNoise(p * 2.3) * 0.5 + bgNoise(p * 6.7 + 3.0) * 0.32 + bgNoise(p * 15.0 + 9.0) * 0.2; }")
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec2 wp = vBgWorld.xz;
        float broad = bgFbm(wp * 0.06);
        float mid = bgFbm(wp * 0.35 + 7.0);
        float fine = bgNoise(wp * 3.1);
        diffuseColor.rgb *= mix(0.84, 1.12, broad) * mix(0.9, 1.08, mid) * mix(0.9, 1.08, fine);
        // clods and pebbles in bare earth
        float bare = 1.0 - smoothstep(0.1, 0.25, diffuseColor.g - diffuseColor.b);
        diffuseColor.rgb *= 1.0 + bare * (1.0 - vSurf.w) * (bgNoise(wp * 9.0) - 0.5) * 0.35;
        bgBare = bare;
        // slopes show a little earth through the grass
        float slope = 1.0 - clamp(vBgNormal.y, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.42, 0.3), clamp(slope * 2.2, 0.0, 0.45));
        // bare rock (the tekdi): layered strata and blocky ledges instead of speckle; rock is grey-brown
        // and shows where the ground is steep and not green
        float rock = vSurf.w;
        float strata = sin(vBgWorld.y * 3.1 + bgNoise(wp * 0.5) * 2.5) * 0.5 + 0.5;
        float ledge = smoothstep(0.75, 0.95, strata);
        vec3 rockCol = mix(vec3(0.43, 0.39, 0.33), vec3(0.58, 0.53, 0.45), bgNoise(wp * 0.9 + vBgWorld.y));
        rockCol *= mix(0.72, 1.06, strata) * (1.0 - ledge * 0.35) * mix(0.85, 1.1, bgNoise(vec2(wp.x + wp.y, vBgWorld.y) * 6.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rock * 0.85);
        // sand: fine grain and a few bright quartz specks
        diffuseColor.rgb *= 1.0 + vSurf.x * ((bgNoise(wp * 22.0) - 0.5) * 0.22 + step(0.93, bgNoise(wp * 41.0)) * 0.18);
        // black cotton soil dries into a net of cracks (not where it's wet)
        // only in dry patches, the lines wandering (warped) so the cells aren't a tidy mosaic
        vec2 cw = wp * 2.2 + vec2(bgNoise(wp * 1.3), bgNoise(wp * 1.3 + 5.0)) * 0.9;
        float patchy = smoothstep(0.58, 0.75, bgFbm(wp * 0.18 + 3.0));
        bgCrack = vSurf.z * (1.0 - vSurf.y) * patchy * crackNet(cw) * (1.0 - smoothstep(8.0, 22.0, distance(cameraPosition, vBgWorld)));
        diffuseColor.rgb *= 1.0 - bgCrack * 0.28;
        // wet mud: darker and richer
        diffuseColor.rgb *= 1.0 - vSurf.y * 0.32;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - vSurf.y * 0.55; // wet mud glistens",
      )
      .replace(
        "#include <normal_fragment_begin>",
        /* glsl */ `#include <normal_fragment_begin>
        #ifdef BG_RELIEF
        {
          // tilt the normal by the slope of a small height field; fades out with distance (no shimmer)
          vec2 rp = vBgWorld.xz;
          float k = mix(0.18, 0.55, bgBare) * (1.0 - smoothstep(18.0, 55.0, distance(cameraPosition, vBgWorld)));
          if (k > 0.001) {
            float e = 0.035, h0 = bgRelief(rp);
            vec2 g = vec2(bgRelief(rp + vec2(e, 0.0)) - h0, bgRelief(rp + vec2(0.0, e)) - h0) / e;
            // crack edges catch the light; sand carries faint wind ripples
            // (no relief from cracks: it made the cells read as raised tiles)
            g += vec2(cos(rp.x * 5.0 + rp.y * 2.0 + bgNoise(rp) * 3.0), 0.0) * vSurf.x * 0.6;
            vec3 nw = normalize(normalize(vBgNormal) + vec3(-g.x, 0.0, -g.y) * k * 0.12);
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          }
        }
        #endif`,
      );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}
