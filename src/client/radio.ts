/*
 * The farmer's transistor radio, brought home from the city: "Tanda FM" plays Marathi and Banjari
 * songs from public/radio/. The station list is public/radio/playlist.json, so songs can be added
 * without touching the code. Unlike the game's sound effects these are real files, streamed by an
 * <audio> element; the list is fetched when the game opens, the songs only when the radio is on.
 */
export type Song = { file: string; title: string; artist?: string; lang?: string };

const BASE = `${import.meta.env.BASE_URL}radio/`;

export class Radio {
  on = false;
  private el: HTMLAudioElement | null = null;
  private songs: Song[] = [];
  private loading: Promise<Song[]> | null = null;
  private order: number[] = [];
  private at = -1;
  private volume = 0.8;
  /** Tell the player what's playing (or why nothing is). */
  onNotice: (msg: string) => void = () => {};
  /** Anything changed: on/off, or the song (for the radio window and the now-playing pill). */
  onChange: () => void = () => {};

  /** Every song on the station, in playlist order. */
  get all(): readonly Song[] {
    return this.songs;
  }
  /** The song on now (or last on, if the radio is off), as an index into `all`. */
  get current(): number {
    return this.order[this.at] ?? -1;
  }

  constructor() {
    // fetch the station list now, so B can start a song straight away: Safari only lets a page start
    // sound in the same moment as the key press, not after waiting on the network
    void this.list();
  }

  private list() {
    if (this.songs.length) return Promise.resolve(this.songs);
    return (this.loading ??= fetch(`${BASE}playlist.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { songs: [] }))
      .then((d: { songs?: Song[] }) => (this.songs = (d.songs ?? []).filter((s) => s && typeof s.file === "string" && s.file)))
      .catch(() => [] as Song[])
      .finally(() => (this.loading = null))); // an empty or failed list is asked for again next time
  }

  /** A fresh shuffle each time round the list, never starting with the song that just ended. */
  private reshuffle(n: number, last: number) {
    this.order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    if (n > 1 && this.order[0] === last) [this.order[0], this.order[n - 1]] = [this.order[n - 1], this.order[0]];
    this.at = -1; // next() steps onto the first
  }

  toggle() {
    if (this.on) return this.stop();
    if (!this.songs.length) {
      // not fetched yet (or empty): fetch, and start if there's anything; the browser may still want one more press
      void this.list().then((s) => (s.length ? this.next() : this.onNotice("📻 Only static on Tanda FM — no songs on the radio yet")));
      return;
    }
    this.next();
  }

  stop(quiet = false) {
    const was = this.on;
    this.on = false;
    this.el?.pause();
    if (was && !quiet) this.onNotice("📻 Radio off");
    this.onChange();
  }

  /** Play the next song (switches the radio on if it was off). Runs inside the key press, so the browser allows the sound. */
  next() {
    const songs = this.songs;
    if (!songs.length) return this.toggle();
    this.on = true;
    const last = this.order[this.at] ?? -1;
    if (this.at + 1 >= this.order.length) this.reshuffle(songs.length, last);
    this.start(songs[this.order[++this.at]]);
  }

  /** Play a chosen song (from the radio window); the shuffle carries on from there. */
  play(i: number) {
    if (!this.songs[i]) return;
    if (this.order.length !== this.songs.length) this.reshuffle(this.songs.length, -1);
    this.at = Math.max(0, this.order.indexOf(i));
    this.start(this.songs[i]);
  }

  /** Back to the song before. */
  prev() {
    if (!this.songs.length) return;
    if (this.order.length !== this.songs.length) return this.next();
    this.at = (this.at - 1 + this.order.length) % this.order.length;
    this.start(this.songs[this.order[this.at]]);
  }

  /** Pause or carry on with the current song (off → on starts one). */
  playPause() {
    if (this.on) return this.stop(true);
    if (this.el?.src && this.current >= 0) {
      this.on = true;
      this.el.play().catch(() => {});
      this.onChange();
    } else this.toggle();
  }

  private start(song: Song) {
    this.on = true;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.el.addEventListener("ended", () => this.on && this.next());
      // a missing or broken file: move on rather than going quiet
      this.el.addEventListener("error", () => this.on && setTimeout(() => this.on && this.next(), 400));
    }
    this.el.src = BASE + encodeURI(song.file);
    this.el.volume = this.volume;
    this.el.play().then(
      () => this.onNotice(`📻 ${song.title}`),
      (e: DOMException) => {
        if (e?.name !== "NotAllowedError") return;
        // the browser blocked the sound (it wants a fresh key press or click): say so instead of going quietly silent
        this.on = false;
        this.onNotice("📻 The browser held the radio back — try again");
        this.onChange();
      },
    );
    this.onChange();
  }

  /** Follow the game's master volume; the radio sits a little under it so the village still comes through. */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v * 0.7));
    if (this.el) this.el.volume = this.volume;
  }

  /** Quiet the radio while the page is hidden, and bring it back after. */
  setPaused(paused: boolean) {
    if (!this.el || !this.on) return;
    if (paused) this.el.pause();
    else this.el.play().catch(() => {});
  }
}
