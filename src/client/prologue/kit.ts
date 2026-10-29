import * as THREE from "three";

/*
 * Small building blocks for the prologue's sets (the Pune office, Swargate ST stand and the night
 * highway). They're built from plain boxes and painted signs, like the village, and carry no shadows:
 * a soft dark disc under each person keeps them on the ground for a fraction of the cost.
 */
const mats = new Map<string, THREE.Material>();
export function mat(color: string, o: { rough?: number; metal?: number; glow?: number; glowColor?: string; opacity?: number } = {}) {
  const k = `${color}|${o.rough ?? 0.85}|${o.metal ?? 0}|${o.glow ?? 0}|${o.glowColor ?? ""}|${o.opacity ?? 1}`;
  if (!mats.has(k))
    mats.set(k, new THREE.MeshStandardMaterial({
      color, roughness: o.rough ?? 0.85, metalness: o.metal ?? 0,
      emissive: o.glow ? (o.glowColor ?? color) : "#000000", emissiveIntensity: o.glow ?? 0,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, depthWrite: (o.opacity ?? 1) >= 1,
    }));
  return mats.get(k)!;
}

/** A box whose bottom-centre sits at (x, y, z). */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material | string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof m === "string" ? mat(m) : m);
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}

export function cyl(parent: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, m: THREE.Material | string, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), typeof m === "string" ? mat(m) : m);
  mesh.position.set(x, y + h / 2, z);
  parent.add(mesh);
  return mesh;
}

/** A painted board: lines of text (Devanagari is fine) on a coloured ground. It glows a little if `lit`. */
export function sign(lines: string[], o: { w: number; h: number; bg: string; fg: string; lit?: boolean; px?: number }) {
  const c = document.createElement("canvas");
  const scale = 128;
  c.width = Math.round(o.w * scale);
  c.height = Math.round(o.h * scale);
  const g = c.getContext("2d")!;
  g.fillStyle = o.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = o.fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const px = o.px ?? Math.min(c.height / (lines.length + 0.6), 90);
  lines.forEach((l, i) => {
    const size = i === 0 ? px : px * 0.7;
    g.font = `700 ${size}px "Noto Sans Devanagari", "Mukta", system-ui, sans-serif`;
    const y = (c.height * (i + 0.5)) / lines.length;
    g.fillText(l, c.width / 2, y, c.width * 0.94);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = o.lit ? new THREE.MeshBasicMaterial({ map: t, toneMapped: true }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
  return new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), m);
}

/** A texture painted with a 2D canvas callback. */
export function painted(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let blobTex: THREE.Texture | null = null;
/** A soft contact shadow to sit under a person or a vehicle. */
export function blob(w: number, d = w) {
  blobTex ??= painted(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    r.addColorStop(0, "rgba(0,0,0,0.55)");
    r.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

/** A sky dome: a vertical gradient from `horizon` to `top`, with optional stars that fade by `stars`. */
export class Dome {
  readonly mesh: THREE.Mesh;
  private u = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color("#0b0a0c") }, uStars: { value: 0 } };
  constructor(radius = 400) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, uniforms: this.u,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uTop, uHorizon, uGround; uniform float uStars; varying vec3 vDir;
          float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
          void main(){
            float y = vDir.y;
            vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y,0.0,1.0), 0.55)) : mix(uHorizon, uGround, clamp(-y*6.0,0.0,1.0));
            vec3 cell = floor(vDir * 260.0);
            float s = step(0.9965, h(cell)) * smoothstep(0.05, 0.3, y) * uStars;
            c += vec3(s);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.mesh.frustumCulled = false;
  }
  set(top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation, stars: number) {
    this.u.uTop.value.set(top);
    this.u.uHorizon.value.set(horizon);
    this.u.uStars.value = stars;
  }
}

export const ease = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
