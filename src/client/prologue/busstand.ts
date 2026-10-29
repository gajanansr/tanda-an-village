import * as THREE from "three";
import { Npc } from "../engine/npc";
import { banjaraWoman, Figure, type Look } from "../scene/figure";
import { blob, box, cyl, mat, painted, sign } from "./kit";
import { buildBus } from "./bus";

/*
 * Act 2: Swargate ST stand at 10:40 pm, the one part of the prologue you walk. The yard is 48 × 48 m
 * on flat ground: the station building along the north (z 0–6) with its stalls in front, the platform
 * shelter (z 13–19), the buses in their bays (z ≈ 21), and the forecourt and gate to the south where
 * you come in. Solid things are marked on a 1 m grid for the walker and the camera.
 */
export const YARD = 48;
export type Spot = { id: "enquiry" | "radio" | "chai" | "conductor"; x: number; z: number; label: string };

export function buildBusStand() {
  const g = new THREE.Group();
  const solidCells = new Map<number, number>(); // cell → height of what's there
  const solidBox = (x0: number, z0: number, x1: number, z1: number, h: number) => {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++)
      for (let z = Math.floor(z0); z < Math.ceil(z1); z++) solidCells.set(x + z * 1000, Math.max(h, solidCells.get(x + z * 1000) ?? 0));
  };
  const solid = (x: number, y: number, z: number) => y >= 0 && y < (solidCells.get(Math.floor(x) + Math.floor(z) * 1000) ?? 0);

  // the ground: worn asphalt, the concrete platform, the yellow bay lines
  box(g, 120, 0.1, 120, YARD / 2, -0.1, YARD / 2, mat("#2c2b2d", { rough: 0.95 }));
  box(g, 42, 0.04, 7, 24, -0.02, 16, mat("#7a756c", { rough: 1 }));
  box(g, 40, 0.06, 1.4, 24, -0.02, 7.6, mat("#8a847a", { rough: 1 }));
  for (let x = 6; x <= 42; x += 12) box(g, 0.15, 0.03, 4, x, 0, 21.3, "#d9b43a");
  box(g, 38, 0.03, 0.15, 24, 0, 19.4, "#d9b43a");

  // the station building, with the stand's name lit across it
  box(g, 40, 4.6, 6, 24, 0, 3, mat("#e6d7b0"));
  box(g, 40, 0.9, 6.05, 24, 0, 3, mat("#9b2c25"));
  box(g, 41, 0.3, 7.5, 24, 4.6, 3.6, mat("#b8ab8c"));
  solidBox(4, 0, 44, 6, 5);
  const name = sign(["स्वारगेट बस स्थानक", "SWARGATE ST STAND · M.S.R.T.C."], { w: 13, h: 1.5, bg: "#7d1414", fg: "#ffe9b0", lit: true });
  name.position.set(24, 3.55, 6.06);
  g.add(name);
  // the windows: enquiry, reservation, and the doors in between
  const windows: [number, string, string][] = [[30, "चौकशी", "Enquiry"], [34, "आरक्षण", "Reservation"], [38, "पास", "Pass"]];
  for (const [x, mr, en] of windows) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), mat("#ffe3a8", { glow: 1.4 }));
    w.position.set(x, 1.5, 6.03);
    g.add(w);
    const s = sign([mr, en], { w: 1.8, h: 0.55, bg: "#1f4f8a", fg: "#ffffff", lit: true });
    s.position.set(x, 2.45, 6.04);
    g.add(s);
  }
  for (const x of [12, 22]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), mat("#1b1712"));
    d.position.set(x, 1.3, 6.02);
    g.add(d);
  }

  // stalls along the front: chai, the radio-and-mobile shop, vada pav
  const stall = (x: number, w: number, color: string, lines: string[], fg = "#ffffff") => {
    box(g, w, 1.0, 1.2, x, 0, 7.4, mat(color));
    box(g, w + 0.4, 0.08, 2.2, x, 2.5, 7.4, mat("#b0b4b8", { metal: 0.5, rough: 0.4 }));
    for (const s of [-1, 1]) cyl(g, 0.05, 2.5, x + s * (w / 2), 0, 8.4, "#8a8c90", 6);
    const sg = sign(lines, { w: w + 0.2, h: 0.6, bg: color, fg, lit: true });
    sg.position.set(x, 2.85, 8.5);
    g.add(sg);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat("#fff1c2", { glow: 6 }));
    bulb.position.set(x, 2.35, 7.8);
    g.add(bulb);
    solidBox(x - w / 2, 6.8, x + w / 2, 8.0, 1.0);
  };
  stall(9, 2.6, "#c0392b", ["अमृततुल्य चहा", "Cutting chai ₹10"]);
  // a big steel kettle on the chai stall
  cyl(g, 0.16, 0.3, 8.6, 1.0, 7.3, mat("#c8ccd0", { metal: 0.8, rough: 0.25 }), 12);
  stall(16.5, 3, "#1d6f6a", ["पवार इलेक्ट्रॉनिक्स", "Radio · Mobile · Charger"]);
  // little radios on the counter
  for (let i = 0; i < 4; i++) {
    const r = box(g, 0.3, 0.18, 0.1, 15.5 + i * 0.6, 1.0, 7.2, mat(["#3a2a20", "#7d1d1d", "#20304a", "#2e2e2e"][i], { rough: 0.5 }));
    r.rotation.y = 0.1 * (i - 1.5);
  }
  stall(40.5, 2.6, "#d6862a", ["गरमागरम वडापाव", "Vada pav ₹15"], "#2a1a08");

  // the platform shelter: pillars, a tin roof, tube lights, benches, and the bay boards
  const roof = box(g, 40, 0.12, 7.5, 24, 3.6, 16, mat("#8d9298", { metal: 0.55, rough: 0.45 }));
  roof.rotation.x = 0.03;
  for (let x = 5; x <= 43; x += 6)
    for (const z of [13, 19]) {
      box(g, 0.35, 3.6, 0.35, x, 0, z, mat("#d6cdb8"));
      solidBox(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 4);
    }
  for (let x = 8; x <= 40; x += 8) box(g, 1.6, 0.06, 0.12, x, 3.45, 16, mat("#eef6ff", { glow: 2.5 }));
  for (let x = 7; x <= 41; x += 6) {
    box(g, 2.2, 0.08, 0.5, x + 1.5, 0.42, 14.4, mat("#5b6d7d", { metal: 0.4, rough: 0.5 }));
    for (const s of [-1, 1]) box(g, 0.06, 0.42, 0.4, x + 1.5 + s, 0, 14.4, "#3b4652");
  }
  const bays: [number, string][] = [[18, "फलाट ३ · पुणे – सातारा"], [36, "फलाट ४ · पुणे – जालना"]];
  for (const [x, text] of bays) {
    const s = sign([text], { w: 4, h: 0.5, bg: "#f2d24a", fg: "#1a1a1a", lit: true });
    s.position.set(x, 3.05, 13.2); // on the yard side of the shelter, where you see it coming in
    g.add(s);
  }

  // the buses in their bays: the Lal Pari to Jalna at platform 4, another bound for Satara
  const lalPari = buildBus("पुणे – जालना", "PUNE – JALNA");
  lalPari.group.position.set(36, 0, 21.3);
  lalPari.setNight(0.6);
  g.add(lalPari.group);
  const satara = buildBus("पुणे – सातारा", "PUNE – SATARA");
  satara.group.position.set(18, 0, 21.3);
  g.add(satara.group);
  for (const x of [36, 18]) solidBox(x - 5.6, 20, x + 5.6, 22.6, 3);

  // the sodium lamps over the yard (each a real light), and the city beyond the wall
  const lamps: [number, number][] = [[10, 28], [24, 30], [38, 28], [24, 40], [44, 10]];
  for (const [x, z] of lamps) {
    cyl(g, 0.08, 7, x, 0, z, "#6d6f72", 6);
    box(g, 0.25, 0.12, 1.2, x, 7, z - 0.5, "#4a4c50");
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat("#ffb35a", { glow: 7 }));
    bulb.position.set(x, 6.92, z - 1);
    g.add(bulb);
    const l = new THREE.PointLight("#ffa04a", 26, 24, 1.4);
    l.position.set(x, 6.6, z - 1);
    g.add(l);
    solidBox(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 7);
  }
  const shelterLight = new THREE.PointLight("#dcecff", 14, 18, 1.5);
  shelterLight.position.set(30, 3.2, 16);
  g.add(shelterLight);
  const shelterLight2 = shelterLight.clone();
  shelterLight2.position.x = 14;
  g.add(shelterLight2);
  g.add(new THREE.HemisphereLight("#5a68a0", "#3a3028", 1.4));
  // the compound wall and the gate
  for (const [x0, z0, x1, z1] of [[0, -0.6, YARD, 0], [-0.6, 0, 0, YARD], [YARD, 0, YARD + 0.6, YARD], [0, YARD, 20, YARD + 0.6], [28, YARD, YARD, YARD + 0.6]] as const)
    box(g, x1 - x0, 1.6, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, mat("#c9bfa8"));
  const towers = painted(64, 128, (c, w, h) => {
    c.fillStyle = "#1a1c26";
    c.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) if (Math.random() < 0.3) { c.fillStyle = "#ffd48a"; c.fillRect(x, y, 4, 4); }
  });
  for (let i = 0; i < 16; i++) {
    const h = 14 + Math.random() * 30;
    const t = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), new THREE.MeshBasicMaterial({ map: towers, color: "#9aa0b8" }));
    const a = (i / 16) * Math.PI * 2;
    t.position.set(YARD / 2 + Math.cos(a) * 70, h / 2, YARD / 2 + Math.sin(a) * 70);
    g.add(t);
  }

  // people: the stall keepers, the conductor at the Lal Pari's door, and passengers waiting
  const npcs: Npc[] = [];
  const chaiwala = new Npc({ kurta: "#e8e2d2", dhoti: "#4a4038", hat: "#f2efe6", skin: "#9a6240" }, 9.6, 0, 6.6, 0);
  const shopkeeper = new Npc({ kurta: "#3a6ea5", dhoti: "#2c2c34", hat: "#2a2a2a", skin: "#a8714c" }, 17, 0, 6.6, 0);
  const conductor = new Npc({ kurta: "#b3a274", dhoti: "#a8986a", hat: "#a8986a", skin: "#8e5b3c" }, 40.6, 0, 19.0, Math.PI / 2);
  const woman = new Npc({ kurta: "", dhoti: "#a8322a", hat: "#e0a030", woman: true }, 33.5, 0, 18.0, Math.PI);
  npcs.push(chaiwala, shopkeeper, conductor, woman);
  for (const n of npcs) {
    g.add(n.group);
    n.group.add(blob(0.9));
  }
  for (const [x, z] of [[9.6, 6.6], [17, 6.6], [40.6, 19.0], [33.5, 18.0]]) solidBox(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 2);
  const sitters: Figure[] = [];
  const seated: [Look, number, number][] = [
    [{ kurta: "#e9e4d6", dhoti: "#e9e4d6", hat: "#f2f0ea", hatStyle: "topi", skin: "#8a5a3a" }, 26.0, 14.5],
    [banjaraWoman("#2a5a8a", "#c0392b"), 32.9, 14.5],
    [{ kurta: "#4a6a4a", dhoti: "#2e2e36", hat: "#111", hatStyle: "none", skin: "#a36f4c", body: "villager_m" }, 14.0, 14.5],
  ];
  for (const [look, x, z] of seated) {
    const f = new Figure(look);
    f.action = "sit";
    f.root.position.set(x, 0, z - 0.05);
    g.add(f.root);
    sitters.push(f);
  }

  const spots: Spot[] = [
    { id: "enquiry", x: 30, z: 7.4, label: "Ask about the Jalna bus at the enquiry window" },
    { id: "radio", x: 16.5, z: 8.9, label: "Look at the radios (Pawar Electronics)" },
    { id: "chai", x: 9, z: 8.9, label: "Have a cutting chai" },
    { id: "conductor", x: 40.2, z: 18.6, label: "Talk to the conductor" },
  ];
  return {
    group: g, solid, spots, npcs, sitters, lalPari,
    /** Where you come in, at the gate, looking up the yard. */
    spawn: { x: 20.5, z: 43, yaw: 0 },
  };
}
export type BusStand = ReturnType<typeof buildBusStand>;
