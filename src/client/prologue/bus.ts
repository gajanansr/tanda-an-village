import * as THREE from "three";
import { blob, box, cyl, mat, sign } from "./kit";

/*
 * The Lal Pari: Maharashtra's red ST bus. Its origin is on the ground at the middle of the bus, and it
 * faces +x, so its left side (where the door is) is −z. It's built as panels rather than solid boxes so
 * the camera can sit inside among the seats.
 */
const RED = "#b81f27", BAND = "#f0c04a";
export const BUS = { length: 11, width: 2.5, floor: 0.95 };

export function buildBus(dest: string, destEn: string) {
  const g = new THREE.Group();
  const L = BUS.length, W = BUS.width, hl = L / 2, hw = W / 2;
  const red = mat(RED, { rough: 0.45, metal: 0.2 });
  const glass = mat("#1a2730", { rough: 0.1, metal: 0.4, opacity: 0.35 });
  // floor, chassis skirt and bumpers
  box(g, L, 0.12, W, 0, 0.83, 0, "#3a3633");
  box(g, L - 0.3, 0.35, W - 0.2, 0, 0.45, 0, "#1c1c1e");
  box(g, 0.2, 0.3, W + 0.05, hl + 0.05, 0.5, 0, "#2a2a2c");
  box(g, 0.2, 0.3, W + 0.05, -hl - 0.05, 0.5, 0, "#2a2a2c");
  // the lower body: two sides, the front and the back, red with the yellow band
  for (const s of [-1, 1]) {
    box(g, L, 0.75, 0.06, 0, 0.75, s * hw, red);
    box(g, L, 0.1, 0.07, 0, 1.4, s * hw, mat(BAND, { rough: 0.5 }));
  }
  box(g, 0.06, 0.75, W, hl, 0.75, 0, red);
  box(g, 0.06, 1.75, W, -hl, 0.75, 0, red);
  // the window band: pillars and glass down both sides, the windscreen in front
  const pillars = 12;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= pillars; i++) box(g, 0.12, 1.0, 0.07, -hl + (i * L) / pillars, 1.5, s * hw, red);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.95), glass);
    pane.position.set(0, 1.98, s * (hw - 0.01));
    g.add(pane);
  }
  const wind = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, 0.95), glass);
  wind.rotation.y = Math.PI / 2;
  wind.position.set(hl + 0.01, 1.98, 0);
  g.add(wind);
  // the roof, with its luggage rail
  box(g, L + 0.05, 0.22, W + 0.05, 0, 2.48, 0, red);
  box(g, L - 2, 0.06, W - 0.5, -0.5, 2.7, 0, "#8d8f92");
  // the door, open, on the left near the front
  const door = box(g, 0.85, 1.55, 0.08, hl - 1.3, 0.95, -hw - 0.005, "#141414");
  door.material = mat("#0d0e10");
  // the destination board over the windscreen, and the name down the side
  const board = sign([dest, destEn], { w: 1.9, h: 0.38, bg: "#121212", fg: "#ffb43a", lit: true });
  board.rotation.y = Math.PI / 2;
  board.position.set(hl + 0.045, 2.3, 0);
  g.add(board);
  const side = sign(["महाराष्ट्र राज्य मार्ग परिवहन महामंडळ"], { w: 5.2, h: 0.36, bg: RED, fg: "#fff4dc" });
  side.position.set(-0.6, 1.05, hw + 0.035);
  g.add(side);
  const side2 = side.clone();
  side2.rotation.y = Math.PI;
  side2.position.set(-0.6, 1.05, -hw - 0.035);
  g.add(side2);
  // head and tail lights
  const head = mat("#fff3d0", { glow: 3 });
  for (const s of [-1, 1]) {
    box(g, 0.05, 0.18, 0.3, hl + 0.06, 0.62, s * (hw - 0.3), head);
    box(g, 0.05, 0.16, 0.22, -hl - 0.06, 0.66, s * (hw - 0.3), mat("#ff2a1a", { glow: 2.5 }));
  }
  // wheels
  const wheels: THREE.Mesh[] = [];
  for (const x of [hl - 2, -hl + 2.6])
    for (const s of [-1, 1]) {
      const w = cyl(g, 0.5, 0.32, x, 0, s * (hw - 0.12), mat("#141414", { rough: 0.9 }), 16);
      w.rotation.x = Math.PI / 2;
      w.position.y = 0.5;
      cyl(w, 0.24, 0.34, 0, -0.17, 0, "#8a8c90", 10);
      wheels.push(w);
    }
  // inside: rows of seats (two on the left, three on the right) and a strip of tube lights
  const seat = mat("#2f4f7a", { rough: 0.9 });
  const rows: number[] = [];
  for (let x = -hl + 1.0; x < hl - 2.2; x += 0.85) rows.push(x);
  const cols = [-0.95, -0.5, 0.3, 0.72, 1.12];
  for (const x of rows)
    for (const z of cols) {
      box(g, 0.45, 0.42, 0.42, x, BUS.floor, z, seat);
      box(g, 0.08, 0.6, 0.42, x - 0.22, BUS.floor + 0.42, z, seat);
    }
  const tube = box(g, L - 2, 0.04, 0.08, -0.3, 2.42, 0, mat("#e8f4ff", { glow: 1.2 }));
  const inside = new THREE.PointLight("#dfefff", 0, 8, 1.5);
  inside.position.set(0, 2.2, 0);
  g.add(inside);
  // headlight beams for the night road
  const beam = new THREE.SpotLight("#ffe7b0", 0, 60, 0.45, 0.6, 1.2);
  beam.position.set(hl + 0.2, 0.8, 0);
  beam.target.position.set(hl + 20, 0, 0);
  g.add(beam, beam.target);
  g.add(blob(L + 1.2, W + 1.4));

  /** Where someone sits: row `r` from the back, column `c` (0–1 left, 2–4 right). Feet on the floor. */
  const seatAt = (r: number, c: number) => new THREE.Vector3(rows[r] + 0.05, BUS.floor, cols[c]);
  return {
    group: g, wheels, seatAt, door,
    setNight(on: number) {
      beam.intensity = on * 90;
      inside.intensity = on * 6;
      (tube.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + on;
    },
    spin(dist: number) {
      for (const w of wheels) w.rotation.y = -dist / 0.5;
    },
  };
}
export type Bus = ReturnType<typeof buildBus>;

/*
 * The road to Jalna for the bus ride. The bus stays put and the land streams past it (−x), wrapping
 * round: fields of black soil, babul and neem, electricity poles, now and then a dhaba with its lights.
 */
export function buildHighway() {
  const g = new THREE.Group();
  const SPAN = 320;
  box(g, 2000, 0.1, 2000, 0, -0.11, 0, mat("#3a2e26", { rough: 1 }));
  box(g, 2000, 0.02, 8, 0, -0.01, 1.6, mat("#2b2b2e", { rough: 0.95 })); // the road; the bus keeps left
  box(g, 2000, 0.03, 0.2, 0, -0.01, -2.3, "#8d8577");
  box(g, 2000, 0.03, 0.2, 0, -0.01, 5.5, "#8d8577");
  const moving = new THREE.Group();
  g.add(moving);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // centre-line dashes
  for (let x = -SPAN / 2; x < SPAN / 2; x += 6) box(moving, 3, 0.03, 0.15, x, 0, 1.6, "#e8e2cf");
  // crops in strips: young jowar, cotton, bare ploughed soil
  const crop = ["#4f6b2e", "#6b7a3a", "#4a3a2c", "#5d7d33"];
  for (let x = -SPAN / 2; x < SPAN / 2; x += 18)
    for (const s of [-1, 1]) box(moving, 16, 0.05, 40, x, 0, s * (30 + rnd() * 6), mat(crop[Math.floor(rnd() * crop.length)], { rough: 1 }));
  // trees, both sides
  const trunk = mat("#4a3828");
  const leaf = [mat("#2f4a26"), mat("#3c5a2c"), mat("#2a3f22")];
  for (let i = 0; i < 70; i++) {
    const t = new THREE.Group();
    cyl(t, 0.18, 2.4 + rnd() * 1.5, 0, 0, 0, trunk, 6);
    const c = new THREE.Mesh(new THREE.SphereGeometry(1.6 + rnd() * 1.4, 8, 6), leaf[i % 3]);
    c.scale.y = 0.7;
    c.position.y = 3.4 + rnd();
    t.add(c);
    const s = rnd() < 0.5 ? -1 : 1;
    t.position.set(-SPAN / 2 + rnd() * SPAN, 0, s < 0 ? -6 - rnd() * 22 : 9 + rnd() * 24);
    moving.add(t);
  }
  // electricity poles along the right
  for (let x = -SPAN / 2; x < SPAN / 2; x += 32) {
    cyl(moving, 0.1, 8, x, 0, 8, "#7d7a74", 6);
    box(moving, 0.1, 0.1, 1.6, x, 7.6, 8, "#5a5752");
  }
  // a dhaba every so often: a tin shed, a string of bulbs, a charpai
  const dhabas: THREE.Group[] = [];
  for (const x of [-60, 110]) {
    const d = new THREE.Group();
    box(d, 8, 2.6, 5, 0, 0, 0, mat("#8a7a68"));
    box(d, 9, 0.12, 6.5, 0, 2.7, 0.6, mat("#9aa0a6", { metal: 0.5, rough: 0.5 }));
    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), mat("#ffcf7a", { glow: 5 }));
      b.position.set(-4 + i * 1.1, 2.55, -2.7);
      d.add(b);
    }
    const l = new THREE.PointLight("#ffb860", 0, 18, 1.6);
    l.position.set(0, 2.2, -3.5);
    d.add(l);
    d.userData.light = l;
    const sg = sign(["हॉटेल सह्याद्री", "शुद्ध शाकाहारी"], { w: 4, h: 0.9, bg: "#f2e1b0", fg: "#9a1d1d", lit: true });
    sg.position.set(0, 2.95, -2.6);
    sg.rotation.y = Math.PI;
    d.add(sg);
    d.position.set(x, 0, -14);
    moving.add(d);
    dhabas.push(d);
  }
  // low hills on the horizon
  for (let i = 0; i < 14; i++) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(40 + rnd() * 50, 18 + rnd() * 20, 7), mat("#2c2a33", { rough: 1 }));
    h.position.set(-500 + i * 80, 0, -200 - rnd() * 60);
    g.add(h);
  }
  let travelled = 0;
  return {
    group: g,
    /** Stream the land past at `speed` m/s; `night` lights the dhabas. */
    update(dt: number, speed: number, night: number) {
      travelled += speed * dt;
      for (const c of moving.children) {
        c.position.x -= speed * dt;
        if (c.position.x < -SPAN / 2) c.position.x += SPAN;
      }
      for (const d of dhabas) (d.userData.light as THREE.PointLight).intensity = night * 40;
      return travelled;
    },
  };
}

/** Ukhali phata: where the village road leaves the highway, with its milestone and signboard. */
export function buildPhata() {
  const g = new THREE.Group();
  box(g, 6, 0.03, 40, 0, -0.005, -22, mat("#6b5444", { rough: 1 })); // the kachcha road into the fields
  const board = sign(["उखळी तांडा ←", "Ukhali Tanda · 2 km"], { w: 2.4, h: 0.9, bg: "#1f5fa8", fg: "#ffffff" });
  board.position.set(3.4, 2.1, -3.2);
  g.add(board);
  for (const s of [-1, 1]) cyl(g, 0.05, 2.6, 3.4 + s * 1.0, 0, -3.25, "#9a9a9a", 6);
  const stone = new THREE.Group();
  box(stone, 0.5, 0.6, 0.18, 0, 0, 0, "#f4f1e8");
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 16), mat("#e8a33a"));
  top.rotation.x = Math.PI / 2; // a disc half sunk into the stone: the milestone's rounded orange top
  top.position.y = 0.6;
  stone.add(top);
  const km = sign(["जालना", "18"], { w: 0.44, h: 0.38, bg: "#f4f1e8", fg: "#222222" });
  km.position.set(0, 0.32, 0.095);
  stone.add(km);
  stone.position.set(-2.5, 0, -3);
  g.add(stone);
  // a tea tapri, still shut at dawn
  box(g, 2.2, 2.2, 1.6, 7.5, 0, -5, mat("#5f7f8a"));
  box(g, 2.6, 0.08, 2.2, 7.5, 2.2, -4.8, mat("#8d9196", { metal: 0.5 }));
  return g;
}
