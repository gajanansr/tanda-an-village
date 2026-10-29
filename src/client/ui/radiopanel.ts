import type { Radio } from "../radio";

/*
 * Tanda FM: the radio's window (B) — every song on the station, the one playing marked, and
 * play/pause, previous and next. Inside it Space plays or pauses, ←/→ change the song and 1–9 pick
 * one. While a song plays, a small pill in the corner shows its name; click it to open the window.
 */
export class RadioPanel {
  private el: HTMLElement;
  private pill: HTMLElement;
  open = false;
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, private radio: Radio) {
    this.el = document.createElement("div");
    this.el.className = "panel radio-panel";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-close]")) return this.close();
      const song = t.closest("[data-song]") as HTMLElement | null;
      if (song) return this.radio.play(Number(song.dataset.song));
      const act = (t.closest("[data-act]") as HTMLElement | null)?.dataset.act;
      if (act === "prev") this.radio.prev();
      else if (act === "next") this.radio.next();
      else if (act === "play") this.radio.playPause();
    });
    // its own keys while it's open (the game's keys stay out of it)
    window.addEventListener("keydown", (e) => {
      if (!this.open || e.repeat) return;
      if (e.code === "Space") this.radio.playPause();
      else if (e.code === "ArrowRight") this.radio.next();
      else if (e.code === "ArrowLeft") this.radio.prev();
      else if (/^Digit[1-9]$/.test(e.code)) this.radio.play(Number(e.code.slice(5)) - 1);
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    this.pill = document.createElement("button");
    this.pill.className = "radio-pill";
    this.pill.hidden = true;
    this.pill.addEventListener("click", () => (this.open ? this.close() : this.onOpenRequest()));
    parent.appendChild(this.pill);
  }

  /** Opening goes through the game, so other windows close and the mouse is let go. */
  onOpenRequest: () => void = () => this.show();

  show() {
    this.open = true;
    this.el.hidden = false;
    this.render();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }

  /** Redraw after any change on the radio. */
  render() {
    const r = this.radio, songs = r.all, cur = r.current;
    const now = songs[cur];
    this.pill.hidden = !r.on || !now;
    if (now) this.pill.innerHTML = `<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="t">${esc(now.title)}</span>`;
    this.pill.title = "Tanda FM — click for the station (B)";
    if (!this.open) return;
    this.el.innerHTML = `<div class="panel-card">
      <button class="x" data-close aria-label="Close">✕</button>
      <div class="radio-head"><span class="radio-dial" aria-hidden="true">📻</span><div><h2>Tanda FM</h2><p class="lede">${r.on && now ? `Now playing <b>${esc(now.title)}</b>` : "Off the air"}</p></div></div>
      <div class="radio-acts">
        <button data-act="prev" aria-label="Previous song">⏮</button>
        <button data-act="play" class="main" aria-label="${r.on ? "Pause" : "Play"}">${r.on ? "⏸" : "▶"}</button>
        <button data-act="next" aria-label="Next song">⏭</button>
      </div>
      <ol class="radio-list">${
        songs.length
          ? songs.map((s, i) => `<li><button data-song="${i}" class="${i === cur ? (r.on ? "on" : "last") : ""}"><kbd>${i + 1}</kbd><span>${esc(s.title)}</span><small>${esc(s.lang ?? "")}</small></button></li>`).join("")
          : `<li class="empty">Only static: no songs on the station yet.</li>`
      }</ol>
      <p class="hint"><kbd>Space</kbd> play / pause · <kbd>←</kbd><kbd>→</kbd> change song · <kbd>N</kbd> next song while you play</p>
    </div>`;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
