import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { PHOTO } from "../quality";

/*
 * Realistic people: rigged, photo-textured avatars from Microsoft Rocketbox (MIT licence; see
 * public/people/CREDITS.md), converted to GLB with idle, walk and run clips. Each figure gets its
 * own skinned copy and animation mixer. Only with photo-realistic graphics (Settings); otherwise
 * the modelled figures.
 */
export type Kind = "villager_m" | "villager_f" | "hero";
type Model = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };

export const REALISTIC = PHOTO;

const loading = new Map<Kind, Promise<Model>>();
const loader = new GLTFLoader();
export function loadPerson(kind: Kind): Promise<Model> {
  if (!loading.has(kind))
    loading.set(kind, loader.loadAsync(`${import.meta.env.BASE_URL}people/${kind}.glb`).then((g) => {
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.SkinnedMesh;
          m.castShadow = m.receiveShadow = true;
          m.frustumCulled = false; // skinned bounds don't follow the animation
        }
      });
      return { scene: g.scene, clips: g.animations };
    }));
  return loading.get(kind)!;
}

/** How skin-like a linear colour is (0..1), and the remap. */
const SKIN_GLSL = /* glsl */ `
float skinness(vec3 c){
  float r = c.r + 1e-4, gr = c.g / r, bg = c.b / (c.g + 1e-4);
  return smoothstep(0.12, 0.2, gr) * (1.0 - smoothstep(0.55, 0.7, gr)) * (1.0 - smoothstep(0.85, 1.0, bg)) * smoothstep(0.003, 0.008, c.r);
}
vec3 reskin(vec3 c, vec3 target, float avg){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, target * clamp(l / avg, 0.35, 1.6), skinness(c));
}`;
/** The average luminance of a texture's skin-like pixels (linear), read once from a small copy. */
const avgCache = new WeakMap<THREE.Texture, number>();
function skinAverage(t: THREE.Texture) {
  if (avgCache.has(t)) return avgCache.get(t)!;
  const img = t.image as CanvasImageSource & { width: number; height: number };
  let avg = 0.03;
  try {
    const n = 64, cv = document.createElement("canvas");
    cv.width = cv.height = n;
    const g = cv.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    const lin = (v: number) => Math.pow(v / 255, 2.2);
    let sum = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = lin(d[i]) + 1e-4, gg = lin(d[i + 1]), b = lin(d[i + 2]);
      const gr = gg / r, bg = b / (gg + 1e-4);
      if (gr > 0.15 && gr < 0.6 && bg < 0.9 && r > 0.006) { sum += 0.2126 * r + 0.7152 * gg + 0.0722 * b; w++; }
    }
    if (w > 20) avg = sum / w;
  } catch { /* keep the default */ }
  avgCache.set(t, avg);
  return avg;
}

const M = new THREE.Matrix4(), M2 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();

/** One person's model and its animations, blended from the walk speed. */
export class Person {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private run: THREE.AnimationAction;
  private body: THREE.Object3D;
  /** Bones by name, and where each one is in the standing pose (in this person's own frame). */
  private bones = new Map<string, THREE.Object3D>();
  private rest = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>();

  constructor(m: Model) {
    const body = (this.body = clone(m.scene));
    body.scale.setScalar(0.01 * (0.93 + Math.random() * 0.1)); // centimetres to metres, and not everyone the same height
    this.root.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    const clip = (n: string) => this.mixer.clipAction(m.clips.find((c) => c.name === n)!);
    [this.idle, this.walk, this.run] = [clip("idle"), clip("walk"), clip("run")];
    for (const a of [this.idle, this.walk, this.run]) a.play();
    this.idle.time = Math.random() * 10; // so nobody idles in step
    this.walk.time = Math.random();
    this.root.updateMatrixWorld(true);
    body.traverse((o) => {
      if (!o.name.startsWith("Bip01")) return;
      this.bones.set(o.name, o);
      this.rest.set(o.name, { p: o.getWorldPosition(new THREE.Vector3()), q: o.getWorldQuaternion(new THREE.Quaternion()) });
    });
  }

  /** Where a bone sits in the standing pose. */
  restPos(bone: string) {
    return this.rest.get(bone)!.p.clone();
  }

  /**
   * Hang something on a bone: `at` is where it goes in the standing pose (metres, in this person's frame:
   * y up from the feet, +z forward). It then follows the bone, turning with it.
   */
  attach(bone: string, obj: THREE.Object3D, at: THREE.Vector3) {
    const b = this.bones.get(bone);
    if (!b) return;
    // parent it to the bone itself (so it costs nothing per frame), placed where `at` is in the
    // standing pose, its orientation and size kept as given
    this.root.updateMatrixWorld(true);
    const inv = M.copy(b.matrixWorld).invert();
    M2.compose(at.clone().applyMatrix4(this.root.matrixWorld), obj.quaternion.clone().premultiply(this.root.getWorldQuaternion(Q)), obj.scale.clone().multiply(this.root.getWorldScale(S)));
    M2.premultiply(inv).decompose(obj.position, obj.quaternion, obj.scale);
    b.add(obj);
  }

  /**
   * Re-shade skin to a complexion (a linear-space colour): pixels that look like skin (warm, moderately
   * saturated) take the target colour, keeping their own light and shade relative to the texture's
   * average skin; eyes, hair, lips' edges and clothes are left as they are.
   */
  skin(part: RegExp, target: THREE.Color) {
    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = list.map((m) => {
        const sm = m as THREE.MeshStandardMaterial;
        if (!part.test(m.name) || !sm.map) return m;
        const c = sm.clone();
        const uSkin = { value: target.clone() }, uAvg = { value: skinAverage(sm.map) };
        c.onBeforeCompile = (sh) => {
          sh.uniforms.uSkin = uSkin;
          sh.uniforms.uSkinAvg = uAvg;
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform vec3 uSkin; uniform float uSkinAvg;\n" + SKIN_GLSL)
            .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = reskin(diffuseColor.rgb, uSkin, uSkinAvg);");
        };
        c.customProgramCacheKey = () => "reskin";
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
  }

  /** Multiply a material's colour (dye the cloth, or warm the skin); each person gets their own copy. */
  tint(part: RegExp, color: THREE.Color) {
    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const out = list.map((m) => (part.test(m.name) ? Object.assign(m.clone(), { color: (m as THREE.MeshStandardMaterial).color.clone().multiply(color) }) : m));
      mesh.material = Array.isArray(mesh.material) ? out : out[0];
    });
  }

  /** A held pose the clips don't have: sitting (on a chair or a bus seat), or sitting at a keyboard. */
  pose: "none" | "sit" | "type" = "none";

  /** speed in m/s: idle below a stroll, walk, then run; the steps keep pace with the ground. `bank` tilts the body into a turn. */
  update(dt: number, speed: number, bank = 0) {
    this.root.rotation.z = bank;
    if (this.pose !== "none") speed = 0;
    const ramp = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    const moving = ramp(0.1, 0.6, speed), running = ramp(2.6, 4.5, speed);
    this.idle.setEffectiveWeight(1 - moving);
    this.walk.setEffectiveWeight(moving * (1 - running));
    this.run.setEffectiveWeight(moving * running);
    this.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.35, 0.55, 2.2)); // the clip walks at ~1.35 m/s
    this.run.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 3.6, 0.7, 1.6));
    this.mixer.update(dt);
    this.root.position.y = 0;
    if (this.pose !== "none") this.sitPose(this.pose === "type");
  }

  /**
   * Sit, on top of the idle clip: thighs forward, shins down, the body lowered until the feet meet the
   * floor (so the seat is at knee height); at a keyboard the forearms reach forward too. Each bone is
   * turned about the body's own left–right axis, whatever its rest orientation.
   */
  private sitPose(typing: boolean) {
    const bone = (n: string) => this.bones.get(`Bip01_${n}`);
    this.root.updateMatrixWorld(true);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(Q));
    const turn = (b: THREE.Object3D | undefined, angle: number) => {
      if (!b?.parent) return;
      const pw = b.parent.getWorldQuaternion(new THREE.Quaternion());
      const r = new THREE.Quaternion().setFromAxisAngle(side, angle);
      b.quaternion.premultiply(pw.clone().invert().multiply(r).multiply(pw));
      b.updateMatrixWorld(true);
    };
    for (const s of ["L", "R"]) {
      turn(bone(`${s}_Thigh`), -Math.PI / 2 + 0.08);
      turn(bone(`${s}_Calf`), Math.PI / 2 - 0.05);
      turn(bone(`${s}_UpperArm`), typing ? -0.95 : -0.35);
      turn(bone(`${s}_Forearm`), typing ? -0.75 : -0.95);
    }
    if (typing) turn(bone("Head"), 0.18); // eyes on the screen
    // lower the body: the thighs are now level at hip height, so the feet hang a shin's length below it
    const hip = this.rest.get("Bip01_L_Thigh")?.p.y ?? 0.9, knee = this.rest.get("Bip01_L_Calf")?.p.y ?? 0.5;
    this.root.position.y = -(hip - knee) + 0.02;
  }

  setShadow(on: boolean) {
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = on; });
  }
}
