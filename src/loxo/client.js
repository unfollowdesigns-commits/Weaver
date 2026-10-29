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

export function createLoxoClient({ domain, slug, apiKey, writeEnabled = false, fetchImpl = fetch, sleep = defaultSleep }) {
  if (!slug?.trim()) throw new Error("LOXO_AGENCY_SLUG is not set in .env");
  if (!apiKey?.trim()) throw new Error("LOXO_API_KEY is not set in .env");
  const host = (domain || "app.loxo.co").trim();
  // A full URL (http://localhost:...) is accepted for local testing against a fake Loxo.
  const base = `${host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`}/api/${slug.trim()}`;

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
      const res = await fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey.trim()}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        const retryAfter = Number(res.headers?.get?.("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 1500 * attempt);
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

  // Follows scroll_id cursors until the list ends.
  async function list(path, query = {}, { maxPages = 100 } = {}) {
    const out = [];
    const seen = new Set();
    let scrollId;
    for (let page = 0; page < maxPages; page++) {
      const data = await request("GET", path, { query: { per_page: 100, ...query, scroll_id: scrollId } });
      const items = firstArray(data);
      out.push(...items);
      const next = data?.scroll_id;
      if (!items.length || !next || seen.has(next)) break;
      seen.add(next);
      scrollId = next;
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
  }[status] ?? "request failed";
  return `Loxo ${method} ${path} -> ${status}: ${hint}. ${text.slice(0, 200)}`.trim();
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
