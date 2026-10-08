import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

/*
 * Realistic people: rigged, photo-textured avatars from Microsoft Rocketbox (MIT licence; see
 * public/people/CREDITS.md), converted to GLB with idle, walk and run clips. Each figure gets its
 * own skinned copy and animation mixer. Set localStorage "tanda.people" to "classic" to go back to
 * the modelled figures.
 */
export type Kind = "villager_m" | "villager_f" | "hero";
type Model = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };

export const REALISTIC = (() => {
  try {
    return localStorage.getItem("tanda.people") !== "classic";
  } catch {
    return true;
  }
})();

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

/** One person's model and its animations, blended from the walk speed. */
export class Person {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private run: THREE.AnimationAction;

  constructor(m: Model) {
    const body = clone(m.scene);
    body.scale.setScalar(0.01 * (0.93 + Math.random() * 0.1)); // centimetres to metres, and not everyone the same height
    this.root.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    const clip = (n: string) => this.mixer.clipAction(m.clips.find((c) => c.name === n)!);
    [this.idle, this.walk, this.run] = [clip("idle"), clip("walk"), clip("run")];
    for (const a of [this.idle, this.walk, this.run]) a.play();
    this.idle.time = Math.random() * 10; // so nobody idles in step
    this.walk.time = Math.random();
  }

  /** speed in m/s: idle below a stroll, walk, then run; the steps keep pace with the ground. */
  update(dt: number, speed: number) {
    const ramp = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)));
    const moving = ramp(0.1, 0.6, speed), running = ramp(2.6, 4.5, speed);
    this.idle.setEffectiveWeight(1 - moving);
    this.walk.setEffectiveWeight(moving * (1 - running));
    this.run.setEffectiveWeight(moving * running);
    this.walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 1.35, 0.55, 2.2)); // the clip walks at ~1.35 m/s
    this.run.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 3.6, 0.7, 1.6));
    this.mixer.update(dt);
  }

  setShadow(on: boolean) {
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = on; });
  }
}
