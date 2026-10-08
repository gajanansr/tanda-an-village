import * as THREE from "three";
import { mulberry32 } from "../../shared/rng";

/*
 * Painted surface textures, drawn once on canvases: lime plaster, handmade brick, Mangalore roof
 * tiles, straw thatch, weathered wood, dressed stone and striped cloth. Soft and slightly uneven,
 * like the rest of the world — no pixel art.
 * Each painting also gives its surface relief: a normal map and a roughness map worked out from its
 * brightness (light = raised, or the other way for mortar), so brick joints sink, tile ridges catch
 * the sun and plaster shows its trowel marks. `mat` picks them up for every material built on one.
 */
type Painter = (g: CanvasRenderingContext2D, s: number, r: () => number) => void;
const cache = new Map<string, THREE.Texture>();
const reliefs = new Map<THREE.Texture, { normalMap: THREE.Texture; roughnessMap?: THREE.Texture }>();

/**
 * Normal and roughness maps from a painted canvas. `bump` is the depth (negative: dark parts are
 * raised, as with mortar painted lighter than its bricks). Hollows are rougher than worn high spots.
 */
function relief(c: HTMLCanvasElement, bump: number, like: THREE.Texture) {
  const s = c.width, src = c.getContext("2d")!.getImageData(0, 0, s, s).data;
  const h = new Float32Array(s * s);
  for (let i = 0; i < s * s; i++) h[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  const at = (x: number, y: number) => h[((y + s) % s) * s + ((x + s) % s)]; // wraps, so the maps tile
  const out = (paint: (x: number, y: number, d: Uint8ClampedArray, i: number) => void) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d")!, img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) paint(x, y, img.data, (y * s + x) * 4);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.copy(like.repeat);
    t.anisotropy = like.anisotropy;
    return t;
  };
  const normalMap = out((x, y, d, i) => {
    // Sobel slopes, scaled by the depth
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * bump;
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * bump;
    const l = Math.hypot(dx, dy, 1);
    d[i] = (-dx / l * 0.5 + 0.5) * 255;
    d[i + 1] = (dy / l * 0.5 + 0.5) * 255; // canvas y runs down, texture v runs up
    d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  });
  const roughnessMap = out((x, y, d, i) => {
    const up = bump < 0 ? 1 - at(x, y) : at(x, y);
    d[i] = d[i + 1] = d[i + 2] = (1 - up * 0.3) * 255; // multiplies the material's roughness: 0.7–1×
    d[i + 3] = 255;
  });
  return { normalMap, roughnessMap };
}

function make(name: string, size: number, paint: Painter, repeat: [number, number] = [1, 1], bump = 0) {
  const key = name + repeat.join("x");
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  paint(g, size, mulberry32(name.length * 7919 + size));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (bump) reliefs.set(t, relief(c, bump, t));
  cache.set(key, t);
  return t;
}

/**
 * A photo-scanned material from public/textures (CC0, Poly Haven; see CREDITS.md): its colour map,
 * with its normal map registered so `mat` picks it up. `repeat` is how many times it tiles per uv unit.
 */
const loader = new THREE.TextureLoader();
function photo(name: string, repeat = 1) {
  const key = "photo:" + name + repeat;
  if (cache.has(key)) return cache.get(key)!;
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(`${import.meta.env.BASE_URL}textures/${file}`);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    return t;
  };
  const t = load(`${name}.jpg`, true);
  reliefs.set(t, { normalMap: load(`${name}_n.jpg`, false) });
  cache.set(key, t);
  return t;
}


export const TEX = {
  plaster: () => photo("white_stucco_02", 1),
  brick: () => photo("red_brick_03", 1.5),
  tiles: () => photo("clay_roof_tiles_02", 1),
  thatch: () =>
    make("thatch", 256, (g, s, r) => {
      g.fillStyle = "#b8944f";
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        const x = r() * s, y = r() * s, l = 10 + r() * 26;
        g.strokeStyle = r() < 0.5 ? `rgba(90,66,30,${0.3 + r() * 0.3})` : `rgba(230,200,130,${0.3 + r() * 0.4})`;
        g.lineWidth = 1 + r();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 4, y + l);
        g.stroke();
      }
    }, [1, 1], 2.5),
  wood: () => photo("brown_planks_05", 1),
  stone: () => photo("castle_wall_varriation", 1),
  /** Banjara embroidery: bold colour bands, zigzag stitching and small round mirrors. */
  mirrorWork: () =>
    make("mirrorwork", 256, (g, s) => {
      const bands = ["#c8292e", "#1b1b1b", "#e8b830", "#1f7a45", "#1f4fa0", "#e8662a"];
      for (let i = 0; i < 8; i++) {
        g.fillStyle = bands[i % 6];
        g.fillRect(0, i * 32, s, 32);
        g.strokeStyle = bands[(i + 2) % 6];
        g.lineWidth = 3;
        g.beginPath();
        for (let x = 0; x <= s; x += 12) g.lineTo(x, i * 32 + (x % 24 ? 6 : 26));
        g.stroke();
        for (let x = 16; x < s; x += 32) {
          g.fillStyle = "#f2d060";
          g.beginPath();
          g.arc(x, i * 32 + 16, 7, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#eef4f8";
          g.beginPath();
          g.arc(x, i * 32 + 16, 4.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }),
  cloth: (color: string, stripe: string) =>
    make("cloth" + color, 128, (g, s) => {
      g.fillStyle = color;
      g.fillRect(0, 0, s, s);
      g.fillStyle = stripe;
      for (let x = 0; x < s; x += s / 4) g.fillRect(x, 0, s / 10, s);
      // the weave, and sun-fading and grime toward one edge (awnings bleach where the sun hits)
      for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(0,0,0,${y % 4 ? 0.05 : 0.11})`; g.fillRect(0, y, s, 1); }
      for (let x = 0; x < s; x += 2) { g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(x, 0, 1, s); }
      const fade = g.createLinearGradient(0, 0, 0, s);
      fade.addColorStop(0, "rgba(255,250,235,0.16)");
      fade.addColorStop(1, "rgba(60,40,20,0.12)");
      g.fillStyle = fade;
      g.fillRect(0, 0, s, s);
    }, [1, 1], 0.8),
  /** Corrugated galvanised tin: ridges, a dull zinc sheen, rust bleeding from the nail lines. */
  tin: () => photo("corrugated_iron_02", 1),
};

export function mat(map: THREE.Texture, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...reliefs.get(map), ...opts });
}
