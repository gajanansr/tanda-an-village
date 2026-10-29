import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/*
 * The village's statues and murtis. Each one is drawn first as a figure modelled in code, so the
 * village is never missing it, and then swapped for a real 3D scan if one is listed in
 * public/statues/statues.json. The scans are a single material (bronze, marble, or sindoor-red
 * stone), so a plain STL works as well as a GLB. See docs/statues.md for adding one.
 */
export type StatueId = "shivaji" | "naik" | "sevalal" | "hanuman";
type Entry = { file: string; height: number; material?: Finish; rotY?: number; credit?: string };
export type Finish = "bronze" | "marble" | "sindoor" | "keep";

const BASE = `${import.meta.env.BASE_URL}statues/`;
type Manifest = Partial<Record<StatueId, Entry>>;
let manifest: Promise<Manifest> | null = null;
const listed = (): Promise<Manifest> =>
  (manifest ??= fetch(`${BASE}statues.json`)
    .then((r): Promise<Manifest> | Manifest => (r.ok ? r.json() : {}))
    .catch((): Manifest => ({})));

/** Patinated bronze: dark in the folds, warm where hands have rubbed it. */
export const FINISH: Record<Exclude<Finish, "keep">, () => THREE.MeshStandardMaterial> = {
  bronze: () => new THREE.MeshStandardMaterial({ color: "#6e4f2c", metalness: 0.8, roughness: 0.36 }),
  marble: () => new THREE.MeshStandardMaterial({ color: "#f1ece2", metalness: 0, roughness: 0.32 }),
  sindoor: () => new THREE.MeshStandardMaterial({ color: "#d4471c", metalness: 0.05, roughness: 0.42 }),
};

async function loadModel(e: Entry): Promise<THREE.Object3D> {
  const url = BASE + e.file;
  if (/\.stl$/i.test(e.file)) {
    const geo = await new STLLoader().loadAsync(url);
    geo.computeVertexNormals();
    // STL scans are usually Z-up
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, FINISH[e.material === "keep" || !e.material ? "bronze" : e.material]());
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  return gltf.scene;
}

/**
 * Put the listed scan of `id` in `slot` in place of the modelled figure: scaled to its height, its
 * feet on the slot's floor, centred, facing the slot's +z. Leaves the modelled figure if there's no scan.
 */
export async function swapInScan(id: StatueId, slot: THREE.Group, modelled: THREE.Object3D) {
  const e = (await listed())[id];
  if (!e) return;
  let obj: THREE.Object3D;
  try {
    obj = await loadModel(e);
  } catch {
    return; // a missing or broken file: keep the modelled figure
  }
  const m = e.material && e.material !== "keep" ? FINISH[e.material]() : null;
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.getAttribute("normal")) mesh.geometry.computeVertexNormals(); // generated meshes may come without
    if (m) mesh.material = m;
  });
  obj.rotation.y = e.rotY ?? 0;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const k = e.height / Math.max(size.y, 1e-6);
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box.min.y;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  slot.remove(modelled);
  slot.add(obj);
}

/**
 * Chhatrapati Shivaji Maharaj on horseback, in bronze: the horse with its near foreleg raised, the
 * rider in his pagadi with its kalgi plume, beard, a shela flying behind, the talwar held high.
 * Faces +z, hooves at y = 0, about 3.4 m to the sword's tip.
 */
export function shivajiFigure(mat: THREE.Material = FINISH.bronze()) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  /** A limb from a to b: a capsule of radius r. */
  const limb = (a: THREE.Vector3, b: THREE.Vector3, r: number, r2 = r) => {
    const len = a.distanceTo(b);
    const m = add(new THREE.CylinderGeometry(r2, r, len, 10));
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    add(new THREE.SphereGeometry(r, 10, 8), a.x, a.y, a.z);
    return m;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // the horse: barrel, chest and haunches
  const barrel = add(new THREE.CapsuleGeometry(0.34, 0.95, 8, 16).rotateX(Math.PI / 2), 0, 1.32, 0);
  barrel.scale.set(0.92, 1, 1);
  add(new THREE.SphereGeometry(0.4, 16, 12).scale(0.88, 1, 0.9), 0, 1.4, 0.55); // chest
  add(new THREE.SphereGeometry(0.4, 16, 12).scale(0.95, 0.95, 0.9), 0, 1.38, -0.58); // haunches
  // neck arched up and forward, the head bowed at the poll
  limb(V(0, 1.55, 0.7), V(0, 2.15, 1.05), 0.2, 0.13);
  const head = add(new THREE.CylinderGeometry(0.09, 0.13, 0.55, 10));
  head.position.set(0, 2.05, 1.27);
  head.rotation.x = 1.15;
  add(new THREE.SphereGeometry(0.1, 10, 8).scale(1, 0.85, 1.1), 0, 1.92, 1.48); // muzzle
  for (const s of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(0.035, 0.13, 6), s * 0.06, 2.3, 1.1);
    ear.rotation.x = -0.3;
  }
  // the mane, a crest along the top of the neck
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const m = add(new THREE.BoxGeometry(0.05, 0.16, 0.1), 0, 1.72 + t * 0.55, 0.62 + t * 0.4);
    m.rotation.x = -0.6;
  }
  // legs: both hind and the far foreleg planted, the near foreleg lifted and bent
  for (const s of [-1, 1]) {
    limb(V(s * 0.2, 1.2, -0.62), V(s * 0.2, 0.62, -0.78), 0.11, 0.08);
    limb(V(s * 0.2, 0.62, -0.78), V(s * 0.2, 0.08, -0.7), 0.065, 0.05);
    add(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 10), s * 0.2, 0.04, -0.7); // hoof
  }
  limb(V(-0.19, 1.15, 0.6), V(-0.19, 0.6, 0.66), 0.1, 0.075);
  limb(V(-0.19, 0.6, 0.66), V(-0.19, 0.08, 0.64), 0.06, 0.05);
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 10), -0.19, 0.04, 0.64);
  limb(V(0.19, 1.15, 0.6), V(0.19, 0.95, 0.98), 0.1, 0.075); // raised: forearm out level…
  limb(V(0.19, 0.95, 0.98), V(0.19, 0.6, 0.92), 0.06, 0.05); // …and the cannon hanging down
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 10), 0.19, 0.56, 0.9);
  // the tail, streaming back
  const tail = new THREE.CatmullRomCurve3([V(0, 1.5, -0.95), V(0, 1.35, -1.15), V(0, 1.0, -1.25), V(0, 0.7, -1.2)]);
  add(new THREE.TubeGeometry(tail, 12, 0.07, 8));
  // saddle cloth and stirrups
  add(new THREE.BoxGeometry(0.78, 0.06, 0.7), 0, 1.66, -0.02);

  // the rider: seat, thighs along the barrel, a straight back
  add(new THREE.SphereGeometry(0.2, 12, 10).scale(1.1, 0.7, 1), 0, 1.78, -0.05);
  for (const s of [-1, 1]) {
    limb(V(s * 0.17, 1.78, 0), V(s * 0.33, 1.42, 0.22), 0.085, 0.07); // thigh
    limb(V(s * 0.33, 1.42, 0.22), V(s * 0.33, 1.05, 0.12), 0.06, 0.05); // shin
    add(new THREE.BoxGeometry(0.09, 0.07, 0.22), s * 0.33, 1.0, 0.18); // mojadi
  }
  add(new THREE.CylinderGeometry(0.2, 0.22, 0.55, 14), 0, 2.1, 0); // the angarkha's body
  add(new THREE.CylinderGeometry(0.22, 0.26, 0.24, 14), 0, 1.86, 0); // its skirt over the saddle
  add(new THREE.SphereGeometry(0.21, 14, 10).scale(1.05, 0.6, 0.9), 0, 2.36, 0); // shoulders
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), 0, 2.48, 0.01); // neck
  add(new THREE.SphereGeometry(0.115, 16, 12).scale(0.92, 1.08, 1), 0, 2.62, 0.02); // head
  add(new THREE.ConeGeometry(0.075, 0.18, 10).rotateX(Math.PI), 0, 2.51, 0.09); // the pointed beard
  add(new THREE.SphereGeometry(0.02, 6, 5), 0, 2.61, 0.13); // nose
  // the pagadi: a tall wrapped turban sloping back, with the kalgi plume and a string of pearls
  const pagadi = add(new THREE.CylinderGeometry(0.115, 0.13, 0.17, 14), 0, 2.76, -0.01);
  pagadi.rotation.x = -0.2;
  add(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.1), 0, 2.84, -0.03);
  const kalgi = add(new THREE.ConeGeometry(0.025, 0.24, 6), 0, 2.98, 0.08);
  kalgi.rotation.x = -0.35;
  // the right arm raised, the talwar high; the left holds the reins
  limb(V(0.2, 2.36, 0), V(0.32, 2.62, 0.12), 0.06, 0.055);
  limb(V(0.32, 2.62, 0.12), V(0.36, 2.9, 0.28), 0.05, 0.045);
  add(new THREE.SphereGeometry(0.05, 8, 6), 0.36, 2.92, 0.3); // fist
  add(new THREE.BoxGeometry(0.14, 0.03, 0.04), 0.36, 2.96, 0.32); // hilt guard
  const blade = add(new THREE.BoxGeometry(0.035, 0.85, 0.012));
  blade.position.set(0.39, 3.36, 0.45);
  blade.rotation.x = 0.32;
  blade.rotation.z = -0.06;
  limb(V(-0.2, 2.36, 0), V(-0.24, 2.12, 0.22), 0.06, 0.055);
  limb(V(-0.24, 2.12, 0.22), V(-0.08, 2.0, 0.44), 0.05, 0.045);
  // the reins, from his fist to the bit
  limb(V(-0.08, 2.0, 0.44), V(-0.09, 1.95, 1.45), 0.01, 0.01);
  // the shela flying behind his shoulders
  const shela = new THREE.CatmullRomCurve3([V(0, 2.38, -0.15), V(0, 2.25, -0.45), V(0, 2.15, -0.7), V(0, 1.95, -0.85)]);
  add(new THREE.TubeGeometry(shela, 10, 0.1, 6)).scale.set(1.6, 1, 1);
  // the shield (dhaal) on his back
  add(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 18).rotateX(Math.PI / 2), 0, 2.15, -0.22);
  return g;
}
