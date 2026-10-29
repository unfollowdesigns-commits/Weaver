#!/usr/bin/env node
// Runs the real-shape fake Loxo (test/support/real-shape-loxo.js) on http://localhost:8792
// for rehearsing every command against the quirks of the real account. Sample data only.
//   LOXO_DOMAIN=http://localhost:8792 LOXO_AGENCY_SLUG=demo LOXO_API_KEY=demo npm run loxo:check -- --jobs
import { startRealShapeLoxo } from "../test/support/real-shape-loxo.js";
const { url } = await startRealShapeLoxo({ port: Number(process.env.FAKE_LOXO_PORT || 8792) });
console.log(`Real-shape fake Loxo (sample data) on ${url}`);
