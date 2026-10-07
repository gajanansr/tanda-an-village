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
const reliefs = new Map<THREE.Texture, { normalMap: THREE.Texture; roughnessMap: THREE.Texture }>();

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

const blotch = (g: CanvasRenderingContext2D, s: number, r: () => number, n: number, color: string, min: number, max: number) => {
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, rad = min + r() * (max - min);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, color);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
};

export const TEX = {
  plaster: () =>
    make("plaster", 512, (g, s, r) => {
      g.fillStyle = "#efe7d6";
      g.fillRect(0, 0, s, s);
      // lime plaster: fine sandy grain at two sizes (tiles seamlessly), no big blobs
      const img = g.getImageData(0, 0, s, s), d = img.data;
      const cell = (n: number) => { const v = new Float32Array(n * n); for (let i = 0; i < v.length; i++) v[i] = r(); return v; };
      const coarse = cell(64), fine = cell(s);
      const smooth = (v: Float32Array, n: number, x: number, y: number) => {
        const fx = (x / s) * n, fy = (y / s) * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const at = (i: number, j: number) => v[((j + n) % n) * n + ((i + n) % n)];
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        return a + (b - a) * ty;
      };
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          const k = 1 + (smooth(coarse, 64, x, y) - 0.5) * 0.07 + (fine[y * s + x] - 0.5) * 0.06, i = (y * s + x) * 4;
          d[i] *= k; d[i + 1] *= k; d[i + 2] *= k * 0.99;
        }
      g.putImageData(img, 0, 0);
      // faint trowel sweeps
      for (let i = 0; i < 70; i++) {
        const x = r() * s, y = r() * s, rad = 30 + r() * 70, a0 = r() * Math.PI * 2;
        g.strokeStyle = r() < 0.5 ? "rgba(255,253,246,0.18)" : "rgba(196,180,150,0.12)";
        g.lineWidth = 2 + r() * 5;
        g.beginPath();
        g.arc(x, y, rad, a0, a0 + 0.5 + r() * 0.8);
        g.stroke();
      }
      // a rain-stained band at the foot of the wall (the texture's bottom)
      const grd = g.createLinearGradient(0, s * 0.72, 0, s);
      grd.addColorStop(0, "rgba(150,120,90,0)");
      grd.addColorStop(1, "rgba(170,130,90,0.28)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }, [1, 1], 1.6),
  brick: () =>
    make("brick", 256, (g, s, r) => {
      g.fillStyle = "#cdbca2";
      g.fillRect(0, 0, s, s);
      const bh = s / 8, bw = s / 4;
      for (let row = 0; row < 8; row++)
        for (let col = -1; col < 5; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0);
          const shade = 0.85 + r() * 0.3;
          g.fillStyle = `rgb(${Math.floor(170 * shade)},${Math.floor(82 * shade)},${Math.floor(56 * shade)})`;
          g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
        }
      blotch(g, s, r, 30, "rgba(80,40,20,0.18)", 8, 30);
    }, [1, 1], -4),
  tiles: () =>
    make("tiles", 256, (g, s, r) => {
      g.fillStyle = "#9c4a30";
      g.fillRect(0, 0, s, s);
      const rows = 8, cols = 6;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const x = col * (s / cols) + (row % 2 ? s / cols / 2 : 0), y = row * (s / rows);
          const grd = g.createLinearGradient(x, 0, x + s / cols, 0);
          const k = 0.85 + r() * 0.3;
          grd.addColorStop(0, `rgb(${120 * k},${50 * k},${32 * k})`);
          grd.addColorStop(0.5, `rgb(${196 * k},${96 * k},${62 * k})`);
          grd.addColorStop(1, `rgb(${120 * k},${50 * k},${32 * k})`);
          g.fillStyle = grd;
          g.beginPath();
          g.roundRect(x + 1, y + 1, s / cols - 2, s / rows + 4, 6);
          g.fill();
        }
      blotch(g, s, r, 25, "rgba(60,50,40,0.2)", 10, 40); // weathering
    }, [1, 1], 3),
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
  wood: () =>
    make("wood", 256, (g, s, r) => {
      g.fillStyle = "#7a5a3c";
      g.fillRect(0, 0, s, s);
      // weathered timber: many fine, faint, wavy grain lines (bold ones read as stripes under a lamp)
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = `rgba(${r() < 0.55 ? "52,36,22" : "150,118,84"},${0.05 + r() * 0.12})`;
        g.lineWidth = 0.6 + r() * 1.4;
        const y = r() * s, w = (r() - 0.5) * 6;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.33, y + w, s * 0.66, y - w, s, y);
        g.stroke();
      }
      // a couple of knots with the grain bending round them
      for (let k = 0; k < 2; k++) {
        const x = r() * s, y = r() * s;
        for (let j = 0; j < 5; j++) {
          g.strokeStyle = `rgba(50,32,18,${0.25 - j * 0.04})`;
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(x, y, 3 + j * 3, 1.5 + j * 1.6, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }, [1, 1], 1),
  stone: () =>
    make("stone", 256, (g, s, r) => {
      g.fillStyle = "#8e877b";
      g.fillRect(0, 0, s, s);
      const rows = 5;
      for (let row = 0; row < rows; row++) {
        let x = -r() * 40;
        while (x < s) {
          const w = 40 + r() * 50;
          const k = 0.8 + r() * 0.35;
          g.fillStyle = `rgb(${150 * k},${143 * k},${130 * k})`;
          g.beginPath();
          g.roundRect(x + 2, row * (s / rows) + 2, w - 4, s / rows - 4, 8);
          g.fill();
          x += w;
        }
      }
      blotch(g, s, r, 20, "rgba(60,70,40,0.2)", 8, 30); // a little moss
    }, [1, 1], 3.5),
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
      g.fillStyle = "rgba(0,0,0,0.08)";
      for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1);
    }),
};

export function mat(map: THREE.Texture, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...reliefs.get(map), ...opts });
}
