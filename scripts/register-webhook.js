#!/usr/bin/env node
// Tells Loxo to call our server when a candidate is added to a job.
// This changes settings on the client's Loxo account, so it follows the same
// write switches as scoring (LOXO_WRITE_ENABLED=true and DRY_RUN=false).
//
//   node scripts/register-webhook.js --url https://<our-server>/loxo/webhook

import { parseArgs } from "node:util";
import { loadEnv } from "../src/env.js";
import { loxoClientFromEnv } from "../src/loxo/index.js";
import { firstArray } from "../src/loxo/client.js";

loadEnv();
const { values: args } = parseArgs({ options: { url: { type: "string" } } });
if (!args.url?.startsWith("https://")) {
  console.error("Give the public https address of the server: --url https://.../loxo/webhook");
  process.exit(1);
}
if (!process.env.WEBHOOK_SECRET) {
  console.error("WEBHOOK_SECRET is not set in .env");
  process.exit(1);
}

const client = loxoClientFromEnv(process.env, { allowWrites: true });
const endpoint = `${args.url}?token=${encodeURIComponent(process.env.WEBHOOK_SECRET)}`;
const existing = firstArray(await client.get("/webhooks"));
if (existing.some((w) => w.item_type === "candidate" && w.action === "create" && String(w.endpoint_url ?? "").startsWith(args.url))) {
  console.log("Already registered. Nothing changed.");
} else {
  try {
    await client.post("/webhooks", { webhook: { item_type: "candidate", action: "create", endpoint_url: endpoint } });
    console.log("Registered: Loxo will call the server when a candidate is added to a job.");
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
