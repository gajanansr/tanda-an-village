import type { Input } from "./physics";

/**
 * Keyboard + mouse input. Mouse look and clicks only count while the pointer is locked; the test
 * hooks drive `held` / `look` directly, so headless runs don't need pointer lock.
 */
export class Controls {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  readonly held = new Set<string>();
  /** The use button (right mouse, or Use on a phone) is being held down: work every tile you aim at. */
  useHeld = false;
  locked = false;
  onDig: () => void = () => {};
  onPlace: () => void = () => {};
  onSelect: (slot: number) => void = () => {};
  onScroll: (dir: number) => void = () => {};
  onToggleDebug: () => void = () => {};
  onInteract: () => void = () => {};
  onEscape: () => void = () => {};
  onMap: () => void = () => {};
  onRide: () => void = () => {};
  onFeed: () => void = () => {};
  onView: () => void = () => {};
  onTorch: () => void = () => {};
  onRadio: () => void = () => {};
  onRadioNext: () => void = () => {};
  onRadioStation: () => void = () => {};
  onHelp: () => void = () => {};
  onBoard: () => void = () => {};
  onKaam: () => void = () => {};
  onPloughField: () => void = () => {};
  onTie: () => void = () => {};
  onSleep: () => void = () => {};
  onGoal: () => void = () => {};
  onLockChange: (locked: boolean) => void = () => {};

  constructor(el: HTMLElement) {
    el.addEventListener("click", () => {
      if (!this.locked && !this.touch) el.requestPointerLock?.()?.catch?.(() => {});
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) {
        this.held.clear();
        this.useHeld = false;
      }
      this.onLockChange(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (this.locked) this.look(e.movementX, e.movementY);
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.onDig();
      else if (e.button === 2) {
        this.useHeld = true;
        this.onPlace();
      }
    });
    document.addEventListener("mouseup", (e) => e.button === 2 && (this.useHeld = false));
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    // one tool per notch of a mouse wheel; a trackpad fires dozens of small events per swipe, so
    // those add up to a notch's worth first, and never more than one step every 120 ms
    let wheel = 0, lastStep = 0;
    document.addEventListener(
      "wheel",
      (e) => {
        if (!this.locked || !e.deltaY) return;
        const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        if (Math.sign(dy) !== Math.sign(wheel)) wheel = 0;
        wheel += dy;
        if (Math.abs(wheel) < 50 || e.timeStamp - lastStep < 120) return;
        lastStep = e.timeStamp;
        wheel = 0;
        this.onScroll(Math.sign(dy));
      },
      { passive: true },
    );
    window.addEventListener("keydown", (e) => {
      if (e.code === "F3") {
        e.preventDefault();
        this.onToggleDebug();
        return;
      }
      if (/^Digit[1-9]$/.test(e.code)) this.onSelect(Number(e.code.slice(5)) - 1);
      if (e.code === "KeyE" && !e.repeat) this.onInteract();
      if (e.code === "Escape") this.onEscape();
      if (e.code === "KeyM" && !e.repeat) this.onMap();
      if (e.code === "KeyR" && !e.repeat) this.onRide();
      if (e.code === "KeyF" && !e.repeat) this.onFeed();
      if (e.code === "KeyV" && !e.repeat) this.onView();
      if (e.code === "KeyT" && !e.repeat) this.onTorch();
      if (e.code === "KeyB" && !e.repeat) (e.shiftKey ? this.onRadioStation() : this.onRadio());
      if (e.code === "KeyN" && !e.repeat) this.onRadioNext();
      if (e.code === "KeyH" && !e.repeat) this.onHelp();
      if (e.code === "KeyL" && !e.repeat) this.onBoard();
      if (e.code === "KeyK" && !e.repeat) this.onKaam();
      if (e.code === "KeyP" && !e.repeat) this.onPloughField();
      if (e.code === "KeyG" && !e.repeat) this.onTie();
      if (e.code === "KeyZ" && !e.repeat) this.onSleep();
      if (e.code === "KeyQ" && !e.repeat) this.onGoal();
      if (this.locked) {
        this.held.add(e.code);
        if (e.code === "Space") e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => {
      this.held.clear();
      this.useHeld = false;
    });
  }

  /** How far you can look up and down. Third person narrows it (the camera rises rather than tips). */
  pitchMin = -1.55;
  pitchMax = 1.55;
  private pendingX = 0;
  private pendingY = 0;
  /** Mouse (or touch) movement is only added up here; `applyLook` turns the view once per frame. A
   *  1000 Hz mouse would otherwise turn it a dozen times between renders, which tears on fast turns. */
  look(dx: number, dy: number) {
    this.pendingX += dx;
    this.pendingY += dy;
  }
  applyLook() {
    this.yaw -= this.pendingX * this.sensitivity;
    this.pitch = Math.max(this.pitchMin, Math.min(this.pitchMax, this.pitch - this.pendingY * this.sensitivity));
    this.pendingX = this.pendingY = 0;
  }

  /** Analog input from touch controls (added to the keys). */
  touch: { move: { forward: number; right: number }; run: boolean } | null = null;

  input(): Input {
    const h = this.held;
    const t = this.touch;
    if (t && (t.move.forward || t.move.right)) return { forward: t.move.forward, right: t.move.right, jump: h.has("Space"), sprint: t.run };
    return {
      forward: (h.has("KeyW") || h.has("ArrowUp") ? 1 : 0) - (h.has("KeyS") || h.has("ArrowDown") ? 1 : 0),
      right: (h.has("KeyD") || h.has("ArrowRight") ? 1 : 0) - (h.has("KeyA") || h.has("ArrowLeft") ? 1 : 0),
      jump: h.has("Space"),
      sprint: h.has("ShiftLeft") || h.has("ShiftRight") || h.has("ControlLeft"),
    };
  }
}
