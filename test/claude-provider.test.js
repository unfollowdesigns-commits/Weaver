// The Claude connection against a stand-in Claude API (no real key, no cost): checks exactly
// what Weaver sends (model, effort, JSON format, refusal fallback, cached instructions, batch
// shape) and how it reads every kind of answer (thinking blocks, fallback blocks, refusal,
// cut-off answer, batch results). 30 Oct 2026, before the client's Claude key exists.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let server, base;
const seen = [];
let mode = "ok";
const answer = { criteria: [], recommendation: "yes" };
const message = (content, stop_reason = "end_turn") => ({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, stop_details: stop_reason === "refusal" ? { type: "refusal", category: "cyber", explanation: "x" } : null, usage: { input_tokens: 10, output_tokens: 5 } });

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
      const json = (o) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
      if (req.method === "POST" && req.url.startsWith("/v1/messages/batches")) return json({ id: "msgbatch_1", type: "message_batch", processing_status: "in_progress", created_at: new Date().toISOString() });
      if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
        if (mode === "refusal") return json(message([], "refusal"));
        if (mode === "cut") return json(message([{ type: "text", text: "{\"crit" }], "max_tokens"));
        return json(message([
          { type: "thinking", thinking: "", signature: "s" },
          { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" } },
          { type: "text", text: JSON.stringify(answer) },
        ]));
      }
      if (req.method === "GET" && req.url.startsWith("/v1/messages/batches/msgbatch_1/results")) {
        res.writeHead(200, { "content-type": "application/binary" });
        return res.end([
          JSON.stringify({ custom_id: "a", result: { type: "succeeded", message: message([{ type: "text", text: JSON.stringify(answer) }]) } }),
          JSON.stringify({ custom_id: "b", result: { type: "errored", error: { type: "error", error: { type: "overloaded_error" } } } }),
          JSON.stringify({ custom_id: "c", result: { type: "succeeded", message: message([], "refusal") } }),
        ].join("\n"));
      }
      if (req.method === "GET" && req.url.startsWith("/v1/messages/batches/msgbatch_1")) return json({ id: "msgbatch_1", type: "message_batch", processing_status: "ended", created_at: new Date().toISOString(), results_url: `${base}/v1/messages/batches/msgbatch_1/results` });
      if (req.method === "GET" && req.url.startsWith("/v1/messages/batches")) return json({ data: [{ id: "msgbatch_1", processing_status: "ended", created_at: new Date().toISOString() }, { id: "old", processing_status: "ended", created_at: "2020-01-01T00:00:00Z" }], has_more: false, first_id: "msgbatch_1", last_id: "old" });
      res.writeHead(404).end();
    });
  });
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  process.env.ANTHROPIC_BASE_URL = base;
});
after(() => { server.close(); delete process.env.ANTHROPIC_BASE_URL; });

const schema = { type: "object", properties: { recommendation: { type: "string" } }, required: ["recommendation"], additionalProperties: false };

test("a direct request: Opus 5.5, high effort, JSON format, refusal fallback, cached instructions", async () => {
  const { createClaudeProvider } = await import("../src/providers/claude.js");
  const p = createClaudeProvider({ apiKey: "sk-ant-test" });
  mode = "ok";
  const r = await p.complete({ system: "instructions", user: "record", schema });
  assert.deepEqual(r.answer, answer, "thinking and fallback blocks are skipped, the text is read");
  const req = seen.filter((s) => s.method === "POST" && s.url.startsWith("/v1/messages")).at(-1);
  assert.equal(req.body.model, "claude-opus-5-5");
  assert.equal(req.body.output_config.effort, "high");
  assert.deepEqual(req.body.output_config.format, { type: "json_schema", schema });
  assert.equal(req.body.fallbacks, "default");
  assert.match(req.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.deepEqual(req.body.system[0].cache_control, { type: "ephemeral" });
  assert.ok(!("thinking" in req.body) && !("temperature" in req.body), "nothing Opus 5.5 rejects");
  assert.equal(req.headers["x-api-key"], "sk-ant-test");
});

test("a refusal and a cut-off answer become clear errors, never a made-up score", async () => {
  const { createClaudeProvider } = await import("../src/providers/claude.js");
  const p = createClaudeProvider({ apiKey: "sk-ant-test" });
  mode = "refusal";
  await assert.rejects(() => p.complete({ system: "s", user: "u", schema }), /declined to score \(cyber\)/);
  mode = "cut";
  await assert.rejects(() => p.complete({ system: "s", user: "u", schema }), /cut off/);
  mode = "ok";
});

test("the half-price batch: same request without the fallback (Batches rejects it), results read per id", async () => {
  const { createClaudeProvider } = await import("../src/providers/claude.js");
  const p = createClaudeProvider({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5", effort: "medium" });
  const id = await p.batch.submit([{ custom_id: "a", system: "s", user: "u", schema }]);
  assert.equal(id, "msgbatch_1");
  const req = seen.filter((s) => s.method === "POST" && s.url.startsWith("/v1/messages/batches")).at(-1);
  const params = req.body.requests[0].params;
  assert.equal(params.model, "claude-sonnet-5-5", "the model setting is honored");
  assert.equal(params.output_config.effort, "medium");
  assert.ok(!("fallbacks" in params));
  const recent = await p.batch.recent({ sinceMs: Date.now() - 3600_000 });
  assert.deepEqual(recent.map((b) => b.id), ["msgbatch_1"]);
  const results = await p.batch.results("msgbatch_1");
  assert.deepEqual(results.find((r) => r.custom_id === "a").answer, answer);
  assert.match(results.find((r) => r.custom_id === "b").error, /errored/);
  assert.match(results.find((r) => r.custom_id === "c").error, /declined/);
});

test("Weaver's own Loxo scorecards are recognized by creator name or by summary, so no duplicate is ever written", async () => {
  const { isAiCard, writeResult, AI_AUTHOR } = await import("../src/loxo/write.js");
  assert.ok(isAiCard({ external_creator_name: AI_AUTHOR }));
  assert.ok(isAiCard({ external_creator_name: null, summary: "AI first read, awaiting recruiter review. Not a decision.\n3.9 / 5" }));
  assert.ok(!isAiCard({ external_creator_name: "Jane Recruiter", summary: "Strong call." }));
  const posts = [];
  const client = { get: async () => ({ scorecards: [{ person_id: 7, job_id: 9, summary: "AI first read, awaiting recruiter review. Not a decision." }] }), post: async (p, b) => posts.push(b) };
  const result = { status: "scored", loxo: { person_id: 7 }, job_id: "9", recommendation: "yes", criteria: [], flags: [], scored_count: 0, average: 4, industry: "other", strongest_signal: "s", watch_item: "w", assessment: "a", scorecard: "s.v1", scored_at: "2026-10-30T00:00:00Z" };
  const out = await writeResult(client, result, { target: "scorecard", scorecardTypeId: "2", recommendationTypeIds: { yes: "3", no: "2" } });
  assert.equal(out.status, "skipped");
  assert.equal(posts.length, 0);
});
