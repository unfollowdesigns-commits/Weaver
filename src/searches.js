// Which searches Weaver scores. 30 Oct 2026 (Houssem): nobody should have to type search numbers.
// LOXO_AUTO_SCORE_JOB_IDS empty (or "all"): every open search in Loxo, re-checked as it runs, so a
// search opened today is picked up without anyone touching a setting. A list of numbers limits it
// to those. LOXO_SKIP_JOB_IDS: searches never to score (for example a test search).
import { jobStatusOf, isOpenStatus } from "./loxo/map.js";

const list = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function parseSearchSetting(value, skip = "") {
  const ids = list(value);
  const all = ids.length === 0 || (ids.length === 1 && ids[0].toLowerCase() === "all");
  return { all, ids: all ? [] : ids, skip: new Set(list(skip)) };
}

export async function openSearchIds(client) {
  const jobs = await client.list("/jobs");
  return jobs.filter((j) => isOpenStatus(jobStatusOf(j))).map((j) => String((j.job ?? j).id)).filter((id) => id && id !== "undefined");
}

// ids(): the searches to score now. has(id): whether a search is switched on; in "all" mode an
// unknown search triggers one fresh look in Loxo (it may have just been opened).
export function createSearchList({ client, setting, skip = "", refreshMs = 10 * 60_000, now = () => Date.now() }) {
  const s = parseSearchSetting(setting, skip);
  let cache = null;
  let at = 0;
  const keep = (ids) => ids.filter((id) => !s.skip.has(id));
  async function refresh() {
    cache = keep(await openSearchIds(client));
    at = now();
    return cache;
  }
  return {
    all: s.all,
    describe: () => (s.all ? `every open search${s.skip.size ? ` except ${[...s.skip].join(", ")}` : ""}` : keep(s.ids).join(", ")),
    async ids() {
      if (!s.all) return keep(s.ids);
      return cache && now() - at < refreshMs ? cache : refresh();
    },
    async has(id) {
      id = String(id);
      if (s.skip.has(id)) return false;
      if (!s.all) return s.ids.includes(id);
      if (!cache || now() - at >= refreshMs) await refresh();
      if (cache.includes(id)) return true;
      if (now() - at > 60_000) await refresh();
      return cache.includes(id);
    },
  };
}
