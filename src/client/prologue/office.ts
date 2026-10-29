import * as THREE from "three";
import { FARMER, Figure, type Look } from "../scene/figure";
import { blob, box, cyl, mat, painted } from "./kit";

/*
 * Act 1: an IT floor in Hinjewadi, Pune, a little after six on a Monday evening. Rows of desks under
 * panel lights, the sunset behind glass, most of the floor gone home. The hero's desk is at the
 * origin, facing −z (toward the windows); its chair is at z = +0.78.
 */
// office people in shirts: a different body from the hero's (his is the only one with the gamcha and the bag)
export const HR_LOOK: Look = { kurta: "#e9eef5", dhoti: "#3b3f4a", hat: "#111111", hatStyle: "none", skin: "#c08a64", body: "villager_m" };
const COLLEAGUES: Look[] = [
  { kurta: "#3d5a80", dhoti: "#2a2a30", hat: "#111", hatStyle: "none", skin: "#a36f4c", body: "villager_m" },
  { kurta: "#8d6a9f", dhoti: "#2f2f38", hat: "#111", hatStyle: "none", skin: "#b98060", body: "villager_m" },
  { kurta: "#5f7f5a", dhoti: "#30303a", hat: "#111", hatStyle: "none", skin: "#8e5b3c", body: "villager_m" },
];

/** The city through the glass at dusk: towers against an orange sky, their windows coming on. */
function skyline() {
  return painted(2048, 320, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#3b3f6b");
    sky.addColorStop(0.45, "#c4697a");
    sky.addColorStop(0.8, "#f4a35a");
    sky.addColorStop(1, "#f7c47a");
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let layer = 0; layer < 2; layer++) {
      let x = -20;
      while (x < w) {
        const bw = 40 + rnd() * 110, bh = (layer ? 90 : 50) + rnd() * (layer ? 170 : 110);
        g.fillStyle = layer ? "#1c1d2c" : "#3a3550";
        g.fillRect(x, h - bh, bw, bh);
        if (layer)
          for (let wy = h - bh + 8; wy < h - 6; wy += 11)
            for (let wx = x + 5; wx < x + bw - 6; wx += 9) if (rnd() < 0.35) { g.fillStyle = rnd() < 0.7 ? "#ffd58a" : "#cfe6ff"; g.fillRect(wx, wy, 5, 6); }
        x += bw + rnd() * 18;
      }
    }
  });
}

/** The hero's screen: an editor full of code and a green build. */
function codeScreen() {
  return painted(512, 320, (g, w, h) => {
    g.fillStyle = "#1e2230";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#2b3145";
    g.fillRect(0, 0, w, 22);
    g.fillStyle = "#9fb3d1";
    g.font = "13px monospace";
    g.fillText("sprint-42 · payments-service", 10, 15);
    const cols = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", "#eeffff"];
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 40; y < h - 34; y += 15) {
      let x = 14 + Math.floor(rnd() * 4) * 18;
      const n = 2 + Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const len = 20 + rnd() * 70;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        g.fillRect(x, y, len, 6);
        x += len + 8;
      }
    }
    g.fillStyle = "#1f6f43";
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = "#d7ffe4";
    g.font = "bold 14px monospace";
    g.fillText("✓ build passing · 3 tickets left", 10, h - 9);
  });
}

function desk(g: THREE.Group, x: number, z: number, screen?: THREE.Texture) {
  box(g, 1.6, 0.05, 0.8, x, 0.72, z, mat("#d9d4c7", { rough: 0.6 }));
  for (const sx of [-0.75, 0.75]) box(g, 0.05, 0.72, 0.7, x + sx, 0, z, "#8a8f98");
  box(g, 1.7, 1.15, 0.05, x, 0, z - 0.43, "#5d6b7a"); // the partition behind the monitor
  box(g, 0.1, 0.18, 0.1, x, 0.77, z - 0.22, "#2a2c30");
  const glow = screen
    ? new THREE.MeshBasicMaterial({ map: screen })
    : mat(Math.random() < 0.5 ? "#2a4d7a" : "#1d2333", { glow: 0.9, glowColor: Math.random() < 0.5 ? "#3c6ea8" : "#20283a" });
  box(g, 0.66, 0.4, 0.04, x, 0.92, z - 0.24, "#16171a");
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), glow);
  s.position.set(x, 1.12, z - 0.215);
  g.add(s);
  box(g, 0.45, 0.02, 0.15, x, 0.775, z + 0.05, "#2b2d33"); // keyboard
  // the chair
  box(g, 0.5, 0.08, 0.5, x, 0.44, z + 0.78, "#26282e");
  box(g, 0.5, 0.6, 0.06, x, 0.52, z + 1.05, "#26282e");
  cyl(g, 0.03, 0.44, x, 0, z + 0.78, "#55585e");
  return s;
}

export function buildOffice() {
  const g = new THREE.Group();
  // the floor, ceiling and walls
  box(g, 26, 0.1, 20, 0, -0.1, 0, mat("#5b6470", { rough: 0.95 }));
  box(g, 26, 0.1, 20, 0, 3.2, 0, "#cfd2d6");
  for (let x = -10.5; x <= 10.5; x += 3.5)
    for (let z = -7; z <= 7; z += 3.5) box(g, 1.2, 0.03, 0.6, x, 3.17, z, mat("#ffffff", { glow: 1.6 }));
  box(g, 0.2, 3.3, 20, -13, 0, 0, "#e6e1d6");
  box(g, 0.2, 3.3, 20, 13, 0, 0, "#e6e1d6");
  box(g, 26, 3.3, 0.2, 0, 0, 10, "#e6e1d6");
  // the glass wall, the city beyond it, and the mullions
  const city = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), new THREE.MeshBasicMaterial({ map: skyline() }));
  city.position.set(0, 1.6, -10.05);
  g.add(city);
  for (let x = -13; x <= 13; x += 2.6) box(g, 0.08, 3.2, 0.08, x, 0, -9.95, "#2b2f36");
  box(g, 26, 0.1, 0.1, 0, 0.9, -9.95, "#2b2f36");
  // a whiteboard, a plant, the pantry counter
  box(g, 2.4, 1.2, 0.04, -12.85, 1.0, 3, "#f7f7f2").rotation.y = Math.PI / 2;
  cyl(g, 0.25, 0.45, 11.6, 0, -8.6, "#7a5a40");
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), mat("#3f7a3a"));
  leaves.position.set(11.6, 0.95, -8.6);
  g.add(leaves);
  box(g, 3, 0.95, 0.7, 10.5, 0, 8.9, "#b3a58c");

  let heroScreen: THREE.Mesh | null = null;
  const seats: { x: number; z: number }[] = [];
  for (const z of [-5, 0, 5])
    for (const x of [-9, -6, -3, 0, 3, 6, 9]) {
      const s = desk(g, x, z, x === 0 && z === 0 ? codeScreen() : undefined);
      if (x === 0 && z === 0) heroScreen = s;
      else seats.push({ x, z });
    }
  // things on the hero's desk: a mug, a framed photo of Aai and Dada, a little plant
  cyl(g, 0.045, 0.1, 0.55, 0.745, 0.1, "#c0392b");
  box(g, 0.14, 0.18, 0.02, -0.55, 0.745, -0.05, "#6b4a2b").rotation.y = 0.3;
  cyl(g, 0.06, 0.08, -0.35, 0.745, 0.15, "#8a5a3a");
  const sprig = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat("#4c8a3c"));
  sprig.position.set(-0.35, 0.88, 0.15);
  g.add(sprig);
  const phone = box(g, 0.08, 0.012, 0.15, 0.32, 0.745, 0.18, mat("#111214", { rough: 0.3 }));
  // the cardboard box, which arrives once the news has
  const carton = new THREE.Group();
  box(carton, 0.5, 0.32, 0.38, 0, 0, 0, mat("#b8895a", { rough: 1 }));
  for (const s of [-1, 1]) {
    const flap = box(carton, 0.5, 0.01, 0.19, 0, 0.32, s * 0.1, mat("#a87a4c", { rough: 1 }));
    flap.rotation.x = s * 0.9;
    flap.position.z = s * 0.22;
  }
  carton.position.set(-0.45, 0.745, 0.05);
  carton.visible = false;
  g.add(carton);

  // light: the panels overhead, and the low sun through the glass
  g.add(new THREE.HemisphereLight("#eef3ff", "#5a5048", 1.5));
  const sun = new THREE.DirectionalLight("#ffb874", 1.6);
  sun.position.set(-4, 3, -14);
  g.add(sun, sun.target);

  // people: the hero at his desk, three colleagues still at work, and HR on the way
  const hero = new Figure(FARMER);
  hero.action = "type";
  hero.root.position.set(0, 0, 0.82);
  hero.root.rotation.y = Math.PI;
  g.add(hero.root);
  const colleagues = [[-6, 0], [6, -5], [-3, 5]].map(([x, z], i) => {
    const f = new Figure(COLLEAGUES[i]);
    f.action = "type";
    f.root.position.set(x, 0, z + 0.82);
    f.root.rotation.y = Math.PI;
    g.add(f.root);
    return f;
  });
  const hr = new Figure(HR_LOOK);
  hr.root.position.set(9.5, 0, 7.5);
  g.add(hr.root);
  const shadow = blob(0.9);
  hr.root.add(shadow);

  return { group: g, hero, hr, colleagues, carton, phone, heroScreen: heroScreen! };
}
export type Office = ReturnType<typeof buildOffice>;
