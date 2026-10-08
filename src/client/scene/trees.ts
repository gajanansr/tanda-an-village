import { PHOTO, Q } from "../quality";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../../shared/rng";
import type { Tree } from "../../shared/world";
import { NOISE_GLSL } from "./glslNoise";

/*
 * Neem and banyan trees, grown procedurally: a leaning, tapering trunk that forks into a few
 * branches, and a canopy of soft leafy clumps (noise-displaced spheres) shaded from dark inside to
 * sunlit on top. The canopy sways in the same wind as the grass. All trees share two draw calls.
 * In the fragment shader the canopy breaks up into leaves: small clusters of light and dark leaves,
 * bumpy lighting, a frayed outline (no smooth blob edge) and a little light coming through the
 * shaded side. The bark is a photo, wrapped round each trunk and branch at its real scale.
 */
// photographed bark (CC0, Poly Haven; public/textures/CREDITS.md): grey-brown and deeply fissured, like neem
const barkTex = (f: string, srgb: boolean) => {
  const t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${f}.jpg`);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};
const barkMat = PHOTO
  ? new THREE.MeshStandardMaterial({ map: barkTex("bark_brown_02", true), normalMap: barkTex("bark_brown_02_n", false), normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.95 })
  : new THREE.MeshStandardMaterial({ color: "#6e5a48", roughness: 1 });
/** A sprig of leaves painted on a canvas: neem-like leaflets with a midrib, transparent between. */
function leafTexture() {
  // a neem sprig: small pointed leaflets (~6 cm at card scale), each shaded from a pale midrib to darker
  // edges and lit from one side, with a glossy, lighter top and a duller, bluer underside
  const S = 512, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!, r = mulberry32(4242);
  for (let i = 0; i < 1000; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.65) * S * 0.46;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, len = 18 + r() * 14, ang = a + (r() - 0.5) * 1.8;
    const under = r() < 0.3, k = 0.55 + r() * 0.5;
    const base = under ? [130, 165, 112] : [108, 168, 70];
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const grd = g.createLinearGradient(0, -len * 0.22, 0, len * 0.22);
    const col = (m: number) => `rgb(${base[0] * k * m},${base[1] * k * m},${base[2] * k * m})`;
    grd.addColorStop(0, col(0.72));
    grd.addColorStop(0.45, col(1.12));
    grd.addColorStop(1, col(0.82));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(-len * 0.1, -len * 0.24, len / 2, -len * 0.02);
    g.quadraticCurveTo(-len * 0.1, len * 0.22, -len / 2, 0);
    g.fill();
    g.strokeStyle = `rgba(200,220,150,${under ? 0.15 : 0.3})`; // the midrib
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.lineTo(len / 2, -len * 0.02);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function leafMaterial(uniforms: { uTime: { value: number } }) {
  const m = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <alphatest_fragment>",
      /* glsl */ `// far away the texture's smaller mip levels average the gaps into the leaves and the canopy
      // goes bare; boost alpha by the mip level so trees keep their leaves at any distance
      vec2 lt = vMapUv * 512.0;
      float lmip = max(0.0, 0.5 * log2(max(dot(dFdx(lt), dFdx(lt)), dot(dFdy(lt), dFdy(lt)))));
      diffuseColor.a *= 1.0 + lmip * 0.55;
      #include <alphatest_fragment>`,
    ).replace(
      "#include <emissivemap_fragment>",
      /* glsl */ `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * vec3(0.16, 0.2, 0.08); // light through the leaves: shaded sides stay green, not navy`,
    );
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\n" + NOISE_GLSL)
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        vec4 wpos = modelMatrix * vec4(transformed, 1.0);
        float g = bgNoise(wpos.xz * 0.045 + vec2(uTime * 0.23, uTime * 0.11));
        float sway = (g - 0.35) * 0.35 + sin(uTime * 1.7 + wpos.x * 0.3 + wpos.z * 0.2) * 0.05;
        transformed.x += sway * color.a * 1.0;
        transformed.z += sway * color.a * 0.45;`,
      );
  };
  return m;
}

/** A tapered tube along a list of points (a trunk or a branch). */
function tube(points: THREE.Vector3[], r0: number, r1: number) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, 8, 1, 7, false);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  // TubeGeometry has a fixed radius; taper it by pulling vertices toward the curve
  const segs = 8, rad = 7;
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r);
    }
  }
  g.computeVertexNormals();
  // the bark photo at its real size (about 0.7 m across), its grain running along the branch
  const len = curve.getLength(), uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i <= segs; i++) {
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= rad; j++) uv.setXY(i * (rad + 1) + j, (j / rad) * Math.max(1, Math.round((Math.PI * 2 * r) / 0.7)), ((i / segs) * len) / 0.7);
  }
  return g;
}

/**
 * One leafy clump: leaf cards (small textured quads) scattered through a flattened ball, mostly near
 * its surface, each tilted outward. Normals point out from the clump's centre so it lights as a soft
 * mass; colour darkens inside and underneath; vertex alpha carries the sway weight.
 */
function clump(center: THREE.Vector3, radius: number, rnd: () => number, base: THREE.Color, sway: number) {
  const n = Math.round((Q.treeDetail > 1 ? 60 : 30) * Math.min(1.6, Math.max(0.6, radius / 1.6)));
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = [];
  const tmp = new THREE.Color(), q = new THREE.Quaternion(), z = new THREE.Vector3(0, 0, 1);
  const size = radius * (Q.treeDetail > 1 ? 0.9 : 1.15);
  for (let i = 0; i < n; i++) {
    const d = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    const depth = 0.4 + 0.6 * Math.pow(rnd(), 0.55); // mostly in the outer shell, some deeper so it isn't hollow
    const c = d.clone().multiplyScalar(radius * depth);
    c.y *= 0.78;
    c.add(center);
    // face roughly outward, with some random twist and tilt
    const face = d.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.9)).normalize();
    q.setFromUnitVectors(z, face).multiply(new THREE.Quaternion().setFromAxisAngle(z, rnd() * Math.PI * 2));
    const s = size * (0.75 + rnd() * 0.5);
    const up = d.y * 0.5 + 0.5;
    tmp.copy(base).multiplyScalar((0.78 + 0.45 * up) * (0.82 + 0.18 * depth)).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06);
    const v0 = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const p = new THREE.Vector3((u - 0.5) * s, (v - 0.5) * s, 0).applyQuaternion(q).add(c);
      pos.push(p.x, p.y, p.z);
      const nn = p.clone().sub(center).normalize();
      nrm.push(nn.x, nn.y * 1.2, nn.z);
      col.push(tmp.r, tmp.g, tmp.b, sway * (0.4 + 0.6 * up));
      uv.push(u, v);
    }
    idx.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.normalizeNormals();
  return g;
}

export class Trees {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 } };

  constructor(trees: Tree[], groundAt: (x: number, z: number) => number) {
    const barks: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const neemGreen = new THREE.Color("#4e6e2c"), banyanGreen = new THREE.Color("#3c5e28"); // dusty Deccan greens
    for (const t of trees) {
      const rnd = mulberry32(Math.floor(t.x * 131 + t.z * 7));
      const y0 = groundAt(t.x, t.z) - 0.2;
      const big = t.kind === "banyan";
      const H = big ? 5.6 : (t.h * 0.95 + 0.6) * (0.68 + rnd() * 0.14); // neem fork low; the crown, not the trunk, makes the height
      const lean = new THREE.Vector3((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9);
      const top = new THREE.Vector3(t.x, y0 + H, t.z).add(lean);
      const trunk = [new THREE.Vector3(t.x, y0, t.z), new THREE.Vector3(t.x + lean.x * 0.3, y0 + H * 0.45, t.z + lean.z * 0.3), top];
      barks.push(tube(trunk, big ? 0.75 : 0.26, big ? 0.45 : 0.14));
      // branches fanning out to hold the canopy
      const nb = big ? 7 : 3 + Math.floor(rnd() * 4);
      const tips: THREE.Vector3[] = [];
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + rnd();
        // uneven branches: some reach far and low, some climb, so no two crowns share a shape
        const reach = t.r * (big ? 0.7 * (0.6 + rnd() * 0.4) : 0.45 + rnd() * 0.75);
        const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * reach, big ? 0.6 + rnd() * 0.8 : 0.5 + rnd() * 1.9, Math.sin(a) * reach));
        const mid = top.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.4, 0));
        barks.push(tube([top.clone().add(new THREE.Vector3(0, -0.3, 0)), mid, tip], big ? 0.3 : 0.12, 0.05));
        tips.push(tip);
      }
      if (big) {
        // aerial roots dropping from the branches, the banyan's signature
        for (const tip of tips.slice(0, 5)) {
          const foot = new THREE.Vector3(tip.x * 0.8 + t.x * 0.2, 0, tip.z * 0.8 + t.z * 0.2);
          foot.y = groundAt(foot.x, foot.z) - 0.1;
          barks.push(tube([tip.clone().add(new THREE.Vector3(0, -0.4, 0)), foot.clone().lerp(tip, 0.5), foot], 0.09, 0.14));
        }
      }
      // the canopy: clumps around the branch tips and over the crown
      const green = (big ? banyanGreen : neemGreen).clone().offsetHSL((rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.08);
      const sway = big ? 0.25 : 0.6;
      for (const tip of tips) leaves.push(clump(tip.clone().add(new THREE.Vector3(0, 0.5, 0)), (big ? 2.6 : t.r * 0.62) * (0.7 + rnd() * 0.55), rnd, green, sway));
      leaves.push(clump(top.clone().add(new THREE.Vector3((rnd() - 0.5) * t.r * 0.5, big ? 1.8 : 1.2 + rnd() * 1.2, (rnd() - 0.5) * t.r * 0.5)), big ? 3.8 : t.r * (0.6 + rnd() * 0.35), rnd, green, sway));
      // a few smaller clumps off-centre and lower: a ragged crown, not a ball on a stick
      if (!big) for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) {
        const a = rnd() * Math.PI * 2, d = t.r * (0.4 + rnd() * 0.6);
        leaves.push(clump(top.clone().add(new THREE.Vector3(Math.cos(a) * d, 0.2 + rnd() * 1.2, Math.sin(a) * d)), t.r * (0.35 + rnd() * 0.3), rnd, green, sway));
      }
      if (big) for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * t.r * 0.8;
        leaves.push(clump(top.clone().add(new THREE.Vector3(Math.cos(a) * d, 1 + rnd() * 1.4, Math.sin(a) * d)), 2.4 + rnd(), rnd, green, sway));
      }
    }
    for (const [geos, mat] of [[barks, barkMat], [leaves, leafMaterial(this.uniforms)]] as const) {
      const clean = geos.map((g) => {
        const q = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(q.attributes)) if (!["position", "normal", "color", "uv"].includes(k)) q.deleteAttribute(k);
        if (!q.getAttribute("color")) {
          const c = new Float32Array(q.getAttribute("position").count * 4).fill(1);
          q.setAttribute("color", new THREE.BufferAttribute(c, 4));
        }
        return q;
      });
      const merged = mergeGeometries(clean);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
  }
}
