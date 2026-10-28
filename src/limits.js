// Cost guards. Both live in memory: they reset on restart, which is why the
// Anthropic account also carries a hard monthly spending limit.

// At most `limit` candidates a day (UTC). 0 or less means no cap.
export function createDailyCap(limit, now = () => Date.now()) {
  let day = "";
  let count = 0;
  return {
    take() {
      const d = new Date(now()).toISOString().slice(0, 10);
      if (d !== day) {
        day = d;
        count = 0;
      }
      if (limit > 0 && count >= limit) return false;
      count++;
      return true;
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
