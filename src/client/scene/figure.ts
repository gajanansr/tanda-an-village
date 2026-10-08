import * as THREE from "three";
import { mergeParts } from "../engine/merge";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type Kind, loadPerson, Person, REALISTIC } from "./people";

/*
 * A villager, modelled rather than built from blocks: kurta, dhoti, pheta or topi, moustache.
 * One rig for the farmer and everyone in the village; `animate` swings limbs from a walk phase.
 * Faces +z, feet at the origin, about 1.7 m tall.
 */
export type Look = { kurta: string; dhoti: string; hat: string; hatStyle: "pheta" | "topi" | "odhni" | "none"; skin: string; tail?: string; woman?: boolean; modern?: boolean };

/** A Banjara woman: mirror-work ghaghra, embroidered kanchali, a coin-edged odhni over the head, arms stacked with bangles. */
export const banjaraWoman = (skirt: string, odhni: string): Look => ({ kurta: "#1f5a52", dhoti: skirt, hat: odhni, hatStyle: "odhni", skin: "#9a6240", woman: true });

/** A checked shirt fabric. */
function checkTex(base: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.28)";
  for (let i = 0; i < 64; i += 16) {
    g.fillRect(i, 0, 5, 64);
    g.fillRect(0, i, 64, 5);
  }
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 8; i < 64; i += 16) {
    g.fillRect(i, 0, 2, 64);
    g.fillRect(0, i, 64, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

/** The embroidery: bands of colour, zigzags, and little round mirrors that catch the light. */
function mirrorWork(base: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const bands = ["#e8b830", "#1b1b1b", "#2e8a4a", "#d8342a", "#f2f0e6", "#1f4fa0"];
  for (let i = 0; i < 6; i++) {
    const y = 150 + i * 17;
    g.fillStyle = bands[i];
    g.fillRect(0, y, 256, 11);
    g.strokeStyle = bands[(i + 3) % 6];
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + (x % 16 ? 1 : 10));
    g.stroke();
  }
  for (let row = 0; row < 3; row++)
    for (let x = 6; x < 256; x += 16) {
      const y = 60 + row * 30 + (x % 32 ? 0 : 8);
      g.fillStyle = "#e8b830";
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#e8eef4"; // the mirror
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
/** The hero: back from the city — a checked shirt over a tee, jeans, white sneakers, a watch, a backpack. */
export const FARMER: Look = { kurta: "#c4592f", dhoti: "#2b3d63", hat: "#17110d", hatStyle: "none", skin: "#9b6541", modern: true };

/** Hand-woven cotton: a fine over-under thread pattern, used as a bump map so cloth reads as fabric. */
let weave: THREE.CanvasTexture | null = null;
function weaveTex() {
  if (weave) return weave;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4)
    for (let x = 0; x < 64; x += 4) {
      const over = ((x + y) / 4) % 2 === 0;
      g.fillStyle = over ? "#b8b8b8" : "#5a5a5a";
      g.fillRect(x, y, over ? 4 : 3, over ? 3 : 4);
    }
  weave = new THREE.CanvasTexture(c);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(10, 10);
  return weave;
}
/** Skin colours of the figures built so far: those parts get skin shading, everything else is cloth. */
const SKINS = new Set<string>();
const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string, rough = 0.85) => {
  const k = c + rough;
  if (!mats.has(k)) {
    let m: THREE.MeshStandardMaterial;
    if (SKINS.has(c)) {
      // skin: a soft sheen, and a little warm light scattered back out of the shadows (no wooden look)
      m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.58, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(0.07, 0.035, 0.02);",
        );
      };
      m.userData.mergeKey = "skin";
    } else {
      m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0, bumpMap: weaveTex(), bumpScale: 0.6 });
      m.userData.mergeKey = "cloth" + rough; // cloth merges with cloth of the same sheen
    }
    mats.set(k, m);
  }
  return mats.get(k)!;
};
function part(geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, rough?: number) {
  const m = new THREE.Mesh(geo, mat(color, rough));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
/**
 * The odhni as draped cloth: it hugs the crown, frames the face, flows over the shoulders and falls
 * down the back to the waist, opening wider below so the arms show; the folds deepen as it falls.
 * Head-local coordinates (the head's centre is at y ≈ 0.11, the shoulders at ≈ -0.17).
 */
function odhniGeometry() {
  const prof = new THREE.SplineCurve([[0.265, 0.02], [0.24, 0.085], [0.2, 0.128], [0.13, 0.15], [0.05, 0.152], [-0.05, 0.175], [-0.15, 0.25], [-0.3, 0.27], [-0.48, 0.285], [-0.62, 0.31]].map(([y, r]) => new THREE.Vector2(y, r))).getPoints(30);
  const cols = 28, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  prof.forEach((pt, j) => {
    const y = pt.x, t = j / (prof.length - 1);
    const gap = 0.95 + 0.75 * Math.min(1, Math.max(0, (0.05 - y) / 0.25)); // face open above, arms free below
    for (let i = 0; i <= cols; i++) {
      const a = gap + (Math.PI * 2 - 2 * gap) * (i / cols);
      const fold = 1 + 0.06 * Math.sin(a * 7 + t * 2) * Math.min(1, Math.max(0, (0.05 - y) / 0.4));
      const r = pt.y * fold;
      pos.push(Math.sin(a) * r, y, Math.cos(a) * r);
      uv.push((i / cols) * 2, t * 2);
    }
  });
  for (let j = 0; j < prof.length - 1; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a profile drawn top-down would turn the surface inside out (you'd see into a hollow sleeve), so it runs bottom-up
const lathe = (pts: [number, number][], seg = 18) =>
  new THREE.LatheGeometry((pts[0][1] > pts[pts.length - 1][1] ? [...pts].reverse() : pts).map(([r, y]) => new THREE.Vector2(r, y)), seg);

/**
 * Dress a realistic person the way this village's people dress (the same Look the modelled figures
 * use): men in a dyed kurta with a pheta or Gandhi topi and a moustache; women in the Banjara mirror-work
 * ghaghra, kanchali, coin-edged odhni and arms of bangles, with a bindi; the farmer with his red checked
 * gamcha, the Banjara bag and a steel kada. Everything hangs on the skeleton, so it moves with them.
 */
/** Light brown to fair complexions, as in the tanda; the avatars' own skin is much darker, so it's lifted. */
const COMPLEXIONS = ["#a46c48", "#b47b56", "#96603f", "#c18a64"]; // light brown to fair (sRGB)
function dress(p: Person, look: Look) {
  const tone = new THREE.Color(COMPLEXIONS[Math.floor(Math.random() * COMPLEXIONS.length)]);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(g, m); o.castShadow = true; return o; };
  const plain = (c: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const head = p.restPos("Bip01_Head");
  // along a forearm in the standing pose (elbow to wrist), for bangles and the kada
  const forearm = (side: "L" | "R", t: number) => {
    const a = p.restPos(`Bip01_${side}_Forearm`), b = p.restPos(`Bip01_${side}_Hand`);
    return { at: a.clone().lerp(b, t), dir: b.clone().sub(a).normalize() };
  };
  const bangle = (side: "L" | "R", t: number, r: number, color: string, tube = 0.006) => {
    const { at, dir } = forearm(side, t);
    const o = mesh(new THREE.TorusGeometry(r, tube, 6, 18), plain(color, 0.4));
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    p.attach(`Bip01_${side}_Forearm`, o, at);
  };
  /** A stack of bangles up a forearm as one mesh (two materials: bone white and red). */
  const bangles = (side: "L" | "R") => {
    const { at: a0, dir } = forearm(side, 0.25);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const g = new THREE.TorusGeometry(0.046 - i * 0.0012, 0.006, 6, 18).translate(0, 0, i * 0.075 * p.restPos(`Bip01_${side}_Forearm`).distanceTo(p.restPos(`Bip01_${side}_Hand`)));
      g.clearGroups();
      g.addGroup(0, Infinity, i % 4 === 3 ? 1 : 0);
      geos.push(g);
    }
    const o = mesh(mergeGeometries(geos, true)!, [plain("#eee6d2", 0.4), plain("#b8322a", 0.4)] as unknown as THREE.Material);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    p.attach(`Bip01_${side}_Forearm`, o, a0);
  };
  if (look.woman) {
    p.skin(/head|body/, tone);
    // the ghaghra: a full skirt from the waist to the ankles, embroidered at the hem
    const hips = p.restPos("Bip01_Pelvis");
    const skirt = mesh(lathe([[0.001, -hips.y + 0.04], [0.4, -hips.y + 0.04], [0.39, -hips.y + 0.08], [0.3, -0.5], [0.2, -0.1], [0.16, 0.1], [0.155, 0.25], [0.001, 0.25]], 32), new THREE.MeshStandardMaterial({ map: mirrorWork(look.dhoti), roughness: 0.8 }));
    p.attach("Bip01_Pelvis", skirt, V(0, hips.y, hips.z - 0.01));
    // the kanchali: an embroidered bodice over the chest, the midriff bare below it
    const chest = p.restPos("Bip01_Spine2");
    const top = mesh(lathe([[0.001, -0.12], [0.14, -0.12], [0.148, 0.0], [0.14, 0.08], [0.1, 0.13], [0.001, 0.13]], 28), new THREE.MeshStandardMaterial({ map: mirrorWork(look.kurta), roughness: 0.75 }));
    top.scale.set(1.04, 1, 0.9);
    p.attach("Bip01_Spine2", top, V(0, chest.y - 0.02, chest.z + 0.02));
    // short embroidered sleeves over the shoulders
    for (const side of ["L", "R"] as const) {
      const sh = p.restPos(`Bip01_${side}_UpperArm`);
      const cap = mesh(new THREE.SphereGeometry(0.068, 14, 10), new THREE.MeshStandardMaterial({ map: mirrorWork(look.kurta), roughness: 0.75 }));
      cap.scale.set(1, 0.85, 0.95);
      p.attach(`Bip01_${side}_UpperArm`, cap, V(sh.x * 0.97, sh.y - 0.01, sh.z + 0.01));
    }
    // the odhni over the head and down the back, and the coins along its brow
    const veil = mesh(odhniGeometry(), new THREE.MeshStandardMaterial({ map: mirrorWork(look.hat), roughness: 0.85, side: THREE.DoubleSide }));
    veil.scale.set(0.92, 0.95, 0.92);
    p.attach("Bip01_Head", veil, V(0, head.y - 0.0, head.z - 0.005));
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.22; // a row across the forehead, under the odhni's edge
      const coin = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.003, 10), plain("#d9c07a", 0.3));
      coin.rotation.x = Math.PI / 2;
      p.attach("Bip01_Head", coin, V(Math.sin(a) * 0.115, head.y + 0.165 - Math.abs(i - 4) * 0.006, head.z + Math.cos(a) * 0.1));
    }
    const bindi = mesh(new THREE.SphereGeometry(0.0055, 8, 6), plain("#b3122a", 0.5));
    p.attach("Bip01_Head", bindi, V(0, head.y + 0.128, head.z + 0.114));
    // bone bangles packed up both forearms
    bangles("L");
    bangles("R");
    return;
  }
  if (look.modern) {
    // the farmer: red checked gamcha round the neck, the Banjara bag across the body, a steel kada
    const neck = p.restPos("Bip01_Neck");
    const gamchaMat = new THREE.MeshStandardMaterial({ map: checkTex("#b3262f"), roughness: 0.9 });
    const loop = mesh(new THREE.TorusGeometry(0.095, 0.02, 8, 22), gamchaMat);
    loop.rotation.x = Math.PI / 2 - 0.25;
    loop.scale.set(1.05, 0.85, 1);
    p.attach("Bip01_Neck", loop, V(0, neck.y - 0.01, neck.z + 0.02));
    const end = mesh(new THREE.BoxGeometry(0.075, 0.28, 0.014), gamchaMat);
    p.attach("Bip01_Spine2", end, V(0.07, neck.y - 0.17, neck.z + 0.115));
    const chest = p.restPos("Bip01_Spine2");
    const strap = mesh(new THREE.BoxGeometry(0.034, 0.66, 0.01), plain("#2a1c14"));
    strap.rotation.z = -0.6;
    p.attach("Bip01_Spine2", strap, V(-0.01, chest.y - 0.12, chest.z + 0.112));
    const bag = new THREE.Group();
    bag.add(mesh(new THREE.BoxGeometry(0.26, 0.24, 0.07), plain("#1f1a22", 0.95)));
    ["#c8302a", "#e8b830", "#2f8a4a"].forEach((c, i) => { const band = mesh(new THREE.BoxGeometry(0.262, 0.022, 0.072), plain(c, 0.9)); band.position.y = 0.07 - i * 0.05; bag.add(band); });
    for (let i = 0; i < 4; i++) { const mir = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 10), plain("#e6edf0", 0.15)); mir.rotation.x = Math.PI / 2; mir.position.set(-0.09 + i * 0.06, -0.08, 0.037); bag.add(mir); }
    bag.rotation.y = -1.1; // at the hip, following its curve
    p.attach("Bip01_Pelvis", bag, V(-0.24, p.restPos("Bip01_Pelvis").y + 0.04, -0.07));
    bangle("L", 0.93, 0.036, "#c9ccd1", 0.009); // (his own avatar already has the right complexion)
    return;
  }
  // village men: the kurta dyed this villager's colour, a pheta or topi, a moustache
  p.tint(/body/, new THREE.Color(look.kurta).lerp(new THREE.Color("#ffffff"), 0.15));
  p.skin(/head|body/, tone);
  for (const s of [-1, 1]) {
    const mo = mesh(new THREE.CapsuleGeometry(0.0042, 0.022, 3, 6), plain("#2a1c14", 0.95));
    mo.rotation.z = Math.PI / 2 + s * 0.2;
    p.attach("Bip01_Head", mo, V(s * 0.016, head.y + 0.03, head.z + 0.108));
  }
  if (look.hatStyle === "pheta") {
    // a wound pheta: thin turns of cloth, tapering to the crown, and the tail down the back
    const m = new THREE.MeshStandardMaterial({ color: look.hat, roughness: 0.85, bumpMap: weaveTex(), bumpScale: 0.5 });
    for (let i = 0; i < 6; i++) {
      // (wide enough to sit over the model's own cap and hide it)
      const ring = mesh(new THREE.TorusGeometry(0.118 - i * 0.008, 0.02, 7, 24), m);
      ring.rotation.x = Math.PI / 2 + (i % 2 ? 0.07 : -0.06);
      p.attach("Bip01_Head", ring, V(0, head.y + 0.118 + i * 0.019, head.z - 0.012));
    }
    const crown = mesh(new THREE.SphereGeometry(0.103, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
    crown.scale.set(1.0, 0.55, 1.0);
    p.attach("Bip01_Head", crown, V(0, head.y + 0.208, head.z - 0.012));
    const tail = mesh(new THREE.BoxGeometry(0.07, 0.3, 0.012), new THREE.MeshStandardMaterial({ color: look.tail ?? look.hat, roughness: 0.85 }));
    tail.rotation.x = 0.18;
    p.attach("Bip01_Head", tail, V(0.035, head.y + 0.0, head.z - 0.12));
  } else if (look.hatStyle === "topi") {
    const cap = mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.09, 4, 1), plain(look.hat, 0.85));
    cap.scale.set(1, 1, 1.35);
    cap.rotation.y = Math.PI / 4;
    p.attach("Bip01_Head", cap, V(0, head.y + 0.185, head.z - 0.008));
  } else {
    // bare-headed: short black hair over the crown
    const hair = mesh(new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), plain("#17110d", 0.7));
    hair.scale.set(1, 0.75, 1.08);
    p.attach("Bip01_Head", hair, V(0, head.y + 0.15, head.z - 0.01));
  }
}

export class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private shoulders: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private head = new THREE.Group();
  // the player's extra joints (villagers leave these empty)
  private feet: THREE.Group[] = [];
  private chest?: THREE.Group;
  private bag?: THREE.Group;
  private scarf?: THREE.Group;
  private t = Math.random() * 10;
  private seed = Math.random(); // so no two villagers breathe or shift their weight in step
  private weight = 0;
  private skirt?: THREE.Object3D;
  private skirtSwing = 0;
  private shoulderY = new Map<THREE.Object3D, number>();
  private shadowOn = true;
  private meshes?: THREE.Mesh[];
  /** Far-off people needn't cast shadows (each body part is its own draw in the shadow pass). */
  setShadow(on: boolean) {
    if (on === this.shadowOn) return;
    this.shadowOn = on;
    this.meshes ??= (() => {
      const out: THREE.Mesh[] = [];
      this.root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow && out.push(o as THREE.Mesh));
      return out;
    })();
    for (const m of this.meshes) m.castShadow = on;
    this.person?.setShadow(on);
  }

  /** The realistic model standing in for this figure, once it has loaded. */
  private person?: Person;
  private personKind: Kind;

  constructor(look: Look) {
    this.personKind = look.modern ? "hero" : look.woman ? "villager_f" : "villager_m";
    if (REALISTIC)
      loadPerson(this.personKind).then((m) => {
        this.person = new Person(m);
        dress(this.person, look);
        this.root.add(this.person.root);
        this.person.setShadow(this.shadowOn);
      }, () => undefined); // no model: keep the modelled figure
    SKINS.add(look.skin);
    const r = this.root;
    r.add(this.body);
    const b = this.body;
    if (look.woman) {
      this.woman(look);
      mergeParts(this.root);
      return;
    }
    if (look.modern) {
      this.hero(look);
      mergeParts(this.root);
      return;
    }
    // legs: the dhoti hangs loose and baggy over each thigh to below the knee; bare calves, chappals
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.92, 0);
      b.add(hip);
      part(lathe([[0.001, 0.02], [0.14, 0], [0.15, -0.18], [0.13, -0.42], [0.115, -0.52], [0.001, -0.53]], 16), look.dhoti, hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      hip.add(knee);
      part(lathe([[0.001, 0], [0.046, 0], [0.054, -0.12], [0.045, -0.28], [0.032, -0.4], [0.001, -0.41]], 12), look.skin, knee); // a calf, not a pipe
      part(new THREE.CapsuleGeometry(0.035, 0.12, 3, 8).rotateX(Math.PI / 2), look.skin, knee, 0, -0.415, 0.045); // the foot
      part(new THREE.BoxGeometry(0.1, 0.022, 0.25), "#3b2a1e", knee, 0, -0.45, 0.05); // the chappal sole
      this.hips.push(hip);
      this.knees.push(knee);
    }
    // the kaccha: the dhoti's pleated front, hanging in folds between the legs
    const pleat = new THREE.PlaneGeometry(0.16, 0.46, 6, 4);
    const pp = pleat.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 75) * 0.012 - Math.abs(pp.getX(i)) * 0.2);
    pleat.computeVertexNormals();
    part(pleat, look.dhoti, b, 0, 0.7, 0.115).material = mat(look.dhoti, 0.86);
    // the kurta: broad at the shoulders, flatter front to back than round, flaring to mid-thigh
    const kg = lathe([[0.001, 0.6], [0.215, 0.6], [0.205, 0.8], [0.19, 1.02], [0.205, 1.24], [0.2, 1.34], [0.13, 1.43], [0.06, 1.46], [0.001, 1.46]], 40);
    const kp = kg.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < kp.count; i++) {
      // soft vertical folds where the cotton hangs free below the chest
      const y = kp.getY(i), a = Math.atan2(kp.getZ(i), kp.getX(i)), k = 1 + 0.03 * Math.sin(a * 11 + y * 3) * Math.min(1, Math.max(0, (1.15 - y) / 0.35));
      kp.setX(i, kp.getX(i) * k);
      kp.setZ(i, kp.getZ(i) * k);
    }
    kg.computeVertexNormals();
    const kurta = part(kg, look.kurta, b);
    kurta.scale.set(1.1, 1, 0.78);
    part(new THREE.CylinderGeometry(0.062, 0.062, 0.025, 14), look.kurta, b, 0, 1.46, 0); // the collar band
    part(new THREE.BoxGeometry(0.018, 0.13, 0.004), "#cfc8b8", b, 0, 1.37, 0.159).material = mat("#cfc8b8", 0.86); // the neck slit's placket
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), look.skin, b, 0, 1.5, 0); // neck
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.068, 14, 10), look.kurta, b, s * 0.222, 1.335, 0).scale.set(1, 0.72, 0.85); // the shoulder joint, hidden in the sleeve's top
      const sh = new THREE.Group();
      sh.position.set(s * 0.225, 1.34, 0);
      b.add(sh);
      part(lathe([[0.001, 0.02], [0.068, 0.0], [0.066, -0.2], [0.062, -0.3], [0.001, -0.31]], 12), look.kurta, sh); // the sleeve
      const el = new THREE.Group();
      el.position.set(0, -0.31, 0);
      sh.add(el);
      part(lathe([[0.001, 0], [0.045, -0.01], [0.042, -0.12], [0.032, -0.24], [0.001, -0.25]], 10), look.skin, el); // the forearm, tapering to the wrist
      part(new THREE.CapsuleGeometry(0.03, 0.06, 4, 8), look.skin, el, 0, -0.3, 0.006).scale.set(1.15, 1, 0.62); // the hand: flat and long, not a ball
      part(new THREE.SphereGeometry(0.02, 8, 6), look.skin, el, s * -0.03, -0.265, 0.03); // thumb
      sh.rotation.z = s * 0.08;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }
    // head: skull, jaw, brows and eyes, a proper nose, a thick moustache
    this.head.position.set(0, 1.535, 0);
    b.add(this.head);
    const h = this.head;
    part(new THREE.SphereGeometry(0.122, 22, 16), look.skin, h, 0, 0.115, 0).scale.set(0.93, 1.05, 1);
    part(new THREE.SphereGeometry(0.094, 16, 12), look.skin, h, 0, 0.06, 0.016).scale.set(0.97, 0.82, 1); // jaw and chin
    const nose = part(new THREE.CapsuleGeometry(0.018, 0.032, 3, 8), look.skin, h, 0, 0.1, 0.112);
    nose.rotation.x = 0.35;
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.017, 10, 8), "#efe8dc", h, s * 0.042, 0.135, 0.098, 0.4).scale.set(1.2, 0.8, 0.6); // eye whites
      part(new THREE.SphereGeometry(0.01, 8, 6), "#1c1410", h, s * 0.042, 0.135, 0.107, 0.3);
      const brow = part(new THREE.BoxGeometry(0.042, 0.007, 0.008), "#1e1611", h, s * 0.043, 0.165, 0.106);
      brow.rotation.z = s * -0.12;
      const mo = part(new THREE.CapsuleGeometry(0.0075, 0.03, 3, 6), "#2a1d15", h, s * 0.021, 0.079, 0.114);
      mo.rotation.z = Math.PI / 2 + s * 0.16; // a trimmed moustache, drooping a little at the ends
      part(new THREE.SphereGeometry(0.024, 8, 6), look.skin, h, s * 0.113, 0.11, -0.005).scale.set(0.6, 1, 1); // ears
    }
    part(new THREE.BoxGeometry(0.034, 0.006, 0.006), "#5e3328", h, 0, 0.058, 0.107); // the mouth
    if (look.hatStyle === "pheta") {
      // a wound pheta: many thin turns of cloth, each a little tilted, a crown, and the tail hanging behind
      for (let i = 0; i < 6; i++) {
        const ring = part(new THREE.TorusGeometry(0.12 - i * 0.009, 0.02, 7, 24), look.hat, h, 0, 0.18 + i * 0.021, -0.008);
        ring.rotation.x = Math.PI / 2 + (i % 2 ? 0.07 : -0.06);
      }
      part(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), look.hat, h, 0, 0.26, -0.008).scale.set(1, 0.55, 1);
      const tail = part(new THREE.BoxGeometry(0.07, 0.3, 0.012), look.tail ?? look.hat, h, 0.035, 0.04, -0.13);
      tail.rotation.x = 0.18;
    } else if (look.hatStyle !== "none") {
      // Gandhi topi: a folded white boat cap
      const cap = part(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 4, 1), look.hat, h, 0, 0.24, 0);
      cap.scale.set(1, 1, 1.35);
      cap.rotation.y = Math.PI / 4;
    } else part(new THREE.SphereGeometry(0.124, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), "#1e1611", h, 0, 0.12, -0.008).rotation.x = -0.35; // bare head: short hair
    mergeParts(this.root);
  }

  /**
   * The player: home from the city to a Banjara tanda. A rust kurta with a cream hem and rolled
   * sleeves over indigo jeans, white canvas sneakers, a mirror-work Banjara bag worn across the body,
   * a checked red gamcha round the neck and a steel kada on the wrist. The rig adds what the
   * villagers don't need: ankles that roll heel to toe, a chest that twists against the hips, and a
   * bag and gamcha that swing on springs.
   */
  private hero(look: Look) {
    const b = this.body;
    const group = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const jeans = look.dhoti, shoe = "#f4f1e8", sole = "#e2dccd", trim = "#f1e4c4", hair = look.hat;

    // legs: thigh, shin and an ankle, so the foot can strike with the heel and push off the toe
    for (const s of [-1, 1]) {
      const hip = group(b, s * 0.1, 0.92, 0);
      // baggy jeans: wide, straight legs hanging loose from the hip
      part(lathe([[0.001, 0.04], [0.108, 0.03], [0.112, -0.15], [0.104, -0.38], [0.1, -0.48], [0.001, -0.49]], 18), jeans, hip);
      const knee = group(hip, 0, -0.45, 0);
      const shin = lathe([[0.001, 0.02], [0.1, 0.01], [0.097, -0.2], [0.1, -0.3], [0.104, -0.37], [0.001, -0.38]], 18);
      const sp = shin.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) {
        // the hem stacks in soft rings over the sneakers
        const y = sp.getY(i), k = 1 + 0.05 * Math.sin(y * 70) * Math.min(1, Math.max(0, (-0.22 - y) / 0.1));
        sp.setX(i, sp.getX(i) * k);
        sp.setZ(i, sp.getZ(i) * k);
      }
      shin.computeVertexNormals();
      part(shin, jeans, knee);
      const ankle = group(knee, 0, -0.4, 0);
      const upper = part(new THREE.CapsuleGeometry(0.062, 0.16, 4, 12), shoe, ankle, 0, -0.025, 0.05, 0.7);
      upper.rotation.x = Math.PI / 2;
      upper.scale.set(1.08, 1, 0.75); // chunky sneakers
      part(new THREE.CapsuleGeometry(0.052, 0.17, 3, 10).rotateX(Math.PI / 2), sole, ankle, 0, -0.068, 0.045, 0.9).scale.set(1.18, 0.42, 1.06); // a thick rubber sole, rounded at heel and toe
      part(new THREE.BoxGeometry(0.05, 0.012, 0.09), "#d8d2c4", ankle, 0, 0.004, 0.06); // laces
      this.hips.push(hip);
      this.knees.push(knee);
      this.feet.push(ankle);
    }
    part(new THREE.CapsuleGeometry(0.125, 0.09, 4, 12).rotateZ(Math.PI / 2), jeans, b, 0, 0.9, 0); // seat of the jeans

    // the chest twists against the hips; arms, head, gamcha and bag ride on it
    const chest = group(b, 0, 0.98, 0);
    this.chest = chest;
    // an open overshirt in a bold check, worn loose over a cream tee
    const kg = lathe([[0.001, -0.24], [0.225, -0.24], [0.21, -0.02], [0.22, 0.2], [0.225, 0.3], [0.195, 0.39], [0.075, 0.46], [0.001, 0.46]], 40);
    const kp = kg.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < kp.count; i++) {
      const y = kp.getY(i), a = Math.atan2(kp.getZ(i), kp.getX(i)), k = 1 + 0.03 * Math.sin(a * 9 + y * 4) * Math.min(1, Math.max(0, (0.15 - y) / 0.35));
      kp.setX(i, kp.getX(i) * k);
      kp.setZ(i, kp.getZ(i) * k);
    }
    kg.computeVertexNormals();
    const shirtMat = new THREE.MeshStandardMaterial({ map: checkTex(look.kurta), roughness: 0.88, bumpMap: weaveTex(), bumpScale: 0.6 });
    const shirt = new THREE.Mesh(kg, shirtMat);
    shirt.scale.z = 0.74;
    shirt.castShadow = true;
    chest.add(shirt);
    // the tee showing down the open front, and the shirt's two front edges
    part(new THREE.BoxGeometry(0.15, 0.6, 0.02), trim, chest, 0, 0.1, 0.152);
    for (const s2 of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.62, 0.025), shirtMat);
      edge.position.set(s2 * 0.085, 0.09, 0.158);
      edge.rotation.z = s2 * 0.06;
      chest.add(edge);
    }
    part(new THREE.CylinderGeometry(0.06, 0.068, 0.1, 12), look.skin, chest, 0, 0.49, 0); // neck

    // arms: kurta sleeves rolled to just above the elbow, bare forearms
    for (const s of [-1, 1]) {
      const sleeve = (g: THREE.BufferGeometry, parent: THREE.Object3D, y: number) => {
        const m = new THREE.Mesh(g, shirtMat);
        m.position.y = y;
        m.castShadow = true;
        parent.add(m);
      };
      sleeve(new THREE.SphereGeometry(0.082, 14, 10).scale(1, 0.75, 0.9), chest, 0.325); // the shoulder, dropped and loose
      chest.children[chest.children.length - 1].position.x = s * 0.235;
      const sh = group(chest, s * 0.24, 0.33, 0);
      sleeve(lathe([[0.001, 0.03], [0.082, 0.01], [0.08, -0.18], [0.074, -0.3], [0.001, -0.31]], 16), sh, 0); // a loose sleeve down to the elbow
      const el = group(sh, 0, -0.31, 0);
      sleeve(lathe([[0.001, 0.02], [0.07, 0.01], [0.066, -0.06], [0.001, -0.07]], 14), el, 0); // pushed-up sleeve over the forearm
      part(new THREE.TorusGeometry(0.064, 0.016, 6, 16), look.kurta, el, 0, -0.065, 0).rotation.x = Math.PI / 2; // the rolled cuff
      part(lathe([[0.001, 0.0], [0.044, -0.02], [0.042, -0.1], [0.032, -0.23], [0.001, -0.24]], 12), look.skin, el); // the forearm, tapering to the wrist
      part(new THREE.CapsuleGeometry(0.03, 0.06, 4, 8), look.skin, el, 0, -0.29, 0.006).scale.set(1.15, 1, 0.62); // the hand
      part(new THREE.SphereGeometry(0.022, 8, 6), look.skin, el, s * -0.035, -0.26, 0.035); // thumb
      if (s < 0) part(new THREE.TorusGeometry(0.05, 0.011, 6, 16), "#c9ccd1", el, 0, -0.22, 0, 0.25).rotation.x = Math.PI / 2; // steel kada
      sh.rotation.z = s * 0.08;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }

    // the gamcha: draped round the neck, one end hanging down the front on a spring
    const gamcha = new THREE.MeshStandardMaterial({ map: checkTex("#b3262f"), roughness: 0.9 });
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.034, 8, 20), gamcha);
    loop.position.set(0, 0.44, 0.005);
    loop.rotation.x = Math.PI / 2 - 0.18;
    loop.scale.set(1, 0.82, 1);
    loop.castShadow = true;
    chest.add(loop);
    const scarf = group(chest, 0.07, 0.42, 0.12);
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.016), gamcha);
    end.position.set(0, -0.15, 0.012);
    end.castShadow = true;
    scarf.add(end);
    this.scarf = scarf;

    // the Banjara bag: strap over the left shoulder, the bag at the right hip, swinging from the shoulder
    const bag = group(chest, -0.15, 0.39, 0);
    const strapLen = Math.hypot(0.3, 0.42);
    const front = part(new THREE.BoxGeometry(0.038, strapLen, 0.012), "#2a1c14", bag, 0.15, -0.21, 0.152);
    front.rotation.z = Math.atan2(0.3, 0.42);
    const back = part(new THREE.BoxGeometry(0.038, 0.5, 0.012), "#2a1c14", bag, 0.12, -0.2, -0.15);
    back.rotation.z = 0.6;
    const sack = group(bag, 0.31, -0.55, 0.13);
    sack.rotation.y = 0.55; // follows the curve of the hip
    part(new THREE.BoxGeometry(0.26, 0.24, 0.07), "#1f1a22", sack, 0, 0, 0, 0.95);
    const bands = ["#c8302a", "#e8b830", "#2f8a4a"];
    bands.forEach((c, i) => part(new THREE.BoxGeometry(0.262, 0.022, 0.072), c, sack, 0, 0.07 - i * 0.05, 0, 0.9));
    for (let i = 0; i < 4; i++) {
      const mirror = part(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 10), "#e6edf0", sack, -0.09 + i * 0.06, -0.08, 0.037, 0.15);
      mirror.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) part(new THREE.SphereGeometry(0.014, 6, 4), i % 2 ? "#e8b830" : "#c8302a", sack, -0.1 + i * 0.05, -0.135, 0.01); // tassels
    this.bag = bag;

    // head: an open face, brows, a short fade with a swept quiff
    this.head.position.set(0, 0.55, 0);
    chest.add(this.head);
    const h = this.head;
    part(new THREE.SphereGeometry(0.118, 22, 16), look.skin, h, 0, 0.115, 0).scale.set(0.93, 1.05, 1);
    part(new THREE.SphereGeometry(0.092, 16, 12), look.skin, h, 0, 0.06, 0.018).scale.set(0.95, 0.82, 1); // jaw and chin
    const nose = part(new THREE.CapsuleGeometry(0.017, 0.03, 3, 8), look.skin, h, 0, 0.1, 0.112);
    nose.rotation.x = 0.35;
    part(new THREE.BoxGeometry(0.042, 0.008, 0.01), "#6b3a2a", h, 0, 0.058, 0.103); // mouth
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.018, 10, 8), "#f4efe6", h, s * 0.042, 0.135, 0.098, 0.4).scale.set(1.2, 0.85, 0.6); // eye whites
      part(new THREE.SphereGeometry(0.011, 8, 6), "#1c1410", h, s * 0.042, 0.135, 0.108, 0.3);
      const brow = part(new THREE.BoxGeometry(0.046, 0.011, 0.012), hair, h, s * 0.044, 0.168, 0.104);
      brow.rotation.z = s * -0.12;
      part(new THREE.SphereGeometry(0.024, 8, 6), look.skin, h, s * 0.113, 0.11, -0.005).scale.set(0.6, 1, 1); // ears
    }
    const cap = part(new THREE.SphereGeometry(0.125, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, h, 0, 0.118, -0.008);
    cap.rotation.x = -0.4;
    cap.scale.set(1.02, 1, 1.04);
    // the quiff: a few soft lumps, swept to his right
    for (const [x, y, z, sx] of [[0.02, 0.215, 0.05, 1.6], [-0.04, 0.22, 0.02, 1.3], [0.05, 0.205, -0.02, 1.2]] as const) {
      part(new THREE.SphereGeometry(0.055, 12, 8), hair, h, x, y, z).scale.set(sx, 0.55, 1);
    }
  }

  private woman(look: Look) {
    const b = this.body;
    // legs under the skirt still swing a little, so walking reads
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.08, 0.86, 0);
      b.add(hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.44, 0);
      hip.add(knee);
      part(new THREE.CylinderGeometry(0.04, 0.035, 0.4, 8), look.skin, knee, 0, -0.2, 0);
      part(new THREE.BoxGeometry(0.09, 0.03, 0.22), "#3b2a1e", knee, 0, -0.41, 0.04);
      for (let i = 0; i < 3; i++) part(new THREE.TorusGeometry(0.045, 0.012, 5, 10), "#d8d8d0", knee, 0, -0.34 - i * 0.02, 0, 0.3).rotation.x = Math.PI / 2; // silver anklets
      this.hips.push(hip);
      this.knees.push(knee);
    }
    // the ghaghra: a full skirt, embroidered at the hem
    const skirt = new THREE.Mesh(lathe([[0.001, 0.06], [0.38, 0.06], [0.37, 0.1], [0.3, 0.45], [0.22, 0.8], [0.17, 0.98], [0.001, 0.98]], 26), new THREE.MeshStandardMaterial({ map: mirrorWork(look.dhoti), roughness: 0.75 }));
    skirt.castShadow = true;
    b.add(skirt);
    this.skirt = skirt;
    // the kanchali (backless embroidered blouse) and bare midriff
    part(lathe([[0.001, 0.98], [0.16, 0.98], [0.155, 1.12], [0.001, 1.12]], 18), look.skin, b);
    const top = new THREE.Mesh(lathe([[0.001, 1.12], [0.17, 1.12], [0.18, 1.3], [0.15, 1.42], [0.05, 1.46], [0.001, 1.46]], 20), new THREE.MeshStandardMaterial({ map: mirrorWork(look.kurta), roughness: 0.7 }));
    top.castShadow = true;
    b.add(top);
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), look.skin, b, 0, 1.49, 0);
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.2, 1.36, 0);
      b.add(sh);
      part(new THREE.CapsuleGeometry(0.045, 0.26, 4, 10), look.skin, sh, 0, -0.15, 0);
      // Banjara women wear stacks of bangles up the arm
      // (bone bangles: slim bands packed close, a red one now and then)
      for (let i = 0; i < 9; i++) part(new THREE.TorusGeometry(0.051, 0.0075, 5, 14), i % 4 === 3 ? "#b8322a" : "#eee6d2", sh, 0, -0.07 - i * 0.026, 0, 0.45).rotation.x = Math.PI / 2;
      const el = new THREE.Group();
      el.position.set(0, -0.32, 0);
      sh.add(el);
      part(new THREE.CapsuleGeometry(0.038, 0.22, 4, 10), look.skin, el, 0, -0.13, 0);
      for (let i = 0; i < 8; i++) part(new THREE.TorusGeometry(0.043 - i * 0.0012, 0.007, 5, 14), "#eee6d2", el, 0, -0.06 - i * 0.022, 0, 0.45).rotation.x = Math.PI / 2;
      sh.rotation.z = s * 0.1;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }
    this.head.position.set(0, 1.53, 0);
    b.add(this.head);
    const h = this.head;
    part(new THREE.SphereGeometry(0.11, 20, 16), look.skin, h, 0, 0.11, 0).scale.set(0.9, 1.05, 0.95);
    part(new THREE.SphereGeometry(0.024, 10, 8), look.skin, h, 0, 0.1, 0.105);
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.013, 8, 6), "#1c1410", h, s * 0.04, 0.14, 0.098, 0.4);
      part(new THREE.SphereGeometry(0.03, 8, 6), "#d8d8d0", h, s * 0.11, 0.05, 0, 0.3); // heavy silver earrings
    }
    part(new THREE.CapsuleGeometry(0.008, 0.026, 3, 6), "#6e3a30", h, 0, 0.058, 0.1, 0.5).rotation.z = Math.PI / 2; // lips
    for (const dx of [-0.012, 0, 0.012]) part(new THREE.SphereGeometry(0.0045, 6, 4), "#2a3550", h, dx, 0.03 + (dx ? 0.004 : 0), 0.098, 0.6); // the chin tattoo
    part(new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), "#1a1210", h, 0, 0.165, -0.012); // hair (its edge above the eyes, not across them)
    // the odhni: a long veil over the head and down the back, edged with coins
    const veil = new THREE.Mesh(odhniGeometry(), new THREE.MeshStandardMaterial({ map: mirrorWork(look.hat), roughness: 0.85, side: THREE.DoubleSide }));
    veil.position.set(0, 0, -0.01);
    veil.castShadow = true;
    h.add(veil);
    const cap = part(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), look.hat, h, 0, 0.168, -0.012);
    cap.scale.set(1, 0.9, 1.05);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.15 + i * 0.087) - Math.PI / 2;
      part(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 10), "#d9c07a", h, Math.cos(a) * 0.122, 0.185, Math.sin(-a) * 0.122 + 0.02, 0.3).rotation.x = Math.PI / 2; // coins on the brow
    }
  }

  /** speed in m/s drives the gait; call every frame. */
  /** What a villager is doing: the arms and body pose on top of the walk. */
  action: "none" | "hoe" | "bend" | "carry" | "sit" | "draw" | "pour" | "fish" | "reel" | "crouch" | "cheer" = "none";
  private props = new Map<string, THREE.Object3D>();
  private restZ?: number[];

  /** Give the figure something to hold: a hoe (kudal) in the hands, or a clay pot (matka) on the head. */
  hold(kind: "hoe" | "pot" | "can" | "bag" | "rod" | "none") {
    for (const [k, o] of this.props) o.visible = k === kind;
    if (kind === "none" || this.props.has(kind)) return;
    const g = new THREE.Group();
    if (kind === "hoe") {
      part(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), "#7a5a3c", g, 0, -0.1, 0);
      const blade = part(new THREE.BoxGeometry(0.16, 0.02, 0.2), "#7c7f84", g, 0, 0.4, 0.1, 0.4);
      blade.rotation.x = 0.5;
      g.position.set(0, -0.3, 0.05);
      g.rotation.x = Math.PI / 2;
      this.elbows[1].add(g);
    } else if (kind === "can") {
      // a brass watering can with its long spout, held by the handle
      part(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 12), "#c9a24a", g, 0, -0.08, 0.08, 0.35);
      const spout = part(new THREE.CylinderGeometry(0.014, 0.02, 0.3, 6), "#b08a30", g, 0, -0.02, 0.26, 0.35);
      spout.rotation.x = 1.0;
      part(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), "#b08a30", g, 0, 0.04, 0.02, 0.35);
      g.position.set(0, -0.3, 0);
      this.elbows[1].add(g);
    } else if (kind === "rod") {
      // a bamboo gal: a long thin cane with a few knots, the line running from its tip
      const cane = new THREE.Group();
      part(new THREE.CylinderGeometry(0.008, 0.017, 2.3, 6), "#c8a868", cane, 0, 1.1, 0, 0.6);
      for (let i = 1; i < 5; i++) part(new THREE.CylinderGeometry(0.019 - i * 0.002, 0.019 - i * 0.002, 0.03, 6), "#8a6a3c", cane, 0, i * 0.45, 0, 0.6);
      const tip = new THREE.Object3D();
      tip.name = "rodTip";
      tip.position.y = 2.25;
      cane.add(tip);
      cane.rotation.x = 2.05; // out over the water, about 30° above level when the arm is raised
      g.add(cane);
      g.position.set(0, -0.3, 0.02);
      this.elbows[1].add(g);
    } else if (kind === "bag") {
      // a cloth seed bag in the hand
      part(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 1.2, 0.8), "#d8c29a", g, 0, -0.06, 0.03, 1);
      part(new THREE.CylinderGeometry(0.03, 0.05, 0.05, 8), "#a0453a", g, 0, 0.04, 0.03, 1);
      g.position.set(0, -0.3, 0);
      this.elbows[1].add(g);
    } else {
      part(lathe([[0.001, 0], [0.1, 0.02], [0.15, 0.1], [0.14, 0.2], [0.06, 0.28], [0.07, 0.32], [0.001, 0.32]], 16), "#a8542e", g, 0, 0, 0, 0.7);
      const ring = part(new THREE.TorusGeometry(0.08, 0.025, 6, 12), "#c9a45c", g, 0, -0.01, 0); // the chumbal, a cloth ring under the pot
      ring.rotation.x = Math.PI / 2;
      g.position.set(0, 0.25, 0);
      this.head.add(g);
    }
    this.props.set(kind, g);
  }

  /** Walk phase in radians: one step per half cycle, advanced by distance so the feet keep pace with the ground. */
  private phase = Math.random() * Math.PI * 2;
  private lastSpeed = 0;

  /** How far one step carries the body at a given speed (m): about 1.4 m at a brisk walk, 2.1 m at a run. */
  static stepLength(speed: number) {
    return Math.min(2.2, Math.max(0.5, 0.55 + 0.25 * speed));
  }

  // springs for the player's bag and gamcha: [angle, velocity]
  private bagFwd = [0, 0];
  private bagSide = [0, 0];
  private scarfSwing = [0, 0];
  private lean = 0;
  private accelS = 0;
  private airPose = 0;

  /**
   * `turn`: how fast the body is turning (rad/s, positive to the left), to lean into it.
   * `air`: 1 while off the ground, for the jump pose. Both only matter for the player's rig.
   */
  animate(dt: number, speed: number, motion: { turn?: number; air?: number } = {}) {
    if (this.person) {
      // the realistic model walks, runs and idles; for work poses it doesn't have, the modelled figure takes over
      // (props hang on the modelled figure's hands, so anyone holding something uses it too)
      const real = this.action === "none" && ![...this.props.values()].some((p) => p.visible);
      this.person.root.visible = real;
      this.body.visible = !real;
      if (real) {
        this.person.update(dt, speed);
        return;
      }
    }
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const walking = smooth(0.15, 1.2, speed);
    const run = smooth(3.6, 6, speed);
    this.t += dt;
    this.phase += ((Math.PI * speed) / Figure.stepLength(speed)) * dt;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    // hips: forward is negative x. Leg 0 swings forward while cos > 0, leg 1 half a cycle behind,
    // and the swinging leg lifts its knee to clear the ground while the other carries the body.
    const stride = (0.42 + 0.2 * run) * walking;
    const lift = (0.55 + 0.6 * run) * walking;
    this.hips[0].rotation.x = -s * stride;
    this.hips[1].rotation.x = s * stride;
    this.knees[0].rotation.x = 0.04 * walking + Math.max(0, c) ** 1.5 * lift;
    this.knees[1].rotation.x = 0.04 * walking + Math.max(0, -c) ** 1.5 * lift;
    // arms swing against the legs, and bend more as the pace picks up
    const arm = (0.4 + 0.35 * run) * walking;
    this.shoulders[0].rotation.x = s * arm;
    this.shoulders[1].rotation.x = -s * arm;
    this.elbows[0].rotation.x = -0.2 - (0.15 + 0.9 * run) * walking - Math.max(0, -s) * 0.25 * walking;
    this.elbows[1].rotation.x = -0.2 - (0.15 + 0.9 * run) * walking - Math.max(0, s) * 0.25 * walking;
    // at rest the arms hang a little forward of the body and drift with the breath
    this.shoulders[0].rotation.x += (-0.06 + Math.sin(this.t * 0.7 + this.seed) * 0.025) * (1 - walking);
    this.shoulders[1].rotation.x += (-0.06 + Math.sin(this.t * 0.8 + this.seed * 2) * 0.025) * (1 - walking);
    // the body dips as the legs spread and rises over the planted foot (twice a cycle), leans into
    // the pace and into speeding up, and the hips twist against the shoulders
    const accel = dt > 0 ? (speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = speed;
    const posed = this.action === "none" ? 1 : 0;
    this.body.position.y = (-Math.abs(s) * 0.04 + 0.02) * walking - run * 0.02 + Math.sin(this.t * 1.6) * 0.004 * (1 - walking);
    this.body.rotation.x = (0.03 * walking + 0.07 * run + THREE.MathUtils.clamp(accel * 0.012, -0.08, 0.08)) * posed;
    this.body.rotation.y = s * 0.07 * walking * posed;
    // weight shifts sideways over the planted foot with each step
    this.body.position.x = -c * 0.022 * walking * posed;
    // standing: breathing, and now and then the weight settles onto one leg (a relaxed contrapposto)
    const idle = (1 - walking) * posed;
    const lean = Math.sin(this.t * 0.23 + this.seed * 6) > 0 ? 1 : -1;
    this.weight += (lean * idle - this.weight) * Math.min(1, dt * 1.5);
    if (!this.chest) {
      // villagers: the hips roll with the stride, the shoulders against them; cloth swings behind
      this.body.rotation.z = (s * 0.035 * walking + this.weight * 0.035) * posed;
      this.hips[0].rotation.z = -this.weight * 0.035;
      this.hips[1].rotation.z = -this.weight * 0.035;
      this.knees[this.weight > 0 ? 1 : 0].rotation.x += Math.abs(this.weight) * 0.14 * idle; // the free knee bends
    }
    this.body.position.y += Math.sin(this.t * 1.5 + this.seed * 3) * 0.003 * idle; // breathing
    for (const sh of this.shoulders) {
      if (!this.shoulderY.has(sh)) this.shoulderY.set(sh, sh.position.y);
      sh.position.y = this.shoulderY.get(sh)! + Math.sin(this.t * 1.5 + this.seed * 3) * 0.004 * idle;
    }
    if (this.skirt) {
      // the ghaghra lags the legs and sways with the hips
      this.skirtSwing += (s * 0.05 * walking - this.skirtSwing) * Math.min(1, dt * 6);
      this.skirt.rotation.x = -Math.abs(this.skirtSwing) * 0.6;
      this.skirt.rotation.z = this.skirtSwing;
    }
    if (this.chest) this.extras(dt, speed, s, c, walking, run, accel, posed, motion);
    // the head steadies itself against the twist, and glances around when standing
    this.head.rotation.y = -s * 0.06 * walking + (Math.sin(this.t * 0.35 + this.seed * 5) * 0.15 + Math.sin(this.t * 0.11 + this.seed) * 0.2) * (1 - walking);
    // poses may spread the arms; every frame starts from the shoulders' resting angle
    this.restZ ??= this.shoulders.map((sh) => sh.rotation.z);
    this.shoulders.forEach((sh, i) => (sh.rotation.z = this.restZ![i]));
    for (const [k, o] of this.props) if (k === "can" && this.action !== "pour") o.rotation.x = 0;
    if (this.action === "hoe") {
      // raise the hoe overhead and bring it down into the soil, about once a second
      const c = (this.t * 1.1) % 1;
      const lift = c < 0.55 ? c / 0.55 : 1 - (c - 0.55) / 0.45;
      const arm = -0.2 - 2.4 * Math.pow(lift, 1.4);
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = arm;
      this.elbows[0].rotation.x = this.elbows[1].rotation.x = -0.3 - 0.4 * lift;
      this.body.rotation.x = 0.28 - 0.18 * lift;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 0.25;
      this.hips[0].rotation.x = this.hips[1].rotation.x = -0.25;
    } else if (this.action === "bend") {
      // bent to the crop, hands working at it
      this.body.rotation.x = 0.55;
      this.hips[0].rotation.x = this.hips[1].rotation.x = -0.55;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 0.35;
      const w = Math.sin(this.t * 5);
      this.shoulders[0].rotation.x = -0.9 + w * 0.2;
      this.shoulders[1].rotation.x = -0.9 - w * 0.2;
      this.elbows[0].rotation.x = this.elbows[1].rotation.x = -0.4;
    } else if (this.action === "carry") {
      // one hand steadies the pot on the head
      this.shoulders[0].rotation.x = -2.9;
      this.elbows[0].rotation.x = -0.9;
    } else if (this.action === "pour") {
      // the can held out in front and tipped
      this.shoulders[1].rotation.x = -1.15;
      this.elbows[1].rotation.x = -0.25;
      this.body.rotation.x = 0.12;
      for (const [k, o] of this.props) if (k === "can") o.rotation.x = 0.7 + Math.sin(this.t * 6) * 0.05;
    } else if (this.action === "draw") {
      // hauling the bucket rope up hand over hand
      const c = Math.sin(this.t * 3.2);
      this.shoulders[0].rotation.x = -1.9 + c * 0.5;
      this.shoulders[1].rotation.x = -1.9 - c * 0.5;
      this.elbows[0].rotation.x = -0.6 - Math.max(0, c) * 0.5;
      this.elbows[1].rotation.x = -0.6 - Math.max(0, -c) * 0.5;
      this.body.rotation.x = 0.12 + Math.abs(c) * 0.05;
    } else if (this.action === "fish" || this.action === "reel") {
      // both hands on the rod, held out over the water; reeling works the arms
      const w = this.action === "reel" ? Math.sin(this.t * 14) * 0.12 : Math.sin(this.t * 1.3) * 0.03;
      this.shoulders[1].rotation.x = -0.75 + w;
      this.elbows[1].rotation.x = -0.35;
      this.shoulders[0].rotation.x = -0.6 - w;
      this.elbows[0].rotation.x = -0.9;
      this.body.rotation.x = this.action === "reel" ? -0.08 : 0.04;
    } else if (this.action === "crouch") {
      // a kabaddi defender's stance: knees bent, arms out, ready to pounce
      this.hips[0].rotation.x = this.hips[1].rotation.x = -0.6;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 0.8;
      this.body.rotation.x = 0.35;
      this.body.position.y -= 0.12;
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -1.1 + Math.sin(this.t * 3) * 0.1;
      this.shoulders[0].rotation.z = -0.35;
      this.shoulders[1].rotation.z = 0.35;
    } else if (this.action === "cheer") {
      const c = Math.abs(Math.sin(this.t * 5));
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -2.8 + c * 0.3;
      this.body.position.y += c * 0.06;
    } else if (this.action === "sit") {
      this.hips[0].rotation.x = this.hips[1].rotation.x = -1.5;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 1.5;
      this.body.position.y = -0.45;
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -0.4;
      if (this.props.get("rod")?.visible) {
        // sitting on the bank with a rod held out over the water
        this.shoulders[1].rotation.x = -0.85 + Math.sin(this.t * 1.1) * 0.03;
        this.elbows[1].rotation.x = -0.3;
        this.shoulders[0].rotation.x = -0.7;
        this.elbows[0].rotation.x = -0.8;
      }
    }
  }

  /** The player's rig on top of the shared walk: feet, chest, lean, jump, and the swinging bag and gamcha. */
  private extras(dt: number, speed: number, s: number, c: number, walking: number, run: number, accel: number, posed: number, motion: { turn?: number; air?: number }) {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const ramp = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    // Lean into acceleration and into speed; bank into turns. The logic is SADAK's hero animator
    // (github.com/mittal-parth/sadak, used with its developer's permission), with its speeds mapped
    // onto ours: SADAK walks at 4.6 m/s and sprints at 12, we walk at 3.4 and run at 6.2.
    const toSadak = 12 / 6.2;
    const sRun = ramp(2.2, 4.6, speed * toSadak), sSprint = ramp(5.5, 9.5, speed * toSadak);
    this.accelS += (accel - this.accelS) * k(10); // frame-to-frame speed is noisy; smooth it first
    const lean = THREE.MathUtils.clamp(this.accelS * 0.009 + sRun * 0.1 + sSprint * 0.12, -0.2, 0.3) * posed;
    const bank = THREE.MathUtils.clamp(-(motion.turn ?? 0) * speed * toSadak * 0.02, -0.25, 0.25) * posed;
    const pelvisRoll = s * (0.03 + 0.02 * sRun) * walking * posed;
    this.lean += (bank - this.lean) * k(12);
    this.body.rotation.x = lean * 0.4;
    this.body.rotation.z = pelvisRoll + this.lean;
    for (const hip of this.hips) hip.rotation.x -= lean * 0.4; // the legs stay under the body
    this.chest!.rotation.x = lean; // the spine and chest take the rest of the lean
    this.chest!.rotation.z = -pelvisRoll - this.lean * 0.5; // the chest rights itself half way
    this.head.rotation.x = -lean * 0.7; // and the head keeps its gaze level
    this.head.rotation.z = -this.lean * 0.4;
    // heel strike as a leg reaches forward, toe-off as it leaves the ground behind, and the foot
    // otherwise kept level under a bent knee
    this.feet.forEach((f, i) => {
      const fwd = i === 0 ? s : -s; // 1 = this leg fully forward
      const level = -(this.hips[i].rotation.x + this.knees[i].rotation.x) * 0.85;
      f.rotation.x = (level - Math.max(0, fwd) ** 2 * 0.28 + Math.max(0, -fwd) ** 2 * 0.42) * walking * posed;
    });
    // the chest turns against the hips, so the shoulders swing with the opposite arm
    this.chest!.rotation.y = -s * 0.17 * walking * posed;
    // in the air: knees tucked, arms up and out for balance
    this.airPose += ((motion.air ?? 0) * posed - this.airPose) * k(motion.air ? 18 : 10);
    const a = this.airPose;
    if (a > 0.01) {
      this.hips[0].rotation.x -= a * 0.7;
      this.hips[1].rotation.x -= a * 0.15;
      this.knees[0].rotation.x += a * 1.1;
      this.knees[1].rotation.x += a * 0.45;
      this.shoulders.forEach((sh, i) => {
        sh.rotation.x -= a * 0.6;
        sh.rotation.z += (i === 0 ? -1 : 1) * a * 0.45;
      });
    }
    // springs: the bag swings back as you set off and forward as you stop, sways with each step and
    // swings out on turns; the gamcha end flaps with the bob
    const h = Math.min(dt, 1 / 30); // springs stay stable through a hitch
    const spring = (st: number[], stiff: number, damping: number, drive: number, rest: number) => {
      st[1] += (-stiff * (st[0] - rest) - damping * st[1] + drive) * h;
      st[0] = THREE.MathUtils.clamp(st[0] + st[1] * h, -1, 1);
      return st[0];
    };
    this.bag!.rotation.x = spring(this.bagFwd, 30, 5, -accel * 0.5 + Math.abs(c) * 5 * walking, 0.04 + run * 0.12);
    this.bag!.rotation.z = spring(this.bagSide, 26, 5, s * 7 * walking + (motion.turn ?? 0) * 4, 0);
    this.scarf!.rotation.x = spring(this.scarfSwing, 40, 6, Math.abs(c) * 9 * walking - accel * 0.4, -0.08 - run * 0.35);
  }

  /** Where the rod's tip is in the world (for the fishing line), or null without a rod in hand. */
  rodTip(out: THREE.Vector3): THREE.Vector3 | null {
    const rod = this.props.get("rod");
    if (!rod?.visible) return null;
    const tip = rod.getObjectByName("rodTip");
    if (!tip) return null;
    this.root.updateMatrixWorld(true);
    return tip.getWorldPosition(out);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }
}
