// Cost guards. The daily cap is kept in a small file on the persistent disk when `file` is
// given, so a restart does not reset it (30 Oct 2026 review: it lived in memory only). The
// Anthropic account's monthly spending limit stays the hard stop above everything.
import fs from "node:fs";
import path from "node:path";

// At most `limit` AI calls a day (UTC). 0 or less means no cap.
export function createDailyCap(limit, now = () => Date.now(), file = null) {
  let day = "";
  let count = 0;
  if (file) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof saved.day === "string" && Number.isFinite(saved.count)) ({ day, count } = saved);
    } catch { /* first run, or unreadable: start from zero */ }
  }
  const save = () => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ day, count }));
    } catch { /* never stop scoring because the counter file could not be written */ }
  };
  const roll = () => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      count = 0;
      save();
    }
  };
  return {
    take() {
      roll();
      if (limit > 0 && count >= limit) return false;
      count++;
      save();
      return true;
    },
    // Readings still allowed today (Infinity without a cap). The hourly catch-up sizes its run
    // with this, then records what it used with use(n).
    remaining() {
      roll();
      return limit > 0 ? Math.max(0, limit - count) : Infinity;
    },
    use(n) {
      roll();
      count += Math.max(0, n);
      save();
    },
    get count() {
      return count;
    },
  };
}

// True if the same key was seen within `ttlMs`: Loxo can send the same event twice.
export function createDeduper(ttlMs = 15 * 60_000, now = () => Date.now()) {
  const seen = new Map();
  return {
    seenRecently(key) {
      const t = now();
      for (const [k, at] of seen) if (t - at > ttlMs) seen.delete(k);
      if (seen.has(key)) return true;
      seen.set(key, t);
      return false;
    },
  };
}

// Wraps a provider so every AI call counts against the daily cap, and none is made once the
// cap is reached: scoring, retries, batches and drafting criteria alike.
export class DailyCapReached extends Error {}
export function capProvider(provider, cap) {
  const check = (n = 1) => {
    if (cap.remaining() < n) throw new DailyCapReached("daily cap reached");
    cap.use(n);
  };
  return {
    ...provider,
    async complete(req) {
      check(1);
      return provider.complete(req);
    },
    batch: provider.batch && {
      ...provider.batch,
      async submit(items) {
        check(items.length);
        return provider.batch.submit(items);
      },
    },
  };
}
