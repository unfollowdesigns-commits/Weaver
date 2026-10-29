// Minimal Loxo Open API client. Reference: https://loxo.readme.io/llms.txt
// URL: https://{domain}/api/{agency_slug}/..., bearer token auth.
// Writes are blocked unless explicitly enabled, so nothing reaches the live account by accident.

const LIST_KEYS = ["candidates", "people", "person_events", "job_profiles", "resumes", "scorecards", "scorecard_types",
  "scorecard_recommendation_types", "activity_types", "webhooks", "results", "data", "items"];

export function firstArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  for (const k of LIST_KEYS) if (Array.isArray(data[k])) return data[k];
  for (const v of Object.values(data)) if (Array.isArray(v) && v.every((x) => x && typeof x === "object")) return v;
  return [];
}

// Loxo rate-limits (429 seen on 29 Oct 2026 at about 12 requests a second; the limit is not
// documented). Every request waits its turn so the client stays under maxPerSecond, and a 429
// is retried with growing waits, honoring Retry-After.
export function createLoxoClient({ domain, slug, apiKey, writeEnabled = false, fetchImpl = fetch, sleep = defaultSleep, maxPerSecond = 4, maxAttempts = 7 }) {
  if (!slug?.trim()) throw new Error("LOXO_AGENCY_SLUG is not set in .env");
  if (!apiKey?.trim()) throw new Error("LOXO_API_KEY is not set in .env");
  const host = (domain || "app.loxo.co").trim();
  // A full URL (http://localhost:...) is accepted for local testing against a fake Loxo.
  const base = `${host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`}/api/${slug.trim()}`;

  let nextSlot = 0;
  async function turn() {
    if (!maxPerSecond) return;
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + 1000 / maxPerSecond;
    if (at > now) await sleep(at - now);
  }

  async function request(method, path, { query, body } = {}) {
    if (method !== "GET" && !writeEnabled) {
      throw new Error(`Write blocked: ${method} ${path}. Writes stay off until the dry run is approved (LOXO_WRITE_ENABLED=true and DRY_RUN=false).`);
    }
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(`${k}[]`, String(x)));
      else url.searchParams.set(k, String(v));
    }
    for (let attempt = 1; ; attempt++) {
      await turn();
      const res = await fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey.trim()}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      // A write that failed with 5xx may still have landed on Loxo's side: retrying it could
      // create a duplicate scorecard. Writes are retried on 429 (refused, not done) only.
      const retriable = res.status === 429 || (res.status >= 500 && method === "GET");
      if (retriable && attempt < maxAttempts) {
        const retryAfter = Number(res.headers?.get?.("retry-after"));
        // 2, 4, 8, 16, 30, 30 seconds unless Loxo says how long.
        await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 2000 * 2 ** (attempt - 1)));
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(explain(res.status, method, path, text));
        err.status = res.status;
        throw err;
      }
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
  }

  // Follows the list to its end. Some Loxo lists page with a scroll_id cursor, others
  // (jobs, for one: confirmed 29 Oct 2026, stopped at 100) with page numbers.
  async function list(path, query = {}, { maxPages = 100, perPage = 100 } = {}) {
    const out = [];
    const ids = new Set();
    const seenCursors = new Set();
    let scrollId;
    let pageNo = 1;
    let mode = null;
    for (let i = 0; i < maxPages; i++) {
      const q = { per_page: perPage, ...query };
      if (mode === "scroll") q.scroll_id = scrollId;
      if (mode === "page") q.page = pageNo;
      const data = await request("GET", path, { query: q });
      const items = firstArray(data);
      let added = 0;
      for (const it of items) {
        const id = it?.id ?? it?.job?.id ?? it?.person?.id;
        const key = id === undefined ? null : String(id);
        if (key !== null && ids.has(key)) continue;
        if (key !== null) ids.add(key);
        out.push(it);
        added++;
      }
      if (!items.length || !added) break;
      const total = Number(data?.total_count ?? data?.total ?? data?.meta?.total_count);
      if (Number.isFinite(total) && total > 0 && out.length >= total) break;
      // Some scroll APIs return the same cursor on every page: keep going while pages add new
      // people (the checks above stop on an empty page or a page with nothing new).
      const cursor = data?.scroll_id;
      if (cursor && (mode !== "page")) {
        seenCursors.add(cursor);
        scrollId = cursor;
        mode = "scroll";
        continue;
      }
      const pages = Number(data?.total_pages ?? data?.meta?.total_pages);
      const more = Number.isFinite(pages) ? pageNo < pages : items.length >= perPage || (Number.isFinite(total) && out.length < total);
      if (mode === "scroll" || !more) break;
      mode = "page";
      pageNo++;
    }
    return out;
  }

  return {
    base,
    writeEnabled,
    get: (path, query) => request("GET", path, { query }),
    list,
    post: (path, body) => request("POST", path, { body }),
    put: (path, body) => request("PUT", path, { body }),
  };
}

function explain(status, method, path, text) {
  const hint = {
    401: "the API key was not accepted",
    403: "Loxo refused the request. Check LOXO_API_KEY, LOXO_AGENCY_SLUG (no spaces) and LOXO_DOMAIN, and that API access is on the account's plan",
    404: "not found. Check the ID, and LOXO_AGENCY_SLUG: a wrong slug also gives 404",
    422: "Loxo rejected the data sent",
    429: "Loxo kept asking to slow down; wait a few minutes and run it again",
  }[status] ?? "request failed";
  return `Loxo ${method} ${path} -> ${status}: ${hint}. ${text.slice(0, 200)}`.trim();
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
