import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
 * Box models (villagers, bulls, the cart) are built from dozens of tiny meshes, one draw call
 * each. This bakes every group's plain-coloured meshes into one vertex-coloured mesh while keeping
 * the groups themselves, so legs, heads and wheels still animate.
 */
const shared = new THREE.MeshLambertMaterial({ vertexColors: true });
const sharedStd = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });

/** The same for the modelled figures: plain-coloured standard-material parts, merged per bone group. */
export function mergeParts(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => groups.push(o));
  for (const g of groups) {
    const all = g.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial && !c.material.map && !c.material.vertexColors && c.material.side === THREE.FrontSide,
    );
    // parts are merged per kind of surface (a material's userData.mergeKey, e.g. skin or cloth),
    // so each kind keeps its own shading instead of all becoming one plain material
    const kinds = new Map<string, THREE.Mesh[]>();
    for (const m of all) {
      const key = (m.material as THREE.Material).userData.mergeKey ?? "plain";
      if (!kinds.has(key)) kinds.set(key, []);
      kinds.get(key)!.push(m);
    }
    for (const [key, meshes] of kinds) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      const col = (m.material as THREE.MeshStandardMaterial).color;
      const n = geo.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "color"].includes(k)) geo.deleteAttribute(k);
      return geo;
    });
    const merged = mergeGeometries(parts);
    if (!merged) continue;
    for (const m of meshes) g.remove(m);
    const mesh = new THREE.Mesh(merged, kindMaterial(key, meshes[0].material as THREE.MeshStandardMaterial));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    }
  }
}

/** One shared vertex-coloured material per surface kind, copying that kind's shading. */
const kindMats = new Map<string, THREE.MeshStandardMaterial>();
function kindMaterial(key: string, like: THREE.MeshStandardMaterial) {
  if (key === "plain") return sharedStd;
  if (!kindMats.has(key)) {
    const m = like.clone();
    m.color.set(0xffffff);
    m.vertexColors = true;
    m.onBeforeCompile = like.onBeforeCompile; // (clone doesn't carry shader tweaks)
    m.customProgramCacheKey = () => "merged-" + key;
    kindMats.set(key, m);
  }
  return kindMats.get(key)!;
}

export function mergeBoxes(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => groups.push(o));
  for (const g of groups) {
    const meshes = g.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.MeshLambertMaterial && !c.material.map && !c.material.vertexColors,
    );
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      const col = (m.material as THREE.MeshLambertMaterial).color;
      const n = geo.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "color", "uv"].includes(k)) geo.deleteAttribute(k);
      return geo;
    });
    // keep uvs (a cloth's weave needs them) only if every part has them
    if (!parts.every((p) => p.getAttribute("uv"))) parts.forEach((p) => p.deleteAttribute("uv"));
    const merged = mergeGeometries(parts);
    if (!merged) continue;
    for (const m of meshes) {
      g.remove(m);
      m.geometry.dispose();
    }
    g.add(new THREE.Mesh(merged, shared));
  }
}
