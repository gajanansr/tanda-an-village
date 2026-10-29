import { SEASON_DAYS } from "./time.js";

/*
 * Festivals that come round every year (a year is three 8-day seasons). On the day, the tanda is
 * decorated, greetings and gifts count double with your neighbours, and each festival has its own
 * thing to do, rewarded once a year:
 *   Dawali (early Rabi): light the diyas at Rathod Bhuvan after dark; the whole lane sees them.
 *   Sevalal Jayanti (late Rabi): offer bhog at the Sevalal mandir; Maharaj's blessing waters your fields.
 *   Holi (early Unhala): sit by the Holi fire in the chowk after dark, and go round your neighbours
 *   for gher — each gives a little, more the better they know you.
 * and Maharashtra's own, each on its rough season in the real year:
 *   Vasantrao Naik Jayanti · Krushi Din (1 July, early Kharif): garland his putla in the chowk; the
 *   krushi sevak hands out seed.
 *   Ganeshotsav (late Kharif): the evening aarti at the Ganpati pandal in the chowk, with modak.
 *   Dasara (first day of Rabi): puja for your bulls and tools at Rathod Bhuvan.
 *   Makar Sankranti (mid Rabi): hand out til-gul in the chowk — "tilgul ghya, god god bola".
 *   Shivaji Jayanti (late Rabi): garland Chhatrapati Shivaji Maharaj's putla in the chowk.
 *   Gudi Padwa (Unhala): raise a gudi at Rathod Bhuvan for the Marathi new year.
 * (Teej and Pola stay in the story, as missions.)
 */
export type FestivalId = "naik" | "ganesh" | "dasara" | "dawali" | "sankranti" | "sevalal" | "shivaji" | "holi" | "padwa";
export const YEAR_DAYS = SEASON_DAYS * 3;

export const FESTIVALS: Record<FestivalId, { name: string; local: string; icon: string; day: number; about: string }> = {
  naik: { name: "Vasantrao Naik Jayanti · Krushi Din", local: "वसंतराव नाईक जयंती · कृषी दिन", icon: "🌾", day: 1, about: "Garland Vasantrao Naik's putla in the chowk; the krushi sevak gives seed to every farmer. Greetings and gifts count double today." },
  ganesh: { name: "Ganeshotsav", local: "गणेशोत्सव", icon: "🐘", day: 5, about: "Join the evening aarti at the Ganpati pandal in the chowk, after 7 pm. Greetings and gifts count double today." },
  dasara: { name: "Dasara", local: "दसरा", icon: "🌿", day: SEASON_DAYS, about: "Do the puja for your bulls and tools at Rathod Bhuvan, and share aapta leaves as sona. Greetings and gifts count double today." },
  dawali: { name: "Dawali", local: "दिवाळी", icon: "🪔", day: SEASON_DAYS + 1, about: "Light the diyas at Rathod Bhuvan after dark. Greetings and gifts count double today." },
  sankranti: { name: "Makar Sankranti", local: "मकर संक्रांत", icon: "🪁", day: SEASON_DAYS + 4, about: "Hand out til-gul in the chowk: tilgul ghya, god god bola. Greetings and gifts count double today." },
  sevalal: { name: "Sevalal Jayanti", local: "सेवालाल जयंती", icon: "🚩", day: SEASON_DAYS + 6, about: "Offer bhog (5 produce) at the Sevalal mandir for Maharaj's blessing. Greetings and gifts count double today." },
  shivaji: { name: "Shivaji Jayanti", local: "शिवजयंती", icon: "⚔️", day: SEASON_DAYS + 7, about: "Garland Chhatrapati Shivaji Maharaj's putla in the chowk. Jai Bhavani, Jai Shivaji! Greetings and gifts count double today." },
  holi: { name: "Holi", local: "होळी", icon: "🔥", day: SEASON_DAYS * 2 + 1, about: "Go round your neighbours for gher, and sit by the Holi fire in the chowk after dark. Greetings and gifts count double today." },
  padwa: { name: "Gudi Padwa", local: "गुढीपाडवा", icon: "🎋", day: SEASON_DAYS * 2 + 3, about: "Raise a gudi at Rathod Bhuvan for the Marathi new year, in the morning (before noon). Greetings and gifts count double today." },
};
export const FESTIVAL_IDS = Object.keys(FESTIVALS) as FestivalId[];

const dayOfYear = (day: number) => ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
export const yearOf = (day: number) => Math.floor(day / YEAR_DAYS);
/** The festival on a game day, if any. */
export const festivalOn = (day: number): FestivalId | null => FESTIVAL_IDS.find((f) => FESTIVALS[f].day === dayOfYear(day)) ?? null;
/** Days until a festival next comes round (0: today). */
export const daysTo = (f: FestivalId, day: number) => (FESTIVALS[f].day - dayOfYear(day) + YEAR_DAYS) % YEAR_DAYS;

/** What each festival rewards, once a year. */
export const DIYA_REP = 5; // Dawali: the diyas lit
export const DIYA_BOND = 3; // …and every neighbour who knows you sees them
export const BHOG_N = 5; // Sevalal Jayanti: produce offered
export const BHOG_REP = 10;
export const HOLIKA_REP = 5; // Holi: the fire
export const gher = (hearts: number) => 20 + 20 * hearts; // Holi: from each neighbour you greet
export const FEST_HOUR = 19;
export const NAIK_REP = 6; // Krushi Din: garlanding his putla…
export const NAIK_SEED = 10; // …and the krushi sevak's jowar seed
export const AARTI_REP = 6; // Ganeshotsav
export const DASARA_REP = 5; // Dasara: the puja (and the bulls are fed and rested)
export const TILGUL_REP = 3; // Sankranti: til-gul…
export const TILGUL_BOND = 3; // …and every neighbour who knows you warms to you
export const SHIVAJI_REP = 10; // Shivaji Jayanti
export const GUDI_REP = 5; // Gudi Padwa
export const GUDI_HOUR = 12; // the gudi goes up in the morning // the evening part (diyas, the fire) is after 7 pm
