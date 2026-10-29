import * as THREE from "three";
import { CROP_IDS, CROPS } from "../shared/crops";
import { BHOG_N, FEST_HOUR, type FestivalId, FESTIVALS, festivalOn, GUDI_HOUR, NAIK_SEED, yearOf } from "../shared/festivals";
import type { Action, FestivalDeed, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";
import type { World } from "../shared/world";
import type { Nav } from "./player/nav";

/*
 * The festivals in the world: on Dawali diyas line the chowk (and, once you light them, your
 * aangan); on Holi a fire is built in the chowk and gulal colours the ground; on Sevalal Jayanti
 * saffron flags fly at the mandir. Maharashtra's own: marigolds and a Krushi Din banner at
 * Vasantrao Naik's putla, a Ganpati pandal in the chowk for Ganeshotsav, aapta and marigold torans
 * at home for Dasara, kites over the chowk at Sankranti, bhagwa flags round Shivaji Maharaj's putla
 * on Shivaji Jayanti, and gudis on the houses at Gudi Padwa. Also what E does there. The server
 * decides what counts.
 */
type P = { x: number; z: number };
type Button = { label: string; sub?: string; onClick: () => void };
type Deps = {
  world: World;
  nav: Nav;
  ground: (x: number, z: number) => number;
  save: () => Save;
  now: () => number;
  act: (a: Action) => Result;
  toast: (m: string, k?: "ok" | "bad") => void;
  sound: (name: string) => void;
  dialogue: (who: string, title: string, text: string, buttons: Button[]) => void;
  closeDialogue: () => void;
};

const flame = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: new THREE.Color("#ff7a1a"), emissiveIntensity: 3, transparent: true, opacity: 0.9 });
const diyaLight = new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: new THREE.Color("#ffb347"), emissiveIntensity: 3 });
const clay = new THREE.MeshStandardMaterial({ color: "#a8542e", roughness: 0.9 });

/** A clay diya with its little flame. */
function diya() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.05, 8), clay);
  cup.position.y = 0.025;
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5).scale(1, 1.8, 1), diyaLight);
  f.position.y = 0.09;
  g.add(cup, f);
  return g;
}

const cloth = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide });
const bamboo = new THREE.MeshStandardMaterial({ color: "#c8a868", roughness: 0.9 });
const marigold = new THREE.MeshStandardMaterial({ color: "#f29a1a", roughness: 0.9 });
const gold = new THREE.MeshStandardMaterial({ color: "#d4a640", metalness: 0.8, roughness: 0.3 });

/** A bamboo pole with a triangular flag near the top. */
function flagPole(color: string, h = 3.2) {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 6), bamboo);
  stick.position.y = h / 2;
  const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0.25), new THREE.Vector2(0, 0.5)]);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(tri), cloth(color));
  flag.position.y = h - 0.6;
  g.add(stick, flag);
  return g;
}

/** A string of marigolds hung between two points (a toran or a garland), sagging in the middle. */
function toran(a: THREE.Vector3, b: THREE.Vector3, sag = 0.3, leaf?: THREE.Material) {
  const g = new THREE.Group();
  const n = Math.max(6, Math.round(a.distanceTo(b) / 0.12));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), i % 3 === 2 && leaf ? leaf : marigold);
    m.position.copy(p);
    g.add(m);
    // aapta or mango leaves hang down between the flowers
    if (leaf && i % 2) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.2), leaf);
      l.position.set(p.x, p.y - 0.13, p.z);
      g.add(l);
    }
  }
  return g;
}

/** A gudi: a bamboo staff with a silk cloth, neem and sugar garland, and a brass kalash upturned on top. */
function gudi() {
  const g = new THREE.Group();
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.4, 6), bamboo);
  staff.position.y = 1.7;
  const silk = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 10, 1, true), cloth("#e0306a"));
  silk.position.y = 2.95;
  const border = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.02, 4, 16).rotateX(Math.PI / 2), gold);
  border.position.y = 2.52;
  const kalash = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), gold);
  kalash.scale.y = 1.15;
  kalash.position.y = 3.45;
  const neem = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: "#4c8a3c", roughness: 0.9 }));
  neem.position.set(0.12, 3.18, 0);
  g.add(staff, silk, border, kalash, neem);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), i % 2 ? marigold : new THREE.MeshStandardMaterial({ color: "#f4efe2" }));
    m.position.set(Math.cos(a) * 0.17, 3.3 - Math.abs(Math.sin(a)) * 0.05, Math.sin(a) * 0.17);
    g.add(m);
  }
  return g;
}

/** Ganpati Bappa, seated on a red throne: a big belly, the elephant head with its trunk curling left, a gold mukut. */
function ganpati() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: "#e8742e", roughness: 0.55 });
  const dhoti = new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 });
  const throne = new THREE.MeshStandardMaterial({ color: "#a0141e", roughness: 0.6 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(1.2, 0.5, 0.9), throne, 0, 0.25, 0);
  add(new THREE.BoxGeometry(1.3, 1.5, 0.15), throne, 0, 1.0, -0.45);
  add(new THREE.SphereGeometry(0.36, 16, 12).scale(1, 0.55, 0.8), dhoti, 0, 0.62, 0.1); // folded legs
  add(new THREE.SphereGeometry(0.34, 16, 14), skin, 0, 0.98, 0.08); // the belly
  add(new THREE.SphereGeometry(0.22, 14, 12), skin, 0, 1.32, 0.02); // chest
  add(new THREE.SphereGeometry(0.21, 16, 14), skin, 0, 1.62, 0.04); // head
  for (const s of [-1, 1]) {
    const ear = add(new THREE.CircleGeometry(0.2, 14), skin, s * 0.2, 1.62, -0.02);
    ear.rotation.y = s * 0.5;
    ear.scale.y = 1.2;
    for (const k of [0, 1]) {
      const arm = add(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), skin, s * (0.3 + k * 0.1), 1.25 + k * 0.18, 0.05);
      arm.rotation.z = s * (0.9 + k * 0.6);
    }
  }
  // the trunk: a tapering curve down the front, curling to his left
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.58, 0.22), new THREE.Vector3(0, 1.4, 0.3), new THREE.Vector3(-0.05, 1.22, 0.3), new THREE.Vector3(-0.16, 1.15, 0.26)]);
  add(new THREE.TubeGeometry(curve, 16, 0.045, 8), skin, 0, 0, 0);
  const crown = add(new THREE.ConeGeometry(0.16, 0.32, 10), gold, 0, 1.92, 0.02);
  crown.scale.z = 0.9;
  add(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: "#f0d080", roughness: 0.6 }), 0.32, 1.02, 0.28); // a modak in his hand
  return g;
}

export class Festivals {
  readonly group = new THREE.Group();
  private dawali = new THREE.Group();
  private aangan = new THREE.Group(); // your own diyas, once lit
  private holi = new THREE.Group();
  private sevalal = new THREE.Group();
  private naik = new THREE.Group();
  private ganesh = new THREE.Group();
  private dasara = new THREE.Group();
  private sankranti = new THREE.Group();
  private shivaji = new THREE.Group();
  private padwa = new THREE.Group();
  private myGudi = new THREE.Group();
  private kites: THREE.Mesh[] = [];
  private pandalLight = new THREE.PointLight("#ffd28a", 0, 12, 1.6);
  readonly naikAt: P;
  readonly shivajiAt: P;
  readonly pandalAt: P;
  private flames: THREE.Mesh[] = [];
  private fireLight = new THREE.PointLight("#ff8a3a", 0, 14, 1.6);
  readonly fireAt: P;
  private homeAt: P;
  private templeAt: P;
  private t = 0;

  constructor(private d: Deps) {
    const L = d.world.landmarks, ch = d.world.chowk;
    this.fireAt = d.nav.open({ x: 106, z: 110.5 });
    this.homeAt = { x: L.home.x + 4.5, z: L.home.z - 4 };
    this.templeAt = { x: L.temple.x, z: L.temple.z };
    const statueAt = (who: "naik" | "shivaji") => {
      const s = d.world.structures.find((s) => s.kind === "statue" && s.who === who) as { x: number; z: number } | undefined;
      return s ? { x: s.x + 0.5, z: s.z + 0.5 } : { x: ch.x0 + 3, z: ch.z1 - 4 };
    };
    this.naikAt = statueAt("naik");
    this.shivajiAt = statueAt("shivaji");
    this.pandalAt = { x: 101.5, z: 115.5 }; // the west side of the chowk, clear of the evening fire
    const put = (g: THREE.Group, o: THREE.Object3D, p: P) => {
      o.position.set(p.x, d.ground(p.x, p.z), p.z);
      g.add(o);
    };
    // Dawali: diyas all round the edge of the chowk
    for (let x = ch.x0 + 0.5; x <= ch.x1 + 0.5; x += 1.6) for (const z of [ch.z0 + 0.3, ch.z1 + 0.7]) put(this.dawali, diya(), { x, z });
    for (let z = ch.z0 + 0.5; z <= ch.z1 + 0.5; z += 1.6) for (const x of [ch.x0 + 0.3, ch.x1 + 0.7]) put(this.dawali, diya(), { x, z });
    // …and a row along your aangan when you light them
    for (let i = 0; i < 9; i++) put(this.aangan, diya(), { x: this.homeAt.x + (i % 3) * 0.5, z: this.homeAt.z - 1.5 + Math.floor(i / 3) * 1.4 });
    this.dawali.add(this.aangan);
    // Holi: a stack of logs and the fire, and gulal on the ground round it
    const logs = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 1 });
    const fire = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), logs);
      // leaning in to a point, like a tepee
      log.rotation.z = 0.5;
      log.position.set(0.3, 0.6, 0);
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 6) * Math.PI * 2;
      pivot.add(log);
      fire.add(pivot);
    }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.1, 1.2 + i * 0.3, 7), flame);
      f.position.y = 0.8 + i * 0.1;
      f.rotation.y = i;
      this.flames.push(f);
      fire.add(f);
    }
    this.fireLight.position.y = 1.6;
    fire.add(this.fireLight);
    put(this.holi, fire, this.fireAt);
    const gulal = ["#e8457b", "#f5c518", "#3fbf5a", "#3f7fe8", "#b04ae8"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, r = 2 + (i % 5) * 1.1;
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.35 + (i % 3) * 0.15, 10).rotateX(-Math.PI / 2), gulal[i % gulal.length]);
      const p = { x: this.fireAt.x + Math.cos(a) * r, z: this.fireAt.z + Math.sin(a) * r };
      if (p.x < ch.x0 || p.x > ch.x1 + 1 || p.z < ch.z0 || p.z > ch.z1 + 1) continue;
      spot.position.set(p.x, d.ground(p.x, p.z) + 0.02, p.z);
      this.holi.add(spot);
    }
    // Sevalal Jayanti: saffron flags on bamboo poles before the mandir
    const pole = new THREE.MeshStandardMaterial({ color: "#c8a868", roughness: 0.9 });
    const saffron = new THREE.MeshStandardMaterial({ color: "#f07a1a", roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6), pole);
      stick.position.y = 1.6;
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0.25), new THREE.Vector2(0, 0.5)]);
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(tri), saffron);
      flag.position.y = 2.6;
      g.add(stick, flag);
      put(this.sevalal, g, { x: this.templeAt.x - 3.5 + i * 1.4, z: this.templeAt.z + 1.6 });
    }
    // Krushi Din: heaps of marigolds round Vasantrao Naik's pedestal, and a banner over the chowk
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const heap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), marigold);
      heap.scale.y = 0.6;
      put(this.naik, heap, { x: this.naikAt.x + Math.cos(a) * 1.35, z: this.naikAt.z + Math.sin(a) * 1.35 });
    }
    const banner = (lines: [string, string], bg: string, fg: string) => {
      const c = document.createElement("canvas");
      c.width = 512;
      c.height = 128;
      const g = c.getContext("2d")!;
      g.fillStyle = bg;
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = fg;
      g.textAlign = "center";
      g.font = "800 50px 'Noto Sans Devanagari', system-ui";
      g.fillText(lines[0], 256, 60);
      g.font = "600 26px system-ui";
      g.fillText(lines[1], 256, 104);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
    };
    const krushi = banner(["कृषी दिन · वसंतराव नाईक जयंती", "Krushi Din · Vasantrao Naik Jayanti"], "#1f6b2c", "#fff6d8");
    const kp = { x: this.naikAt.x - 2.2, z: this.naikAt.z + 2.6 };
    for (const dx of [-1.7, 1.7]) put(this.naik, new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3, 6).translate(0, 1.5, 0), bamboo), { x: kp.x + dx, z: kp.z });
    put(this.naik, krushi, kp);
    krushi.position.y += 2.5;
    // Ganeshotsav: a pandal of bamboo and cloth with Bappa inside, string lights, and the aarti thali
    {
      const pandal = new THREE.Group();
      for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.4], [1.6, 1.4]]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.2, 6), bamboo);
        pole.position.set(x, 1.6, z);
        pandal.add(pole);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 3.0), cloth("#c8202a"));
      roof.position.set(0, 3.2, 0.1);
      const valance = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 0.04), cloth("#f2c230"));
      valance.position.set(0, 2.98, 1.6);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.1), cloth("#7a1a6a"));
      back.position.set(0, 1.6, -1.2);
      pandal.add(roof, valance, back);
      const bappa = ganpati();
      bappa.position.set(0, 0, -0.6);
      pandal.add(bappa);
      for (let i = 0; i < 14; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), new THREE.MeshStandardMaterial({ color: ["#ff5a5a", "#5aff7a", "#5ab4ff", "#ffe05a"][i % 4], emissive: ["#ff2a2a", "#2aff4a", "#2a8aff", "#ffcc2a"][i % 4], emissiveIntensity: 2 }));
        b.position.set(-1.6 + (i / 13) * 3.2, 2.75 - Math.sin((i / 13) * Math.PI) * 0.2, 1.62);
        pandal.add(b);
      }
      this.pandalLight.position.set(0, 2.6, 0.6);
      pandal.add(this.pandalLight, toran(new THREE.Vector3(-1.6, 2.9, 1.65), new THREE.Vector3(1.6, 2.9, 1.65), 0.25));
      pandal.rotation.y = Math.PI / 2; // open to the east, toward the middle of the chowk
      put(this.ganesh, pandal, this.pandalAt);
    }
    // Dasara: aapta-leaf and marigold torans across your door and the gate
    const aapta = new THREE.MeshStandardMaterial({ color: "#5d8a2e", roughness: 0.9, side: THREE.DoubleSide });
    const hy = d.ground(this.homeAt.x, this.homeAt.z);
    this.dasara.add(toran(new THREE.Vector3(this.homeAt.x - 2.2, hy + 2.6, this.homeAt.z + 0.8), new THREE.Vector3(this.homeAt.x + 2.2, hy + 2.6, this.homeAt.z + 0.8), 0.3, aapta));
    for (const [dx, dz] of [[-1.2, -0.8], [1.6, -1.6]]) {
      const heap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), aapta);
      heap.scale.y = 0.4;
      put(this.dasara, heap, { x: this.homeAt.x + dx, z: this.homeAt.z + dz });
    }
    // Sankranti: kites high over the chowk
    const kiteCols = ["#e8327a", "#f6e04a", "#3a8ae8", "#3fbf5a", "#f2801e", "#9a4ae8"];
    for (let i = 0; i < 9; i++) {
      const k = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), cloth(kiteCols[i % kiteCols.length]));
      k.rotation.z = Math.PI / 4;
      k.position.set(ch.x0 + 2 + (i * 7.3) % (ch.x1 - ch.x0), 14 + (i % 4) * 3, ch.z0 + (i * 5.1) % (ch.z1 - ch.z0));
      k.userData.base = k.position.clone();
      this.kites.push(k);
      this.sankranti.add(k);
    }
    // Shivaji Jayanti: bhagwa flags all round the putla, and a rangoli at its foot
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      put(this.shivaji, flagPole("#f07a1a", 3.6), { x: this.shivajiAt.x + Math.cos(a) * 3.4, z: this.shivajiAt.z + Math.sin(a) * 3.4 });
    }
    const rangoli = new THREE.Group();
    ["#e8327a", "#f6e04a", "#f2801e", "#ffffff"].forEach((c, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.3 + i * 0.32, 0.55 + i * 0.32, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
      ring.position.y = 0.03 + i * 0.001;
      rangoli.add(ring);
    });
    put(this.shivaji, rangoli, { x: this.shivajiAt.x + 2.6, z: this.shivajiAt.z });
    // Gudi Padwa: gudis on the neighbours' houses, and yours once you raise it
    const houses = d.world.structures.filter((s) => s.kind === "house").slice(0, 14) as { x0: number; z0: number }[];
    for (const h of houses) put(this.padwa, gudi(), { x: h.x0 - 0.4, z: h.z0 - 0.4 });
    put(this.myGudi, gudi(), { x: this.homeAt.x - 1.5, z: this.homeAt.z + 0.6 });
    this.padwa.add(this.myGudi);
    this.group.add(this.dawali, this.holi, this.sevalal, this.naik, this.ganesh, this.dasara, this.sankranti, this.shivaji, this.padwa);
  }

  /** The festival today, if any. */
  today(): FestivalId | null {
    return festivalOn(clock(this.d.now()).day);
  }
  private done(what: string) {
    const f = this.today();
    return !!f && this.d.save().fests?.[`${f}:${what}`] === yearOf(clock(this.d.now()).day);
  }

  update(dt: number, hour: number) {
    const f = this.today();
    this.dawali.visible = f === "dawali";
    this.aangan.visible = this.done("diyas");
    this.holi.visible = f === "holi";
    this.sevalal.visible = f === "sevalal";
    this.naik.visible = f === "naik";
    this.ganesh.visible = f === "ganesh";
    this.dasara.visible = f === "dasara";
    this.sankranti.visible = f === "sankranti";
    this.shivaji.visible = f === "shivaji";
    this.padwa.visible = f === "padwa";
    this.myGudi.visible = this.done("gudi");
    this.pandalLight.intensity = f === "ganesh" && (hour >= 18 || hour < 6) ? 6 : 0;
    this.t += dt;
    if (this.sankranti.visible)
      this.kites.forEach((k, i) => {
        const b = k.userData.base as THREE.Vector3;
        k.position.set(b.x + Math.sin(this.t * 0.6 + i) * 1.2, b.y + Math.sin(this.t * 1.1 + i * 2) * 0.6, b.z + Math.cos(this.t * 0.5 + i) * 0.8);
        k.rotation.y = Math.sin(this.t * 0.8 + i) * 0.4;
      });
    if (this.holi.visible) {
      // the fire is lit at dusk and burns through the night
      const lit = hour >= 18 || hour < 6;
      this.flames.forEach((fl, i) => {
        fl.visible = lit;
        fl.scale.set(1, 1 + Math.sin(this.t * (7 + i * 3)) * 0.15, 1);
      });
      this.fireLight.intensity = lit ? 3 + Math.sin(this.t * 11) * 0.6 : 0;
    }
    for (const g of [this.sevalal, this.shivaji]) for (const fl of g.children) if (fl.children[1]) (fl.children[1] as THREE.Mesh).rotation.y = Math.sin(this.t * 2 + fl.position.x) * 0.25;
  }

  private where(p: P): "home" | "fire" | "temple" | "naik" | "pandal" | "chowk" | "shivaji" | null {
    const f = this.today();
    const near = (q: P, r: number) => Math.hypot(p.x - q.x, p.z - q.z) < r;
    if ((f === "dawali" || f === "dasara" || f === "padwa") && near(this.homeAt, 5)) return "home";
    if (f === "holi" && near(this.fireAt, 3.5)) return "fire";
    if (f === "sevalal" && near(this.templeAt, 5)) return "temple";
    if (f === "naik" && near(this.naikAt, 3.5)) return "naik";
    if (f === "ganesh" && near(this.pandalAt, 4)) return "pandal";
    if (f === "shivaji" && near(this.shivajiAt, 4)) return "shivaji";
    if (f === "sankranti" && near(this.fireAt, 7)) return "chowk";
    return null;
  }

  /** The hint line for what E does here on a festival, or "". */
  hint(p: P, hour: number): string {
    const w = this.where(p);
    const dark = hour >= FEST_HOUR || hour < 6;
    const f = this.today();
    if (w === "home" && f === "dasara") return this.done("puja") ? "🌿 Shubh Dasara! Your tools and bulls have had their puja" : "<kbd>E</kbd> Do the Dasara puja for your bulls and tools";
    if (w === "home" && f === "padwa") return this.done("gudi") ? "🎋 Your gudi stands over Rathod Bhuvan — a happy new year!" : hour < GUDI_HOUR ? "<kbd>E</kbd> Raise the gudi at Rathod Bhuvan" : "🎋 The gudi goes up in the morning — you've missed it this year";
    if (w === "naik") return this.done("garland") ? "🌾 You've garlanded Vasantrao Naik — happy Krushi Din" : `<kbd>E</kbd> Garland Vasantrao Naik's putla <small class="hours">· the krushi sevak gives ${NAIK_SEED} seed</small>`;
    if (w === "pandal") return this.done("aarti") ? "🐘 Ganpati Bappa Morya! You've sung the aarti" : dark ? "<kbd>E</kbd> Join the aarti at the Ganpati pandal" : "🐘 The aarti at the pandal is after dark (7 pm)";
    if (w === "shivaji") return this.done("shivaji") ? "🚩 Jai Bhavani, Jai Shivaji!" : "<kbd>E</kbd> Garland Chhatrapati Shivaji Maharaj's putla";
    if (w === "chowk") return this.done("tilgul") ? "🪁 Tilgul ghya, god god bola!" : "<kbd>E</kbd> Hand out til-gul in the chowk";
    if (w === "home") return this.done("diyas") ? "🪔 Your diyas are lit — Shubh Dawali!" : dark ? "<kbd>E</kbd> Light the Dawali diyas at Rathod Bhuvan" : "🪔 Light your Dawali diyas here after dark (7 pm)";
    if (w === "fire") return this.done("fire") ? "🔥 Holi hai! The fire burns till morning" : dark ? "<kbd>E</kbd> Sit by the Holi fire and sing the lengi" : "🔥 The Holi fire is lit here after dark (7 pm)";
    if (w === "temple") return this.done("bhog") ? "🚩 Sevalal Maharaj has blessed your fields" : `<kbd>E</kbd> Offer bhog to Sevalal Maharaj <small class="hours">· ${BHOG_N} produce</small>`;
    return "";
  }

  /** E on a festival: true if it did something. */
  interact(p: P, hour: number): boolean {
    const w = this.where(p);
    if (!w) return false;
    const report = (r: Result) => {
      this.d.toast(r.ok ? (r.msg ?? "") : r.error, r.ok ? "ok" : "bad");
      if (r.ok) this.d.sound("templebell");
    };
    const dark = hour >= FEST_HOUR || hour < 6;
    const f = this.today();
    const deeds: Partial<Record<string, FestivalDeed>> = { naik: "garland", pandal: "aarti", shivaji: "shivaji", chowk: "tilgul" };
    const deed = deeds[w];
    if (w === "home" && f === "dasara") {
      if (this.done("puja")) return false;
      report(this.d.act({ t: "festival", what: "puja" }));
    } else if (w === "home" && f === "padwa") {
      if (this.done("gudi") || hour >= GUDI_HOUR) return false;
      report(this.d.act({ t: "festival", what: "gudi" }));
    } else if (deed) {
      if (this.done(deed) || (deed === "aarti" && !dark)) return false;
      report(this.d.act({ t: "festival", what: deed }));
    } else if (w === "home" && !this.done("diyas") && dark) report(this.d.act({ t: "festival", what: "diyas" }));
    else if (w === "fire" && !this.done("fire") && dark) report(this.d.act({ t: "festival", what: "fire" }));
    else if (w === "temple" && !this.done("bhog")) {
      const s = this.d.save();
      const crops = CROP_IDS.filter((c) => (s.inv[c] ?? 0) >= BHOG_N);
      const f = FESTIVALS.sevalal;
      if (!crops.length) this.d.dialogue(`${f.icon} ${f.name} · ${f.local}`, "Bhog", `Bring ${BHOG_N} of your harvest — onions, jowar or cane — as bhog for Maharaj.`, [{ label: "I'll bring it", onClick: this.d.closeDialogue }]);
      else
        this.d.dialogue(`${f.icon} ${f.name} · ${f.local}`, "Bhog for Sevalal Maharaj", "The pujari waits with the thali. Offer the first of your harvest, and Maharaj's blessing will fall on your fields like rain.", [
          ...crops.map((c) => ({ label: `Offer ${BHOG_N} ${CROPS[c].name.toLowerCase()}`, sub: `you have ${s.inv[c]}`, onClick: () => (this.d.closeDialogue(), report(this.d.act({ t: "festival", what: "bhog", item: c }))) })),
          { label: "Not now", onClick: this.d.closeDialogue },
        ]);
    } else return false;
    return true;
  }
}
