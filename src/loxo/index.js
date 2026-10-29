import { createLoxoClient } from "./client.js";
import { writesAllowed } from "./write.js";

export function loxoClientFromEnv(env = process.env, { allowWrites = false } = {}) {
  return createLoxoClient({
    domain: env.LOXO_DOMAIN,
    slug: env.LOXO_AGENCY_SLUG,
    apiKey: env.LOXO_API_KEY,
    writeEnabled: allowWrites && writesAllowed(env),
    maxPerSecond: Number(env.LOXO_MAX_PER_SECOND || 4),
  });
}
