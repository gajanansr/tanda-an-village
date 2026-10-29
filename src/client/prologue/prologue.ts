import * as THREE from "three";
import type { Audio } from "../audio";
import { CameraRig } from "../player/camera-rig";
import type { Controls } from "../player/controls";
import { Walker } from "../player/walker";
import type { Radio } from "../radio";
import { FARMER, Figure } from "../scene/figure";
import { Post } from "../scene/post";
import { buildBus, buildHighway, buildPhata, BUS } from "./bus";
import { buildBusStand, type BusStand, type Spot, YARD } from "./busstand";
import { blob, Dome, ease } from "./kit";
import { buildOffice, type Office } from "./office";

/*
 * The prologue, before the village: three acts in their own little world, rendered instead of the
 * village while they run.
 *   1. The office (a cutscene): Hinjewadi, Pune. HR comes to the hero's desk; eight years end in a
 *      cardboard box, and Aai calls: come home.
 *   2. Swargate ST stand (you walk): ask for the Jalna bus, buy a transistor radio for the road, have
 *      a cutting chai if you like, and board the Lal Pari at platform 4.
 *   3. The Lal Pari (a cutscene): the night road to Jalna, dawn over the black soil, and the bus
 *      leaving you at Ukhali phata.
 * Every scene can be skipped, and the whole story can be watched again from the title screen.
 */
type V = [number, number, number];
type Shot = { at: number; from: [V, V]; to: [V, V]; dur: number; fov?: number };
type Line = { at: number; dur: number; who: string; text: string };
type Card = { at: number; dur: number; place: string; time: string };
type Cue = { at: number; run: () => void };
type Act = "office" | "stand" | "ride";

const STAND_LINES: Line[] = [{ at: 1.2, dur: 6, who: "📢 Announcement", text: "Pravashanna vinanti… the Pune–Jalna bus is standing at platform number 4." }];
const STAND_CARDS: Card[] = [{ at: 0.3, dur: 4.5, place: "Swargate ST stand, Pune", time: "10:40 pm" }];
const v3 = (a: V) => new THREE.Vector3(a[0], a[1], a[2]);
const MUSIC = `${import.meta.env.BASE_URL}radio/`;

/** Walk a path of [x, z] points: where you are after `d` metres, and which way you face. */
function along(pts: [number, number][], d: number) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    if (d <= len || i === pts.length - 1) {
      const k = Math.min(1, d / len);
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, heading: Math.atan2(bx - ax, bz - az), done: d >= len && i === pts.length - 1 };
    }
    d -= len;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z, heading: 0, done: true };
}

export class Prologue {
  active = false;
  /** True while you're walking about the bus stand (the touch controls show). */
  walking = false;
  /** Called when the story ends (or is skipped): into the village. */
  onDone: () => void = () => {};

  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);
  private post: Post | null = null;
  private size = { w: 1, h: 1 };
  private dome = new Dome(600);
  private act: Act = "office";
  private t = 0;
  private fired = new Set<number>();
  private ui: HTMLElement;
  private els: Record<"sub" | "card" | "goal" | "hint" | "fade" | "click" | "end", HTMLElement>;
  private music: HTMLAudioElement | null = null;
  private musicGoal = 0;

  // act 1
  private office: Office | null = null;
  // act 2
  private stand: BusStand | null = null;
  private hero: Figure | null = null;
  private walker: Walker | null = null;
  private rig: CameraRig | null = null;
  private marker: THREE.Mesh | null = null;
  private done = { enquiry: false, radio: false, chai: false };
  private boarding = false;
  // act 3
  private ride: { group: THREE.Group; bus: ReturnType<typeof buildBus>; road: ReturnType<typeof buildHighway>; phata: THREE.Group; rider: Figure; walkerFig: Figure; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; moon: THREE.DirectionalLight; others: Figure[] } | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private controls: Controls,
    parent: HTMLElement,
    private radio: Radio,
    private audio: Audio,
    private touch: boolean,
    private volume: () => number,
  ) {
    this.ui = document.createElement("div");
    this.ui.className = "prologue";
    this.ui.hidden = true;
    this.ui.innerHTML = `
      <div class="pl-bar top"></div><div class="pl-bar bottom"></div>
      <div class="pl-card"></div>
      <div class="pl-goal"></div>
      <div class="pl-hint"></div>
      <div class="pl-click">${touch ? "" : "Click to look around and walk"}</div>
      <div class="pl-sub"></div>
      <div class="pl-skips"><button data-skip>Skip scene ›</button><button data-skip-all>Skip story ⏭</button></div>
      <div class="pl-fade"></div>
      <div class="pl-end" hidden></div>`;
    parent.appendChild(this.ui);
    const q = (c: string) => this.ui.querySelector(`.pl-${c}`) as HTMLElement;
    this.els = { sub: q("sub"), card: q("card"), goal: q("goal"), hint: q("hint"), fade: q("fade"), click: q("click"), end: q("end") };
    this.ui.querySelector("[data-skip]")!.addEventListener("click", () => this.skip());
    this.ui.querySelector("[data-skip-all]")!.addEventListener("click", () => this.finish());
    this.scene.add(this.dome.mesh);
    this.dome.mesh.renderOrder = -1;
  }

  setSize(w: number, h: number) {
    this.size = { w, h };
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    this.post?.setSize(w, h);
  }

  /** Test hook: stand at a spot in the ST stand and press E there. */
  walkTo(x: number, z: number) {
    if (this.walker) Object.assign(this.walker.pos, { x, z });
  }

  /** Test hook: jump to a moment in one of the acts (its cues up to then run on the next frame). */
  seek(act: Act, t: number) {
    if (!this.active) this.start();
    this.enter(act);
    this.t = t;
  }

  /** Begin the story from the office. */
  start() {
    this.active = true;
    this.ui.hidden = false;
    this.els.end.hidden = true;
    this.done = { enquiry: false, radio: false, chai: false };
    if (!this.post) {
      this.post = new Post(this.renderer, this.scene, this.cam);
      this.post.setSize(this.size.w, this.size.h);
    }
    this.enter("office");
  }

  // ---------------------------------------------------------------- acts

  private enter(act: Act) {
    this.act = act;
    this.t = 0;
    this.fired.clear();
    this.walking = act === "stand";
    this.ui.classList.toggle("cine", act !== "stand");
    this.ui.classList.toggle("walk", act === "stand");
    this.els.sub.classList.remove("on");
    this.els.card.classList.remove("on");
    this.shownLine = this.shownCard = "";
    this.els.click.classList.remove("on");
    this.talk = [];
    this.els.hint.innerHTML = "";
    this.els.goal.innerHTML = "";
    for (const g of [this.office?.group, this.stand?.group, this.ride?.group]) if (g) this.scene.remove(g);
    this.scene.fog = null;
    if (act === "office") {
      this.office ??= buildOffice();
      this.scene.add(this.office.group);
      this.dome.set("#3b3f6b", "#f4a35a", 0);
      this.officeReset();
      this.playMusic("shahar-sutla.mp3");
    } else if (act === "stand") {
      if (!this.stand) this.buildStand();
      this.scene.add(this.stand!.group);
      this.scene.fog = new THREE.Fog("#1b1a26", 40, 160);
      this.dome.set("#070a18", "#3a2c2c", 0.4);
      const s = this.stand!.spawn;
      Object.assign(this.walker!.pos, { x: s.x, y: 0, z: s.z });
      Object.assign(this.walker!.vel, { x: 0, y: 0, z: 0 });
      this.walker!.heading = Math.PI;
      this.controls.yaw = s.yaw;
      this.controls.pitch = -0.15;
      this.boarding = false;
      this.fadeMusic(0.25);
    } else {
      if (!this.ride) this.buildRide();
      this.scene.add(this.ride!.group);
      this.scene.fog = new THREE.Fog("#0b0e1c", 80, 520);
      this.radio.stop(true);
      this.playMusic("lal-pari.mp3"); // the song starts as the bus pulls out
    }
    this.els.fade.classList.remove("on");
  }

  /** Skip to the next scene. */
  private skip() {
    if (this.act === "office") this.enter("stand");
    else if (this.act === "stand") {
      this.done.radio = true; // he buys the radio either way
      this.enter("ride");
    } else this.finish();
  }

  /** The end card, then the village. */
  private finish() {
    this.walking = false;
    this.ui.classList.add("cine");
    this.els.sub.classList.remove("on");
    this.els.card.classList.remove("on");
    this.els.hint.innerHTML = this.els.goal.innerHTML = "";
    this.els.fade.classList.add("on");
    this.fadeMusic(0);
    document.exitPointerLock?.();
    const end = this.els.end;
    end.hidden = false;
    end.innerHTML = `<div class="pl-end-card">
      <div class="pl-where">Ukhali phata · sunrise</div>
      <h2>Ram Ram! Welcome home to Ukhali Tanda</h2>
      <p>Two kilometres of black soil, the smoke of the chulhas, and the whole tanda already knows you've come home.</p>
      <p>Dada's field, <b>Aamrai</b>, has lain fallow since he passed. Naik Dhavlu is waiting at his kacheri on the chowk. The card at the top left and the golden marker will show you each step.</p>
      <p class="pl-tip">${this.touch ? "Your radio is in your bag: ☰ menu → Radio." : "Your radio is in your bag: <kbd>B</kbd> for the station and every song, <kbd>N</kbd> for the next one."}</p>
      <div class="big-acts"><button data-go>Let's farm</button></div></div>`;
    end.querySelector("[data-go]")!.addEventListener("click", () => {
      end.hidden = true;
      this.close();
      this.onDone();
    });
  }

  private close() {
    this.active = false;
    this.walking = false;
    this.ui.hidden = true;
    this.music?.pause();
    for (const g of [this.office?.group, this.stand?.group, this.ride?.group]) if (g) this.scene.remove(g);
  }

  // ---------------------------------------------------------------- per frame

  frame(dt: number) {
    if (!this.active || !this.post) return;
    this.t += dt;
    if (!this.els.end.hidden) {
      // the end card: hold the last frame, gently
    } else if (this.act === "office") this.officeFrame(dt);
    else if (this.act === "stand") this.standFrame(dt);
    else this.rideFrame(dt);
    this.dome.mesh.position.copy(this.cam.position);
    this.stepMusic(dt);
    this.post.setHeat(0, this.t);
    this.post.render();
  }

  /** Run the cutscene parts common to every act: the camera, the lines, the place cards and the cues. */
  private direct(shots: Shot[], lines: Line[], cards: Card[], cues: Cue[]) {
    const t = this.t;
    let shot = shots[0];
    for (const s of shots) if (t >= s.at) shot = s;
    const k = ease((t - shot.at) / shot.dur);
    const pos = v3(shot.from[0]).lerp(v3(shot.to[0]), k), look = v3(shot.from[1]).lerp(v3(shot.to[1]), k);
    this.cam.position.copy(pos);
    this.cam.lookAt(look);
    const fov = shot.fov ?? 50;
    if (this.cam.fov !== fov) {
      this.cam.fov = fov;
      this.cam.updateProjectionMatrix();
    }
    this.lines(lines);
    this.cards(cards);
    this.cues(cues);
  }

  private shownLine = "";
  private lines(lines: Line[]) {
    const now = lines.find((l) => this.t >= l.at && this.t < l.at + l.dur) ?? null;
    const key = now ? `${now.at}|${now.text}` : "";
    if (key === this.shownLine) return;
    this.shownLine = key;
    if (now) this.els.sub.innerHTML = now.who ? `<b>${now.who}</b> ${now.text}` : `<i>${now.text}</i>`;
    this.els.sub.classList.toggle("on", !!now);
  }
  private shownCard = "";
  private cards(cards: Card[]) {
    const now = cards.find((c) => this.t >= c.at && this.t < c.at + c.dur) ?? null;
    const key = now ? `${now.at}|${now.place}` : "";
    if (key === this.shownCard) return;
    this.shownCard = key;
    if (now) this.els.card.innerHTML = `<b>${now.place}</b><span>${now.time}</span>`;
    this.els.card.classList.toggle("on", !!now);
  }
  private cues(cues: Cue[]) {
    cues.forEach((c, i) => {
      if (this.t >= c.at && !this.fired.has(i)) {
        this.fired.add(i);
        c.run();
      }
    });
  }

  // ---------------------------------------------------------------- act 1: the office

  private officeReset() {
    const o = this.office!;
    o.hero.action = "type";
    o.hero.root.position.set(0, 0, 0.82);
    o.hero.root.rotation.y = Math.PI;
    o.hr.root.position.set(9.5, 0, 7.5);
    o.hr.root.visible = true;
    o.carton.visible = false;
    this.ringing = false;
  }
  private ringing = false;
  private static HR_IN: [number, number][] = [[9.5, 7.5], [11.3, 7.5], [11.3, 2.6], [1.3, 2.6], [1.1, 1.65]];

  private officeFrame(dt: number) {
    const o = this.office!, t = this.t;
    const hr = o.hr;
    // HR crosses the floor to the desk from 6.5 s, and leaves again at 39 s
    let hrSpeed = 0;
    if (t >= 6.5 && t < 39) {
      const p = along(Prologue.HR_IN, (t - 6.5) * 1.45);
      hr.root.position.set(p.x, 0, p.z);
      if (!p.done) {
        hr.root.rotation.y = p.heading;
        hrSpeed = 1.45;
      } else hr.root.rotation.y = Math.atan2(0 - p.x, 0.82 - p.z);
    } else if (t >= 39) {
      const p = along([...Prologue.HR_IN].reverse(), (t - 39) * 1.45);
      hr.root.position.set(p.x, 0, p.z);
      hr.root.rotation.y = p.heading;
      hrSpeed = p.done ? 0 : 1.45;
      if (p.done) hr.root.visible = false;
    }
    // the hero stops typing and swivels round to listen
    if (t >= 18.5 && t < 39) {
      o.hero.action = "sit";
      const want = Math.atan2(1.1, 1.65 - 0.82);
      o.hero.root.rotation.y = THREE.MathUtils.lerp(Math.PI, want, ease((t - 18.5) / 1.4));
    }
    // the ringing phone
    const ph = o.phone.material as THREE.MeshStandardMaterial;
    ph.emissive.set("#7fb7ff");
    ph.emissiveIntensity = this.ringing ? 0.6 + 0.6 * Math.sin(t * 14) : 0;
    o.hero.animate(dt, 0);
    hr.animate(dt, hrSpeed);
    for (const c of o.colleagues) c.animate(dt, 0);

    const HERO = "You", HR = "Rohit (HR)", AAI = "Aai, on the phone";
    this.direct(
      [
        { at: 0, dur: 7, from: [[-11, 2.6, 8], [0, 1, -2]], to: [[-7, 2.2, 6], [0, 1, 0]] },
        { at: 7, dur: 5, from: [[0.55, 1.45, 1.65], [0, 1.1, -0.25]], to: [[0.38, 1.36, 1.3], [0, 1.08, -0.25]], fov: 42 },
        { at: 12, dur: 7, from: [[-3.6, 1.7, -2.6], [3, 1, 3]], to: [[-3.1, 1.6, -2.1], [1, 1, 1.5]] },
        { at: 19, dur: 20, from: [[-1.7, 1.5, 3.3], [0.45, 1.15, 1.1]], to: [[-1.15, 1.42, 2.7], [0.45, 1.12, 1.1]], fov: 44 },
        { at: 39, dur: 7, from: [[2.5, 1.65, 3.5], [0, 1.0, 0.4]], to: [[1.9, 1.5, 2.9], [0, 0.95, 0.4]] },
        { at: 46, dur: 13, from: [[2.7, 1.65, 1.5], [0.9, 1.5, 1.3]], to: [[2.35, 1.6, 1.4], [0.9, 1.52, 1.3]], fov: 40 },
      ],
      [
        { at: 19.5, dur: 4, who: HR, text: "Hey… got a minute? Sorry to do this at your desk." },
        { at: 23.8, dur: 4.5, who: HR, text: "The company is restructuring. Your role has been impacted." },
        { at: 28.6, dur: 3, who: HERO, text: "Impacted…? Eight years, Rohit." },
        { at: 31.9, dur: 4.5, who: HR, text: "Today is your last day. IT will collect the laptop, and your badge stops at seven." },
        { at: 36.6, dur: 2.3, who: HR, text: "I'm really sorry." },
        { at: 39.6, dur: 4, who: "", text: "Eight years, and it all fits in one cardboard box." },
        { at: 44, dur: 2.5, who: "", text: "📱 Aai calling…" },
        { at: 47, dur: 4, who: AAI, text: "Kay re, baba? You sound tired." },
        { at: 51.3, dur: 4.2, who: AAI, text: "Ye ghari. Come home. Dada's field is still there." },
        { at: 55.8, dur: 2.4, who: HERO, text: "Ho, Aai. I'm coming home." },
      ],
      [{ at: 0.6, dur: 5, place: "Hinjewadi, Pune", time: "Monday · 6:10 pm" }],
      [
        { at: 12, run: () => this.audio.play("stamp") },
        {
          at: 39, run: () => {
            o.hero.action = "bend";
            o.hero.root.position.set(0.15, 0, 1.0);
            o.hero.root.rotation.y = Math.PI;
            o.carton.visible = true;
          },
        },
        { at: 43.5, run: () => (o.hero.action = "none") },
        { at: 44, run: () => (this.ringing = true) },
        {
          at: 46, run: () => {
            this.ringing = false;
            o.hero.root.position.set(0.9, 0, 1.3);
            o.hero.root.rotation.y = Math.PI / 2;
          },
        },
        { at: 58.2, run: () => this.els.fade.classList.add("on") },
        { at: 59.6, run: () => this.enter("stand") },
      ],
    );
  }

  // ---------------------------------------------------------------- act 2: Swargate ST stand

  private buildStand() {
    const s = (this.stand = buildBusStand());
    this.hero = new Figure(FARMER);
    this.hero.root.add(blob(0.9));
    s.group.add(this.hero.root);
    this.walker = new Walker(() => 0, s.solid, () => -100, YARD);
    this.rig = new CameraRig(this.cam, () => 0, s.solid);
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color: "#ffd060", toneMapped: false }));
    s.group.add(this.marker);
  }

  /** What you should do next at the stand. */
  private nextSpot() {
    const id = !this.done.enquiry ? "enquiry" : !this.done.radio ? "radio" : "conductor";
    return this.stand!.spots.find((p) => p.id === id)!;
  }

  private standFrame(dt: number) {
    const s = this.stand!, w = this.walker!, t = this.t;
    if (!this.boarding) {
      const input = this.controls.input();
      const n = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < n; i++) w.step(input, this.controls.yaw, dt / n);
    }
    this.rig!.update(dt, w.pos, this.controls.yaw, this.controls.pitch, undefined, w.vel, 0);
    this.hero!.root.position.set(w.pos.x, w.pos.y, w.pos.z);
    this.hero!.root.rotation.y = w.heading;
    this.hero!.animate(dt, w.speed, { turn: w.turn, air: w.onGround ? 0 : 1 });
    const me = new THREE.Vector3(w.pos.x, w.pos.y, w.pos.z);
    for (const n of s.npcs) n.update(dt, me);
    for (const f of s.sitters) f.animate(dt, 0);
    this.footsteps(dt, w.speed);
    // the marker bobs over the next thing to do
    const next = this.nextSpot();
    this.marker!.position.set(next.x, 2.6 + Math.sin(t * 3) * 0.12, next.z);
    this.marker!.rotation.y = t * 2;
    // what E would do here
    const near = this.nearSpot();
    const key = this.touch ? "Tap Talk:" : "<kbd>E</kbd>";
    this.els.hint.innerHTML = near && !this.boarding ? `${key} ${near.id === "conductor" && this.done.radio ? "Board the Lal Pari to Jalna" : near.label}` : "";
    this.els.click.classList.toggle("on", !this.touch && !this.controls.locked && !this.boarding && t > 1.5);
    // the goals, top left
    const row = (ok: boolean, text: string, optional = false) => `<li class="${ok ? "ok" : ""}${optional ? " opt" : ""}">${ok ? "✓" : optional ? "☕" : "○"} ${text}</li>`;
    const goal = `<div class="pl-goal-head">Swargate ST stand</div><ul>${row(this.done.enquiry, "Ask about the Jalna bus at the enquiry window")}${row(this.done.radio, "Buy something for the road at Pawar Electronics")}${row(this.boarding, "Board the Lal Pari at platform 4")}${row(this.done.chai, "A cutting chai before the journey", true)}</ul>`;
    if (this.els.goal.innerHTML !== goal) this.els.goal.innerHTML = goal;
    this.lines([...STAND_LINES, ...this.talk]);
    this.cards(STAND_CARDS);
  }

  private talk: Line[] = [];
  private say(who: string, text: string, dur = 4.5) {
    this.talk = [{ at: this.t, dur, who, text }];
  }

  private nearSpot() {
    const w = this.walker!;
    let best: Spot | null = null, bd = 2.4;
    for (const p of this.stand!.spots) {
      const d = Math.hypot(p.x - w.pos.x, p.z - w.pos.z);
      if (d < bd) [best, bd] = [p, d];
    }
    return best;
  }

  private stepT = 0;
  private footsteps(dt: number, speed: number) {
    if (speed < 0.5) return;
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.audio.play("step", 0.3);
      this.stepT = speed > 4 ? 0.3 : 0.45;
    }
  }

  private interact() {
    if (this.act !== "stand" || this.boarding) return;
    const p = this.nearSpot();
    if (!p) return;
    if (p.id === "enquiry") {
      this.done.enquiry = true;
      this.say("Enquiry clerk", "Jalna? Platform 4, the red one. Leaves at 10:55, reaches by six.");
    } else if (p.id === "chai") {
      this.done.chai = true;
      this.audio.play("buy");
      this.say("Chaiwala", "Garam cutting, bhau! Long journey? Drink, drink.");
    } else if (p.id === "radio") {
      if (this.done.radio) return this.say("Pawar", "It works, bhau, don't worry. Happy journey!");
      this.done.radio = true;
      this.audio.play("cash");
      this.say("Pawar", `A Philips transistor, ₹350. Old but gold: Tanda FM comes in clear all the way to Jalna. ${this.touch ? "(☰ menu → Radio)" : "(Press B to switch it on.)"}`, 6);
    } else if (!this.done.radio) {
      this.say("Conductor", "Jalna, ho? Ten minutes yet. It's a long night: get something for the road.");
    } else {
      this.boarding = true;
      this.say("Conductor", "Chala, chala! Jalna! Get in, bhau.", 2.5);
      this.audio.play("bells");
      document.exitPointerLock?.();
      setTimeout(() => this.els.fade.classList.add("on"), 1400);
      setTimeout(() => this.active && this.act === "stand" && this.enter("ride"), 2800);
    }
  }

  /** A key or touch button pressed while the prologue runs. Only a few mean anything here. */
  key(name: string) {
    if (name === "onInteract") this.interact();
    else if ((name === "onRadio" || name === "onRadioNext") && this.act === "stand") {
      if (!this.done.radio) this.say("", "You don't have a radio yet. Pawar Electronics, by the chai stall, sells them.", 3.5);
      else {
        this.fadeMusic(0);
        void (name === "onRadio" ? this.radio.toggle() : this.radio.next());
      }
    }
  }

  // ---------------------------------------------------------------- act 3: the Lal Pari

  private buildRide() {
    const group = new THREE.Group();
    const road = buildHighway();
    group.add(road.group);
    const bus = buildBus("पुणे – जालना", "PUNE – JALNA");
    group.add(bus.group);
    const phata = buildPhata();
    phata.position.set(2, 0, -2.4);
    phata.visible = false;
    group.add(phata);
    // the hero at a window seat on the left, and the night's other passengers dozing
    const rider = new Figure(FARMER);
    rider.action = "sit";
    rider.root.position.copy(bus.seatAt(6, 0));
    rider.root.rotation.y = Math.PI / 2;
    bus.group.add(rider.root);
    const others: Figure[] = [];
    for (const [r, c, look] of [[3, 1, { kurta: "#e9e4d6", dhoti: "#e9e4d6", hat: "#f2f0ea", hatStyle: "topi", skin: "#8a5a3a" }], [7, 3, { kurta: "#7a4a6a", dhoti: "#2e2e36", hat: "#111", hatStyle: "none", skin: "#a36f4c", body: "villager_m" }], [4, 2, { kurta: "#2f5a7a", dhoti: "#3a3a3a", hat: "#cc8a2a", hatStyle: "pheta", skin: "#8e5b3c" }]] as const) {
      const f = new Figure({ ...look });
      f.action = "sit";
      f.root.position.copy(bus.seatAt(r, c));
      f.root.rotation.y = Math.PI / 2;
      bus.group.add(f.root);
      others.push(f);
    }
    // the hero again, on foot at the phata once the bus has gone
    const walkerFig = new Figure(FARMER);
    walkerFig.root.add(blob(0.9));
    walkerFig.root.visible = false;
    group.add(walkerFig.root);
    const hemi = new THREE.HemisphereLight("#5868a0", "#2a2018", 0.7);
    const moon = new THREE.DirectionalLight("#9fb4ff", 0.7);
    moon.position.set(-30, 40, -40);
    group.add(moon);
    const sun = new THREE.DirectionalLight("#ffb070", 0);
    sun.position.set(80, 25, -60);
    group.add(hemi, sun, sun.target);
    this.ride = { group, bus, road, phata, rider, walkerFig, sun, hemi, moon, others };
  }

  private busX = 0;
  private rideFrame(dt: number) {
    const r = this.ride!, t = this.t;
    // night until 20 s, then dawn breaks over the black soil by 30 s
    const night = 1 - ease((t - 20) / 10);
    this.dome.set(new THREE.Color("#4f74b0").lerp(new THREE.Color("#04060f"), night), new THREE.Color("#f2a46a").lerp(new THREE.Color("#141a30"), night), night);
    (this.scene.fog as THREE.Fog).color.set(new THREE.Color("#d9a07a").lerp(new THREE.Color("#0b0e1c"), night));
    r.hemi.intensity = 0.7 + (1 - night) * 1.3;
    r.moon.intensity = night * 0.7;
    r.sun.intensity = (1 - night) * 2.2;
    r.bus.setNight(night);
    const atPhata = t >= 31;
    const speed = atPhata ? 0 : 16;
    r.road.update(dt, speed, night);
    r.phata.visible = atPhata;
    // the bus rocks on the road; at the phata it sets you down and pulls away
    if (!atPhata) {
      this.busX = 0;
      r.bus.group.position.set(0, Math.sin(t * 9) * 0.015, 0);
      r.bus.group.rotation.x = Math.sin(t * 2.3) * 0.006;
      r.bus.spin(t * speed);
    } else {
      const go = Math.max(0, t - 33.5);
      this.busX = 0.8 * go * go;
      r.bus.group.position.set(this.busX, 0, 0);
      r.bus.group.rotation.x = 0;
      r.bus.spin(this.busX);
      r.rider.root.visible = false;
      const f = r.walkerFig;
      f.root.visible = true;
      // he stands by the door a moment, then turns up the village road
      const walk = Math.max(0, t - 36.5) * 1.3;
      const p = along([[4.2, -1.9], [3.4, -4.2], [2.2, -30]], walk);
      f.root.position.set(p.x, 0, p.z);
      f.root.rotation.y = walk > 0 ? p.heading : -Math.PI / 2 - 0.4;
      f.animate(dt, walk > 0 && !p.done ? 1.3 : 0);
    }
    r.rider.animate(dt, 0);
    for (const o of r.others) o.animate(dt, 0);
    const seat = r.bus.seatAt(6, 0), sy = BUS.floor;
    this.direct(
      [
        { at: 0, dur: 8, from: [[-3, 2.4, -10], [1, 1.5, 0]], to: [[3, 2.0, -9], [2, 1.5, 0]] },
        { at: 8, dur: 9, from: [[seat.x + 1.15, sy + 1.42, 0.0], [seat.x - 0.1, sy + 1.0, -1.1]], to: [[seat.x + 1.0, sy + 1.38, -0.05], [seat.x - 0.1, sy + 1.02, -1.3]], fov: 52 },
        { at: 17, dur: 7, from: [[-16, 9, -11], [2, 0, 0]], to: [[-9, 7, -13], [3, 0, 0]] },
        { at: 24, dur: 7, from: [[17, 1.2, -5.5], [0, 1.4, 0]], to: [[13, 1.4, -6.5], [0, 1.5, 0]] },
        { at: 31, dur: 11, from: [[-3, 1.7, 9.5], [3, 1.3, -4]], to: [[-2, 1.9, 8.5], [3, 1.2, -7.5]] },
      ],
      [
        { at: 1.2, dur: 3.6, who: "", text: "📻 The bus pulls out, and the little radio crackles into Tanda FM." },
        { at: 9, dur: 3.6, who: "Conductor", text: "Tikit? … Jalna. Four hundred and eighty." },
        { at: 31.6, dur: 3.4, who: "Conductor", text: "Ukhali phata! Utra, bhau, utra!" },
        { at: 37, dur: 4, who: "", text: "Two kilometres of black soil to Ukhali Tanda. Home." },
      ],
      [
        { at: 0.6, dur: 5, place: "Pune → Jalna", time: "11:30 pm" },
        { at: 18, dur: 4, place: "Past Ahmednagar", time: "2:15 am" },
        { at: 25, dur: 4.5, place: "Jalna district", time: "6:05 am" },
      ],
      [
        { at: 31, run: () => this.audio.play("bells") },
        { at: 39.5, run: () => this.fadeMusic(0.3) },
        { at: 41.5, run: () => this.finish() },
      ],
    );
  }

  // ---------------------------------------------------------------- music

  /** Play one of the radio songs as the scene's score, if it's there (a missing file is just quiet). */
  private playMusic(file: string, goal = 0.85) {
    // one player for the whole story: it's unlocked by the click that starts the story, and the
    // browser then lets it change songs by itself (a new player per scene would be blocked in Safari)
    if (!this.music) {
      this.music = new window.Audio();
      this.music.loop = false;
    }
    const a = this.music;
    a.src = MUSIC + file;
    a.volume = 0;
    a.play().catch(() => {});
    this.musicGoal = goal;
  }
  private fadeMusic(goal: number) {
    this.musicGoal = goal;
  }
  private stepMusic(dt: number) {
    const a = this.music;
    if (!a) return;
    const want = this.musicGoal * this.volume() * 0.7;
    a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(want - a.volume) * Math.min(Math.abs(want - a.volume), dt * 0.5)));
  }
}
