import { authed, displayName, json, loadSave, onBoard, publish, serverNow } from "./_lib/game.js";
import { type Parts, store } from "./_lib/store.js";
import { netWorth } from "../src/shared/bank.js";
import { clock } from "../src/shared/time.js";
import { world } from "./_lib/game.js";

/**
 * GET /api/leaderboard → { top: [...20], me?: { rank, total, entry } }
 * Public top list (names, titles, wealth and what it's made of); your own rank if you send your token.
 * The top list is read straight from the board, which every accepted move refreshes; only your own
 * wealth is worked out fresh from your save. Independent reads run side by side, so a request costs
 * about three database round trips however long the board is.
 */
export async function GET(req: Request): Promise<Response> {
  const s = store();
  const mine = authed(req).then((id) => (id ? loadSave(id).catch(() => null) : null));
  const [board, save] = await Promise.all([s.boardTop(20), mine]);
  // equal net worth shares a rank (1, 2, 2, 4…), matching "how many are worth more than you"
  const top = board.map((e, i) => ({ rank: board.findIndex((x) => x.worth === e.worth) + 1 || i + 1, name: e.name, worth: e.worth, parts: e.parts ?? null, title: e.title, missions: e.missions, sarpanch: e.sarpanch, you: false, id: e.id }));
  let me: { rank: number; total: number; name: string; worth: number; parts: Parts; title: string; missions: number; unlisted?: boolean } | undefined;
  if (save) {
    const now = serverNow(save);
    const w = netWorth(world(), save, now, clock(now).day);
    const parts = { cash: w.money, land: w.land, goods: w.goods + w.livestock, debt: w.debt };
    // refresh your row (even before your first move today) while your rank is counted
    const [{ above, total }] = await Promise.all([s.boardRank(w.total), publish(save).catch(() => {})]);
    me = { rank: above + 1, total: onBoard(save) ? Math.max(total, above + 1) : total, name: displayName(save), worth: w.total, parts, title: "", missions: save.missions?.i ?? 0, ...(onBoard(save) ? {} : { unlisted: true }) };
    for (const t of top) if (t.id === save.id) Object.assign(t, { you: true, worth: w.total, parts });
  }
  return json({ top: top.map(({ id: _id, ...t }) => t), me });
}
