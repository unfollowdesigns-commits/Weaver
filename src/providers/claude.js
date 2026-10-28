import Anthropic from "@anthropic-ai/sdk";

// Production provider. One request per candidate, JSON constrained by the output schema.
// `batch` sends non-urgent work through the Message Batches API at half price.
export function createClaudeProvider({ apiKey, model, effort }) {
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");
  const client = new Anthropic({ apiKey });
  const modelId = model || "claude-opus-5-5";
  const outputConfig = (schema) => ({ effort: effort || "high", format: { type: "json_schema", schema } });
  const system = (text) => [{ type: "text", text, cache_control: { type: "ephemeral" } }];

  return {
    name: "claude",
    model: modelId,
    async complete({ system: sys, user, schema }) {
      const response = await client.beta.messages.create({
        model: modelId,
        max_tokens: 16000,
        // If a safety classifier declines, the API retries on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: outputConfig(schema),
        system: system(sys),
        messages: [{ role: "user", content: user }],
      });
      return parseMessage(response);
    },

    batch: {
      // items: [{ custom_id, system, user, schema }]. Returns the batch id.
      async submit(items) {
        const created = await client.messages.batches.create({
          requests: items.map((it) => ({
            custom_id: it.custom_id,
            params: {
              model: modelId,
              max_tokens: 16000,
              output_config: outputConfig(it.schema),
              system: system(it.system),
              messages: [{ role: "user", content: it.user }],
            },
          })),
        });
        return created.id;
      },
      // Batches created since `sinceMs`, newest first, at most 200 looked at.
      async recent({ sinceMs }) {
        const out = [];
        let seen = 0;
        for await (const b of client.messages.batches.list({ limit: 100 })) {
          if (++seen > 200) break;
          if (Date.parse(b.created_at) < sinceMs) continue;
          out.push({ id: b.id, status: b.processing_status });
        }
        return out;
      },
      async results(id) {
        const out = [];
        for await (const r of await client.messages.batches.results(id)) {
          if (r.result.type !== "succeeded") {
            out.push({ custom_id: r.custom_id, error: `batch request ${r.result.type}` });
            continue;
          }
          try {
            out.push({ custom_id: r.custom_id, ...parseMessage(r.result.message) });
          } catch (err) {
            out.push({ custom_id: r.custom_id, error: err.message });
          }
        }
        return out;
      },
    },
  };
}

function parseMessage(message) {
  if (message.stop_reason === "refusal") {
    throw new Error(`Claude declined to score (${message.stop_details?.category ?? "no category"})`);
  }
  if (message.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off (max_tokens)");
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { answer: JSON.parse(text), model: message.model, usage: message.usage };
}
